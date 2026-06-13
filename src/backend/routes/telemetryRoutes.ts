import express from 'express';
import { authenticateToken, authorizeRoles } from '../auth/middleware';
import { CompetencyEvaluatorServiceImpl } from '../ai/services';
import { summarizeVrTelemetry, validateVrTelemetry } from '../telemetry/vrTelemetry';
import { AuditService } from '../audit/auditService';

const router = express.Router();
const authSecret = process.env.AACP_ACCESS_TOKEN_SECRET ?? 'aacp-access-secret';

router.use(authenticateToken(authSecret));

router.post('/validate', authorizeRoles('youth', 'coach', 'employer', 'admin'), (req, res, next) => {
  try {
    const events = req.body.events;
    const isValid = validateVrTelemetry(events);

    AuditService.logEvent({
      action: 'telemetry_submission',
      entityType: 'TelemetryEvent',
      details: { valid: isValid, eventCount: Array.isArray(events) ? events.length : 0 },
      source: 'api',
      outcome: isValid ? 'success' : 'warning',
    });

    res.json({ valid: isValid });
  } catch (error: unknown) {
    next(error);
  }
});

router.post('/summarize', authorizeRoles('youth', 'coach', 'employer', 'admin'), (req, res, next) => {
  try {
    const events = req.body.events;
    const summary = summarizeVrTelemetry(events);

    AuditService.logEvent({
      action: 'telemetry_submission',
      entityType: 'TelemetryEvent',
      details: { summary },
      source: 'api',
      outcome: 'success',
    });

    res.json(summary);
  } catch (error: unknown) {
    next(error);
  }
});

router.post('/competency/evaluate', authorizeRoles('youth', 'coach', 'employer', 'admin'), async (req, res, next) => {
  try {
    const evaluator = new CompetencyEvaluatorServiceImpl();
    const result = await evaluator.evaluate(req.body);

    AuditService.logEvent({
      action: 'telemetry_submission',
      entityType: 'TelemetryEvent',
      details: { endpoint: 'competency/evaluate', payload: req.body },
      source: 'api',
      outcome: 'success',
    });

    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

export { router as telemetryRouter };
