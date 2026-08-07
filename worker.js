// AACP Cloudflare Worker — full backend (Web Crypto only, no Node.js builtins)

// ── In-memory stores (reset on cold start — MVP only) ──────────────────────
const users = new Map();         // id → UserRecord
const usersByEmail = new Map();  // email → id
const refreshTokens = new Map(); // token → RefreshTokenRecord
const auditLog = [];
const consents = new Map();      // userId → ConsentRecord[]

// ── Seed default admin (runs once on cold start) ─────────────────────────────
// Default credentials: admin@aviationaerospacecompetency.com / AACP@Admin2024
(async () => {
  const adminEmail = 'admin@aviationaerospacecompetency.com';
  if (!usersByEmail.has(adminEmail)) {
    const enc = new TextEncoder();
    const saltBytes = new Uint8Array([0xaa,0xc9,0x00,0x1f,0x2d,0x4e,0x7b,0x3c,0x91,0x08,0x55,0xd6,0xe2,0xf7,0x14,0xa0]);
    const keyMat = await crypto.subtle.importKey('raw', enc.encode('AACP@Admin2024'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: 10000 }, keyMat, 256);
    const toHex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    const passwordHash = `10000:${toHex(saltBytes)}:${toHex(bits)}`;
    const id = 'admin-seed-0001';
    const now = new Date().toISOString();
    users.set(id, { id, email: adminEmail, passwordHash, name: 'AACP Administrator', role: 'admin', phone: '', status: 'active', mfaEnabled: false, mfaSecret: null, createdAt: now, updatedAt: now });
    usersByEmail.set(adminEmail, id);
  }
})();

// ── Config ──────────────────────────────────────────────────────────────────
const ACCESS_EXPIRES_SEC  = 15 * 60;
const REFRESH_EXPIRES_SEC = 7 * 24 * 60 * 60;
const PBKDF2_ITERATIONS   = 10000;
// Roles: admin (full), youth, employer, postsecondary
// admin is the only role that can approve registrations, view all, change anything
// New registrations for non-admin roles start with status 'pending' until admin approves
const MFA_ENFORCED_ROLES  = new Set(['admin']);
const VALID_ROLES = new Set(['youth', 'employer', 'postsecondary', 'admin']);

// ── Crypto helpers ───────────────────────────────────────────────────────────

function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function randomHex(byteLen) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLen)));
}

function base64UrlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const padded = str.padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial, 256,
  );
  return `${PBKDF2_ITERATIONS}:${bytesToHex(salt)}:${bytesToHex(bits)}`;
}

async function verifyPassword(password, stored) {
  const [iters, saltHex, hashHex] = stored.split(':');
  const enc = new TextEncoder();
  const salt = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: Number(iters) },
    keyMaterial, 256,
  );
  return bytesToHex(bits) === hashHex;
}

// ── JWT ──────────────────────────────────────────────────────────────────────

async function importHmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function createJwt(payload, secret, expiresInSec) {
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSec })));
  const key = await importHmacKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${base64UrlEncode(sig)}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const key = await importHmacKey(secret, 'verify');
  const valid = await crypto.subtle.verify('HMAC', key, base64UrlDecode(signature), new TextEncoder().encode(`${header}.${body}`));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;
  return payload;
}

// ── TOTP (HMAC-SHA1) ─────────────────────────────────────────────────────────

async function generateHotp(secretHex, counter) {
  const key = hexToBytes(secretHex);
  const counterBytes = new Uint8Array(8);
  const hi = Math.floor(counter / 0x100000000);
  const lo = counter >>> 0;
  new DataView(counterBytes.buffer).setUint32(0, hi, false);
  new DataView(counterBytes.buffer).setUint32(4, lo, false);
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counterBytes));
  const offset = sig[sig.length - 1] & 0x0f;
  const code = (((sig[offset] & 0x7f) << 24) | (sig[offset+1] << 16) | (sig[offset+2] << 8) | sig[offset+3]) % 1000000;
  return code.toString().padStart(6, '0');
}

async function verifyTotp(secretHex, token) {
  if (!token || token.length !== 6) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (const delta of [-1, 0, 1]) {
    if (await generateHotp(secretHex, step + delta) === token) return true;
  }
  return false;
}

// ── Responses ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

// ── Auth middleware ───────────────────────────────────────────────────────────

async function authenticate(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const secret = env.AACP_ACCESS_TOKEN_SECRET ?? 'aacp-access-secret';
  return verifyJwt(token, secret);
}

function requireAuth(user) {
  if (!user) return err('Unauthorized', 401);
  return null;
}

function requireRole(user, ...roles) {
  const authErr = requireAuth(user);
  if (authErr) return authErr;
  if (!roles.includes(user.role)) return err('Forbidden', 403);
  return null;
}

// ── Audit helper ─────────────────────────────────────────────────────────────

function audit(action, userId, entityType, details = {}) {
  auditLog.push({ id: randomHex(8), action, userId, entityType, details, timestamp: new Date().toISOString() });
}

// ── Auth handlers ─────────────────────────────────────────────────────────────

async function handleRegister(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.name || !body?.role || !body?.phone) {
    return err('email, password, name, phone, and role are required');
  }

  const email = body.email.trim().toLowerCase();
  if (usersByEmail.has(email)) return err('Email already registered');

  const role = body.role.trim().toLowerCase();
  if (!VALID_ROLES.has(role)) return err('Invalid role');

  // Admin accounts cannot be self-registered — they must be provisioned
  if (role === 'admin') return err('Administrator accounts are provisioned by AACP. Contact your administrator.', 403);

  // Role-specific required fields
  if (role === 'employer' && !body.organizationName) return err('Organization name is required for Employer accounts');
  if (role === 'postsecondary' && (!body.institutionName || !body.region)) return err('Institution name and region are required for Post-Secondary accounts');

  const id = randomHex(16);
  const passwordHash = await hashPassword(body.password);
  const now = new Date().toISOString();
  const user = {
    id, email, passwordHash,
    name: body.name.trim(), role,
    phone: body.phone.trim(),
    // Role-specific profile fields
    organizationName: body.organizationName?.trim(),
    jobTitle: body.jobTitle?.trim(),
    institutionName: body.institutionName?.trim(),
    region: body.region?.trim(),
    province: body.province?.trim(),
    programArea: body.programArea?.trim(),
    cohortId: body.cohortId,
    // All non-admin accounts start pending until an admin approves
    status: 'pending',
    mfaEnabled: false, mfaSecret: null,
    createdAt: now, updatedAt: now,
  };
  users.set(id, user);
  usersByEmail.set(email, id);
  audit('register', id, 'user', { role, status: 'pending' });
  return json({ userId: id, role, status: 'pending', message: 'Registration submitted. Your account is pending administrator approval.' }, 201);
}

// ── Admin: list pending registrations ─────────────────────────────────────────

function handleAdminPendingUsers(request, user) {
  const guard = requireRole(user, 'admin'); if (guard) return guard;
  const pending = [...users.values()]
    .filter(u => u.status === 'pending')
    .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, organizationName: u.organizationName, institutionName: u.institutionName, region: u.region, createdAt: u.createdAt }));
  return json({ users: pending, total: pending.length });
}

// ── Admin: approve or reject a registration ───────────────────────────────────

async function handleAdminUserAction(request, user) {
  const guard = requireRole(user, 'admin'); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.userId || !body?.action) return err('userId and action (approve|reject) are required');
  const target = users.get(body.userId);
  if (!target) return err('User not found', 404);
  if (body.action === 'approve') {
    target.status = 'active';
    target.updatedAt = new Date().toISOString();
    users.set(target.id, target);
    audit('user_approved', user.sub, 'user', { targetUserId: target.id });
    return json({ success: true, message: `${target.name} approved.` });
  }
  if (body.action === 'reject') {
    target.status = 'rejected';
    target.updatedAt = new Date().toISOString();
    users.set(target.id, target);
    audit('user_rejected', user.sub, 'user', { targetUserId: target.id });
    return json({ success: true, message: `${target.name} rejected.` });
  }
  return err('Invalid action. Use approve or reject.');
}

async function handleLogin(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return err('email and password are required');

  const email = body.email.trim().toLowerCase();
  const uid = usersByEmail.get(email);
  const user = uid ? users.get(uid) : null;
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return err('Invalid credentials', 401);
  }

  if (user.status === 'pending') return err('Your account is pending administrator approval. You will be notified when access is granted.', 403);
  if (user.status === 'rejected') return err('Your registration was not approved. Please contact AACP for more information.', 403);

  const testMode = (env.AACP_AUTH_TEST_MODE ?? 'false') === 'true';
  const mfaEnforced = MFA_ENFORCED_ROLES.has(user.role);

  if (mfaEnforced && !user.mfaEnabled && !testMode) {
    return json({ userId: user.id, role: user.role, mfaRequired: true, mfaSetupRequired: true, message: 'MFA setup required' });
  }

  if (user.mfaEnabled && !testMode) {
    if (!body.otp) return json({ userId: user.id, role: user.role, mfaRequired: true, message: 'MFA token required' });
    if (!(await verifyTotp(user.mfaSecret, body.otp))) return err('Invalid MFA token', 401);
  }

  const accessSecret  = env.AACP_ACCESS_TOKEN_SECRET  ?? 'aacp-access-secret';
  const refreshSecret = env.AACP_REFRESH_TOKEN_SECRET ?? 'aacp-refresh-secret';

  const basePayload = { sub: user.id, email: user.email, role: user.role, cohortId: user.cohortId };
  const accessToken  = await createJwt({ ...basePayload, tokenType: 'access'  }, accessSecret,  ACCESS_EXPIRES_SEC);
  const refreshToken = await createJwt({ ...basePayload, tokenType: 'refresh' }, refreshSecret, REFRESH_EXPIRES_SEC);

  refreshTokens.set(refreshToken, {
    token: refreshToken, userId: user.id,
    expiresAt: Math.floor(Date.now() / 1000) + REFRESH_EXPIRES_SEC,
    revoked: false, createdAt: new Date().toISOString(),
  });

  audit('login', user.id, 'session');
  return json({ userId: user.id, role: user.role, accessToken, refreshToken, tokenType: 'Bearer', message: 'Login successful' });
}

async function handleRefresh(request, env) {
  const body = await request.json().catch(() => null);
  const token = body?.refreshToken;
  if (!token) return err('refreshToken required');

  const stored = refreshTokens.get(token);
  if (!stored || stored.revoked || stored.expiresAt <= Math.floor(Date.now() / 1000)) {
    return err('Invalid or expired refresh token', 401);
  }

  const refreshSecret = env.AACP_REFRESH_TOKEN_SECRET ?? 'aacp-refresh-secret';
  const payload = await verifyJwt(token, refreshSecret);
  if (!payload || payload.tokenType !== 'refresh') return err('Invalid refresh token', 401);

  const user = users.get(payload.sub);
  if (!user) return err('User not found', 401);

  const accessSecret = env.AACP_ACCESS_TOKEN_SECRET ?? 'aacp-access-secret';
  const accessToken = await createJwt(
    { sub: user.id, email: user.email, role: user.role, cohortId: user.cohortId, tokenType: 'access' },
    accessSecret, ACCESS_EXPIRES_SEC,
  );

  return json({ userId: user.id, role: user.role, accessToken, refreshToken: token, tokenType: 'Bearer' });
}

async function handleLogout(request) {
  const body = await request.json().catch(() => null);
  const token = body?.refreshToken;
  if (token) {
    const rec = refreshTokens.get(token);
    if (rec) { rec.revoked = true; refreshTokens.set(token, rec); }
  }
  return json({ message: 'Logged out' });
}

async function handleMfaSetup(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return err('email and password required');
  const email = body.email.trim().toLowerCase();
  const uid = usersByEmail.get(email);
  const user = uid ? users.get(uid) : null;
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) return err('Invalid credentials', 401);
  const secret = randomHex(20);
  user.mfaSecret = secret;
  user.mfaEnabled = false;
  users.set(user.id, user);
  return json({ secret, message: 'MFA secret generated. Confirm with a TOTP token.' });
}

async function handleMfaConfirm(request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.token) return err('email, password, and token required');
  const email = body.email.trim().toLowerCase();
  const uid = usersByEmail.get(email);
  const user = uid ? users.get(uid) : null;
  if (!user || !(await verifyPassword(body.password, user.passwordHash)) || !user.mfaSecret) {
    return err('Invalid credentials or MFA not initiated', 401);
  }
  if (!(await verifyTotp(user.mfaSecret, body.token))) return err('Invalid TOTP token');
  user.mfaEnabled = true;
  users.set(user.id, user);
  return json({ success: true, message: 'MFA enabled' });
}

async function handleMfaDisable(request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return err('email and password required');
  const email = body.email.trim().toLowerCase();
  const uid = usersByEmail.get(email);
  const user = uid ? users.get(uid) : null;
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) return err('Invalid credentials', 401);
  user.mfaEnabled = false;
  user.mfaSecret = null;
  users.set(user.id, user);
  return json({ success: true, message: 'MFA disabled' });
}

// ── Dashboard handlers ────────────────────────────────────────────────────────

function handleDashboardYouth(request, user) {
  const url = new URL(request.url);
  const userId   = user.sub ?? url.searchParams.get('userId');
  const cohortId = user.cohortId ?? url.searchParams.get('cohortId');
  return json({
    progress: {
      readinessScore: 68, competencyCompleted: 7,
      competencyInProgress: 4, competencyPendingReview: 2,
      targetRole: 'Aviation Maintenance Technician',
    },
    badges: [{
      badgeId: 'badge-vr-safe-operations',
      title: 'Safe VR Operations',
      description: 'Completed the safe operations virtual simulation review.',
      earnedAt: new Date().toISOString(),
    }],
    nextSteps: [{
      stepId: 'step-001',
      title: 'Submit evidence for navigation competency',
      description: 'Provide evidence for navigation task completion and instrument practice.',
      type: 'evidence',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }],
    metadata: { userId, cohortId, generatedAt: new Date().toISOString() },
  });
}

function handleDashboardEmployer(request, user) {
  const guard = requireRole(user, 'employer', 'admin'); if (guard) return guard;

  // Only participants who completed the full 8-week AACP program
  const completers = [...programEnrollments.values()].filter(e => e.completedAt !== null);

  const profiles = completers.map(enrollment => {
    const aciaResult = aciaResults.get(enrollment.userId);
    return {
      userId: enrollment.userId,
      name: enrollment.userName,
      email: enrollment.email,
      cohort: enrollment.cohort,
      programCompletedAt: enrollment.completedAt,
      topPathway: aciaResult?.topPathway ?? null,
      pathwayAlignments: aciaResult?.alignments ?? [],
      validatedCompetencies: enrollment.validatedCompetencies,
      aciaCompleted: !!aciaResult,
    };
  });

  return json({
    completers: profiles,
    totalCompleters: profiles.length,
    pathwayBreakdown: profiles.reduce((acc, p) => {
      if (p.topPathway) acc[p.topPathway] = (acc[p.topPathway] ?? 0) + 1;
      return acc;
    }, {}),
    metadata: { generatedAt: new Date().toISOString() },
  });
}

function handleDashboardCoach(request) {
  const url = new URL(request.url);
  const cohortId = url.searchParams.get('cohortId') ?? 'cohort-default';
  return json({
    reviewQueue: [{
      assessmentId: 'assessment-001', userId: 'user-001', userName: 'Ava Pilot',
      competencyTitle: 'Emergency Procedures', status: 'pending',
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    }],
    cohortReadiness: [{
      roleFamilyId: 'rf-flight-support', roleFamilyName: 'Flight Support',
      averageReadiness: 69, participantCount: 22,
    }],
    participantOverview: [{
      userId: 'user-001', userName: 'Ava Pilot',
      currentScore: 71, openItems: 3,
      lastActivity: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }],
    regulatoryReviewItems: [{
      itemId: 'item-001', itemType: 'assessment',
      reason: 'CARs-aligned evidence required', submittedAt: new Date().toISOString(),
    }],
    actionItems: [{
      actionId: 'action-001', title: 'Review navigation evidence',
      description: 'Review evidence and certify readiness for the pilot cohort.',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    }],
    metadata: { cohortId, generatedAt: new Date().toISOString() },
  });
}

function handleDashboardPostSecondary(request, user) {
  const url = new URL(request.url);
  const region = url.searchParams.get('region') ?? 'all';
  return json({
    summary: { region, participantCount: 50, averageReadiness: 72, pathwayBreakdown: { pilot: 12, ame: 14, atc: 8, engineering: 10, airport: 6 } },
    regionalBreakdown: [
      { region: 'British Columbia',    participantCount: 14, averageReadiness: 74 },
      { region: 'Alberta',             participantCount: 11, averageReadiness: 70 },
      { region: 'Ontario',             participantCount: 18, averageReadiness: 75 },
      { region: 'Quebec',              participantCount: 7,  averageReadiness: 68 },
    ],
    competencyHighlights: [
      { competencyId: 'crm',        title: 'Crew Resource Management',  averageScore: 3.8, participantCount: 50 },
      { competencyId: 'safety',     title: 'Safety and Emergency Proc.', averageScore: 4.1, participantCount: 50 },
      { competencyId: 'regulatory', title: 'Regulatory Knowledge',       averageScore: 3.2, participantCount: 50 },
    ],
    pathwayReadiness: [
      { pathway: 'Pilot',                averageReadiness: 76 },
      { pathway: 'AME',                  averageReadiness: 71 },
      { pathway: 'Air Traffic Control',  averageReadiness: 68 },
      { pathway: 'Aerospace Engineering',averageReadiness: 74 },
      { pathway: 'Airport Specialty',    averageReadiness: 70 },
    ],
    metadata: { institutionName: user.institutionName ?? 'Post-Secondary Partner', generatedAt: new Date().toISOString(), region },
  });
}

// ── ACIA results store ────────────────────────────────────────────────────────
const aciaResults = new Map();        // userId → ACIAResult
const programEnrollments = new Map(); // userId → ProgramRecord

// ── Competency store ──────────────────────────────────────────────────────────
const competencyScores = new Map(); // userId → { pathway, ratings, completedAt }

async function handleCompetencyGet(request, user) {
  const guard = requireAuth(user); if (guard) return guard;
  const record = competencyScores.get(user.sub) ?? null;
  return json({ assessment: record });
}

async function handleCompetencySave(request, user) {
  const guard = requireAuth(user); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.pathway || !body?.ratings) return err('pathway and ratings required');
  const record = { pathway: body.pathway, ratings: body.ratings, completedAt: body.completedAt ?? new Date().toISOString() };
  competencyScores.set(user.sub, record);
  auditLog.push({ userId: user.sub, action: 'competency_saved', entityType: 'competency', at: new Date().toISOString() });
  return json({ success: true });
}

// ── ACIA result persistence ───────────────────────────────────────────────────

async function handleAciaSaveResult(request, user) {
  const guard = requireAuth(user); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.alignments || !body?.topPathway) return err('alignments and topPathway required');
  const record = {
    userId: user.sub,
    userName: user.name ?? user.email,
    email: user.email,
    topPathway: body.topPathway,
    alignments: body.alignments,
    evidenceSummary: body.evidenceSummary ?? {},
    completedAt: new Date().toISOString(),
  };
  aciaResults.set(user.sub, record);
  audit('acia_completed', user.sub, 'acia', { topPathway: body.topPathway });
  return json({ success: true });
}

async function handleAciaGetResult(request, user) {
  const guard = requireAuth(user); if (guard) return guard;
  const result = aciaResults.get(user.sub) ?? null;
  return json({ result });
}

// ── Program enrollment & completion ───────────────────────────────────────────

async function handleProgramEnroll(request, user) {
  const guard = requireRole(user, 'admin'); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.userId) return err('userId required');
  const targetUser = users.get(body.userId);
  if (!targetUser) return err('User not found', 404);
  const record = {
    userId: body.userId,
    userName: targetUser.name ?? targetUser.email,
    email: targetUser.email,
    cohort: body.cohort ?? 'cohort-1',
    enrolledAt: new Date().toISOString(),
    completedAt: null,
    weeklyProgress: body.weeklyProgress ?? 0,
    validatedCompetencies: [],
  };
  programEnrollments.set(body.userId, record);
  audit('program_enrolled', user.sub, 'program', { targetUserId: body.userId });
  return json({ success: true });
}

async function handleProgramComplete(request, user) {
  const guard = requireRole(user, 'admin'); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.userId) return err('userId required');
  const enrollment = programEnrollments.get(body.userId);
  if (!enrollment) return err('User not enrolled', 404);
  enrollment.completedAt = new Date().toISOString();
  enrollment.weeklyProgress = 8;
  enrollment.validatedCompetencies = body.validatedCompetencies ?? [
    'Safety & Emergency Procedures',
    'Aviation Regulatory Knowledge',
    'Technical Systems Understanding',
    'Professional Communication',
  ];
  programEnrollments.set(body.userId, enrollment);
  audit('program_completed', user.sub, 'program', { targetUserId: body.userId });
  return json({ success: true });
}

async function handleProgramStatus(request, user) {
  const guard = requireAuth(user); if (guard) return guard;
  const enrollment = programEnrollments.get(user.sub) ?? null;
  return json({ enrollment });
}

// ── ACIA — Aviation Career Intelligence Assessment ────────────────────────────

async function handleAciaChat(request, env) {
  const user = await authenticate(request, env);
  const guard = requireAuth(user);
  if (guard) return guard;

  const body = await request.json().catch(() => null);
  if (!body?.messages || !Array.isArray(body.messages)) {
    return err('messages array required');
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return err('AI service not configured', 503);

  const systemPrompt = body.systemPrompt ?? 'You are a helpful aviation career mentor.';
  const messages = body.messages.slice(-20).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content).slice(0, 4000),
  }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 600,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('Anthropic API error:', res.status, errBody);
    return err('AI service error', 502);
  }

  const data = await res.json();
  const reply = data.content?.[0]?.text ?? '';
  return json({ reply });
}

// ── Audit handler ─────────────────────────────────────────────────────────────

function handleAuditLogs(request, user) {
  const guard = requireRole(user, 'admin');
  if (guard) return guard;
  const url = new URL(request.url);
  let logs = [...auditLog];
  const userId     = url.searchParams.get('userId');
  const action     = url.searchParams.get('action');
  const entityType = url.searchParams.get('entityType');
  if (userId)     logs = logs.filter(l => l.userId === userId);
  if (action)     logs = logs.filter(l => l.action === action);
  if (entityType) logs = logs.filter(l => l.entityType === entityType);
  return json({ logs, total: logs.length });
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (path === '/health') return json({ status: 'ok', timestamp: new Date().toISOString() });
    if (path === '/ping')   return new Response('pong');

    // /app → serve the React dashboard
    if (path === '/app' || path === '/app/') {
      return Response.redirect(new URL('/app.html', request.url).toString(), 301);
    }

    // Auth routes (no token required)
    if (path === '/auth/register' && request.method === 'POST') return handleRegister(request, env);
    if (path === '/auth/login'    && request.method === 'POST') return handleLogin(request, env);
    if (path === '/auth/logout'   && request.method === 'POST') return handleLogout(request);
    if (path === '/auth/refresh'  && request.method === 'POST') return handleRefresh(request, env);
    if (path === '/auth/mfa/setup'   && request.method === 'POST') return handleMfaSetup(request, env);
    if (path === '/auth/mfa/confirm' && request.method === 'POST') return handleMfaConfirm(request);
    if (path === '/auth/mfa/disable' && request.method === 'POST') return handleMfaDisable(request);

    // Protected routes — validate JWT first
    const user = await authenticate(request, env);

    if (path === '/dashboard/youth'          && request.method === 'GET') {
      const g = requireRole(user, 'youth', 'admin'); if (g) return g;
      return handleDashboardYouth(request, user);
    }
    if (path === '/dashboard/employer' && request.method === 'GET') return handleDashboardEmployer(request, user);
    if (path === '/dashboard/coach'          && request.method === 'GET') {
      const g = requireRole(user, 'admin'); if (g) return g;
      return handleDashboardCoach(request);
    }
    if (path === '/dashboard/postsecondary'  && request.method === 'GET') {
      const g = requireRole(user, 'postsecondary', 'admin'); if (g) return g;
      return handleDashboardPostSecondary(request, user);
    }

    // Admin-only: user management
    if (path === '/admin/users/pending'  && request.method === 'GET')  return handleAdminPendingUsers(request, user);
    if (path === '/admin/users/action'   && request.method === 'POST') return handleAdminUserAction(request, user);

    if (path === '/dashboard/competency' && request.method === 'GET')  return handleCompetencyGet(request, user);
    if (path === '/dashboard/competency' && request.method === 'POST') return handleCompetencySave(request, user);

    if (path === '/audit/logs' && request.method === 'GET') return handleAuditLogs(request, user);

    if (path === '/acia/chat'        && request.method === 'POST') return handleAciaChat(request, env);
    if (path === '/acia/result'      && request.method === 'GET')  return handleAciaGetResult(request, user);
    if (path === '/acia/result'      && request.method === 'POST') return handleAciaSaveResult(request, user);
    if (path === '/program/status'   && request.method === 'GET')  return handleProgramStatus(request, user);
    if (path === '/program/enroll'   && request.method === 'POST') return handleProgramEnroll(request, user);
    if (path === '/program/complete' && request.method === 'POST') return handleProgramComplete(request, user);

    if (path === '/dashboard/employer' && request.method === 'GET') return handleDashboardEmployer(request, user);

    // Stubs — authenticated
    if (path.startsWith('/privacy') || path.startsWith('/ai') || path.startsWith('/telemetry')) {
      const g = requireAuth(user); if (g) return g;
      return json({ message: 'Coming soon', path });
    }

    // Fall through to static assets (index.html, app.html, JS/CSS)
    return env.ASSETS.fetch(request);
  },
};
