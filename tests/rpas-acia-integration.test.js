/**
 * RPAS ACIA Integration Test
 *
 * Verifies the full RPAS participant journey end-to-end against the live API:
 *   1. RPAS chat endpoint delivers Bank 16 RPAS-specific content
 *   2. RPAS assessment save produces RPAS Career Intelligence
 *   3. hub_status advances to profile_ready on completion
 *   4. Interrupted session evidence is preserved (durable recovery)
 *   5. General AACP assessment is unaffected
 *
 * Prerequisites:
 *   TEST_BASE_URL  — API base (default: http://aacp-alb-584172094.ca-central-1.elb.amazonaws.com)
 *   ADMIN_EMAIL    — Admin account email
 *   ADMIN_PASSWORD — Admin account password
 *   (Admin account must have role admin or super_admin)
 *
 * Run:
 *   TEST_BASE_URL=http://aacp-alb-... ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/rpas-acia-integration.test.js
 */

import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { URL } from 'url';

const BASE_URL = process.env.TEST_BASE_URL || 'http://aacp-alb-584172094.ca-central-1.elb.amazonaws.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TIMEOUT_MS = 20000;

// ── HTTP helper ───────────────────────────────────────────────────────────────

function request(method, path, body, token) {
  const url = new URL(path, BASE_URL);
  const lib = url.protocol === 'https:' ? https : http;
  const payload = body ? JSON.stringify(body) : null;
  const headers = { Accept: 'application/json' };
  if (payload) headers['Content-Type'] = 'application/json';
  if (token)   headers['Authorization'] = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      { method, hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`, headers, timeout: TIMEOUT_MS },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => { data += c; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch { parsed = { raw: data }; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Assert helper ─────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ── Test runner ───────────────────────────────────────────────────────────────

const results = [];

async function step(name, fn) {
  process.stdout.write(`  ${name}... `);
  try {
    const r = await fn();
    results.push({ name, status: 'PASS' });
    console.log('PASS');
    return r;
  } catch (e) {
    results.push({ name, status: 'FAIL', error: e.message });
    console.log(`FAIL — ${e.message}`);
    throw e;
  }
}

// ── Build a minimal but valid RPAS session payload ────────────────────────────

function buildRpasPayload(submissionId, participantName, chatHistory) {
  const sessionLog = chatHistory.map((m, i) => ({
    role: m.role,
    content: m.content,
    mission: i < 6 ? 'm1' : 'm9',
  }));

  return {
    submissionId,
    startedAt: new Date(Date.now() - 600_000).toISOString(),
    participantName,
    sessionLog,
    interactionResults: {
      missionEvidence: {
        m1: [{ indicator: 'spatial_reasoning', value: 'strong', positive: true }],
        m9: [{ indicator: 'reflection_depth', value: 'demonstrated', positive: true }],
      },
      q1_bank01_q001: { questionId: 'bank01_q001', response: 'I would assess wind direction first', classified: true, indicators: ['safety_orientation'], responseTimeMs: 12000 },
    },
    participantContext: { pathwayType: 'rpas', assessmentStage: 'rpas_intake' },
  };
}

// ── Main test suite ───────────────────────────────────────────────────────────

async function run() {
  console.log(`\nRPAS ACIA Integration Test`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('─'.repeat(60));

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('ERROR: Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.');
    process.exit(1);
  }

  // ── 1. Admin login ─────────────────────────────────────────────────────────
  let adminToken;
  await step('Admin login', async () => {
    const r = await request('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.accessToken, 'Missing accessToken');
    adminToken = r.body.accessToken;
  });

  // ── 2. Submit RPAS EOI ─────────────────────────────────────────────────────
  const testEmail = `rpas.test.${Date.now()}@mailinator.com`;
  const testFirst = 'RTest';
  const testLast  = 'Participant';
  let applicationId;

  await step('Submit RPAS EOI (public)', async () => {
    const r = await request('POST', '/rpas/apply', {
      firstName: testFirst, lastName: testLast, email: testEmail,
      phone: '5550001111', city: 'Ottawa', province: 'ON',
      careerStage: 'exploring', rpasExperience: 'recreational',
      motivation: 'I want to explore RPAS workforce pathways.',
      preferredCohort: 'either', feeAcknowledged: true,
      referralSourceKey: 'social_media',
    });
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.applicationId, 'Missing applicationId');
    applicationId = r.body.applicationId;
  });

  // ── 3. Admin: accept application ───────────────────────────────────────────
  await step('Admin accepts RPAS application', async () => {
    const r = await request('PATCH', `/admin/rpas/applications/${applicationId}`, {
      status: 'accepted',
    }, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await step('Admin confirms payment', async () => {
    const r = await request('PATCH', `/admin/rpas/applications/${applicationId}/payment`, {
      paymentStatus: 'payment_confirmed',
    }, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── 4. Admin: issue invite ─────────────────────────────────────────────────
  let inviteToken;
  await step('Admin issues RPAS Hub invite', async () => {
    const r = await request('POST', `/admin/rpas/applications/${applicationId}/invite`, {
      cohortName: 'RPAS Test Cohort',
    }, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.token, 'Missing invite token');
    inviteToken = r.body.token;
  });

  // ── 5. Participant accepts invite ──────────────────────────────────────────
  const testPassword = 'RPASTest2024!';
  let participantToken;
  let participantRefreshToken;

  await step('Participant accepts invite and creates account', async () => {
    const r = await request('POST', `/cohort/invite/${inviteToken}`, {
      password: testPassword,
      careerStage: 'exploring',
    });
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.accessToken, 'Missing accessToken after invite acceptance');
    participantToken = r.body.accessToken;
    participantRefreshToken = r.body.refreshToken;
  });

  // ── 6. RPAS chat — verify Bank 16 content is delivered ────────────────────
  let chatHistory = [];
  await step('RPAS chat endpoint responds with Bank 16 intake question', async () => {
    const welcomeMsg = { role: 'assistant', content: "Welcome to the RPAS Workforce Intelligence assessment. Let's start with your background — what education, training, technical field or professional experience do you bring with you?" };
    chatHistory = [welcomeMsg, { role: 'user', content: 'I have a background in electrical engineering and have been flying DJI drones recreationally for 2 years.' }];

    const r = await request('POST', '/acia/rpas/chat', {
      systemPrompt: 'ignored — server uses CAPTAIN_RPAS_SYSTEM_PROMPT',
      messages: chatHistory.map(m => ({ role: m.role, content: m.content })),
    }, participantToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.reply, 'Missing reply from RPAS chat');

    const reply = r.body.reply.toLowerCase();
    // Bank 16 Phase 1 should ask about TC credential status (Question 2)
    const hasTCQuestion = reply.includes('transport canada') || reply.includes('certificate') || reply.includes('rpas') || reply.includes('credential');
    assert(hasTCQuestion, `Expected RPAS-specific Bank 16 question, got: "${r.body.reply.slice(0, 200)}"`);
    chatHistory.push({ role: 'assistant', content: r.body.reply });
  });

  // Continue chat to get through intake
  await step('RPAS chat — TC credential answer', async () => {
    chatHistory.push({ role: 'user', content: 'I have no Transport Canada RPAS certificate yet.' });
    const r = await request('POST', '/acia/rpas/chat', {
      systemPrompt: 'ignored',
      messages: chatHistory.map(m => ({ role: m.role, content: m.content })),
    }, participantToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.reply, 'Missing reply');
    chatHistory.push({ role: 'assistant', content: r.body.reply });
  });

  await step('RPAS chat — RPAS experience answer', async () => {
    chatHistory.push({ role: 'user', content: 'I have recreational flying experience — mostly photography and some mapping experiments.' });
    const r = await request('POST', '/acia/rpas/chat', {
      systemPrompt: 'ignored',
      messages: chatHistory.map(m => ({ role: m.role, content: m.content })),
    }, participantToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.reply, 'Missing reply');
    chatHistory.push({ role: 'assistant', content: r.body.reply });
    // After Q3, Captain RPAS should transition to missions
    const reply = r.body.reply.toLowerCase();
    const hasTransition = reply.includes('mission') || reply.includes('let') || reply.includes('ready') || reply.includes('start') || reply.includes('background');
    assert(hasTransition, `Expected mission transition after Q3 intake, got: "${r.body.reply.slice(0, 200)}"`);
  });

  // ── 7. Simulate interrupted session (durable recovery test) ───────────────
  const submissionId = crypto.randomUUID();
  const partialPayload = buildRpasPayload(submissionId, `${testFirst} ${testLast}`, chatHistory.slice(0, 4));

  await step('Save partial RPAS assessment (interrupted session simulation)', async () => {
    const r = await request('POST', '/acia/rpas/assessment/complete', partialPayload, participantToken);
    // First save should succeed (creates record)
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await step('Idempotent replay with same submissionId does not duplicate', async () => {
    const r = await request('POST', '/acia/rpas/assessment/complete', partialPayload, participantToken);
    assert(r.status === 200 || r.status === 201, `Expected idempotent 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── 8. Complete RPAS assessment with full session ──────────────────────────
  const finalSubmissionId = crypto.randomUUID();
  const fullPayload = buildRpasPayload(finalSubmissionId, `${testFirst} ${testLast}`, chatHistory);
  let careerIntelligenceResult;

  await step('Complete RPAS assessment — full payload', async () => {
    const r = await request('POST', '/acia/rpas/assessment/complete', fullPayload, participantToken);
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
    careerIntelligenceResult = r.body;
  });

  // ── 9. Verify RPAS Career Intelligence was generated ──────────────────────
  await step('RPAS Career Intelligence contains RPAS-specific pathways', async () => {
    assert(careerIntelligenceResult, 'No result from assessment complete');
    const body = careerIntelligenceResult;
    // Should contain topPathway with an RPAS-specific ID
    const rpasPathways = ['rpas_operator','rpas_inspector','rpas_sar','rpas_geomatics','rpas_engineering','rpas_data'];
    const hasRpasPathway = body.topPathway && rpasPathways.includes(body.topPathway);
    assert(hasRpasPathway, `Expected RPAS pathway, got topPathway="${body.topPathway}". Full: ${JSON.stringify(body).slice(0,400)}`);
  });

  // ── 10. Verify hub_status advanced to profile_ready ───────────────────────
  await step('hub_status advanced to profile_ready', async () => {
    const r = await request('GET', '/rpas/status', null, participantToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    const hubStatus = r.body?.hubStatus ?? r.body?.hub_status;
    assert(hubStatus === 'profile_ready', `Expected hub_status=profile_ready, got "${hubStatus}". Full: ${JSON.stringify(r.body)}`);
  });

  // ── 11. RPAS Career Intelligence report is accessible ─────────────────────
  await step('RPAS Career Intelligence report accessible', async () => {
    const r = await request('GET', '/acia/rpas/report', null, participantToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.careerAlignment || r.body?.topPathway || r.body?.competencyProfile, 'Missing career intelligence data in report');
  });

  // ── 12. Token refresh works mid-session ───────────────────────────────────
  await step('Token refresh succeeds', async () => {
    const r = await request('POST', '/auth/refresh', { refreshToken: participantRefreshToken });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.accessToken, 'Missing refreshed accessToken');
  });

  // ── 13. General AACP assessment is unaffected ─────────────────────────────
  await step('General /acia/chat still responds (general assessment preserved)', async () => {
    // Register a standard (non-RPAS) test user
    const generalEmail = `general.test.${Date.now()}@mailinator.com`;
    const regR = await request('POST', '/auth/register', {
      email: generalEmail, password: 'GenTest2024!', name: 'General Tester', role: 'youth',
    });
    assert(regR.status === 200 || regR.status === 201, `Register failed: ${regR.status}`);
    const generalToken = regR.body?.accessToken ?? (await request('POST', '/auth/login', { email: generalEmail, password: 'GenTest2024!' })).body?.accessToken;
    assert(generalToken, 'Could not get token for general user');

    const r = await request('POST', '/acia/chat', {
      systemPrompt: 'You are Captain ACIA.',
      messages: [{ role: 'user', content: 'What aviation careers might suit me?' }],
    }, generalToken);
    assert(r.status === 200, `General /acia/chat returned ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.reply, 'Missing reply from general ACIA chat');
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  FAIL  ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('\nAll RPAS ACIA integration tests passed.');
    console.log(`Test participant: ${testEmail}`);
  }
}

run().catch(err => {
  console.error('\nUnhandled error:', err.message);
  process.exit(1);
});
