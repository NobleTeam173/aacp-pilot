const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4000';
const TIMEOUT_MS = 15000;

function rawRequest(method, path, body, token) {
  const url = new URL(path, BASE_URL);
  const lib = url.protocol === 'https:' ? https : http;

  const payload = body ? JSON.stringify(body) : null;
  const headers = {
    Accept: 'application/json',
  };
  if (payload) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    const request = lib.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers,
        timeout: TIMEOUT_MS,
      },
      (response) => {
        let bodyData = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          bodyData += chunk;
        });
        response.on('end', () => {
          let parsed = null;
          try {
            parsed = bodyData ? JSON.parse(bodyData) : null;
          } catch (error) {
            return reject(new Error(`Invalid JSON response: ${error.message} - ${bodyData}`));
          }
          resolve({ status: response.statusCode || 0, body: parsed });
        });
      },
    );

    request.on('error', (err) => reject(err));
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timed out'));
    });

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function run() {
  console.log('Integration test base URL:', BASE_URL);

  const youthUser = {
    email: 'youth+test@aacp.local',
    password: 'YouthP@ss123',
    name: 'Pilot Youth',
    role: 'youth',
  };

  const employerUser = {
    email: 'employer+test@aacp.local',
    password: 'EmployerP@ss123',
    name: 'Pilot Employer',
    role: 'employer',
  };

  const reporter = [];

  async function step(name, callback) {
    process.stdout.write(`- ${name}... `);
    try {
      const result = await callback();
      reporter.push({ name, status: 'passed' });
      console.log('OK');
      return result;
    } catch (error) {
      reporter.push({ name, status: 'failed', error: error.message });
      console.log('FAIL');
      throw error;
    }
  }

  const youthRegistration = await step('Register youth user', async () => {
    const result = await rawRequest('POST', '/auth/register', youthUser);
    assert(result.status === 201, `Expected 201, got ${result.status}`);
    assert(result.body?.userId, 'Missing userId in response');
    return result.body;
  });

  const employerRegistration = await step('Register employer user', async () => {
    const result = await rawRequest('POST', '/auth/register', employerUser);
    assert(result.status === 201, `Expected 201, got ${result.status}`);
    assert(result.body?.userId, 'Missing userId in response');
    return result.body;
  });

  const youthLogin = await step('Login youth user', async () => {
    const result = await rawRequest('POST', '/auth/login', {
      email: youthUser.email,
      password: youthUser.password,
    });
    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(result.body?.accessToken, 'Missing accessToken');
    assert(result.body?.refreshToken, 'Missing refreshToken');
    return result.body;
  });

  const employerLogin = await step('Login employer user', async () => {
    const result = await rawRequest('POST', '/auth/login', {
      email: employerUser.email,
      password: employerUser.password,
    });
    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(result.body?.accessToken, 'Missing accessToken');
    return result.body;
  });

  await step('Refresh youth access token', async () => {
    const result = await rawRequest('POST', '/auth/refresh', {
      refresh_token: youthLogin.refreshToken,
    });
    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(result.body?.accessToken, 'Missing refreshed accessToken');
  });

  await step('Fetch youth dashboard', async () => {
    const result = await rawRequest('GET', '/dashboard/youth', null, youthLogin.accessToken);
    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(result.body?.progress, 'Missing progress in youth dashboard');
  });

  await step('Fetch employer dashboard', async () => {
    const result = await rawRequest('GET', '/dashboard/employer', null, employerLogin.accessToken);
    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(result.body?.summary, 'Missing summary in employer dashboard');
  });

  await step('Query unauthorized audit logs from youth user', async () => {
    const result = await rawRequest('GET', '/audit/logs', null, youthLogin.accessToken);
    assert(result.status === 403 || result.status === 401, `Expected 401 or 403, got ${result.status}`);
  });

  await step('Call AI career recommendation endpoint', async () => {
    const result = await rawRequest(
      'POST',
      '/ai/career',
      {
        userId: youthRegistration.userId,
        userProfile: { targetRole: 'Aviation Technician' },
        currentCompetencies: [{ competencyId: 'comp-001', status: 'in_progress' }],
        assessmentStatus: [],
        readinessIndex: 55,
      },
      youthLogin.accessToken,
    );

    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(Array.isArray(result.body?.recommendations), 'Missing recommendations');
  });

  await step('Call AI competency evaluation endpoint', async () => {
    const result = await rawRequest(
      'POST',
      '/ai/evaluate',
      {
        assessmentId: 'assessment-001',
        userId: youthRegistration.userId,
        competencyId: 'comp-001',
        competencyRubric: [
          { level: 'novice', criteria: 'Basic task completion', weight: 1 },
          { level: 'proficient', criteria: 'Consistent accuracy', weight: 1.2 },
        ],
        vrTelemetryEvents: [
          {
            eventId: 'evt-1',
            timestamp: new Date().toISOString(),
            eventType: 'task_complete',
            details: { success: true },
            qualityScore: 0.9,
          },
        ],
      },
      youthLogin.accessToken,
    );

    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(typeof result.body?.competencyIndex === 'number', 'Missing competencyIndex');
  });

  await step('Validate telemetry endpoint', async () => {
    const result = await rawRequest(
      'POST',
      '/telemetry/validate',
      {
        events: [
          {
            eventId: 'evt-2',
            timestamp: new Date().toISOString(),
            eventType: 'motion_stability',
            details: { stabilized: true },
            qualityScore: 0.8,
          },
        ],
      },
      youthLogin.accessToken,
    );
    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(result.body?.valid === true, 'Telemetry validation failed');
  });

  await step('Summarize telemetry endpoint', async () => {
    const result = await rawRequest(
      'POST',
      '/telemetry/summarize',
      {
        events: [
          {
            eventId: 'evt-3',
            timestamp: new Date().toISOString(),
            eventType: 'control_accuracy',
            details: { accuracy: 0.95 },
            qualityScore: 0.95,
          },
        ],
      },
      youthLogin.accessToken,
    );
    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(typeof result.body?.normalizedScore === 'number', 'Missing normalizedScore');
  });

  console.log('\nIntegration test summary:');
  reporter.forEach((item) => {
    console.log(`  ${item.status.toUpperCase()}: ${item.name}${item.error ? ` - ${item.error}` : ''}`);
  });
  console.log('\nAll configured integration steps completed.');
}

run().catch((error) => {
  console.error('\nIntegration test failure:', error.message);
  process.exit(1);
});
