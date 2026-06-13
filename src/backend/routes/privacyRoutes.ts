import express from 'express';
import { authenticateToken, authorizeRoles } from '../auth/middleware';
import { ConsentService } from '../privacy/privacyService';
import { AuditService } from '../audit/auditService';

interface AuthRequest extends express.Request {
  user?: { sub: string; role: string };
}

const router = express.Router();
const authSecret = process.env.AACP_ACCESS_TOKEN_SECRET ?? 'aacp-access-secret';

router.use(authenticateToken(authSecret));

router.post('/consent/grant', authorizeRoles('youth', 'coach', 'employer', 'admin'), (req: AuthRequest, res, next) => {
  try {
    const userId = (req.body.userId as string | undefined) || req.user?.sub;
    if (!userId) {
      throw new Error('Missing userId for consent grant');
    }

    const consent = ConsentService.grantConsent({
      userId,
      consentType: req.body.consentType,
      source: req.body.source,
      details: req.body.details,
    });

    AuditService.logEvent({
      userId,
      action: 'consent_granted',
      entityType: 'ConsentRecord',
      entityId: consent.id,
      details: { consentType: consent.consentType },
      source: 'api',
      outcome: 'success',
    });

    res.status(201).json(consent);
  } catch (error: unknown) {
    next(error);
  }
});

router.post('/consent/withdraw', authorizeRoles('youth', 'coach', 'employer', 'admin'), (req: AuthRequest, res, next) => {
  try {
    const userId = (req.body.userId as string | undefined) || req.user?.sub;
    if (!userId) {
      throw new Error('Missing userId for consent withdrawal');
    }

    const consent = ConsentService.withdrawConsent({
      userId,
      consentType: req.body.consentType,
    });

    AuditService.logEvent({
      userId,
      action: 'consent_withdrawn',
      entityType: 'ConsentRecord',
      entityId: consent.id,
      details: { consentType: consent.consentType },
      source: 'api',
      outcome: 'success',
    });

    res.json(consent);
  } catch (error: unknown) {
    next(error);
  }
});

router.get('/consents', authorizeRoles('youth', 'coach', 'employer', 'admin'), (req: AuthRequest, res, next) => {
  try {
    const queryUserId = req.query.userId?.toString();
    const targetUserId = queryUserId || req.user?.sub;

    if (!targetUserId) {
      throw new Error('Missing userId for consent query');
    }

    const consents = ConsentService.getConsentsForUser(targetUserId);
    res.json(consents);
  } catch (error: unknown) {
    next(error);
  }
});

export { router as privacyRouter };
