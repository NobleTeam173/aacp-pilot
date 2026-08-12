// AACP Cloudflare Worker — full backend (Web Crypto only, no Node.js builtins)
// Backed by D1 (see schema.sql) — accounts, ACIA results, program enrollment,
// and audit history survive redeploys and cold starts.

// ── Config ──────────────────────────────────────────────────────────────────
const ACCESS_EXPIRES_SEC  = 15 * 60;
const REFRESH_EXPIRES_SEC = 7 * 24 * 60 * 60;
const PBKDF2_ITERATIONS   = 10000;
// Roles: super_admin (platform owner), admin (staff), youth, employer, postsecondary
// super_admin: invite/remove admins, view admin audit activity, initiate MFA resets
// admin: approve registrations, view all participants, manage assessments
// New registrations for non-admin roles start with status 'pending' until admin approves
const MFA_ENFORCED_ROLES  = new Set(['super_admin', 'admin', 'employer', 'postsecondary']);
const VALID_ROLES = new Set(['youth', 'employer', 'postsecondary', 'admin', 'super_admin']);
const ADMIN_ROLES = new Set(['admin', 'super_admin']); // roles with dashboard access

// Personal/consumer email domains — not allowed for partner account registration
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.ca','yahoo.co.uk',
  'hotmail.com','hotmail.ca','outlook.com','outlook.ca','live.com','live.ca',
  'icloud.com','me.com','mac.com','aol.com','protonmail.com','proton.me',
  'ymail.com','rocketmail.com','msn.com','mail.com',
]);

// Field length limits — prevent oversized payloads
const MAX_EMAIL_LEN  = 254;
const MAX_NAME_LEN   = 150;
const MAX_PHONE_LEN  =  30;
const MAX_FIELD_LEN  = 255;

// ── Seed initial Super Admin (idempotent — INSERT OR IGNORE) ─────────────────
// Initial credentials are in wrangler secrets: AACP_SUPER_ADMIN_EMAIL / AACP_SUPER_ADMIN_PASSWORD
// Falls back to env.AACP_ADMIN_EMAIL and a placeholder if secrets are not set.
// The seeded account is forced to change its password on first login (password_change_required=1).
let adminSeedDone = false;

async function runMigrations(db) {
  // Lazy migrations — idempotent; run once per cold start after adminSeedDone guard
  await db.prepare(`ALTER TABLE users ADD COLUMN career_stage TEXT DEFAULT 'exploring'`).run().catch(() => {});
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS transition_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run().catch(() => {});
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS transition_results (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      top_career TEXT,
      alignments TEXT NOT NULL,
      competencies TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run().catch(() => {});
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS acia_assessments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      pathway_type TEXT NOT NULL DEFAULT 'standard',
      acia_version TEXT NOT NULL DEFAULT '1.0',
      assessment_stage TEXT NOT NULL DEFAULT 'baseline',
      started_at TEXT,
      completed_at TEXT NOT NULL,
      top_pathway TEXT,
      competency_profile TEXT,
      career_alignment TEXT,
      evidence_confidence TEXT,
      development_areas TEXT,
      recommended_pathways TEXT,
      session_summary TEXT,
      badge_id TEXT,
      badge_issued_at TEXT,
      status TEXT DEFAULT 'complete',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run().catch(() => {});
  await db.prepare(`ALTER TABLE acia_assessments ADD COLUMN assessment_stage TEXT DEFAULT 'baseline'`).run().catch(() => {});
  // Phone deduplication — normalized form stored for format-agnostic uniqueness checks
  await db.prepare(`ALTER TABLE users ADD COLUMN phone_normalized TEXT`).run().catch(() => {});
  // Backfill existing rows: strip spaces, dashes, parens, plus signs
  await db.prepare(`
    UPDATE users SET phone_normalized =
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')',''),'+',''),'.','')
    WHERE phone_normalized IS NULL AND phone IS NOT NULL
  `).run().catch(() => {});
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS acia_badges (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      participant_name TEXT NOT NULL,
      participant_email TEXT,
      acia_version TEXT NOT NULL DEFAULT '1.0',
      pathway_type TEXT NOT NULL DEFAULT 'standard',
      issue_date TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    )
  `).run().catch(() => {});
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS program_interest (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      assessment_id TEXT,
      expressed_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run().catch(() => {});

  // Rate limiting — track login / OTP / reset attempts per identifier
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      attempted_at TEXT NOT NULL,
      success INTEGER DEFAULT 0
    )
  `).run().catch(() => {});
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(identifier, attempted_at)`).run().catch(() => {});

  // Email verification OTP tokens
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL
    )
  `).run().catch(() => {});

  // Password reset tokens
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    )
  `).run().catch(() => {});

  // Organization / partner directory
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      org_type TEXT NOT NULL,
      approved_domains TEXT NOT NULL DEFAULT '[]',
      partner_status TEXT NOT NULL DEFAULT 'pending',
      primary_contact TEXT,
      approved_at TEXT,
      approved_by TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run().catch(() => {});

  // email_verified column on users
  await db.prepare(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`).run().catch(() => {});

  // Require password change on first login (used for seeded/invited admin accounts)
  await db.prepare(`ALTER TABLE users ADD COLUMN password_change_required INTEGER DEFAULT 0`).run().catch(() => {});

  // Admin invitation tokens — invite-only provisioning for admin/super_admin accounts
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS admin_invitations (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      invited_email TEXT NOT NULL,
      invited_name TEXT NOT NULL,
      invited_role TEXT NOT NULL DEFAULT 'admin',
      invited_by TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL
    )
  `).run().catch(() => {});
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_invitations_token ON admin_invitations(token_hash)`).run().catch(() => {});
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_invitations_email ON admin_invitations(invited_email)`).run().catch(() => {});

  // Migrate existing admin seed account to super_admin role
  await db.prepare(`UPDATE users SET role = 'super_admin' WHERE id = 'admin-seed-0001' AND role = 'admin'`).run().catch(() => {});

  // AACP Connector — employer signals and curriculum mappings
  await db.prepare(`CREATE TABLE IF NOT EXISTS employer_signals (id TEXT PRIMARY KEY, org_id TEXT, employer_name TEXT NOT NULL, industry_subsector TEXT, region TEXT, occupation TEXT, role_title TEXT, competency TEXT NOT NULL, skill TEXT, importance_level TEXT DEFAULT 'medium', proficiency_expectation TEXT DEFAULT 'intermediate', hiring_difficulty TEXT, skills_gap TEXT, emerging_requirement INTEGER DEFAULT 0, certification_required TEXT, workforce_readiness_expectation TEXT, future_demand TEXT DEFAULT 'stable', source TEXT DEFAULT 'employer_submission', collected_by TEXT, collected_at TEXT, validation_status TEXT DEFAULT 'new', validated_by TEXT, validated_at TEXT, validation_notes TEXT, created_at TEXT, updated_at TEXT)`).run().catch(() => {});
  await db.prepare(`CREATE TABLE IF NOT EXISTS curriculum_mappings (id TEXT PRIMARY KEY, org_id TEXT, institution_name TEXT NOT NULL, program_name TEXT NOT NULL, course_name TEXT, learning_outcome TEXT, skill TEXT, aacp_competency TEXT NOT NULL, alignment_level TEXT DEFAULT 'insufficient_evidence', notes TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)`).run().catch(() => {});

  // Pilot / Early Access Invitation System
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS pilot_invitations (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      invited_email TEXT NOT NULL,
      invited_first_name TEXT NOT NULL,
      invited_last_name TEXT NOT NULL,
      invited_organization TEXT,
      pilot_role TEXT NOT NULL,
      cohort_name TEXT,
      notes TEXT,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      accepted_by TEXT,
      revoked_at TEXT,
      revoked_by TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run().catch(() => {});
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_pilot_inv_token ON pilot_invitations(token_hash)`).run().catch(() => {});
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_pilot_inv_email ON pilot_invitations(invited_email)`).run().catch(() => {});

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS pilot_feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      pilot_role TEXT NOT NULL,
      overall_rating INTEGER,
      navigation_rating INTEGER,
      value_rating INTEGER,
      most_valuable TEXT,
      needs_improvement TEXT,
      would_recommend INTEGER,
      additional_comments TEXT,
      submitted_at TEXT NOT NULL
    )
  `).run().catch(() => {});

  // Pilot account columns on users
  await db.prepare(`ALTER TABLE users ADD COLUMN pilot_account INTEGER DEFAULT 0`).run().catch(() => {});
  await db.prepare(`ALTER TABLE users ADD COLUMN pilot_cohort TEXT`).run().catch(() => {});
  await db.prepare(`ALTER TABLE users ADD COLUMN invitation_id TEXT`).run().catch(() => {});
  await db.prepare(`ALTER TABLE users ADD COLUMN pilot_status TEXT DEFAULT 'active'`).run().catch(() => {});
  await db.prepare(`ALTER TABLE users ADD COLUMN last_activity_at TEXT`).run().catch(() => {});
}

async function seedAdmin(db, env) {
  // Bootstrap the initial Super Admin using Wrangler secrets.
  // Set AACP_SUPER_ADMIN_EMAIL and AACP_SUPER_ADMIN_PASSWORD as wrangler secrets.
  // Falls back to AACP_ADMIN_EMAIL env var with a placeholder password that forces a reset.
  const adminEmail = (env?.AACP_SUPER_ADMIN_EMAIL ?? env?.AACP_ADMIN_EMAIL ?? 'admin@aviationaerospacecompetency.com').toLowerCase().trim();
  const adminPassword = env?.AACP_SUPER_ADMIN_PASSWORD ?? 'AACP@Admin2024!ChangeMe';
  const passwordHash = await hashPassword(adminPassword);
  const now = new Date().toISOString();
  // password_change_required=1 so admin is forced to set a new password on first login
  await db.prepare(
    `INSERT OR IGNORE INTO users (id, email, password_hash, name, role, phone, status, mfa_enabled, mfa_secret, password_change_required, created_at, updated_at)
     VALUES (?, ?, ?, 'AACP Super Administrator', 'super_admin', '', 'active', 0, NULL, 1, ?, ?)`
  ).bind('admin-seed-0001', adminEmail, passwordHash, now, now).run();
}

// ── Phone normalization ──────────────────────────────────────────────────────
// Strips all non-digit characters, then removes the leading country-code "1"
// from North American numbers so these all resolve to the same value:
//   403-555-1234 | (403) 555-1234 | +1 403 555 1234 | 14035551234
function normalizePhone(raw) {
  const digits = (raw ?? '').replace(/\D/g, '');
  // 11-digit North American number starting with 1 → drop the country code
  if (digits.length === 11 && digits.charAt(0) === '1') return digits.slice(1);
  return digits;
}

// ── SHA-256 hex digest ───────────────────────────────────────────────────────
async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(buf);
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
async function countRecentAttempts(db, identifier, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM login_attempts WHERE identifier = ? AND attempted_at > ? AND success = 0`
  ).bind(identifier, since).first().catch(() => ({ n: 0 }));
  return row?.n ?? 0;
}

async function recordAttempt(db, identifier, success) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO login_attempts (id, identifier, attempted_at, success) VALUES (?, ?, ?, ?)`
  ).bind(randomHex(8), identifier, now, success ? 1 : 0).run().catch(() => {});
  // Prune records older than 24 hours
  await db.prepare(`DELETE FROM login_attempts WHERE attempted_at < ?`)
    .bind(new Date(Date.now() - 86400000).toISOString()).run().catch(() => {});
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
  if (!stored || !stored.includes(':')) return false;
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

// ── Base32 (RFC 4648) — for TOTP secret display ───────────────────────────────

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes) {
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_CHARS[(value << (5 - bits)) & 31];
  return output;
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
  const secret = env.AACP_ACCESS_TOKEN_SECRET || 'aacp-access-secret';
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
    emailVerified: !!row.email_verified,
    passwordChangeRequired: !!row.password_change_required,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    careerStage: row.career_stage ?? 'exploring',
    pilotAccount: !!row.pilot_account,
    pilotCohort: row.pilot_cohort ?? null,
    invitationId: row.invitation_id ?? null,
    pilotStatus: row.pilot_status ?? 'active',
  };
}

// ── Audit helper ─────────────────────────────────────────────────────────────

async function audit(db, action, userId, entityType, details = {}) {
  await db.prepare(
    `INSERT INTO audit_log (id, action, user_id, entity_type, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(randomHex(8), action, userId ?? null, entityType ?? null, JSON.stringify(details), new Date().toISOString()).run().catch(() => {});
}

// ── Auth handlers ─────────────────────────────────────────────────────────────

async function handleRegister(request, env, ctx) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.name || !body?.role || !body?.phone) {
    return err('email, password, name, phone, and role are required');
  }

  const email = body.email.trim().toLowerCase();

  // Field length guards
  if (email.length > MAX_EMAIL_LEN)         return err('Email address is too long');
  if (body.name.trim().length > MAX_NAME_LEN) return err('Name is too long');
  if ((body.phone ?? '').trim().length > MAX_PHONE_LEN) return err('Phone number is too long');
  if (body.password.length > 128)           return err('Password is too long (max 128 characters)');
  if (body.password.length < 8)             return err('Password must be at least 8 characters');
  if ((body.organizationName ?? '').length > MAX_FIELD_LEN) return err('Organization name is too long');
  if ((body.institutionName  ?? '').length > MAX_FIELD_LEN) return err('Institution name is too long');

  // Employer and post-secondary partners must use an organizational email address
  const roleForCheck = (body.role ?? '').trim().toLowerCase();
  if (roleForCheck === 'employer' || roleForCheck === 'postsecondary') {
    const domain = email.split('@')[1] ?? '';
    if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
      return err('Please use your organizational email address. Personal email providers (Gmail, Outlook, Yahoo, etc.) are not accepted for partner accounts.', 422);
    }
  }

  const phoneNorm = normalizePhone(body.phone);

  const [emailRow, phoneRow] = await Promise.all([
    env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first(),
    phoneNorm
      ? env.DB.prepare('SELECT id FROM users WHERE phone_normalized = ?').bind(phoneNorm).first()
      : Promise.resolve(null),
  ]);
  if (emailRow) return err('An account with this email address is already registered. Please sign in or recover your account.', 409);
  if (phoneRow) return err('An account with this phone number is already registered. Please sign in or recover your account.', 409);

  const role = body.role.trim().toLowerCase();
  if (!VALID_ROLES.has(role)) return err('Invalid role');

  // Admin and super_admin accounts cannot be self-registered — they are provisioned by invite only
  if (role === 'admin' || role === 'super_admin') return err('Administrator accounts are provisioned by invitation only. Contact your administrator.', 403);

  // Role-specific required fields
  if (role === 'employer' && !body.organizationName) return err('Organization name is required for Employer accounts');
  if (role === 'postsecondary' && (!body.institutionName || !body.region)) return err('Institution name and region are required for Post-Secondary accounts');

  const id = randomHex(16);
  const passwordHash = await hashPassword(body.password);
  const now = new Date().toISOString();

  const careerStage = role === 'youth' ? (body.careerStage ?? 'exploring') : null;

  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, phone, phone_normalized, organization_name, job_title, institution_name, region, province, program_area, cohort_id, career_stage, status, mfa_enabled, mfa_secret, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, ?, ?)`
  ).bind(
    id, email, passwordHash, body.name.trim(), role, body.phone.trim(), phoneNorm,
    body.organizationName?.trim() ?? null, body.jobTitle?.trim() ?? null,
    body.institutionName?.trim() ?? null, body.region?.trim() ?? null,
    body.province?.trim() ?? null, body.programArea?.trim() ?? null,
    body.cohortId ?? null, careerStage, now, now,
  ).run();

  await audit(env.DB, 'register', id, 'user', { role, status: 'pending' });

  // Transactional emails — fire-and-forget, never block registration response
  const participant = {
    name: body.name.trim(), email, role,
    organizationName: body.organizationName?.trim() ?? null,
    institutionName: body.institutionName?.trim() ?? null,
  };
  fireEmail(ctx, emailRegistrationReceived(env, participant), 'registration_received');
  fireEmail(ctx, emailAdminNewRegistration(env, participant), 'admin_new_registration');

  return json({ userId: id, role, status: 'pending', message: 'Registration submitted. Your account is pending administrator approval.' }, 201);
}

// ── Transactional Email System — Resend ───────────────────────────────────────
//
// Architecture:
//   sendEmail()         — core send; logs every step; returns Resend message ID
//   emailLayout()       — branded HTML wrapper for all templates
//   email*()            — one function per transactional event
//
// All event functions are fire-and-forget (never block the HTTP response).
// They log the actual Resend error so the root cause is always diagnosable.
// The API key is never logged.

const FROM_ADDRESS = 'noreply@aviationaerospacecompetency.com';
const FROM_NAME    = 'AACP Platform';
const PLATFORM_URL = 'https://aviationaerospacecompetency.com/app.html';
const CONTACT_EMAIL = 'info@aviationaerospacecompetency.com';

// Core send — throws on failure so callers can log the actual Resend error.
async function sendEmail(env, { event, to, subject, text, html }) {
  console.log(`[email] EVENT=${event} TO=${to} SUBJECT="${subject}"`);

  if (!env.RESEND_API_KEY) {
    console.error(`[email] FAILED event=${event} reason=RESEND_API_KEY_NOT_SET to=${to}`);
    throw new Error('RESEND_API_KEY not configured');
  }

  console.log(`[email] REQUESTING Resend API event=${event} from=${FROM_ADDRESS} to=${to}`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: `${FROM_NAME} <${FROM_ADDRESS}>`, to, subject, text, html }),
  });

  const resBody = await res.text().catch(() => '');

  if (!res.ok) {
    console.error(`[email] RESEND_ERROR event=${event} status=${res.status} to=${to} body=${resBody}`);
    throw new Error(`Resend ${res.status}: ${resBody}`);
  }

  let messageId = null;
  try { messageId = JSON.parse(resBody)?.id ?? null; } catch (_) {}
  console.log(`[email] DELIVERED event=${event} to=${to} resend_id=${messageId}`);
  return messageId;
}

// Branded email HTML wrapper — email-client-safe inline styles.
function emailLayout({ preheader = '', body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AACP</title>
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}&nbsp;&zwnj;&nbsp;</div>` : ''}
</head>
<body style="margin:0;padding:0;background:#f4f5f6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f6;padding:32px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e0e2e5">
      <!-- Header -->
      <tr><td style="background:#0f0a0b;padding:24px 32px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td><span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:2px">AACP</span></td>
            <td align="right"><span style="font-size:11px;color:#7a8390;letter-spacing:1px;text-transform:uppercase">Aviation &amp; Aerospace Competency Program</span></td>
          </tr>
        </table>
        <div style="height:3px;background:linear-gradient(90deg,#80011f,#dc143c);margin-top:14px;border-radius:2px"></div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px 32px 24px">${body}</td></tr>
      <!-- Footer -->
      <tr><td style="background:#f9f9fa;border-top:1px solid #e0e2e5;padding:20px 32px">
        <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6">
          This is an automated transactional email from the AACP Platform. Do not reply to this email.<br>
          Questions? Contact us at <a href="mailto:${CONTACT_EMAIL}" style="color:#80011f">${CONTACT_EMAIL}</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// Heading, paragraph, CTA button helpers
function eH1(text) { return `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;line-height:1.3">${text}</h1>`; }
function eP(text, style = '') { return `<p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.65${style ? ';' + style : ''}">${text}</p>`; }
function eBtn(label, url) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0">
    <tr><td style="background:#80011f;border-radius:6px">
      <a href="${url}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.03em">${label}</a>
    </td></tr>
  </table>`;
}
function eInfoRow(label, value) { return `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600">${value}</td></tr>`; }
function eTable(rows) { return `<table cellpadding="0" cellspacing="0" style="margin:12px 0 20px;width:100%;background:#f9f9fa;border:1px solid #e5e7eb;border-radius:6px;padding:4px 12px">${rows}</table>`; }
function eDivider() { return `<div style="height:1px;background:#e5e7eb;margin:20px 0"></div>`; }
function eNote(text) { return `<p style="margin:16px 0 0;font-size:12px;color:#9ca3af;line-height:1.6">${text}</p>`; }

// ── 1. Participant registration confirmation ───────────────────────────────────
async function emailRegistrationReceived(env, { name, email, role }) {
  const roleLabel = { youth: 'Youth Participant', employer: 'Employer', postsecondary: 'Post-Secondary Institution' }[role] ?? role;
  const html = emailLayout({
    preheader: 'Your AACP registration has been received and is under review.',
    body: eH1('Registration Received') +
      eP(`Hi ${name},`) +
      eP('Thank you for registering with the <strong>Aviation and Aerospace Competency Program (AACP)</strong>. We\'ve received your application and it is now under review by our team.') +
      eTable(
        eInfoRow('Name', name) +
        eInfoRow('Email', email) +
        eInfoRow('Account Type', roleLabel) +
        eInfoRow('Status', 'Pending Administrator Approval')
      ) +
      eP('You will receive a follow-up email once your account has been reviewed. This typically takes 1–2 business days.') +
      eDivider() +
      eNote('If you did not register for AACP, please contact us at ' + CONTACT_EMAIL + ' immediately.'),
  });
  const text = `Hi ${name},\n\nThank you for registering with AACP. We've received your application and it is now under review.\n\nName: ${name}\nEmail: ${email}\nAccount Type: ${roleLabel}\nStatus: Pending Administrator Approval\n\nYou will receive a follow-up email once your account has been reviewed.\n\n— The AACP Team`;

  const messageId = await sendEmail(env, { event: 'registration_received', to: email, subject: 'AACP Registration Received — Pending Review', text, html });
  return messageId;
}

// ── 2. Admin registration alert ───────────────────────────────────────────────
async function emailAdminNewRegistration(env, { name, email, role, organizationName, institutionName }) {
  const adminEmail = env.AACP_ADMIN_EMAIL ?? 'admin@aviationaerospacecompetency.com';
  const roleLabel = { youth: 'Youth Participant', employer: 'Employer', postsecondary: 'Post-Secondary Institution' }[role] ?? role;
  const orgRow = organizationName ? eInfoRow('Organization', organizationName)
    : institutionName ? eInfoRow('Institution', institutionName) : '';
  const html = emailLayout({
    preheader: `New AACP registration from ${name} — awaiting your approval.`,
    body: eH1('New Participant Awaiting Approval') +
      eP('A new participant has registered on the AACP platform and is awaiting administrator approval.') +
      eTable(
        eInfoRow('Name', name) +
        eInfoRow('Email', email) +
        eInfoRow('Account Type', roleLabel) +
        orgRow +
        eInfoRow('Registered', new Date().toLocaleString('en-CA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC') +
        eInfoRow('Status', 'Pending Approval')
      ) +
      eBtn('Review in Admin Dashboard →', PLATFORM_URL) +
      eDivider() +
      eNote('Log in to the AACP Admin Dashboard to approve or decline this registration.'),
  });
  const text = `New AACP Participant Awaiting Approval\n\nName: ${name}\nEmail: ${email}\nAccount Type: ${roleLabel}${organizationName ? `\nOrganization: ${organizationName}` : institutionName ? `\nInstitution: ${institutionName}` : ''}\nRegistered: ${new Date().toUTCString()}\nStatus: Pending Approval\n\nReview in Admin Dashboard:\n${PLATFORM_URL}\n\n— AACP Platform`;

  const messageId = await sendEmail(env, { event: 'admin_new_registration', to: adminEmail, subject: `AACP — New Participant Awaiting Approval: ${name}`, text, html });
  return messageId;
}

// ── 3. Account approved ────────────────────────────────────────────────────────
async function emailAccountApproved(env, { name, email }) {
  const html = emailLayout({
    preheader: 'Your AACP account has been approved. You can now sign in.',
    body: eH1('Your Account Has Been Approved') +
      eP(`Hi ${name},`) +
      eP('Great news — your AACP account has been approved. You can now sign in and begin your <strong>Aviation Career Intelligence Assessment (ACIA)</strong>.') +
      eBtn('Sign In and Begin ACIA →', PLATFORM_URL) +
      eDivider() +
      eP('The ACIA is a structured assessment designed to map your strengths, aptitudes, and interests to aviation and aerospace career pathways. It takes approximately 30–40 minutes to complete.', 'font-size:13px;color:#6b7280') +
      eNote('Welcome aboard. We look forward to supporting your aviation career journey.'),
  });
  const text = `Hi ${name},\n\nYour AACP account has been approved. You can now sign in and begin your Aviation Career Intelligence Assessment (ACIA).\n\n${PLATFORM_URL}\n\nWelcome aboard.\n\n— The AACP Team`;

  return sendEmail(env, { event: 'account_approved', to: email, subject: 'Your AACP Account Has Been Approved', text, html });
}

// ── 4. Account declined (or additional info required) ─────────────────────────
async function emailAccountDeclined(env, { name, email, reason }) {
  const reasonBlock = reason
    ? eDivider() + `<div style="background:#fef9f0;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:0 4px 4px 0;margin:0 0 16px">${eP('<strong>Note from the review team:</strong>', 'margin-bottom:6px')}<p style="margin:0;font-size:14px;color:#374151">${reason}</p></div>`
    : '';
  const html = emailLayout({
    preheader: 'An update regarding your AACP account registration.',
    body: eH1('AACP Account Registration Update') +
      eP(`Hi ${name},`) +
      eP('Thank you for your interest in the Aviation and Aerospace Competency Program. After reviewing your registration, we are unable to approve your account at this time.') +
      reasonBlock +
      eP('If you believe this decision was made in error, or if you have additional information to provide, please contact us:') +
      eBtn(`Contact AACP — ${CONTACT_EMAIL}`, `mailto:${CONTACT_EMAIL}`) +
      eNote('We appreciate your interest in AACP and wish you well in your aviation career journey.'),
  });
  const reasonText = reason ? `\n\nNote from the review team: ${reason}\n` : '';
  const text = `Hi ${name},\n\nThank you for registering with AACP. After review, we are unable to approve your account at this time.${reasonText}\n\nIf you believe this is an error, contact us at ${CONTACT_EMAIL}.\n\n— The AACP Team`;

  return sendEmail(env, { event: 'account_declined', to: email, subject: 'AACP Account Registration Update', text, html });
}

// ── 5. ACIA assessment completed ──────────────────────────────────────────────
async function emailAciaCompleted(env, { name, email, pathwayType, badgeId, completedAt }) {
  const pathway = pathwayType === 'transition' ? 'Career Transition' : 'Standard';
  const verifyUrl = `https://aviationaerospacecompetency.com/badge/verify/${badgeId}`;
  const date = new Date(completedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const html = emailLayout({
    preheader: 'Your ACIA is complete. Your Career Intelligence Profile and digital badge are ready.',
    body: eH1('ACIA Assessment Complete') +
      eP(`Hi ${name},`) +
      eP('Congratulations — you\'ve completed the <strong>Aviation Career Intelligence Assessment (ACIA)</strong>. Your Career Intelligence Profile is now available in your dashboard.') +
      eTable(
        eInfoRow('Completed', date) +
        eInfoRow('Pathway', pathway + ' Pathway') +
        eInfoRow('Profile Status', 'Available') +
        eInfoRow('Digital Badge', 'Issued') +
        eInfoRow('Badge ID', badgeId.slice(0, 12).toUpperCase())
      ) +
      eBtn('View Your Career Intelligence Profile →', PLATFORM_URL) +
      eDivider() +
      eP('<strong>What\'s in your profile?</strong>', 'margin-bottom:6px') +
      `<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;line-height:1.8">
        <li>Career pathway alignments based on observed evidence</li>
        <li>Competency profile across six aviation intelligence domains</li>
        <li>Downloadable ACIA Career Intelligence Report (PDF)</li>
        <li>Digital completion badge for LinkedIn and professional profiles</li>
      </ul>` +
      eDivider() +
      eP('Your digital badge verification link:') +
      `<p style="margin:0 0 16px;font-size:13px"><a href="${verifyUrl}" style="color:#80011f;word-break:break-all">${verifyUrl}</a></p>` +
      eNote('This profile reflects patterns observed across your assessment missions. It is a discovery tool designed to guide career conversations — not a certification or final determination.'),
  });
  const text = `Hi ${name},\n\nYou've completed your ACIA assessment. Your Career Intelligence Profile and digital badge are now available in your dashboard.\n\nCompleted: ${date}\nPathway: ${pathway}\nBadge ID: ${badgeId.slice(0, 12).toUpperCase()}\n\nView your profile:\n${PLATFORM_URL}\n\nDigital badge verification:\n${verifyUrl}\n\n— The AACP Team`;

  return sendEmail(env, { event: 'acia_completed', to: email, subject: 'Your ACIA Is Complete — Career Intelligence Profile Ready', text, html });
}

// ── 6. Program interest / enrollment application received ─────────────────────
async function emailProgramInterestReceived(env, { name, email }) {
  const html = emailLayout({
    preheader: 'Your interest in the AACP 8-Week Program has been received.',
    body: eH1('Program Application Received') +
      eP(`Hi ${name},`) +
      eP('We\'ve received your application for the <strong>AACP 8-Week Aviation Competency Development Program</strong>. An AACP advisor will review your ACIA profile and be in touch to discuss next steps.') +
      eTable(
        eInfoRow('Program', 'AACP 8-Week Competency Development Program') +
        eInfoRow('Application Status', 'Received — Under Review') +
        eInfoRow('Next Step', 'Advisor contact within 3–5 business days')
      ) +
      eBtn('Return to Your Dashboard →', PLATFORM_URL) +
      eDivider() +
      eP('While you wait, you can review your Career Intelligence Profile, download your ACIA report, and share your digital badge in your dashboard.', 'font-size:13px;color:#6b7280') +
      eNote('If you have questions, contact us at ' + CONTACT_EMAIL),
  });
  const text = `Hi ${name},\n\nWe've received your application for the AACP 8-Week Program. An advisor will be in touch within 3–5 business days.\n\n${PLATFORM_URL}\n\n— The AACP Team`;

  return sendEmail(env, { event: 'program_interest_received', to: email, subject: 'AACP 8-Week Program — Application Received', text, html });
}

// ── 7. Admin alert — new program interest ─────────────────────────────────────
async function emailAdminProgramInterest(env, { name, email, assessmentId }) {
  const adminEmail = env.AACP_ADMIN_EMAIL ?? 'admin@aviationaerospacecompetency.com';
  const html = emailLayout({
    preheader: `${name} has expressed interest in the AACP 8-Week Program.`,
    body: eH1('New Program Application') +
      eP('A participant has expressed interest in the AACP 8-Week Program.') +
      eTable(
        eInfoRow('Name', name) +
        eInfoRow('Email', email) +
        (assessmentId ? eInfoRow('Assessment ID', assessmentId) : '') +
        eInfoRow('Expressed', new Date().toLocaleString('en-CA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC')
      ) +
      eBtn('Review in Admin Dashboard →', PLATFORM_URL),
  });
  const text = `New AACP Program Application\n\nName: ${name}\nEmail: ${email}${assessmentId ? `\nAssessment ID: ${assessmentId}` : ''}\n\nReview: ${PLATFORM_URL}`;

  return sendEmail(env, { event: 'admin_program_interest', to: adminEmail, subject: `AACP — Program Application: ${name}`, text, html });
}

// ── 7. Admin invitation ───────────────────────────────────────────────────────
async function emailAdminInvite(env, { name, email, token, role, expiresAt }) {
  const inviteUrl = `${PLATFORM_URL}?invite=${token}`;
  const roleLabel = role === 'super_admin' ? 'Super Administrator' : 'Administrator';
  const expiry = new Date(expiresAt).toLocaleString('en-CA', { dateStyle: 'full', timeStyle: 'short' });
  const html = emailLayout({
    preheader: `You have been invited to join AACP as a ${roleLabel}.`,
    body: eH1(`You're invited to AACP`) +
      eP(`Hello ${name},`) +
      eP(`You have been invited to create an <strong>${roleLabel}</strong> account on the Aviation and Aerospace Competency Program (AACP) platform.`) +
      eBtn('Accept Invitation & Set Up Account', inviteUrl) +
      eTable(
        eInfoRow('Invited Email:', email) +
        eInfoRow('Role:', roleLabel) +
        eInfoRow('Link expires:', expiry)
      ) +
      eDivider() +
      eP('After setting your password you will be guided through mandatory MFA (multi-factor authentication) setup before accessing the dashboard.') +
      eNote(`This invitation is single-use and tied to ${email}. If you did not expect this invitation, please ignore this email and contact <a href="mailto:${CONTACT_EMAIL}" style="color:#80011f">${CONTACT_EMAIL}</a>.`) +
      eNote(`If the button above doesn't work, copy and paste this link into your browser:<br><a href="${inviteUrl}" style="color:#80011f">${inviteUrl}</a>`),
  });
  return sendEmail(env, {
    event: 'admin_invite',
    to: email,
    subject: `AACP — Administrator Invitation for ${name}`,
    text: `Hello ${name},\n\nYou have been invited to create an ${roleLabel} account on the AACP platform.\n\nAccept your invitation here: ${inviteUrl}\n\nThis link expires: ${expiry}\n\nAfter setting your password, you must complete MFA setup before accessing the dashboard.\n\nIf you did not expect this, contact ${CONTACT_EMAIL}.`,
    html,
  });
}

// ── 9. Email address verification OTP ────────────────────────────────────────
async function emailVerificationCode(env, { email, otp }) {
  const html = emailLayout({
    preheader: `Your AACP email verification code is ${otp}`,
    body: eH1('Verify Your Email Address') +
      eP('Enter the 6-digit code below to verify your AACP account email address.') +
      `<div style="background:#f9f5f6;border:2px solid #80011f;border-radius:10px;padding:24px;text-align:center;margin:20px 0">` +
      `<div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#80011f;font-family:monospace">${otp}</div>` +
      `<div style="color:#888;font-size:13px;margin-top:8px">Expires in 15 minutes</div>` +
      `</div>` +
      eNote('If you did not create an AACP account, please ignore this email.'),
  });
  return sendEmail(env, { event: 'email_verification', to: email, subject: 'AACP — Verify your email address', text: `Your AACP verification code is: ${otp}\n\nThis code expires in 15 minutes.`, html });
}

// ── 8. Password reset ─────────────────────────────────────────────────────────
async function emailPasswordReset(env, { name, email, token }) {
  const resetUrl = `${PLATFORM_URL}?reset=${token}`;
  const html = emailLayout({
    preheader: 'Reset your AACP account password.',
    body: eH1('Reset Your Password') +
      eP(`Hello ${name},`) +
      eP('You requested a password reset for your AACP account. Click the button below to choose a new password.') +
      eBtn('Reset Password', resetUrl) +
      eP('This link expires in <strong>1 hour</strong>.') +
      eNote(`If you did not request a reset, please ignore this email — your password remains unchanged.<br>If the button does not work, copy this link: <a href="${resetUrl}" style="color:#80011f">${resetUrl}</a>`),
  });
  return sendEmail(env, { event: 'password_reset', to: email, subject: 'AACP — Reset your password', text: `Hello ${name},\n\nReset your AACP password here: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.`, html });
}

// Fire-and-forget wrapper — uses ctx.waitUntil() so the Cloudflare Worker does
// not terminate before the Resend fetch completes. Never throws to the caller.
function fireEmail(ctx, promise, event) {
  ctx.waitUntil(
    promise.catch(err => console.error(`[email] UNHANDLED_ERROR event=${event} error=${err.message}`))
  );
}

// ── Admin: list pending registrations ─────────────────────────────────────────

async function handleAdminPendingUsers(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
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

async function handleAdminUserAction(request, user, env, ctx) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.userId || !body?.action) return err('userId and action (approve|reject) are required');
  const target = await env.DB.prepare('SELECT id, name, email FROM users WHERE id = ?').bind(body.userId).first();
  if (!target) return err('User not found', 404);
  const now = new Date().toISOString();
  const reason = typeof body.reason === 'string' ? body.reason.trim() : null;

  if (body.action === 'approve') {
    await env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').bind('active', now, target.id).run();
    await audit(env.DB, 'user_approved', user.sub, 'user', { targetUserId: target.id, adminId: user.sub });
    fireEmail(ctx, emailAccountApproved(env, { name: target.name, email: target.email }), 'account_approved');
    return json({ success: true, message: `${target.name} approved.` });
  }
  if (body.action === 'reject') {
    await env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').bind('rejected', now, target.id).run();
    await audit(env.DB, 'user_rejected', user.sub, 'user', { targetUserId: target.id, adminId: user.sub, reason });
    fireEmail(ctx, emailAccountDeclined(env, { name: target.name, email: target.email, reason }), 'account_declined');
    return json({ success: true, message: `${target.name} declined.` });
  }
  return err('Invalid action. Use approve or reject.');
}

// ── Admin: all users with optional status filter ──────────────────────────────

async function handleAdminAllUsers(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status'); // pending | active | rejected | null (all)
  let query = `SELECT id, name, email, role, phone, organization_name, institution_name, region, status, created_at, updated_at FROM users`;
  const params = [];
  if (statusFilter && ['pending', 'active', 'rejected'].includes(statusFilter)) {
    query += ` WHERE status = ?`;
    params.push(statusFilter);
  }
  // Exclude admin accounts from participant management list
  query += statusFilter ? ` AND role != 'admin'` : ` WHERE role != 'admin'`;
  query += ` ORDER BY created_at DESC`;
  const { results } = params.length
    ? await env.DB.prepare(query).bind(...params).all()
    : await env.DB.prepare(query).all();
  const users = results.map(r => ({
    id: r.id, name: r.name, email: r.email, role: r.role, phone: r.phone,
    organizationName: r.organization_name, institutionName: r.institution_name,
    region: r.region, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
  return json({ users, total: users.length });
}

// ── Admin: notification count (pending approvals) ─────────────────────────────

async function handleAdminNotifications(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
  const row = await env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE status = 'pending' AND role != 'admin'`).first();
  return json({ pendingCount: row?.count ?? 0 });
}

async function handleLogin(request, env) {
  let _step = 'init';
  try {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return err('email and password are required');

  const email = body.email.trim().toLowerCase();

  // Rate limiting: max 10 failed attempts per 15-minute window per email
  const recentFails = await countRecentAttempts(env.DB, `login:${email}`, 15 * 60 * 1000);
  if (recentFails >= 10) {
    return err('Too many failed login attempts. Please wait 15 minutes before trying again.', 429);
  }

  const user = rowToUser(await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first());
  const credentialsValid = user && (await verifyPassword(body.password, user.passwordHash));
  if (!credentialsValid) {
    await recordAttempt(env.DB, `login:${email}`, false);
    await audit(env.DB, 'login_failed', user?.id ?? null, 'session', { email });
    return err('Invalid credentials', 401);
  }

  if (user.status === 'pending') return err('Your account is pending administrator approval. You will be notified when access is granted.', 403);
  if (user.status === 'rejected') return err('Your registration was not approved. Please contact AACP for more information.', 403);

  // Password change required before proceeding — return a signal (no tokens yet)
  if (user.passwordChangeRequired) {
    return json({ userId: user.id, role: user.role, passwordChangeRequired: true, message: 'You must set a new password before continuing.' });
  }

  const testMode = (env.AACP_AUTH_TEST_MODE ?? 'false') === 'true';
  const mfaEnforced = MFA_ENFORCED_ROLES.has(user.role);
  const isPilotAccount = !!user.pilotAccount;

  if (mfaEnforced && !user.mfaEnabled && !testMode && !isPilotAccount) {
    return json({ userId: user.id, role: user.role, mfaRequired: true, mfaSetupRequired: true, message: 'MFA setup required' });
  }

  _step = 'totp';
  if (user.mfaEnabled && !testMode && !isPilotAccount) {
    if (!body.otp) return json({ userId: user.id, role: user.role, mfaRequired: true, message: 'MFA token required' });
    if (!(await verifyTotp(user.mfaSecret, body.otp))) return err('Invalid MFA token', 401);
  }

  _step = 'jwt-access';
  // Use || not ?? so an empty-string secret also falls back to the default
  const accessSecret  = env.AACP_ACCESS_TOKEN_SECRET  || 'aacp-access-secret';
  const refreshSecret = env.AACP_REFRESH_TOKEN_SECRET || 'aacp-refresh-secret';

  const basePayload = { sub: user.id, email: user.email, role: user.role, cohortId: user.cohortId };
  const accessToken  = await createJwt({ ...basePayload, tokenType: 'access'  }, accessSecret,  ACCESS_EXPIRES_SEC);

  _step = 'jwt-refresh';
  const refreshToken = await createJwt({ ...basePayload, tokenType: 'refresh' }, refreshSecret, REFRESH_EXPIRES_SEC);

  _step = 'db-refresh-insert';
  const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_EXPIRES_SEC;
  await env.DB.prepare(
    `INSERT INTO refresh_tokens (token, user_id, expires_at, revoked, created_at) VALUES (?, ?, ?, 0, ?)`
  ).bind(refreshToken, user.id, expiresAt, new Date().toISOString()).run();

  _step = 'done';
  await recordAttempt(env.DB, `login:${email}`, true);
  await audit(env.DB, 'login', user.id, 'session');
  return json({ userId: user.id, name: user.name, role: user.role, emailVerified: user.emailVerified, careerStage: user.careerStage, accessToken, refreshToken, tokenType: 'Bearer', message: 'Login successful' });
  } catch (e) {
    console.error(`[handleLogin crash at ${_step ?? 'pre-totp'}]`, e?.message ?? String(e));
    return err(`Authentication failed at step: ${_step ?? 'pre-totp'}. Please contact support.`, 500);
  }
}

async function handleRefresh(request, env) {
  const body = await request.json().catch(() => null);
  const token = body?.refreshToken;
  if (!token) return err('refreshToken required');

  const stored = await env.DB.prepare('SELECT * FROM refresh_tokens WHERE token = ?').bind(token).first();
  if (!stored || stored.revoked || stored.expires_at <= Math.floor(Date.now() / 1000)) {
    return err('Invalid or expired refresh token', 401);
  }

  const refreshSecret = env.AACP_REFRESH_TOKEN_SECRET || 'aacp-refresh-secret';
  const payload = await verifyJwt(token, refreshSecret);
  if (!payload || payload.tokenType !== 'refresh') return err('Invalid refresh token', 401);

  const user = rowToUser(await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first());
  if (!user) return err('User not found', 401);

  const accessSecret   = env.AACP_ACCESS_TOKEN_SECRET  || 'aacp-access-secret';
  const refreshSecret2 = env.AACP_REFRESH_TOKEN_SECRET || 'aacp-refresh-secret';
  const accessToken = await createJwt(
    { sub: user.id, email: user.email, role: user.role, cohortId: user.cohortId, tokenType: 'access' },
    accessSecret, ACCESS_EXPIRES_SEC,
  );

  // Rotate refresh token — revoke old, issue new
  const basePayload2 = { sub: user.id, email: user.email, role: user.role, cohortId: user.cohortId };
  const newRefreshToken = await createJwt({ ...basePayload2, tokenType: 'refresh' }, refreshSecret2, REFRESH_EXPIRES_SEC);
  const newExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_EXPIRES_SEC;
  const now2 = new Date().toISOString();
  await env.DB.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE token = ?`).bind(token).run();
  await env.DB.prepare(
    `INSERT INTO refresh_tokens (token, user_id, expires_at, revoked, created_at) VALUES (?, ?, ?, 0, ?)`
  ).bind(newRefreshToken, user.id, newExpiresAt, now2).run();

  return json({ userId: user.id, role: user.role, accessToken, refreshToken: newRefreshToken, tokenType: 'Bearer' });
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
  try {
    const body = await request.json().catch(() => null);
    if (!body?.email || !body?.password) return err('email and password required');
    const email = body.email.trim().toLowerCase();
    const user = rowToUser(await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first());
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) return err('Invalid credentials', 401);
    const rawBytes = crypto.getRandomValues(new Uint8Array(20));
    const secretHex = bytesToHex(rawBytes);
    const secretBase32 = base32Encode(rawBytes);
    const otpauthUri = `otpauth://totp/AACP:${encodeURIComponent(user.email)}?secret=${secretBase32}&issuer=AACP&algorithm=SHA1&digits=6&period=30`;
    await env.DB.prepare('UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?').bind(secretHex, user.id).run();
    return json({ secret: secretBase32, otpauthUri, message: 'MFA secret generated. Confirm with a TOTP token.' });
  } catch (e) {
    return err('MFA setup failed: ' + (e?.message ?? String(e)), 500);
  }
}

async function handleMfaConfirm(request, env) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.email || !body?.password || !body?.token) return err('email, password, and token required');
    const email = body.email.trim().toLowerCase();
    const user = rowToUser(await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first());
    if (!user || !(await verifyPassword(body.password, user.passwordHash)) || !user.mfaSecret) {
      return err('Invalid credentials or MFA not initiated', 401);
    }
    const token = String(body.token).replace(/\s/g, '');
    if (!(await verifyTotp(user.mfaSecret, token))) return err('Invalid TOTP token. Check your authenticator app and try again.');
    await env.DB.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').bind(user.id).run();
    return json({ success: true, message: 'MFA enabled' });
  } catch (e) {
    return err('MFA confirmation failed: ' + (e?.message ?? String(e)), 500);
  }
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
    nextSteps: [],
    metadata: { userId, cohortId, generatedAt: new Date().toISOString() },
  });
}

async function handleDashboardEmployer(request, user, env) {
  const guard = requireRole(user, 'employer', 'admin', 'super_admin'); if (guard) return guard;

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
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
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
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
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
  const maxTokens = Math.min(Number(body.maxTokens ?? 600), 1200);
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
      max_tokens: maxTokens,
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
  return json({ reply, response: reply });
}

// ── Transition profile handlers ───────────────────────────────────────────────

async function handleTransitionProfileGet(request, user, env) {
  const guard = requireRole(user, 'youth', 'admin');
  if (guard) return guard;
  const row = await env.DB.prepare('SELECT session_data FROM transition_profiles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').bind(user.sub).first();
  if (!row) return json({ profile: null });
  try { return json({ profile: JSON.parse(row.session_data) }); }
  catch { return json({ profile: null }); }
}

async function handleTransitionProfileSave(request, user, env) {
  const guard = requireRole(user, 'youth', 'admin');
  if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.sessionData) return err('sessionData required');
  const now = new Date().toISOString();
  const id = randomHex(16);
  await env.DB.prepare(`
    INSERT INTO transition_profiles (id, user_id, session_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).bind(id, user.sub, JSON.stringify(body.sessionData), now, now).run().catch(() => {});
  await env.DB.prepare('UPDATE transition_profiles SET session_data = ?, updated_at = ? WHERE user_id = ?').bind(JSON.stringify(body.sessionData), now, user.sub).run();
  return json({ saved: true });
}

async function handleTransitionResultSave(request, user, env) {
  const guard = requireRole(user, 'youth', 'admin');
  if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.alignments) return err('alignments required');
  const now = new Date().toISOString();
  const id = randomHex(16);
  const topCareer = body.alignments[0]?.careerId ?? null;
  await env.DB.prepare(`
    INSERT INTO transition_results (id, user_id, top_career, alignments, competencies, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, user.sub, topCareer, JSON.stringify(body.alignments), JSON.stringify(body.competencies ?? {}), now).run();
  await audit(env.DB, 'transition_result_saved', user.sub, 'transition_result', { topCareer });
  return json({ saved: true }, 201);
}

// ── ACIA Assessment complete + Badge ──────────────────────────────────────────

async function handleAciaAssessmentComplete(request, user, env, ctx) {
  const guard = requireRole(user, 'youth', 'admin');
  if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body) return err('Request body required');

  const stage = body.assessmentStage ?? 'baseline';
  const validStages = ['baseline', 'completion', 'followup'];
  if (!validStages.includes(stage)) return err('Invalid assessmentStage');

  // Stage locking — each stage can only be completed once (superseded records don't block)
  const existing = await env.DB.prepare(
    `SELECT id FROM acia_assessments WHERE user_id = ? AND status = 'complete' AND (assessment_stage = ? OR (assessment_stage IS NULL AND ? = 'baseline'))`
  ).bind(user.sub, stage, stage).first();
  if (existing) return json({ error: 'locked', message: `Assessment stage '${stage}' already completed`, existingId: existing.id }, 409);

  const now = new Date().toISOString();
  const assessmentId = randomHex(16);
  const badgeId = randomHex(24);
  const participantName = body.participantName ?? user.email;
  await env.DB.prepare(`
    INSERT INTO acia_assessments
      (id, user_id, pathway_type, acia_version, assessment_stage, started_at, completed_at,
       top_pathway, competency_profile, career_alignment, evidence_confidence,
       development_areas, recommended_pathways, session_summary, badge_id, badge_issued_at, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    assessmentId, user.sub, body.pathwayType ?? 'standard', '1.0', stage,
    body.startedAt ?? null, now,
    body.topPathway ?? null,
    JSON.stringify(body.competencyProfile ?? {}),
    JSON.stringify(body.careerAlignment ?? []),
    body.evidenceConfidence ?? null,
    JSON.stringify(body.developmentAreas ?? []),
    JSON.stringify(body.recommendedPathways ?? []),
    JSON.stringify(body.sessionSummary ?? {}),
    badgeId, now, 'complete', now,
  ).run();
  await env.DB.prepare(`
    INSERT INTO acia_badges
      (id, assessment_id, user_id, participant_name, participant_email, acia_version, pathway_type, issue_date, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(badgeId, assessmentId, user.sub, participantName, user.email, '1.0', body.pathwayType ?? 'standard', now, 'active', now).run();
  await audit(env.DB, 'acia_assessment_complete', user.sub, 'acia_assessment', { assessmentId, badgeId, topPathway: body.topPathway });

  // Email: notify participant their ACIA is complete and badge has been issued
  const participantEmail = user.email;
  const participantDisplayName = body.participantName ?? participantName;
  if (participantEmail) {
    fireEmail(ctx, emailAciaCompleted(env, {
      name: participantDisplayName,
      email: participantEmail,
      pathwayType: body.pathwayType ?? 'standard',
      badgeId,
      completedAt: now,
    }), 'acia_completed');
  }

  return json({ assessmentId, badgeId, completedAt: now }, 201);
}

async function handleAciaAssessmentsGet(request, user, env) {
  const guard = requireRole(user, 'youth', 'admin');
  if (guard) return guard;
  const { results } = await env.DB.prepare(
    `SELECT id, pathway_type, acia_version, assessment_stage, completed_at, top_pathway, career_alignment, evidence_confidence,
            competency_profile, development_areas, recommended_pathways, session_summary, badge_id, badge_issued_at, status
     FROM acia_assessments WHERE user_id = ? ORDER BY completed_at DESC`
  ).bind(user.sub).all();
  const assessments = (results ?? []).map((r, i) => ({
    id: r.id,
    pathwayType: r.pathway_type,
    aciaVersion: r.acia_version,
    assessmentStage: r.assessment_stage ?? 'baseline',
    completedAt: r.completed_at,
    topPathway: r.top_pathway,
    careerAlignment: JSON.parse(r.career_alignment ?? '[]'),
    evidenceConfidence: r.evidence_confidence,
    competencyProfile: JSON.parse(r.competency_profile ?? '{}'),
    developmentAreas: JSON.parse(r.development_areas ?? '[]'),
    recommendedPathways: JSON.parse(r.recommended_pathways ?? '[]'),
    sessionSummary: JSON.parse(r.session_summary ?? '{}'),
    badgeId: r.badge_id,
    badgeIssuedAt: r.badge_issued_at,
    status: r.status,
    isLatest: i === 0,
  }));
  return json({ assessments });
}

async function handleAciaEligibility(request, user, env) {
  const guard = requireRole(user, 'youth', 'admin');
  if (guard) return guard;

  const { results: assessments } = await env.DB.prepare(
    `SELECT id, assessment_stage, completed_at FROM acia_assessments WHERE user_id = ? AND status = 'complete' ORDER BY completed_at ASC`
  ).bind(user.sub).all();

  const program = await env.DB.prepare(
    `SELECT enrolled_at, completed_at FROM program_enrollments WHERE user_id = ?`
  ).bind(user.sub).first();

  const byStage = {};
  for (const a of (assessments ?? [])) {
    const s = a.assessment_stage ?? 'baseline';
    if (!byStage[s]) byStage[s] = a;
  }

  const programCompletedAt = program?.completed_at ?? null;
  const followupAvailableFrom = programCompletedAt
    ? new Date(new Date(programCompletedAt).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const now = new Date().toISOString();

  const baselineStage = byStage.baseline
    ? { status: 'complete', completedAt: byStage.baseline.completed_at, assessmentId: byStage.baseline.id }
    : { status: 'available' };

  let completionStage;
  if (byStage.completion) {
    completionStage = { status: 'complete', completedAt: byStage.completion.completed_at, assessmentId: byStage.completion.id };
  } else if (byStage.baseline && programCompletedAt) {
    completionStage = { status: 'available' };
  } else if (byStage.baseline) {
    completionStage = { status: 'locked', reason: 'Available after completing the 8-week AACP' };
  } else {
    completionStage = { status: 'locked', reason: 'Complete the Baseline ACIA first' };
  }

  let followupStage;
  if (byStage.followup) {
    followupStage = { status: 'complete', completedAt: byStage.followup.completed_at, assessmentId: byStage.followup.id };
  } else if (byStage.completion && followupAvailableFrom && now >= followupAvailableFrom) {
    followupStage = { status: 'available' };
  } else if (byStage.completion && followupAvailableFrom) {
    followupStage = { status: 'locked', reason: '90-day follow-up period', availableFrom: followupAvailableFrom };
  } else if (byStage.completion) {
    followupStage = { status: 'locked', reason: 'Complete the 8-week AACP to start the 90-day follow-up period' };
  } else {
    followupStage = { status: 'locked', reason: 'Complete the AACP Completion ACIA first' };
  }

  return json({
    stages: { baseline: baselineStage, completion: completionStage, followup: followupStage },
    program: { enrolled: !!program, completed: !!programCompletedAt, completedAt: programCompletedAt },
  });
}

// ── Forced password change (first login) ─────────────────────────────────────

async function handleFirstPasswordChange(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.currentPassword || !body?.newPassword) {
    return err('email, currentPassword, and newPassword are required');
  }
  if (body.newPassword.length < 8)   return err('New password must be at least 8 characters');
  if (body.newPassword.length > 128) return err('New password is too long');
  if (body.newPassword === body.currentPassword) return err('New password must be different from your current password');

  const email = body.email.trim().toLowerCase();
  const user = rowToUser(await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first());
  if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
    return err('Invalid credentials', 401);
  }
  if (!user.passwordChangeRequired) return err('No password change required for this account');

  const newHash = await hashPassword(body.newPassword);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users SET password_hash = ?, password_change_required = 0, updated_at = ? WHERE id = ?`
  ).bind(newHash, now, user.id).run();
  await audit(env.DB, 'password_changed_forced', user.id, 'user', { email });
  return json({ success: true, message: 'Password updated. Please sign in with your new password.' });
}

// ── Admin invite system ───────────────────────────────────────────────────────

async function handleSendAdminInvite(request, user, env, ctx) {
  const guard = requireRole(user, 'super_admin');
  if (guard) return guard;

  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.name) return err('email and name are required');
  if (!body?.role || !['admin', 'super_admin'].includes(body.role)) return err('role must be admin or super_admin');

  // super_admin can only invite admin; only super_admin can invite another super_admin
  // (second super_admin invitation requires explicit intent — allowed here for flexibility)
  const invitedEmail = body.email.trim().toLowerCase();
  if (invitedEmail.length > MAX_EMAIL_LEN) return err('Email address is too long');

  // Check no existing active account with this email
  const existing = await env.DB.prepare('SELECT id, status FROM users WHERE email = ?').bind(invitedEmail).first();
  if (existing) return err('An account with this email already exists');

  // Invalidate any existing pending invite for this email
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE admin_invitations SET accepted_at = ? WHERE invited_email = ? AND accepted_at IS NULL`)
    .bind(now, invitedEmail).run().catch(() => {});

  const token = randomHex(32);
  const tokenHash = await sha256hex(token);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours
  const id = randomHex(16);

  await env.DB.prepare(`
    INSERT INTO admin_invitations (id, token_hash, invited_email, invited_name, invited_role, invited_by, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, tokenHash, invitedEmail, body.name.trim(), body.role, user.sub, expiresAt, now).run();

  await audit(env.DB, 'admin_invited', user.sub, 'user', { invitedEmail, role: body.role, inviteId: id });
  fireEmail(ctx, emailAdminInvite(env, { name: body.name.trim(), email: invitedEmail, token, role: body.role, expiresAt }), 'admin_invite');
  return json({ success: true, message: `Invitation sent to ${invitedEmail}. It expires in 48 hours.` });
}

async function handleGetInviteInfo(request, env) {
  const url = new URL(request.url);
  const token = url.pathname.split('/').pop();
  if (!token) return err('Invite token required', 400);

  const tokenHash = await sha256hex(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT invited_email, invited_name, invited_role, expires_at, accepted_at FROM admin_invitations WHERE token_hash = ?`
  ).bind(tokenHash).first();

  if (!row) return err('Invalid invitation link', 404);
  if (row.accepted_at) return err('This invitation has already been used', 410);
  if (row.expires_at < now) return err('This invitation has expired. Please request a new one.', 410);

  return json({ email: row.invited_email, name: row.invited_name, role: row.invited_role, expiresAt: row.expires_at });
}

async function handleAcceptInvite(request, env) {
  const url = new URL(request.url);
  const token = url.pathname.split('/').pop();
  if (!token) return err('Invite token required', 400);

  const body = await request.json().catch(() => null);
  if (!body?.password) return err('password is required');
  if (body.password.length < 8)   return err('Password must be at least 8 characters');
  if (body.password.length > 128) return err('Password is too long');

  const tokenHash = await sha256hex(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT * FROM admin_invitations WHERE token_hash = ?`
  ).bind(tokenHash).first();

  if (!row) return err('Invalid invitation link', 404);
  if (row.accepted_at) return err('This invitation has already been used', 410);
  if (row.expires_at < now) return err('This invitation has expired. Please request a new one.', 410);

  // Verify no account exists yet
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(row.invited_email).first();
  if (existing) return err('An account already exists for this email address', 409);

  // Create the admin account — status active, mfa_enabled=0, mfa must be set up before dashboard access
  const userId = randomHex(16);
  const passwordHash = await hashPassword(body.password);
  await env.DB.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, phone, status, mfa_enabled, mfa_secret, email_verified, password_change_required, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '', 'active', 0, NULL, 1, 0, ?, ?)
  `).bind(userId, row.invited_email, passwordHash, row.invited_name, row.invited_role, now, now).run();

  // Mark invite as accepted (single-use)
  await env.DB.prepare(`UPDATE admin_invitations SET accepted_at = ? WHERE token_hash = ?`).bind(now, tokenHash).run();

  await audit(env.DB, 'admin_invite_accepted', userId, 'user', { email: row.invited_email, role: row.invited_role });
  return json({ success: true, message: 'Account created. Please sign in and complete MFA setup to access the dashboard.' });
}

async function handleAdminInviteList(request, user, env) {
  const guard = requireRole(user, 'super_admin');
  if (guard) return guard;
  const { results } = await env.DB.prepare(`
    SELECT i.id, i.invited_email, i.invited_name, i.invited_role, i.expires_at, i.accepted_at, i.created_at,
           u.name AS invited_by_name
    FROM admin_invitations i
    LEFT JOIN users u ON u.id = i.invited_by
    ORDER BY i.created_at DESC LIMIT 50
  `).all();
  return json({ invitations: (results ?? []).map(r => ({
    id: r.id, email: r.invited_email, name: r.invited_name, role: r.invited_role,
    expiresAt: r.expires_at, acceptedAt: r.accepted_at, createdAt: r.created_at,
    invitedBy: r.invited_by_name ?? 'System',
    status: r.accepted_at ? 'accepted' : (r.expires_at < new Date().toISOString() ? 'expired' : 'pending'),
  })) });
}

// ── Email verification ────────────────────────────────────────────────────────

async function handleSendEmailVerification(request, user, env, ctx) {
  const guard = requireAuth(user);
  if (guard) return guard;

  const userRow = await env.DB.prepare('SELECT email, email_verified FROM users WHERE id = ?').bind(user.sub).first();
  if (userRow?.email_verified) return json({ already: true, message: 'Email already verified.' });

  // Rate limit: 3 sends per 30 min per user
  const attempts = await countRecentAttempts(env.DB, `verify:${user.sub}`, 30 * 60 * 1000);
  if (attempts >= 3) return err('Too many verification requests. Please wait 30 minutes before trying again.', 429);

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await sha256hex(otp);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const id = randomHex(16);
  const now = new Date().toISOString();

  await env.DB.prepare(`DELETE FROM email_verifications WHERE user_id = ? AND verified_at IS NULL`).bind(user.sub).run().catch(() => {});
  await env.DB.prepare(
    `INSERT INTO email_verifications (id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(id, user.sub, codeHash, expiresAt, now).run();
  await recordAttempt(env.DB, `verify:${user.sub}`, false);

  fireEmail(ctx, emailVerificationCode(env, { email: userRow.email, otp }), 'email_verification');
  return json({ message: 'Verification code sent. It expires in 15 minutes.' });
}

async function handleConfirmEmailVerification(request, user, env) {
  const guard = requireAuth(user);
  if (guard) return guard;

  const body = await request.json().catch(() => null);
  if (!body?.code) return err('code is required');

  const codeHash = await sha256hex(String(body.code).trim());
  const now = new Date().toISOString();

  const row = await env.DB.prepare(
    `SELECT id FROM email_verifications WHERE user_id = ? AND code_hash = ? AND expires_at > ? AND verified_at IS NULL`
  ).bind(user.sub, codeHash, now).first();

  if (!row) {
    await audit(env.DB, 'email_verify_failed', user.sub, 'user', {});
    return err('Invalid or expired verification code.', 400);
  }

  await env.DB.prepare(`UPDATE email_verifications SET verified_at = ? WHERE id = ?`).bind(now, row.id).run();
  await env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(user.sub).run();
  await audit(env.DB, 'email_verified', user.sub, 'user', {});
  return json({ success: true, message: 'Email address verified successfully.' });
}

// ── Password reset ─────────────────────────────────────────────────────────────

async function handleForgotPassword(request, env, ctx) {
  const body = await request.json().catch(() => null);
  if (!body?.email) return err('email is required');

  const email = body.email.trim().toLowerCase();

  const attempts = await countRecentAttempts(env.DB, `pwreset:${email}`, 60 * 60 * 1000);
  if (attempts >= 3) return err('Too many reset requests. Please try again in 1 hour.', 429);

  const userRow = await env.DB.prepare(`SELECT id, name, email FROM users WHERE email = ? AND status = 'active'`).bind(email).first();
  await recordAttempt(env.DB, `pwreset:${email}`, false);

  if (userRow) {
    const token = randomHex(32);
    const tokenHash = await sha256hex(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    await env.DB.prepare(`DELETE FROM password_resets WHERE user_id = ?`).bind(userRow.id).run().catch(() => {});
    await env.DB.prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(randomHex(16), userRow.id, tokenHash, expiresAt, now).run();
    await audit(env.DB, 'password_reset_requested', userRow.id, 'user', {});
    fireEmail(ctx, emailPasswordReset(env, { name: userRow.name, email: userRow.email, token }), 'password_reset');
  }

  // Always return the same message to prevent email enumeration
  return json({ message: 'If an account with that email address exists, a password reset link has been sent.' });
}

async function handleResetPassword(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.token || !body?.password) return err('token and password are required');
  if (body.password.length < 8)   return err('Password must be at least 8 characters');
  if (body.password.length > 128) return err('Password is too long');

  const tokenHash = await sha256hex(body.token);
  const now = new Date().toISOString();

  const row = await env.DB.prepare(
    `SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL`
  ).bind(tokenHash, now).first();
  if (!row) return err('Invalid or expired reset token.', 400);

  const newHash = await hashPassword(body.password);
  await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).bind(newHash, now, row.user_id).run();
  await env.DB.prepare(`UPDATE password_resets SET used_at = ? WHERE id = ?`).bind(now, row.id).run();
  // Invalidate all sessions on password reset
  await env.DB.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`).bind(row.user_id).run();
  await audit(env.DB, 'password_reset_completed', row.user_id, 'user', {});
  return json({ success: true, message: 'Password reset successfully. Please sign in.' });
}

// ── Organization directory ────────────────────────────────────────────────────

async function handleOrganizationsGet(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin');
  if (guard) return guard;
  const { results } = await env.DB.prepare(`SELECT * FROM organizations ORDER BY name ASC`).all();
  return json({ organizations: (results ?? []).map(r => ({
    id: r.id, name: r.name, orgType: r.org_type,
    approvedDomains: JSON.parse(r.approved_domains ?? '[]'),
    partnerStatus: r.partner_status, primaryContact: r.primary_contact,
    approvedAt: r.approved_at, status: r.status, notes: r.notes, createdAt: r.created_at,
  })) });
}

async function handleOrganizationCreate(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin');
  if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.orgType) return err('name and orgType are required');
  if (!['employer', 'postsecondary'].includes(body.orgType)) return err('orgType must be employer or postsecondary');

  const id = randomHex(16);
  const now = new Date().toISOString();
  const domains = Array.isArray(body.approvedDomains)
    ? body.approvedDomains.map(d => d.trim().toLowerCase()).filter(Boolean)
    : [];

  await env.DB.prepare(`
    INSERT INTO organizations (id, name, org_type, approved_domains, partner_status, primary_contact, approved_at, approved_by, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).bind(
    id, body.name.trim(), body.orgType, JSON.stringify(domains),
    body.partnerStatus ?? 'pending', body.primaryContact?.trim() ?? null,
    body.partnerStatus === 'approved' ? now : null, user.sub,
    body.notes?.trim() ?? null, now, now,
  ).run();

  await audit(env.DB, 'organization_created', user.sub, 'organization', { id, name: body.name, orgType: body.orgType });
  return json({ id, success: true }, 201);
}

async function handleOrganizationUpdate(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin');
  if (guard) return guard;
  const url = new URL(request.url);
  const orgId = url.pathname.split('/').pop();
  const body = await request.json().catch(() => null);
  if (!body) return err('Request body required');

  const existing = await env.DB.prepare('SELECT * FROM organizations WHERE id = ?').bind(orgId).first();
  if (!existing) return err('Organization not found', 404);

  const now = new Date().toISOString();
  const domains = Array.isArray(body.approvedDomains)
    ? body.approvedDomains.map(d => d.trim().toLowerCase()).filter(Boolean)
    : JSON.parse(existing.approved_domains ?? '[]');

  await env.DB.prepare(`
    UPDATE organizations SET name = ?, org_type = ?, approved_domains = ?, partner_status = ?,
      primary_contact = ?, status = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    body.name?.trim() ?? existing.name, body.orgType ?? existing.org_type,
    JSON.stringify(domains), body.partnerStatus ?? existing.partner_status,
    body.primaryContact?.trim() ?? existing.primary_contact,
    body.status ?? existing.status, body.notes?.trim() ?? existing.notes, now, orgId,
  ).run();

  await audit(env.DB, 'organization_updated', user.sub, 'organization', { id: orgId });
  return json({ success: true });
}

// ── Admin assessment override ─────────────────────────────────────────────────

async function handleAdminAssessmentUnlock(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin');
  if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.assessmentId || !body?.reason?.trim()) return err('assessmentId and reason are required');

  const row = await env.DB.prepare(
    `SELECT id, user_id, assessment_stage, status FROM acia_assessments WHERE id = ?`
  ).bind(body.assessmentId).first();
  if (!row) return err('Assessment not found', 404);
  if (row.status !== 'complete') return err('Only completed assessments can be unlocked');

  await env.DB.prepare(`UPDATE acia_assessments SET status = 'superseded' WHERE id = ?`).bind(body.assessmentId).run();
  await audit(env.DB, 'assessment_unlocked', user.sub, 'acia_assessment', {
    assessmentId: body.assessmentId,
    targetUserId: row.user_id,
    stage: row.assessment_stage,
    reason: body.reason.trim(),
    previousStatus: 'complete',
    newStatus: 'superseded',
  });
  return json({ success: true });
}

async function handleBadgeVerify(badgeId, env) {
  const row = await env.DB.prepare(
    `SELECT b.id, b.participant_name, b.acia_version, b.pathway_type, b.issue_date, b.status,
            a.top_pathway, a.completed_at
     FROM acia_badges b LEFT JOIN acia_assessments a ON b.assessment_id = a.id
     WHERE b.id = ?`
  ).bind(badgeId).first();
  if (!row) return err('Badge not found', 404);
  return json({
    badgeId: row.id,
    badge: 'Aviation Career Intelligence — Completed',
    participantName: row.participant_name,
    issuer: 'Aviation and Aerospace Career Pathways (AACP)',
    issuerWebsite: 'https://aviationaerospacecompetency.com',
    aciaVersion: row.acia_version,
    pathwayType: row.pathway_type,
    issueDate: row.issue_date,
    status: row.status,
    description: 'Completed the AACP Aviation Career Intelligence Assessment (ACIA), an aviation career discovery and competency-development assessment.',
    disclaimer: 'This badge recognizes completion of the ACIA assessment journey. It does not constitute professional certification, occupational licensing, Transport Canada approval, or employment qualification.',
  });
}

async function handleProgramInterest(request, user, env, ctx) {
  const guard = requireRole(user, 'youth', 'admin');
  if (guard) return guard;
  const body = await request.json().catch(() => ({}));
  const id = randomHex(16);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO program_interest (id, user_id, assessment_id, expressed_at) VALUES (?,?,?,?)`
  ).bind(id, user.sub, body.assessmentId ?? null, now).run().catch(() => {});
  await audit(env.DB, 'program_interest_expressed', user.sub, 'program', { assessmentId: body.assessmentId ?? null });

  // Look up participant name for email
  const userRow = await env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(user.sub).first().catch(() => null);
  const participantName = userRow?.name ?? user.email ?? 'Participant';
  const participantEmail = userRow?.email ?? user.email;
  if (participantEmail) {
    fireEmail(ctx, emailProgramInterestReceived(env, { name: participantName, email: participantEmail }), 'program_interest_received');
    fireEmail(ctx, emailAdminProgramInterest(env, { name: participantName, email: participantEmail, assessmentId: body.assessmentId ?? null }), 'admin_program_interest');
  }

  return json({ recorded: true, message: 'Your interest in the 8-Week AACP Program has been noted. An AACP advisor will be in touch.' });
}

// ── Audit handler ─────────────────────────────────────────────────────────────

async function handleAuditLogs(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin');
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

// ── AACP Connector ────────────────────────────────────────────────────────────

const COMPETENCY_LABELS = {
  SR:'Spatial Reasoning', MR:'Mechanical Reasoning', AP:'Attention & Precision',
  PS:'Problem Solving', SO:'Safety Orientation', DM:'Decision Making',
  WM:'Working Memory', MT:'Multitasking & Prioritization', CM:'Communication',
  PR:'Procedural Reasoning', SA:'Situational Awareness', AL:'Adaptive Learning',
  AK:'Aviation Knowledge',
};

async function handleConnectorOverview(request, user, env) {
  const guard = requireRole(user, 'admin');
  if (guard) return guard;
  const [signals, orgs, participants, mappings] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN validation_status="validated" THEN 1 ELSE 0 END) as validated, SUM(CASE WHEN validation_status="new" THEN 1 ELSE 0 END) as awaiting, SUM(CASE WHEN emerging_requirement=1 AND validation_status="validated" THEN 1 ELSE 0 END) as emerging FROM employer_signals').first(),
    env.DB.prepare('SELECT COUNT(DISTINCT employer_name) as employers FROM employer_signals WHERE validation_status="validated"').first(),
    env.DB.prepare('SELECT COUNT(*) as total FROM users WHERE role="youth" AND status="active"').first(),
    env.DB.prepare('SELECT COUNT(*) as total FROM curriculum_mappings').first(),
  ]);
  const occupations = await env.DB.prepare('SELECT COUNT(DISTINCT occupation) as cnt FROM employer_signals WHERE validation_status="validated" AND occupation IS NOT NULL').first();
  const competencies = await env.DB.prepare('SELECT COUNT(DISTINCT competency) as cnt FROM employer_signals WHERE validation_status="validated"').first();
  const postSecOrgs = await env.DB.prepare('SELECT COUNT(DISTINCT institution_name) as cnt FROM curriculum_mappings').first();
  const lastSignal = await env.DB.prepare('SELECT MAX(created_at) as last FROM employer_signals').first();
  return json({
    employersContributing: orgs?.employers ?? 0,
    occupationsMapped: occupations?.cnt ?? 0,
    competenciesCaptured: signals?.total ?? 0,
    competenciesValidated: signals?.validated ?? 0,
    emergingDetected: signals?.emerging ?? 0,
    awaitingValidation: signals?.awaiting ?? 0,
    postSecondaryConsuming: postSecOrgs?.cnt ?? 0,
    participantEvidence: participants?.total ?? 0,
    curriculumMappings: mappings?.total ?? 0,
    lastRefresh: lastSignal?.last ?? null,
  });
}

async function handleSignalsList(request, user, env) {
  const guard = requireRole(user, 'admin');
  if (guard) return guard;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? '';
  const competency = url.searchParams.get('competency') ?? '';
  let q = 'SELECT * FROM employer_signals WHERE 1=1';
  const params = [];
  if (status) { q += ' AND validation_status = ?'; params.push(status); }
  if (competency) { q += ' AND competency = ?'; params.push(competency); }
  q += ' ORDER BY created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(q).bind(...params).all();
  return json({ signals: results });
}

async function handleSignalCreate(request, user, env) {
  const guard = requireRole(user, 'admin');
  if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.employer_name || !body?.competency) return err('employer_name and competency are required');
  const id = randomHex(16);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO employer_signals (id,org_id,employer_name,industry_subsector,region,occupation,role_title,competency,skill,importance_level,proficiency_expectation,hiring_difficulty,skills_gap,emerging_requirement,certification_required,workforce_readiness_expectation,future_demand,source,collected_by,collected_at,validation_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, body.org_id??null, body.employer_name, body.industry_subsector??null, body.region??null, body.occupation??null, body.role_title??null, body.competency, body.skill??null, body.importance_level??'medium', body.proficiency_expectation??'intermediate', body.hiring_difficulty??null, body.skills_gap??null, body.emerging_requirement?1:0, body.certification_required??null, body.workforce_readiness_expectation??null, body.future_demand??'stable', body.source??'employer_submission', user.sub, now, 'new', now, now)
    .run();
  await audit(env.DB, 'signal_created', user.sub, 'employer_signal', { signalId: id, competency: body.competency, employer: body.employer_name });
  return json({ id, message: 'Signal created' }, 201);
}

async function handleSignalUpdate(request, user, env) {
  const guard = requireRole(user, 'admin');
  if (guard) return guard;
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  const body = await request.json().catch(() => null);
  if (!body) return err('Request body required');
  const now = new Date().toISOString();
  const existing = await env.DB.prepare('SELECT * FROM employer_signals WHERE id = ?').bind(id).first();
  if (!existing) return err('Signal not found', 404);
  const newStatus = body.validation_status ?? existing.validation_status;
  const isValidating = ['validated','needs_clarification','archived','under_review'].includes(newStatus);
  await env.DB.prepare(`UPDATE employer_signals SET employer_name=?,industry_subsector=?,region=?,occupation=?,role_title=?,competency=?,skill=?,importance_level=?,proficiency_expectation=?,hiring_difficulty=?,skills_gap=?,emerging_requirement=?,certification_required=?,workforce_readiness_expectation=?,future_demand=?,source=?,validation_status=?,validated_by=?,validated_at=?,validation_notes=?,updated_at=? WHERE id=?`)
    .bind(body.employer_name??existing.employer_name, body.industry_subsector??existing.industry_subsector, body.region??existing.region, body.occupation??existing.occupation, body.role_title??existing.role_title, body.competency??existing.competency, body.skill??existing.skill, body.importance_level??existing.importance_level, body.proficiency_expectation??existing.proficiency_expectation, body.hiring_difficulty??existing.hiring_difficulty, body.skills_gap??existing.skills_gap, body.emerging_requirement!==undefined?body.emerging_requirement:existing.emerging_requirement, body.certification_required??existing.certification_required, body.workforce_readiness_expectation??existing.workforce_readiness_expectation, body.future_demand??existing.future_demand, body.source??existing.source, newStatus, isValidating?user.sub:existing.validated_by, isValidating?now:existing.validated_at, body.validation_notes??existing.validation_notes, now, id)
    .run();
  await audit(env.DB, 'signal_updated', user.sub, 'employer_signal', { signalId: id, status: newStatus });
  return json({ message: 'Signal updated' });
}

async function handleConnectorIntelligence(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin', 'postsecondary', 'employer');
  if (guard) return guard;
  const url = new URL(request.url);
  const occupation = url.searchParams.get('occupation') ?? '';
  const region = url.searchParams.get('region') ?? '';
  const subsector = url.searchParams.get('subsector') ?? '';
  let q = 'SELECT competency, importance_level, future_demand, occupation, region, industry_subsector, employer_name FROM employer_signals WHERE validation_status="validated"';
  const params = [];
  if (occupation) { q += ' AND occupation=?'; params.push(occupation); }
  if (region) { q += ' AND region=?'; params.push(region); }
  if (subsector) { q += ' AND industry_subsector=?'; params.push(subsector); }
  const { results } = await env.DB.prepare(q).bind(...params).all();
  const byComp = {};
  for (const s of results) {
    if (!byComp[s.competency]) byComp[s.competency] = { competency: s.competency, signals: 0, employers: new Set(), importanceSum: 0, increasing: 0, stable: 0, decreasing: 0, occupations: new Set(), regions: new Set() };
    const c = byComp[s.competency];
    c.signals++;
    c.employers.add(s.employer_name);
    const imp = { critical: 4, high: 3, medium: 2, low: 1 }[s.importance_level] ?? 2;
    c.importanceSum += imp;
    if (s.future_demand === 'increasing') c.increasing++;
    else if (s.future_demand === 'decreasing') c.decreasing++;
    else c.stable++;
    if (s.occupation) c.occupations.add(s.occupation);
    if (s.region) c.regions.add(s.region);
  }
  const demandLevel = (avg) => avg >= 3.5 ? 'high' : avg >= 2.5 ? 'growing' : avg >= 1.5 ? 'moderate' : 'low';
  const trend = (c) => c.increasing > c.stable && c.increasing > c.decreasing ? 'increasing' : c.decreasing > c.stable && c.decreasing > c.increasing ? 'decreasing' : 'stable';
  const evidenceLevel = (n, e) => n >= 10 && e >= 5 ? 'strong' : n >= 5 && e >= 3 ? 'moderate' : n >= 2 ? 'limited' : 'insufficient';
  const signals = Object.values(byComp).map(c => ({
    competency: c.competency,
    label: COMPETENCY_LABELS[c.competency] ?? c.competency,
    demandLevel: demandLevel(c.importanceSum / c.signals),
    trend: trend(c),
    evidenceLevel: evidenceLevel(c.signals, c.employers.size),
    signalCount: c.signals,
    contributingEmployers: c.employers.size,
    occupations: [...c.occupations],
    regions: [...c.regions],
  })).sort((a,b) => b.signalCount - a.signalCount);
  return json({ signals, totalValidatedSignals: results.length, lastUpdated: new Date().toISOString() });
}

async function handleEmployerSignals(request, user, env) {
  const guard = requireRole(user, 'employer', 'admin', 'super_admin');
  if (guard) return guard;
  let q = 'SELECT id,occupation,role_title,competency,skill,importance_level,future_demand,emerging_requirement,validation_status,created_at FROM employer_signals WHERE 1=1';
  const params = [];
  if (user.role === 'employer') { q += ' AND collected_by=?'; params.push(user.sub); }
  q += ' ORDER BY created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(q).bind(...params).all();
  return json({ signals: results });
}

async function handleEmployerSignalSubmit(request, user, env) {
  const guard = requireRole(user, 'employer', 'admin', 'super_admin');
  if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.employer_name || !body?.competency) return err('employer_name and competency are required');
  const id = randomHex(16);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO employer_signals (id,org_id,employer_name,industry_subsector,region,occupation,role_title,competency,skill,importance_level,proficiency_expectation,hiring_difficulty,skills_gap,emerging_requirement,certification_required,workforce_readiness_expectation,future_demand,source,collected_by,collected_at,validation_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, body.org_id??null, body.employer_name, body.industry_subsector??null, body.region??null, body.occupation??null, body.role_title??null, body.competency, body.skill??null, body.importance_level??'medium', body.proficiency_expectation??'intermediate', body.hiring_difficulty??null, body.skills_gap??null, body.emerging_requirement?1:0, body.certification_required??null, body.workforce_readiness_expectation??null, body.future_demand??'stable', 'employer_submission', user.sub, now, 'new', now, now)
    .run();
  await audit(env.DB, 'employer_signal_submitted', user.sub, 'employer_signal', { signalId: id, competency: body.competency });
  return json({ id, message: 'Signal submitted for validation' }, 201);
}

async function handleEmergingSkills(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin', 'postsecondary');
  if (guard) return guard;
  const { results } = await env.DB.prepare(`SELECT competency, employer_name, future_demand, collected_at FROM employer_signals WHERE validation_status="validated" AND emerging_requirement=1 ORDER BY collected_at DESC`).all();
  const byComp = {};
  for (const s of results) {
    if (!byComp[s.competency]) byComp[s.competency] = { competency: s.competency, employers: new Set(), increasing: 0, total: 0, latest: s.collected_at };
    byComp[s.competency].employers.add(s.employer_name);
    byComp[s.competency].total++;
    if (s.future_demand === 'increasing') byComp[s.competency].increasing++;
    if (s.collected_at > byComp[s.competency].latest) byComp[s.competency].latest = s.collected_at;
  }
  const statusFor = (c) => {
    if (c.employers.size < 2) return 'insufficient_evidence';
    const pct = c.increasing / c.total;
    if (pct >= 0.8) return 'emerging';
    if (pct >= 0.6) return 'growing';
    return 'stable';
  };
  const skills = Object.values(byComp).map(c => ({
    competency: c.competency,
    label: COMPETENCY_LABELS[c.competency] ?? c.competency,
    status: statusFor(c),
    signalCount: c.total,
    contributingEmployers: c.employers.size,
    latestSignal: c.latest,
  })).filter(s => s.status !== 'insufficient_evidence' || s.signalCount >= 1)
    .sort((a,b) => b.signalCount - a.signalCount);
  return json({ emergingSkills: skills });
}

async function handleCurriculumMappings(request, user, env) {
  const guard = requireRole(user, 'postsecondary', 'admin', 'super_admin');
  if (guard) return guard;
  const url = new URL(request.url);
  const institutionName = url.searchParams.get('institution');
  let q = 'SELECT * FROM curriculum_mappings WHERE 1=1';
  const params = [];
  if (user.role === 'postsecondary') {
    q += ' AND created_by=?'; params.push(user.sub);
  } else if (institutionName) {
    q += ' AND institution_name=?'; params.push(institutionName);
  }
  q += ' ORDER BY created_at DESC';
  const { results } = await env.DB.prepare(q).bind(...params).all();
  return json({ mappings: results });
}

async function handleCurriculumMappingCreate(request, user, env) {
  const guard = requireRole(user, 'postsecondary', 'admin', 'super_admin');
  if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.program_name || !body?.aacp_competency || !body?.institution_name) return err('program_name, institution_name, and aacp_competency are required');
  const id = randomHex(16);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO curriculum_mappings (id,org_id,institution_name,program_name,course_name,learning_outcome,skill,aacp_competency,alignment_level,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, body.org_id??null, body.institution_name, body.program_name, body.course_name??null, body.learning_outcome??null, body.skill??null, body.aacp_competency, body.alignment_level??'insufficient_evidence', body.notes??null, user.sub, now, now)
    .run();
  await audit(env.DB, 'curriculum_mapping_created', user.sub, 'curriculum_mapping', { mappingId: id, program: body.program_name, competency: body.aacp_competency });
  return json({ id, message: 'Mapping created' }, 201);
}

async function handleCompetencyGap(request, user, env) {
  const guard = requireRole(user, 'postsecondary', 'admin', 'super_admin');
  if (guard) return guard;
  const { results: signals } = await env.DB.prepare('SELECT competency, importance_level FROM employer_signals WHERE validation_status="validated"').all();
  let mappingQ = 'SELECT aacp_competency, alignment_level FROM curriculum_mappings WHERE 1=1';
  const mappingParams = [];
  if (user.role === 'postsecondary') { mappingQ += ' AND created_by=?'; mappingParams.push(user.sub); }
  const { results: mappings } = await env.DB.prepare(mappingQ).bind(...mappingParams).all();
  const { results: assessments } = await env.DB.prepare('SELECT competency_profile FROM acia_assessments WHERE status="complete" AND competency_profile IS NOT NULL').all().catch(() => ({ results: [] }));
  const demand = {};
  for (const s of signals) {
    if (!demand[s.competency]) demand[s.competency] = { sum: 0, count: 0 };
    demand[s.competency].sum += { critical: 4, high: 3, medium: 2, low: 1 }[s.importance_level] ?? 2;
    demand[s.competency].count++;
  }
  const curriculum = {};
  for (const m of mappings) {
    if (!curriculum[m.aacp_competency]) curriculum[m.aacp_competency] = { sum: 0, count: 0 };
    curriculum[m.aacp_competency].sum += { strong: 4, moderate: 3, developing: 2, gap: 1, insufficient_evidence: 0 }[m.alignment_level] ?? 0;
    curriculum[m.aacp_competency].count++;
  }
  const evidence = {};
  for (const a of assessments) {
    try {
      const profile = JSON.parse(a.competency_profile);
      for (const [key, val] of Object.entries(profile)) {
        if (!evidence[key]) evidence[key] = { sum: 0, count: 0 };
        evidence[key].sum += { strong: 5, demonstrated: 4, developing: 3, emerging: 2, insufficient: 1 }[val?.state ?? val] ?? 1;
        evidence[key].count++;
      }
    } catch {}
  }
  const labelDemand = (avg) => avg >= 3.5 ? 'High' : avg >= 2.5 ? 'Growing' : avg >= 1.5 ? 'Moderate' : 'Low';
  const labelCurriculum = (avg) => avg >= 3.5 ? 'Strong' : avg >= 2.5 ? 'Moderate' : avg >= 1.5 ? 'Developing' : 'Limited';
  const labelEvidence = (avg) => avg >= 4 ? 'Strong' : avg >= 3 ? 'Demonstrated' : avg >= 2 ? 'Developing' : 'Emerging';
  const gaps = Object.keys(COMPETENCY_LABELS).map(key => {
    const d = demand[key];
    const c = curriculum[key];
    const e = evidence[key];
    return {
      competency: key,
      label: COMPETENCY_LABELS[key],
      employerDemand: d ? labelDemand(d.sum / d.count) : 'No Data',
      employerDemandCount: d?.count ?? 0,
      curriculumCoverage: c ? labelCurriculum(c.sum / c.count) : 'No Data',
      curriculumCount: c?.count ?? 0,
      participantEvidence: e ? labelEvidence(e.sum / e.count) : 'No Data',
      participantCount: e?.count ?? 0,
    };
  });
  return json({ gaps });
}

// ── Pilot / Early Access Invitation System ─────────────────────────────────────

async function handleCreatePilotInvitation(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.firstName || !body?.lastName || !body?.pilotRole) {
    return err('email, firstName, lastName, and pilotRole are required');
  }
  const validPilotRoles = new Set(['youth', 'employer', 'postsecondary']);
  if (!validPilotRoles.has(body.pilotRole)) return err('pilotRole must be youth, employer, or postsecondary');
  const email = body.email.trim().toLowerCase();
  // Check for existing active (non-revoked, non-expired) invitation for this email
  const existing = await env.DB.prepare(
    `SELECT id FROM pilot_invitations WHERE invited_email = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`
  ).bind(email, new Date().toISOString()).first();
  if (existing) return err('An active invitation already exists for this email address. Revoke it first or wait for it to expire.');

  const rawToken = randomHex(32);
  const tokenHash = await sha256hex(rawToken);
  const id = randomHex(8);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  await env.DB.prepare(
    `INSERT INTO pilot_invitations (id, token_hash, invited_email, invited_first_name, invited_last_name, invited_organization, pilot_role, cohort_name, notes, expires_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tokenHash, email,
    body.firstName.trim(), body.lastName.trim(),
    body.organization?.trim() ?? null,
    body.pilotRole,
    body.cohortName?.trim() ?? null,
    body.notes?.trim() ?? null,
    expiresAt, user.sub, now
  ).run();

  await audit(env.DB, 'pilot_invitation_created', user.sub, 'pilot_invitation', {
    invitationId: id, email, pilotRole: body.pilotRole, cohortName: body.cohortName ?? null,
  });

  return json({ success: true, invitationId: id, token: rawToken, expiresAt });
}

async function handleListPilotInvitations(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(
    `SELECT pi.*, u.name as accepted_by_name
     FROM pilot_invitations pi
     LEFT JOIN users u ON u.id = pi.accepted_by
     ORDER BY pi.created_at DESC`
  ).all();
  const invitations = results.map(r => ({
    id: r.id,
    email: r.invited_email,
    firstName: r.invited_first_name,
    lastName: r.invited_last_name,
    organization: r.invited_organization,
    pilotRole: r.pilot_role,
    cohortName: r.cohort_name,
    notes: r.notes,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at,
    acceptedByName: r.accepted_by_name,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
    status: r.revoked_at ? 'revoked'
      : r.accepted_at ? 'accepted'
      : r.expires_at < now ? 'expired'
      : 'pending',
  }));
  return json({ invitations, total: invitations.length });
}

async function handleGetPilotInviteInfo(request, env) {
  const url = new URL(request.url);
  const rawToken = url.pathname.replace('/pilot/invite/', '').split('/')[0];
  if (!rawToken) return err('Invalid invitation link', 400);
  const tokenHash = await sha256hex(rawToken);
  const inv = await env.DB.prepare(
    `SELECT * FROM pilot_invitations WHERE token_hash = ?`
  ).bind(tokenHash).first();
  if (!inv) return err('Invitation not found or invalid', 404);
  if (inv.revoked_at) return err('This invitation has been revoked', 410);
  if (inv.accepted_at) return err('This invitation has already been used', 410);
  if (inv.expires_at < new Date().toISOString()) return err('This invitation has expired', 410);
  return json({
    email: inv.invited_email,
    firstName: inv.invited_first_name,
    lastName: inv.invited_last_name,
    organization: inv.invited_organization,
    pilotRole: inv.pilot_role,
    cohortName: inv.cohort_name,
    expiresAt: inv.expires_at,
  });
}

async function handleAcceptPilotInvite(request, env) {
  const url = new URL(request.url);
  const rawToken = url.pathname.replace('/pilot/invite/', '').split('/')[0];
  if (!rawToken) return err('Invalid invitation link', 400);
  const tokenHash = await sha256hex(rawToken);
  const inv = await env.DB.prepare(
    `SELECT * FROM pilot_invitations WHERE token_hash = ?`
  ).bind(tokenHash).first();
  if (!inv) return err('Invitation not found or invalid', 404);
  if (inv.revoked_at) return err('This invitation has been revoked', 410);
  if (inv.accepted_at) return err('This invitation has already been used', 410);
  if (inv.expires_at < new Date().toISOString()) return err('This invitation has expired', 410);

  const body = await request.json().catch(() => null);
  if (!body?.password) return err('password is required');
  if (body.email && body.email.trim().toLowerCase() !== inv.invited_email) {
    return err('Email does not match the invitation', 400);
  }
  if (body.password.length < 8) return err('Password must be at least 8 characters');

  // Check if email already registered
  const existingUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(inv.invited_email).first();
  if (existingUser) return err('An account already exists for this email address. Please log in instead.', 409);

  const id = randomHex(8);
  const passwordHash = await hashPassword(body.password);
  const now = new Date().toISOString();

  // Determine name from invitation fields
  const fullName = `${inv.invited_first_name} ${inv.invited_last_name}`.trim();

  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, phone, phone_normalized, organization_name, status, mfa_enabled, mfa_secret, email_verified, pilot_account, pilot_cohort, invitation_id, pilot_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', '', ?, 'active', 0, NULL, 1, 1, ?, ?, 'active', ?, ?)`
  ).bind(
    id, inv.invited_email, passwordHash, fullName, inv.pilot_role,
    inv.invited_organization ?? '',
    inv.cohort_name ?? null,
    inv.id,
    now, now
  ).run();

  // Mark invitation as accepted
  await env.DB.prepare(
    `UPDATE pilot_invitations SET accepted_at = ?, accepted_by = ? WHERE id = ?`
  ).bind(now, id, inv.id).run();

  // Issue tokens immediately so pilot tester lands in dashboard
  const accessSecret  = env.AACP_ACCESS_TOKEN_SECRET  || 'aacp-access-secret';
  const refreshSecret = env.AACP_REFRESH_TOKEN_SECRET || 'aacp-refresh-secret';
  const basePayload = { sub: id, email: inv.invited_email, role: inv.pilot_role, cohortId: null };
  const accessToken  = await createJwt({ ...basePayload, tokenType: 'access'  }, accessSecret,  ACCESS_EXPIRES_SEC);
  const refreshToken = await createJwt({ ...basePayload, tokenType: 'refresh' }, refreshSecret, REFRESH_EXPIRES_SEC);
  const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_EXPIRES_SEC;
  await env.DB.prepare(
    `INSERT INTO refresh_tokens (token, user_id, expires_at, revoked, created_at) VALUES (?, ?, ?, 0, ?)`
  ).bind(refreshToken, id, expiresAt, now).run();

  await audit(env.DB, 'pilot_registration_completed', id, 'user', {
    invitationId: inv.id, pilotRole: inv.pilot_role, cohortName: inv.cohort_name ?? null,
  });

  return json({
    success: true,
    userId: id, name: fullName, role: inv.pilot_role,
    pilotAccount: true,
    accessToken, refreshToken, tokenType: 'Bearer',
    message: 'Welcome to the AACP pilot program!',
  });
}

async function handleRevokePilotInvitation(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
  const id = new URL(request.url).pathname.split('/')[3];
  if (!id) return err('Invitation ID required', 400);
  const inv = await env.DB.prepare('SELECT * FROM pilot_invitations WHERE id = ?').bind(id).first();
  if (!inv) return err('Invitation not found', 404);
  if (inv.accepted_at) return err('Cannot revoke an already-accepted invitation');
  if (inv.revoked_at) return err('Invitation is already revoked');
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE pilot_invitations SET revoked_at = ?, revoked_by = ? WHERE id = ?').bind(now, user.sub, id).run();
  await audit(env.DB, 'pilot_invitation_revoked', user.sub, 'pilot_invitation', { invitationId: id, email: inv.invited_email });
  return json({ success: true, message: 'Invitation revoked.' });
}

async function handleExtendPilotInvitation(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
  const id = new URL(request.url).pathname.split('/')[3];
  if (!id) return err('Invitation ID required', 400);
  const inv = await env.DB.prepare('SELECT * FROM pilot_invitations WHERE id = ?').bind(id).first();
  if (!inv) return err('Invitation not found', 404);
  if (inv.revoked_at) return err('Cannot extend a revoked invitation');
  if (inv.accepted_at) return err('Cannot extend an already-accepted invitation');
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('UPDATE pilot_invitations SET expires_at = ? WHERE id = ?').bind(newExpiry, id).run();
  await audit(env.DB, 'pilot_invitation_extended', user.sub, 'pilot_invitation', { invitationId: id, newExpiry });
  return json({ success: true, expiresAt: newExpiry });
}

async function handleDeactivatePilotAccount(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
  const id = new URL(request.url).pathname.split('/')[3];
  if (!id) return err('User ID required', 400);
  const target = await env.DB.prepare('SELECT id, name, email, pilot_account FROM users WHERE id = ?').bind(id).first();
  if (!target) return err('User not found', 404);
  if (!target.pilot_account) return err('This is not a pilot account');
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE users SET pilot_status = ?, status = ?, updated_at = ? WHERE id = ?').bind('deactivated', 'rejected', now, id).run();
  await audit(env.DB, 'pilot_account_deactivated', user.sub, 'user', { targetUserId: id, email: target.email });
  return json({ success: true, message: `Pilot account for ${target.name} deactivated.` });
}

async function handlePilotFeedback(request, user, env) {
  const guard = requireAuth(user); if (guard) return guard;
  // Verify user is a pilot account
  const dbUser = await env.DB.prepare('SELECT pilot_account, role FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.pilot_account) return err('Feedback submission is for pilot accounts only', 403);
  const body = await request.json().catch(() => null);
  if (!body) return err('Request body required');
  const id = randomHex(8);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO pilot_feedback (id, user_id, pilot_role, overall_rating, navigation_rating, value_rating, most_valuable, needs_improvement, would_recommend, additional_comments, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, user.sub, dbUser.role,
    body.overallRating ?? null, body.navigationRating ?? null, body.valueRating ?? null,
    body.mostValuable?.trim() ?? null, body.needsImprovement?.trim() ?? null,
    body.wouldRecommend != null ? (body.wouldRecommend ? 1 : 0) : null,
    body.additionalComments?.trim() ?? null,
    now
  ).run();
  await audit(env.DB, 'pilot_feedback_submitted', user.sub, 'pilot_feedback', { feedbackId: id });
  return json({ success: true, message: 'Feedback submitted. Thank you!' });
}

async function handleListPilotFeedback(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
  const { results } = await env.DB.prepare(
    `SELECT pf.*, u.name as user_name, u.email as user_email
     FROM pilot_feedback pf
     LEFT JOIN users u ON u.id = pf.user_id
     ORDER BY pf.submitted_at DESC`
  ).all();
  return json({ feedback: results, total: results.length });
}

async function handlePilotAnalytics(request, user, env) {
  const guard = requireRole(user, 'admin', 'super_admin'); if (guard) return guard;
  const now = new Date().toISOString();
  const [totalRow, activeRow, byRoleRows, invStatsRow] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE pilot_account = 1`).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE pilot_account = 1 AND pilot_status = 'active'`).first(),
    env.DB.prepare(`SELECT role, COUNT(*) as count FROM users WHERE pilot_account = 1 GROUP BY role`).all(),
    env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN accepted_at IS NOT NULL THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) as revoked,
        SUM(CASE WHEN accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? THEN 1 ELSE 0 END) as pending
      FROM pilot_invitations
    `).bind(now).first(),
  ]);
  return json({
    accounts: {
      total: totalRow?.count ?? 0,
      active: activeRow?.count ?? 0,
      byRole: Object.fromEntries((byRoleRows.results ?? []).map(r => [r.role, r.count])),
    },
    invitations: {
      total: invStatsRow?.total ?? 0,
      accepted: invStatsRow?.accepted ?? 0,
      revoked: invStatsRow?.revoked ?? 0,
      pending: invStatsRow?.pending ?? 0,
    },
  });
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!adminSeedDone) {
      adminSeedDone = true;
      await runMigrations(env.DB);
      await seedAdmin(env.DB, env);
    }

    if (path === '/health') return json({ status: 'ok', timestamp: new Date().toISOString() });
    if (path === '/ping')   return new Response('pong');

    // /app → serve the React dashboard
    if (path === '/app' || path === '/app/') {
      return Response.redirect(new URL('/app.html', request.url).toString(), 301);
    }

    // Auth routes (no token required)
    if (path === '/auth/register'        && request.method === 'POST') return handleRegister(request, env, ctx);
    if (path === '/auth/login'           && request.method === 'POST') return handleLogin(request, env);
    if (path === '/auth/logout'          && request.method === 'POST') return handleLogout(request, env);
    if (path === '/auth/refresh'         && request.method === 'POST') return handleRefresh(request, env);
    if (path === '/auth/forgot-password'      && request.method === 'POST') return handleForgotPassword(request, env, ctx);
    if (path === '/auth/reset-password'       && request.method === 'POST') return handleResetPassword(request, env);
    if (path === '/auth/first-password-change' && request.method === 'POST') return handleFirstPasswordChange(request, env);
    // Admin invite — public (token-gated, no JWT required)
    if (path.startsWith('/auth/invite/') && request.method === 'GET')  return handleGetInviteInfo(request, env);
    if (path.startsWith('/auth/invite/') && request.method === 'POST') return handleAcceptInvite(request, env);
    if (path === '/auth/mfa/setup'   && request.method === 'POST') return handleMfaSetup(request, env);
    if (path === '/auth/mfa/confirm' && request.method === 'POST') return handleMfaConfirm(request, env);
    if (path === '/auth/mfa/disable' && request.method === 'POST') return handleMfaDisable(request, env);

    // Pilot invite — public (token-gated, no JWT required)
    if (path.startsWith('/pilot/invite/') && request.method === 'GET')  return handleGetPilotInviteInfo(request, env);
    if (path.startsWith('/pilot/invite/') && request.method === 'POST') return handleAcceptPilotInvite(request, env);

    // Public badge verification (no auth required)
    if (path.startsWith('/badge/verify/') && request.method === 'GET') {
      const badgeId = path.replace('/badge/verify/', '').split('/')[0];
      return handleBadgeVerify(badgeId, env);
    }

    // Protected routes — validate JWT first
    const user = await authenticate(request, env);

    if (path === '/dashboard/youth'          && request.method === 'GET') {
      const g = requireRole(user, 'youth', 'admin', 'super_admin'); if (g) return g;
      return handleDashboardYouth(request, user);
    }
    if (path === '/dashboard/employer' && request.method === 'GET') return handleDashboardEmployer(request, user, env);
    if (path === '/dashboard/coach'          && request.method === 'GET') {
      const g = requireRole(user, 'admin', 'super_admin'); if (g) return g;
      return handleDashboardCoach(request);
    }
    if (path === '/dashboard/postsecondary'  && request.method === 'GET') {
      const g = requireRole(user, 'postsecondary', 'admin', 'super_admin'); if (g) return g;
      return handleDashboardPostSecondary(request, user);
    }

    // Admin-only: user management
    if (path === '/admin/users/pending'       && request.method === 'GET')  return handleAdminPendingUsers(request, user, env);
    if (path === '/admin/users/all'           && request.method === 'GET')  return handleAdminAllUsers(request, user, env);
    if (path === '/admin/users/action'        && request.method === 'POST') return handleAdminUserAction(request, user, env, ctx);
    if (path === '/admin/notifications'       && request.method === 'GET')  return handleAdminNotifications(request, user, env);

    if (path === '/dashboard/competency' && request.method === 'GET')  return handleCompetencyGet(request, user, env);
    if (path === '/dashboard/competency' && request.method === 'POST') return handleCompetencySave(request, user, env);

    if (path === '/audit/logs' && request.method === 'GET') return handleAuditLogs(request, user, env);

    if (path === '/acia/chat'        && request.method === 'POST') return handleAciaChat(request, env);
    if (path === '/acia/result'      && request.method === 'GET')  return handleAciaGetResult(request, user, env);
    if (path === '/acia/result'      && request.method === 'POST') return handleAciaSaveResult(request, user, env);
    if (path === '/program/status'   && request.method === 'GET')  return handleProgramStatus(request, user, env);
    if (path === '/program/enroll'   && request.method === 'POST') return handleProgramEnroll(request, user, env);
    if (path === '/program/complete' && request.method === 'POST') return handleProgramComplete(request, user, env);

    if (path === '/transition/profile' && request.method === 'GET')  return handleTransitionProfileGet(request, user, env);
    if (path === '/transition/profile' && request.method === 'POST') return handleTransitionProfileSave(request, user, env);
    if (path === '/transition/result'  && request.method === 'POST') return handleTransitionResultSave(request, user, env);

    if (path === '/acia/assessment/complete' && request.method === 'POST') return handleAciaAssessmentComplete(request, user, env, ctx);
    if (path === '/acia/assessments'         && request.method === 'GET')  return handleAciaAssessmentsGet(request, user, env);
    if (path === '/acia/eligibility'         && request.method === 'GET')  return handleAciaEligibility(request, user, env);
    if (path === '/program/interest'         && request.method === 'POST') return handleProgramInterest(request, user, env, ctx);

    // Email verification
    if (path === '/auth/verify-email/send'    && request.method === 'POST') return handleSendEmailVerification(request, user, env, ctx);
    if (path === '/auth/verify-email/confirm' && request.method === 'POST') return handleConfirmEmailVerification(request, user, env);

    // Organization directory (admin only)
    if (path === '/admin/organizations'          && request.method === 'GET')  return handleOrganizationsGet(request, user, env);
    if (path === '/admin/organizations'          && request.method === 'POST') return handleOrganizationCreate(request, user, env);
    if (path.startsWith('/admin/organizations/') && request.method === 'PUT')  return handleOrganizationUpdate(request, user, env);

    // Admin assessment override
    if (path === '/admin/assessment/unlock' && request.method === 'POST') return handleAdminAssessmentUnlock(request, user, env);

    // Admin invite management (super_admin only)
    if (path === '/admin/invitations'      && request.method === 'GET')  return handleAdminInviteList(request, user, env);
    if (path === '/admin/invitations/send' && request.method === 'POST') return handleSendAdminInvite(request, user, env, ctx);

    // Pilot invitation management (admin / super_admin)
    if (path === '/pilot/invitations'                                           && request.method === 'GET')  return handleListPilotInvitations(request, user, env);
    if (path === '/pilot/invitations'                                           && request.method === 'POST') return handleCreatePilotInvitation(request, user, env);
    if (path.startsWith('/pilot/invitations/') && path.endsWith('/revoke')      && request.method === 'PUT')  return handleRevokePilotInvitation(request, user, env);
    if (path.startsWith('/pilot/invitations/') && path.endsWith('/extend')      && request.method === 'PUT')  return handleExtendPilotInvitation(request, user, env);
    if (path.startsWith('/pilot/accounts/')    && path.endsWith('/deactivate')  && request.method === 'PUT')  return handleDeactivatePilotAccount(request, user, env);
    if (path === '/pilot/feedback'                                              && request.method === 'POST') return handlePilotFeedback(request, user, env);
    if (path === '/pilot/feedback'                                              && request.method === 'GET')  return handleListPilotFeedback(request, user, env);
    if (path === '/pilot/analytics'                                             && request.method === 'GET')  return handlePilotAnalytics(request, user, env);

    // Employer signal submission (employer-facing)
    if (path === '/employer/signals' && request.method === 'GET')  return handleEmployerSignals(request, user, env);
    if (path === '/employer/signals' && request.method === 'POST') return handleEmployerSignalSubmit(request, user, env);

    // AACP Connector
    if (path === '/connector/overview'   && request.method === 'GET')  return handleConnectorOverview(request, user, env);
    if (path === '/connector/signals'    && request.method === 'GET')  return handleSignalsList(request, user, env);
    if (path === '/connector/signals'    && request.method === 'POST') return handleSignalCreate(request, user, env);
    if (path.startsWith('/connector/signals/') && request.method === 'PUT') return handleSignalUpdate(request, user, env);
    if (path === '/connector/intelligence'  && request.method === 'GET')  return handleConnectorIntelligence(request, user, env);
    if (path === '/connector/emerging-skills' && request.method === 'GET') return handleEmergingSkills(request, user, env);
    if (path === '/connector/gap'        && request.method === 'GET')  return handleCompetencyGap(request, user, env);
    if (path === '/postsecondary/curriculum-mappings' && request.method === 'GET')  return handleCurriculumMappings(request, user, env);
    if (path === '/postsecondary/curriculum-mappings' && request.method === 'POST') return handleCurriculumMappingCreate(request, user, env);

    // Stubs — authenticated
    if (path.startsWith('/privacy') || path.startsWith('/ai') || path.startsWith('/telemetry')) {
      const g = requireAuth(user); if (g) return g;
      return json({ message: 'Coming soon', path });
    }

    // Fall through to static assets (index.html, app.html, JS/CSS)
    return env.ASSETS.fetch(request);
  },
};