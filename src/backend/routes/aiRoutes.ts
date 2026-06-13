import express from 'express';
import { authenticateToken, authorizeRoles } from '../auth/middleware';
import { CareerCoachServiceImpl, CompetencyEvaluatorServiceImpl, MatchingEngineServiceImpl, WorkforceAnalystServiceImpl } from '../ai/services';
import { AuditService } from '../audit/auditService';
import type { JwtPayload } from '../auth/jwt';

const router = express.Router();
const authSecret = process.env.AACP_ACCESS_TOKEN_SECRET ?? 'aacp-access-secret';

interface AuthRequest extends express.Request {
  user?: JwtPayload;
}

const careerCoachService = new CareerCoachServiceImpl();
const competencyEvaluatorService = new CompetencyEvaluatorServiceImpl();
const workforceAnalystService = new WorkforceAnalystServiceImpl();
const matchingEngineService = new MatchingEngineServiceImpl();

router.use(authenticateToken(authSecret));

router.post('/career', authorizeRoles('youth', 'coach', 'employer', 'admin'), async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.sub ?? req.body.userId;
    const result = await careerCoachService.generateRecommendations({
      ...req.body,
      userId,
    });

    AuditService.logEvent({
      userId: req.user?.sub,
      action: 'ai_request',
      entityType: 'AIRequest',
      details: { endpoint: 'career', payload: req.body },
      source: 'api',
      outcome: 'success',
    });

    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

router.post('/evaluate', authorizeRoles('youth', 'coach', 'employer', 'admin'), async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.sub ?? req.body.userId;
    const result = await competencyEvaluatorService.evaluate({
      ...req.body,
      userId,
    });

    AuditService.logEvent({
      userId: req.user?.sub,
      action: 'ai_request',
      entityType: 'AIRequest',
      details: { endpoint: 'evaluate', payload: req.body },
      source: 'api',
      outcome: 'success',
    });

    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

router.post('/analyze', authorizeRoles('coach', 'employer', 'admin'), async (req: AuthRequest, res, next) => {
  try {
    const result = await workforceAnalystService.analyze(req.body);

    AuditService.logEvent({
      userId: req.user?.sub,
      action: 'ai_request',
      entityType: 'AIRequest',
      details: { endpoint: 'analyze', payload: req.body },
      source: 'api',
      outcome: 'success',
    });

    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

router.post('/match', authorizeRoles('coach', 'employer', 'admin'), async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.sub ?? req.body.userId;
    const result = await matchingEngineService.match({
      ...req.body,
      userId,
    });

    AuditService.logEvent({
      userId: req.user?.sub,
      action: 'ai_request',
      entityType: 'AIRequest',
      details: { endpoint: 'match', payload: req.body },
      source: 'api',
      outcome: 'success',
    });

    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

export { router as aiRouter };
