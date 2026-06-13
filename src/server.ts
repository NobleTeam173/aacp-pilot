import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { authRouter } from './backend/routes/authRoutes';
import { aiRouter } from './backend/routes/aiRoutes';
import { dashboardRouter } from './backend/routes/dashboardRoutes';
import { telemetryRouter } from './backend/routes/telemetryRoutes';
import { privacyRouter } from './backend/routes/privacyRoutes';
import { auditRouter } from './backend/routes/auditRoutes';
import { AuditService } from './backend/audit/auditService';

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - start;
    console.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsed}ms)`);
  });
  next();
});

app.use('/auth', authRouter);
app.use('/ai', aiRouter);
app.use('/dashboard', dashboardRouter);
app.use('/telemetry', telemetryRouter);
app.use('/privacy', privacyRouter);
app.use('/audit', auditRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ping', (_req, res) => {
  res.send('pong');
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  AuditService.logEvent({
    action: 'server_start',
    entityType: 'Unknown',
    details: { port },
    outcome: 'success',
  });
  console.log(`AACP server listening on http://localhost:${port}`);
});
