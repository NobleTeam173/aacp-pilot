import { request } from './apiClient';

export interface EmployerDashboardData {
  summary: {
    cohortId?: string;
    participantCount: number;
    averageReadiness: number;
    readinessBands: {
      high: number;
      medium: number;
      low: number;
    };
  };
  readinessTrends: Array<{ period: string; averageReadiness: number }>;
  gapMapByRoleFamily: Array<{
    roleFamilyId: string;
    roleFamilyName: string;
    gapScore: number;
    averageReadiness: number;
    topCompetencyGaps: Array<{ competencyId: string; title: string; gapCount: number }>;
  }>;
  topMatches: Array<{
    userId: string;
    roleId: string;
    roleName: string;
    matchScore: number;
    readinessScore: number;
    keyGaps: string[];
    status: 'candidate' | 'recommended' | 'matched' | 'rejected';
  }>;
  regulatoryFlags: Array<{
    flagType: string;
    count: number;
    description?: string;
  }>;
  recentActivity: Array<{
    type: 'assessment' | 'evidence' | 'match';
    title: string;
    date: string;
    status: string;
    details?: string;
  }>;
  metadata: {
    generatedAt: string;
    timeframe: '30d' | '90d' | 'all';
  };
}

export interface YouthDashboardData {
  progress: {
    readinessScore: number;
    competencyCompleted: number;
    competencyInProgress: number;
    competencyPendingReview: number;
    targetRole?: string;
  };
  badges: Array<{ badgeId: string; title: string; description: string; earnedAt: string }>;
  nextSteps: Array<{
    stepId: string;
    title: string;
    description: string;
    type: 'skill' | 'assessment' | 'training' | 'evidence';
    dueDate?: string;
  }>;
  metadata: {
    userId?: string;
    generatedAt: string;
  };
}

export interface CoachDashboardData {
  reviewQueue: Array<{
    assessmentId: string;
    userId: string;
    userName: string;
    competencyTitle: string;
    status: string;
    submittedAt: string;
  }>;
  cohortReadiness: Array<{
    roleFamilyId: string;
    roleFamilyName: string;
    averageReadiness: number;
    participantCount: number;
  }>;
  participantOverview: Array<{
    userId: string;
    userName: string;
    currentScore: number;
    openItems: number;
    lastActivity: string;
  }>;
  regulatoryReviewItems: Array<{
    itemId: string;
    itemType: 'assessment' | 'evidence';
    reason: string;
    submittedAt: string;
  }>;
  actionItems: Array<{
    actionId: string;
    title: string;
    description: string;
    dueDate?: string;
  }>;
  metadata: {
    cohortId?: string;
    generatedAt: string;
  };
}

function buildQueryString(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });
  return query.toString();
}

export async function fetchEmployerDashboard(params: {
  cohortId?: string;
  roleFamilyId?: string;
  timeframe?: string;
}): Promise<EmployerDashboardData> {
  const query = buildQueryString({
    cohortId: params.cohortId,
    roleFamilyId: params.roleFamilyId,
    timeframe: params.timeframe,
  });
  return request<EmployerDashboardData>(`/dashboard/employer${query ? `?${query}` : ''}`);
}

export async function fetchYouthDashboard(params: { userId?: string; cohortId?: string }): Promise<YouthDashboardData> {
  const query = buildQueryString({
    userId: params.userId,
    cohortId: params.cohortId,
  });
  return request<YouthDashboardData>(`/dashboard/youth${query ? `?${query}` : ''}`);
}

export async function fetchCoachDashboard(params: {
  cohortId?: string;
  status?: string;
  reviewerId?: string;
}): Promise<CoachDashboardData> {
  const query = buildQueryString({
    cohortId: params.cohortId,
    status: params.status,
    reviewerId: params.reviewerId,
  });
  return request<CoachDashboardData>(`/dashboard/coach${query ? `?${query}` : ''}`);
}
