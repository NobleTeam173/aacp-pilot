import express from 'express';
import { authenticateToken, authorizeRoles } from '../auth/middleware';
import type { JwtPayload } from '../auth/jwt';

const router = express.Router();
const authSecret = process.env.AACP_ACCESS_TOKEN_SECRET ?? 'aacp-access-secret';

interface AuthRequest extends express.Request {
  user?: JwtPayload;
}

router.use(authenticateToken(authSecret));

router.get('/youth', authorizeRoles('youth', 'admin'), (req: AuthRequest, res) => {
  const userId = req.user?.sub ?? req.query.userId?.toString();
  const cohortId = req.user?.cohortId ?? req.query.cohortId?.toString();

  res.json({
    progress: {
      readinessScore: 68,
      competencyCompleted: 7,
      competencyInProgress: 4,
      competencyPendingReview: 2,
      targetRole: 'Aviation Maintenance Technician',
    },
    badges: [
      {
        badgeId: 'badge-vr-safe-operations',
        title: 'Safe VR Operations',
        description: 'Completed the safe operations virtual simulation review.',
        earnedAt: new Date().toISOString(),
      },
    ],
    nextSteps: [
      {
        stepId: 'step-001',
        title: 'Submit evidence for navigation competency',
        description: 'Provide evidence for navigation task completion and instrument practice.',
        type: 'evidence',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    metadata: {
      userId,
      cohortId,
      generatedAt: new Date().toISOString(),
    },
  });
});

router.get('/employer', authorizeRoles('employer', 'admin'), (req, res) => {
  const timeframe = (req.query.timeframe as '30d' | '90d' | 'all') || '30d';
  const cohortId = req.query.cohortId?.toString();

  res.json({
    summary: {
      cohortId,
      participantCount: 50,
      averageReadiness: 72,
      readinessBands: {
        high: 28,
        medium: 46,
        low: 26,
      },
    },
    readinessTrends: [
      { period: '0d', averageReadiness: 72 },
      { period: '7d', averageReadiness: 70 },
      { period: '14d', averageReadiness: 68 },
    ],
    gapMapByRoleFamily: [
      {
        roleFamilyId: 'rf-aviation-ops',
        roleFamilyName: 'Aviation Operations',
        gapScore: 18,
        averageReadiness: 74,
        topCompetencyGaps: [
          { competencyId: 'comp-001', title: 'Flight Procedure Accuracy', gapCount: 8 },
        ],
      },
    ],
    topMatches: [
      {
        userId: 'user-123',
        roleId: 'role-jet-tech',
        roleName: 'Jet Technician Apprentice',
        matchScore: 82,
        readinessScore: 71,
        keyGaps: ['navigation', 'regulatory documentation'],
        status: 'recommended',
      },
    ],
    regulatoryFlags: [
      {
        flagType: 'training_gap',
        count: 3,
        description: 'Some participants require additional CARs-aligned training before role placement.',
      },
    ],
    recentActivity: [
      {
        type: 'assessment',
        title: 'Competency assessment submitted',
        date: new Date().toISOString(),
        status: 'pending',
        details: 'Evidence review queue updated for cohort.',
      },
    ],
    metadata: {
      generatedAt: new Date().toISOString(),
      timeframe,
    },
  });
});

router.get('/coach', authorizeRoles('coach', 'admin'), (req, res) => {
  const cohortId = req.query.cohortId?.toString() || 'cohort-default';

  res.json({
    reviewQueue: [
      {
        assessmentId: 'assessment-001',
        userId: 'user-001',
        userName: 'Ava Pilot',
        competencyTitle: 'Emergency Procedures',
        status: 'pending',
        submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    cohortReadiness: [
      {
        roleFamilyId: 'rf-flight-support',
        roleFamilyName: 'Flight Support',
        averageReadiness: 69,
        participantCount: 22,
      },
    ],
    participantOverview: [
      {
        userId: 'user-001',
        userName: 'Ava Pilot',
        currentScore: 71,
        openItems: 3,
        lastActivity: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    regulatoryReviewItems: [
      {
        itemId: 'item-001',
        itemType: 'assessment',
        reason: 'CARs-aligned evidence required for final review',
        submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    actionItems: [
      {
        actionId: 'action-001',
        title: 'Review evidence submission for navigation task',
        description: 'Review the latest navigation assessment evidence and certify readiness for the pilot cohort.',
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    metadata: {
      cohortId,
      generatedAt: new Date().toISOString(),
    },
  });
});

export { router as dashboardRouter };
