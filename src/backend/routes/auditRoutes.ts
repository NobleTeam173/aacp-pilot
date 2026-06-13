import express from 'express';
import { authenticateToken, authorizeRoles } from '../auth/middleware';
import { AuditService } from '../audit/auditService';

const router = express.Router();
const authSecret = process.env.AACP_ACCESS_TOKEN_SECRET ?? 'aacp-access-secret';

router.use(authenticateToken(authSecret));

router.get('/logs', authorizeRoles('admin'), (req, res) => {
  const userId = req.query.userId?.toString();
  const action = req.query.action?.toString() as any;
  const entityType = req.query.entityType?.toString() as any;
  const events = AuditService.listEvents({ userId, action, entityType });
  res.json(events);
});

export { router as auditRouter };
