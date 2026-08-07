// AACP Cloudflare Worker — full backend (Web Crypto only, no Node.js builtins)
// Backed by D1 (see schema.sql) — accounts, ACIA results, program enrollment,
// and audit history survive redeploys and cold starts.

// ── Config ──────────────────────────────────────────────────────────────────
const ACCESS_EXPIRES_SEC  = 15 * 60;
const REFRESH_EXPIRES_SEC = 7 * 24 * 60 * 60;
const PBKDF2_ITERATIONS   = 10000;
// Roles: admin (full), youth, employer, postsecondary
// admin is the only role that can approve registrations, view all, change anything
// New registrations for non-admin roles start with status 'pending' until admin approves
const MFA_ENFORCED_ROLES  = new Set(['admin']);
const VALID_ROLES = new Set(['youth', 'employer', 'postsecondary', 'admin']);

// ── Seed default admin (idempotent — runs once per isolate) ──────────────────
// Default credentials: admin@aviationaerospacecompetency.com / AACP@Admin2024
let adminSeedDone = false;

async function seedAdmin(db) {
  const adminEmail = 'admin@aviationaerospacecompetency.com';
  const enc = new TextEncoder();
  const saltBytes = new Uint8Array([0xaa,0xc9,0x00,0x1f,0x2d,0x4e,0x7b,0x3c,0x91,0x08,0x55,0xd6,0xe2,0xf7,0x14,0xa0]);
  const keyMat = await crypto.subtle.importKey('raw', enc.encode('AACP@Admin2024'), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: 10000 }, keyMat, 256);
  const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const passwordHash = `10000:${toHex(saltBytes)}:${toHex(bits)}`;
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT OR IGNORE INTO users (id, email, password_hash, name, role, phone, status, mfa_enabled, mfa_secret, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', '', 'active', 0, NULL, ?, ?)`
  ).bind('admin-seed-0001', adminEmail, passwordHash, 'AACP Administrator', now, now).run();
}

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

// ── D1 row helpers ───────────────────────────────────────────────────────────

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role,
    phone: row.phone,
    organizationName: row.organization_name,
    jobTitle: row.job_title,
    institutionName: row.institution_name,
    region: row.region,
    province: row.province,
    programArea: row.program_area,
    cohortId: row.cohort_id,
    status: row.status,
    mfaEnabled: !!row.mfa_enabled,
    mfaSecret: row.mfa_secret,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Audit helper ─────────────────────────────────────────────────────────────

async function audit(db, action, userId, entityType, details = {}) {
  await db.prepare(
    `INSERT INTO audit_log (id, action, user_id, entity_type, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(randomHex(8), action, userId ?? null, entityType ?? null, JSON.stringify(details), new Date().toISOString()).run();
}

// ── Auth handlers ─────────────────────────────────────────────────────────────

async function handleRegister(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.name || !body?.role || !body?.phone) {
    return err('email, password, name, phone, and role are required');
  }

  const email = body.email.trim().toLowerCase();
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return err('Email already registered');

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

  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, phone, organization_name, job_title, institution_name, region, province, program_area, cohort_id, status, mfa_enabled, mfa_secret, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, ?, ?)`
  ).bind(
    id, email, passwordHash, body.name.trim(), role, body.phone.trim(),
    body.organizationName?.trim() ?? null, body.jobTitle?.trim() ?? null,
    body.institutionName?.trim() ?? null, body.region?.trim() ?? null,
    body.province?.trim() ?? null, body.programArea?.trim() ?? null,
    body.cohortId ?? null, now, now,
  ).run();

  await audit(env.DB, 'register', id, 'user', { role, status: 'pending' });
  return json({ userId: id, role, status: 'pending', message: 'Registration submitted. Your account is pending administrator approval.' }, 201);
}

// ── Admin: list pending registrations ─────────────────────────────────────────

async function handleAdminPendingUsers(request, user, env) {
  const guard = requireRole(user, 'admin'); if (guard) return guard;
  const { results } = await env.DB.prepare(
    `SELECT id, name, email, role, phone, organization_name, institution_name, region, created_at
     FROM users WHERE status = 'pending' ORDER BY created_at DESC`
  ).all();
  const pending = results.map((r) => ({
    id: r.id, name: r.name, email: r.email, role: r.role, phone: r.phone,
    organizationName: r.organization_name, institutionName: r.institution_name,
    region: r.region, createdAt: r.created_at,
  }));
  return json({ users: pending, total: pending.length });
}

// ── Admin: approve or reject a registration ───────────────────────────────────

async function handleAdminUserAction(request, user, env) {
  const guard = requireRole(user, 'admin'); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.userId || !body?.action) return err('userId and action (approve|reject) are required');
  const target = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(body.userId).first();
  if (!target) return err('User not found', 404);
  const now = new Date().toISOString();

  if (body.action === 'approve') {
    await env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').bind('active', now, target.id).run();
    await audit(env.DB, 'user_approved', user.sub, 'user', { targetUserId: target.id });
    return json({ success: true, message: `${target.name} approved.` });
  }
  if (body.action === 'reject') {
    await env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').bind('rejected', now, target.id).run();
    await audit(env.DB, 'user_rejected', user.sub, 'user', { targetUserId: target.id });
    return json({ success: true, message: `${target.name} rejected.` });
  }
  return err('Invalid action. Use approve or reject.');
}

async function handleLogin(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return err('email and password are required');

  const email = body.email.trim().toLowerCase();
  const user = rowToUser(await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first());
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

  const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_EXPIRES_SEC;
  await env.DB.prepare(
    `INSERT INTO refresh_tokens (token, user_id, expires_at, revoked, created_at) VALUES (?, ?, ?, 0, ?)`
  ).bind(refreshToken, user.id, expiresAt, new Date().toISOString()).run();

  await audit(env.DB, 'login', user.id, 'session');
  return json({ userId: user.id, role: user.role, accessToken, refreshToken, tokenType: 'Bearer', message: 'Login successful' });
}

async function handleRefresh(request, env) {
  const body = await request.json().catch(() => null);
  const token = body?.refreshToken;
  if (!token) return err('refreshToken required');

  const stored = await env.DB.prepare('SELECT * FROM refresh_tokens WHERE token = ?').bind(token).first();
  if (!stored || stored.revoked || stored.expires_at <= Math.floor(Date.now() / 1000)) {
    return err('Invalid or expired refresh token', 401);
  }

  const refreshSecret = env.AACP_REFRESH_TOKEN_SECRET ?? 'aacp-refresh-secret';
  const payload = await verifyJwt(token, refreshSecret);
  if (!payload || payload.tokenType !== 'refresh') return err('Invalid refresh token', 401);

  const user = rowToUser(await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first());
  if (!user) return err('User not found', 401);

  const accessSecret = env.AACP_ACCESS_TOKEN_SECRET ?? 'aacp-access-secret';
  const accessToken = await createJwt(
    { sub: user.id, email: user.email, role: user.role, cohortId: user.cohortId, tokenType: 'access' },
    accessSecret, ACCESS_EXPIRES_SEC,
  );

  return json({ userId: user.id, role: user.role, accessToken, refreshToken: token, tokenType: 'Bearer' });
}

async function handleLogout(request, env) {
  const body = await request.json().catch(() => null);
  const token = body?.refreshToken;
  if (token) {
    await env.DB.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?').bind(token).run();
  }
  return json({ message: 'Logged out' });
}

async function handleMfaSetup(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return err('email and password required');
  const email = body.email.trim().toLowerCase();
  const user = rowToUser(await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first());
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) return err('Invalid credentials', 401);
  const secret = randomHex(20);
  await env.DB.prepare('UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?').bind(secret, user.id).run();
  return json({ secret, message: 'MFA secret generated. Confirm with a TOTP token.' });
}

async function handleMfaConfirm(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.token) return err('email, password, and token required');
  const email = body.email.trim().toLowerCase();
  const user = rowToUser(await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first());
  if (!user || !(await verifyPassword(body.password, user.passwordHash)) || !user.mfaSecret) {
    return err('Invalid credentials or MFA not initiated', 401);
  }
  if (!(await verifyTotp(user.mfaSecret, body.token))) return err('Invalid TOTP token');
  await env.DB.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').bind(user.id).run();
  return json({ success: true, message: 'MFA enabled' });
}

async function handleMfaDisable(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return err('email and password required');
  const email = body.email.trim().toLowerCase();
  const user = rowToUser(await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first());
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) return err('Invalid credentials', 401);
  await env.DB.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?').bind(user.id).run();
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

async function handleDashboardEmployer(request, user, env) {
  const guard = requireRole(user, 'employer', 'admin'); if (guard) return guard;

  // Only participants who completed the full 8-week AACP program
  const { results: enrollments } = await env.DB.prepare(
    `SELECT * FROM program_enrollments WHERE completed_at IS NOT NULL`
  ).all();

  const profiles = [];
  for (const e of enrollments) {
    const aciaRow = await env.DB.prepare('SELECT * FROM acia_results WHERE user_id = ?').bind(e.user_id).first();
    profiles.push({
      userId: e.user_id,
      name: e.user_name,
      email: e.email,
      cohort: e.cohort,
      programCompletedAt: e.completed_at,
      topPathway: aciaRow?.top_pathway ?? null,
      pathwayAlignments: aciaRow ? JSON.parse(aciaRow.alignments) : [],
      validatedCompetencies: JSON.parse(e.validated_competencies ?? '[]'),
      aciaCompleted: !!aciaRow,
    });
  }

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

// ── Competency store ──────────────────────────────────────────────────────────

async function handleCompetencyGet(request, user, env) {
  const guard = requireAuth(user); if (guard) return guard;
  const row = await env.DB.prepare('SELECT * FROM competency_scores WHERE user_id = ?').bind(user.sub).first();
  const record = row ? { pathway: row.pathway, ratings: JSON.parse(row.ratings), completedAt: row.completed_at } : null;
  return json({ assessment: record });
}

async function handleCompetencySave(request, user, env) {
  const guard = requireAuth(user); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.pathway || !body?.ratings) return err('pathway and ratings required');
  const completedAt = body.completedAt ?? new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO competency_scores (user_id, pathway, ratings, completed_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET pathway = excluded.pathway, ratings = excluded.ratings, completed_at = excluded.completed_at`
  ).bind(user.sub, body.pathway, JSON.stringify(body.ratings), completedAt).run();
  await audit(env.DB, 'competency_saved', user.sub, 'competency');
  return json({ success: true });
}

// ── ACIA result persistence ───────────────────────────────────────────────────

async function handleAciaSaveResult(request, user, env) {
  const guard = requireAuth(user); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.alignments || !body?.topPathway) return err('alignments and topPathway required');
  const completedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO acia_results (user_id, user_name, email, top_pathway, alignments, evidence_summary, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET user_name = excluded.user_name, top_pathway = excluded.top_pathway,
       alignments = excluded.alignments, evidence_summary = excluded.evidence_summary, completed_at = excluded.completed_at`
  ).bind(
    user.sub, user.name ?? user.email, user.email, body.topPathway,
    JSON.stringify(body.alignments), JSON.stringify(body.evidenceSummary ?? {}), completedAt,
  ).run();
  await audit(env.DB, 'acia_completed', user.sub, 'acia', { topPathway: body.topPathway });
  return json({ success: true });
}

async function handleAciaGetResult(request, user, env) {
  const guard = requireAuth(user); if (guard) return guard;
  const row = await env.DB.prepare('SELECT * FROM acia_results WHERE user_id = ?').bind(user.sub).first();
  const result = row ? {
    userId: row.user_id, userName: row.user_name, email: row.email,
    topPathway: row.top_pathway, alignments: JSON.parse(row.alignments),
    evidenceSummary: JSON.parse(row.evidence_summary ?? '{}'), completedAt: row.completed_at,
  } : null;
  return json({ result });
}

// ── Program enrollment & completion ───────────────────────────────────────────

async function handleProgramEnroll(request, user, env) {
  const guard = requireRole(user, 'admin'); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.userId) return err('userId required');
  const targetUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(body.userId).first();
  if (!targetUser) return err('User not found', 404);
  const enrolledAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO program_enrollments (user_id, user_name, email, cohort, enrolled_at, completed_at, weekly_progress, validated_competencies)
     VALUES (?, ?, ?, ?, ?, NULL, ?, '[]')
     ON CONFLICT(user_id) DO UPDATE SET cohort = excluded.cohort, enrolled_at = excluded.enrolled_at, weekly_progress = excluded.weekly_progress`
  ).bind(
    body.userId, targetUser.name ?? targetUser.email, targetUser.email,
    body.cohort ?? 'cohort-1', enrolledAt, body.weeklyProgress ?? 0,
  ).run();
  await audit(env.DB, 'program_enrolled', user.sub, 'program', { targetUserId: body.userId });
  return json({ success: true });
}

async function handleProgramComplete(request, user, env) {
  const guard = requireRole(user, 'admin'); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.userId) return err('userId required');
  const enrollment = await env.DB.prepare('SELECT * FROM program_enrollments WHERE user_id = ?').bind(body.userId).first();
  if (!enrollment) return err('User not enrolled', 404);
  const completedAt = new Date().toISOString();
  const validated = body.validatedCompetencies ?? [
    'Safety & Emergency Procedures',
    'Aviation Regulatory Knowledge',
    'Technical Systems Understanding',
    'Professional Communication',
  ];
  await env.DB.prepare(
    `UPDATE program_enrollments SET completed_at = ?, weekly_progress = 8, validated_competencies = ? WHERE user_id = ?`
  ).bind(completedAt, JSON.stringify(validated), body.userId).run();
  await audit(env.DB, 'program_completed', user.sub, 'program', { targetUserId: body.userId });
  return json({ success: true });
}

async function handleProgramStatus(request, user, env) {
  const guard = requireAuth(user); if (guard) return guard;
  const row = await env.DB.prepare('SELECT * FROM program_enrollments WHERE user_id = ?').bind(user.sub).first();
  const enrollment = row ? {
    userId: row.user_id, userName: row.user_name, email: row.email, cohort: row.cohort,
    enrolledAt: row.enrolled_at, completedAt: row.completed_at,
    weeklyProgress: row.weekly_progress, validatedCompetencies: JSON.parse(row.validated_competencies ?? '[]'),
  } : null;
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

async function handleAuditLogs(request, user, env) {
  const guard = requireRole(user, 'admin');
  if (guard) return guard;
  const url = new URL(request.url);
  const userId     = url.searchParams.get('userId');
  const action     = url.searchParams.get('action');
  const entityType = url.searchParams.get('entityType');

  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];
  if (userId)     { query += ' AND user_id = ?';     params.push(userId); }
  if (action)     { query += ' AND action = ?';      params.push(action); }
  if (entityType) { query += ' AND entity_type = ?'; params.push(entityType); }
  query += ' ORDER BY timestamp DESC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  const logs = results.map((r) => ({
    id: r.id, action: r.action, userId: r.user_id, entityType: r.entity_type,
    details: r.details ? JSON.parse(r.details) : {}, timestamp: r.timestamp,
  }));
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

    if (!adminSeedDone) {
      adminSeedDone = true;
      await seedAdmin(env.DB);
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
    if (path === '/auth/logout'   && request.method === 'POST') return handleLogout(request, env);
    if (path === '/auth/refresh'  && request.method === 'POST') return handleRefresh(request, env);
    if (path === '/auth/mfa/setup'   && request.method === 'POST') return handleMfaSetup(request, env);
    if (path === '/auth/mfa/confirm' && request.method === 'POST') return handleMfaConfirm(request, env);
    if (path === '/auth/mfa/disable' && request.method === 'POST') return handleMfaDisable(request, env);

    // Protected routes — validate JWT first
    const user = await authenticate(request, env);

    if (path === '/dashboard/youth'          && request.method === 'GET') {
      const g = requireRole(user, 'youth', 'admin'); if (g) return g;
      return handleDashboardYouth(request, user);
    }
    if (path === '/dashboard/employer' && request.method === 'GET') return handleDashboardEmployer(request, user, env);
    if (path === '/dashboard/coach'          && request.method === 'GET') {
      const g = requireRole(user, 'admin'); if (g) return g;
      return handleDashboardCoach(request);
    }
    if (path === '/dashboard/postsecondary'  && request.method === 'GET') {
      const g = requireRole(user, 'postsecondary', 'admin'); if (g) return g;
      return handleDashboardPostSecondary(request, user);
    }

    // Admin-only: user management
    if (path === '/admin/users/pending'  && request.method === 'GET')  return handleAdminPendingUsers(request, user, env);
    if (path === '/admin/users/action'   && request.method === 'POST') return handleAdminUserAction(request, user, env);

    if (path === '/dashboard/competency' && request.method === 'GET')  return handleCompetencyGet(request, user, env);
    if (path === '/dashboard/competency' && request.method === 'POST') return handleCompetencySave(request, user, env);

    if (path === '/audit/logs' && request.method === 'GET') return handleAuditLogs(request, user, env);

    if (path === '/acia/chat'        && request.method === 'POST') return handleAciaChat(request, env);
    if (path === '/acia/result'      && request.method === 'GET')  return handleAciaGetResult(request, user, env);
    if (path === '/acia/result'      && request.method === 'POST') return handleAciaSaveResult(request, user, env);
    if (path === '/program/status'   && request.method === 'GET')  return handleProgramStatus(request, user, env);
    if (path === '/program/enroll'   && request.method === 'POST') return handleProgramEnroll(request, user, env);
    if (path === '/program/complete' && request.method === 'POST') return handleProgramComplete(request, user, env);

    // Stubs — authenticated
    if (path.startsWith('/privacy') || path.startsWith('/ai') || path.startsWith('/telemetry')) {
      const g = requireAuth(user); if (g) return g;
      return json({ message: 'Coming soon', path });
    }

    // Fall through to static assets (index.html, app.html, JS/CSS)
    return env.ASSETS.fetch(request);
  },
};