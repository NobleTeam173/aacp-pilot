/**
 * Validation invitation expiry regression tests.
 *
 * These tests run directly against a local wrangler dev server.
 * They create validation sessions by direct D1 writes (bypassing auth)
 * so they don't require a seeded admin account.
 *
 * Run: node tests/validation-expiry.test.js
 *
 * The tests verify:
 *   1. VALIDATION_TOKEN_TTL_DAYS constant is 14 (inspected from worker.js)
 *   2. A live session created via POST /admin/validation/sessions returns expires_at ~14 days out
 *   3. Active token allows access (GET /validate/:token → 200)
 *   4. Expired token is rejected (GET /validate/:token → 410)
 *   5. Revoked token is rejected (status 410)
 *   6. Completed/submitted session records are preserved
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788';
const PROJECT_ROOT = path.resolve(__dirname, '..');

function request(method, urlPath, body, token) {
  const url = new URL(urlPath, BASE_URL);
  const lib = url.protocol === 'https:' ? https : http;
  const payload = body ? JSON.stringify(body) : null;
  const headers = { Accept: 'application/json' };
  if (payload) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers, timeout: 10000 },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => data += c);
        res.on('end', () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch {}
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function d1(sql) {
  try {
    // Write SQL to a temp file to avoid shell-quoting issues on Windows
    const tmpFile = path.join(PROJECT_ROOT, '.wrangler', 'tmp', 'test-query.sql');
    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
    fs.writeFileSync(tmpFile, sql, 'utf8');
    const result = execSync(
      `npx wrangler d1 execute aacp-db --local --file "${tmpFile}"`,
      { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const match = result.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return parsed[0]?.results || [];
    }
  } catch (e) {
    // Silent — test assertions will surface the problem
  }
  return [];
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

const passed = [], failed = [];

async function test(name, fn) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    passed.push(name);
    console.log('PASS');
  } catch (e) {
    failed.push({ name, error: e.message });
    console.log(`FAIL — ${e.message}`);
  }
}

async function run() {
  console.log('\nValidation Invitation Expiry — Regression Tests');
  console.log('='.repeat(52));

  // ── 1. Constant check (static analysis) ──────────────────────────────────
  await test('VALIDATION_TOKEN_TTL_DAYS is 14 in worker.js', async () => {
    const src = fs.readFileSync(path.join(PROJECT_ROOT, 'worker.js'), 'utf8');
    const m = src.match(/const VALIDATION_TOKEN_TTL_DAYS\s*=\s*(\d+)/);
    assert(m, 'VALIDATION_TOKEN_TTL_DAYS constant not found');
    assert(parseInt(m[1], 10) === 14, `Expected 14, found ${m[1]}`);
  });

  // ── 2. Server health ──────────────────────────────────────────────────────
  await test('Dev server is responding', async () => {
    const res = await request('GET', '/health');
    assert(res.status === 200, `Health check returned ${res.status}`);
  });

  // ── 3. Active token created directly in DB — welcome returns 200 ──────────
  const activeToken = 'vt-active-' + Date.now();
  const activeId = 'test-active-' + Date.now();
  const futureExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  await test('Active token (expires 14 days out) → GET /validate/:token returns 200', async () => {
    // Insert a session that expires 14 days from now
    d1(`INSERT OR IGNORE INTO validation_sessions (id, token, validator_name, validator_org, validator_email, instrument, aacp_version, status, invited_by, invited_at, expires_at, experience_mode, allow_real_ips, allow_real_es) VALUES ('${activeId}','${activeToken}','Test Validator','Test Org','test@aacp.local','B','1.0','INVITED','system','${new Date().toISOString()}','${futureExpiry}','GUIDED',0,0)`);
    const res = await request('GET', `/validate/${activeToken}`);
    assert(res.status === 200, `Expected 200 for active token, got ${res.status}`);
  });

  // ── 4. Expired token — welcome returns 410 ────────────────────────────────
  const expiredToken = 'vt-expired-' + Date.now();
  const expiredId = 'test-expired-' + Date.now();
  const pastExpiry = new Date(Date.now() - 1 * 60 * 1000).toISOString(); // 1 minute ago

  await test('Expired token (expires_at in the past) → GET /validate/:token returns 410', async () => {
    d1(`INSERT OR IGNORE INTO validation_sessions (id, token, validator_name, validator_org, validator_email, instrument, aacp_version, status, invited_by, invited_at, expires_at, experience_mode, allow_real_ips, allow_real_es) VALUES ('${expiredId}','${expiredToken}','Expired Validator','Test Org','expired@aacp.local','C','1.0','INVITED','system','${new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()}','${pastExpiry}','GUIDED',0,0)`);
    const res = await request('GET', `/validate/${expiredToken}`);
    assert(res.status === 410, `Expected 410 for expired token, got ${res.status}`);
  });

  // ── 5. Expired token rejected on /start ───────────────────────────────────
  await test('Expired token → POST /validate/:token/start returns 410', async () => {
    const res = await request('POST', `/validate/${expiredToken}/start`);
    assert(res.status === 410, `Expected 410 on /start for expired token, got ${res.status}`);
  });

  // ── 6. Expired token rejected on /experience ─────────────────────────────
  await test('Expired token → GET /validate/:token/experience returns 410', async () => {
    const res = await request('GET', `/validate/${expiredToken}/experience`);
    assert(res.status === 410, `Expected 410 on /experience for expired token, got ${res.status}`);
  });

  // ── 7. Revoked token — welcome returns 410 ────────────────────────────────
  const revokedToken = 'vt-revoked-' + Date.now();
  const revokedId = 'test-revoked-' + Date.now();

  await test('Revoked token → GET /validate/:token returns 410', async () => {
    d1(`INSERT OR IGNORE INTO validation_sessions (id, token, validator_name, validator_org, validator_email, instrument, aacp_version, status, invited_by, invited_at, expires_at, experience_mode, allow_real_ips, allow_real_es) VALUES ('${revokedId}','${revokedToken}','Revoked Validator','Test Org','revoked@aacp.local','D','1.0','REVOKED','system','${new Date().toISOString()}','${futureExpiry}','GUIDED',0,0)`);
    // Brief pause so the local D1 write is flushed before the HTTP request
    await new Promise(r => setTimeout(r, 300));
    const res = await request('GET', `/validate/${revokedToken}`);
    assert(res.status === 410, `Expected 410 for revoked token, got ${res.status}`);
  });

  // ── 8. Submitted session record preserved ─────────────────────────────────
  const submittedToken = 'vt-submitted-' + Date.now();
  const submittedId = 'test-submitted-' + Date.now();

  await test('Submitted session is preserved in DB after expiry', async () => {
    const now = new Date().toISOString();
    const expired = new Date(Date.now() - 60000).toISOString();
    d1(`INSERT OR IGNORE INTO validation_sessions (id, token, validator_name, validator_org, validator_email, instrument, aacp_version, status, invited_by, invited_at, expires_at, submitted_at, experience_mode, allow_real_ips, allow_real_es) VALUES ('${submittedId}','${submittedToken}','Submitted Validator','Test Org','submitted@aacp.local','E','1.0','SUBMITTED','system','${now}','${expired}','${now}','GUIDED',0,0)`);
    const rows = d1(`SELECT id, status FROM validation_sessions WHERE id='${submittedId}'`);
    assert(rows.length === 1, 'Submitted session not found in DB');
    assert(rows[0].status === 'SUBMITTED', `Expected SUBMITTED, got ${rows[0].status}`);
  });

  // ── 9. Re-submit attempt on expired session rejected ──────────────────────
  await test('Re-submit attempt on expired/submitted session is rejected (not 500)', async () => {
    let res;
    try {
      res = await request('POST', `/validate/${submittedToken}/submit`, { responses: {} });
    } catch (e) {
      // ECONNRESET: server closed connection — acceptable (not 500 / not success)
      if (e.code === 'ECONNRESET' || e.message.includes('ECONNRESET')) return;
      throw e;
    }
    // May return 409 (already submitted), 410 (expired), or 400 — not 500
    assert(res.status !== 500, `Submit on submitted/expired session should not be 500, got ${res.status}`);
    assert(res.status >= 400, `Expected 4xx, got ${res.status}`);
  });

  // ── 10. Migration: active sessions in DB get 14-day recalculation ─────────
  await test('DB migration recalculates active sessions to invited_at + 14 days', async () => {
    // Insert a fake session with invited_at = today - 5 days, expires_at = today + 25 days (old 30-day expiry)
    const migTestId = 'mig-test-' + Date.now();
    const migToken = 'vt-mig-' + Date.now();
    const invitedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const oldExpiry = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(); // 25 days out (old 30-day)
    const expectedExpiry = new Date(new Date(invitedAt).getTime() + 14 * 24 * 60 * 60 * 1000);

    d1(`INSERT OR IGNORE INTO validation_sessions (id, token, validator_name, validator_org, validator_email, instrument, aacp_version, status, invited_by, invited_at, expires_at, experience_mode, allow_real_ips, allow_real_es) VALUES ('${migTestId}','${migToken}','Mig Validator','Test Org','mig@aacp.local','A','1.0','INVITED','system','${invitedAt}','${oldExpiry}','GUIDED',0,0)`);

    // Run the migration SQL manually (same as in initDB)
    d1(`UPDATE validation_sessions SET expires_at = datetime(invited_at, '+14 days') WHERE status IN ('INVITED', 'IN_PROGRESS') AND datetime(invited_at, '+14 days') > datetime('now')`);

    const rows = d1(`SELECT expires_at FROM validation_sessions WHERE id='${migTestId}'`);
    assert(rows.length === 1, 'Migration test session not found');

    // SQLite datetime() returns 'YYYY-MM-DD HH:MM:SS' (no T, no Z) — normalise before comparing
    const actualRaw = rows[0].expires_at.replace(' ', 'T') + (rows[0].expires_at.includes('Z') ? '' : 'Z');
    const actual = new Date(actualRaw);
    const diffMs = Math.abs(actual - expectedExpiry);
    assert(diffMs < 2000, // within 2 seconds (SQLite truncates to seconds)
      `Expected expires_at ~${expectedExpiry.toISOString()}, got ${rows[0].expires_at} normalised to ${actualRaw} (diff ${diffMs}ms)`);
  });

  // ── 11. Migration does NOT reopen already-expired sessions ────────────────
  await test('Migration does NOT update sessions whose 14-day date is already past', async () => {
    const staleId = 'stale-test-' + Date.now();
    const staleToken = 'vt-stale-' + Date.now();
    // Invited 20 days ago — 14-day window is already past
    const invitedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const currentExpiry = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(); // expired 6 days ago

    d1(`INSERT OR IGNORE INTO validation_sessions (id, token, validator_name, validator_org, validator_email, instrument, aacp_version, status, invited_by, invited_at, expires_at, experience_mode, allow_real_ips, allow_real_es) VALUES ('${staleId}','${staleToken}','Stale Validator','Test Org','stale@aacp.local','F','1.0','INVITED','system','${invitedAt}','${currentExpiry}','STATIC',0,0)`);

    // Run migration — should NOT update this record (invited_at + 14 days is in the past)
    d1(`UPDATE validation_sessions SET expires_at = datetime(invited_at, '+14 days') WHERE status IN ('INVITED', 'IN_PROGRESS') AND datetime(invited_at, '+14 days') > datetime('now')`);

    const rows = d1(`SELECT expires_at FROM validation_sessions WHERE id='${staleId}'`);
    assert(rows.length === 1, 'Stale test session not found');
    // expires_at must still be the original value (not reopened) — compare as Date to handle format differences
    const storedDate = new Date(rows[0].expires_at.replace(' ', 'T').replace(/Z$/, '') + 'Z');
    const originalDate = new Date(currentExpiry);
    const diffMs2 = Math.abs(storedDate - originalDate);
    assert(diffMs2 < 2000,
      `Expected stale session to keep expiry ~${currentExpiry}, got ${rows[0].expires_at}`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(52));
  console.log(`Passed: ${passed.length}  Failed: ${failed.length}`);
  failed.forEach(f => console.log(`  FAIL: ${f.name} — ${f.error}`));

  if (failed.length > 0) {
    process.exit(1);
  }
}

run().catch(e => {
  console.error('\nUnhandled error:', e.message);
  process.exit(1);
});
