// Express adapter — wraps worker.js fetch handler for Node.js / ECS.
import express from 'express';
import { buildEnv } from './src/env-builder.js';
import worker from './worker.js';

const app  = express();
const PORT = process.env.PORT || 8080;
const env  = buildEnv();

// Parse body as raw buffer so worker can re-read it as text/json
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// Health check — ALB and ECS use this
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// All other requests forwarded to the Cloudflare Worker handler
app.all('*', async (req, res) => {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers.host || 'aviationaerospacecompetency.com';
    const url   = `${proto}://${host}${req.originalUrl}`;

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k] = Array.isArray(v) ? v.join(', ') : v;
    }

    const init = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method) && req.body?.length) {
      init.body = req.body;
    }

    const cfReq = new Request(url, init);
    const cfRes = await worker.fetch(cfReq, env, {
      waitUntil(p) { p.catch(err => console.error('[ctx.waitUntil]', err)); },
    });

    res.status(cfRes.status);
    cfRes.headers.forEach((v, k) => {
      // Skip headers Express sets automatically
      if (!['content-encoding', 'transfer-encoding'].includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    });

    const buf = Buffer.from(await cfRes.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error('[server] unhandled error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
