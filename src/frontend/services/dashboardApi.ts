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

export type ParticipantPathway =
  | 'exploring_first'
  | 'student'
  | 'stem_grad'
  | 'transition'
  | 'current_pro'
  | 'intl_pro';

export const PARTICIPANT_PATHWAY_LABELS: Record<ParticipantPathway, string> = {
  exploring_first: 'Exploring My First Aviation Career',
  student: 'Student / Recent Graduate',
  stem_grad: 'STEM Graduate / Professional',
  transition: 'Career Transition Professional',
  current_pro: 'Current Aviation Professional',
  intl_pro: 'Internationally Trained Aviation Professional',
};

export type ACIAStatus = 'not_started' | 'in_progress' | 'completed';
export type CoachingStatus = 'not_started' | 'scheduled' | 'in_progress' | 'completed';
export type EvidenceState = 'insufficient' | 'emerging' | 'developing' | 'demonstrated' | 'strong';
export type AlignmentLevel = 'strong' | 'promising' | 'developing' | 'exploratory';
export type ReferralStatus = 'created' | 'interested' | 'intro_requested' | 'connected' | 'in_progress' | 'completed';

export type EvidenceSource =
  | 'acia'
  | 'career_coach'
  | 'industry_mentor'
  | 'aacp_program'
  | 'instructor'
  | 'employer'
  | 'workplace_wil'
  | 'verified_credential';

export const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
  acia: 'ACIA Assessment',
  career_coach: 'Career Coach',
  industry_mentor: 'Industry Mentor',
  aacp_program: 'AACP Program',
  instructor: 'Instructor',
  employer: 'Employer',
  workplace_wil: 'Workplace / WIL',
  verified_credential: 'Verified Credential',
};

export const AACP_COMPETENCY_KEYS: Record<string, string> = {
  SR: 'Spatial Reasoning',
  MR: 'Mechanical Reasoning',
  AP: 'Attention & Precision',
  PS: 'Problem Solving',
  SO: 'Safety Orientation',
  DM: 'Decision Making',
  WM: 'Working Memory',
  MT: 'Multitasking & Prioritization',
  CM: 'Communication',
  PR: 'Procedural Reasoning',
  SA: 'Situational Awareness',
  AL: 'Adaptive Learning',
  AK: 'Aviation Knowledge',
};

export const EVIDENCE_STATE_LABELS: Record<EvidenceState, string> = {
  insufficient: 'Insufficient Evidence',
  emerging: 'Emerging Evidence',
  developing: 'Developing Evidence',
  demonstrated: 'Demonstrated',
  strong: 'Strong Evidence',
};

export interface CompetencyEvidenceRecord {
  id?: string;
  evidenceSource: EvidenceSource;
  observerType?: string;
  evidenceState: EvidenceState;
  observationContext?: string;
  structuredObservation?: string;
  occurredAt: string;
  visibilityScope?: string;
}

export interface CompetencyIntelligence {
  competencyId: string;
  label: string;
  currentState: EvidenceState;
  evidenceDepth: number;
  evidenceDiversity: number;
  evidenceSources: EvidenceSource[];
  records?: CompetencyEvidenceRecord[];
}

export interface ParticipantIntelligenceProfile {
  participantId: string;
  intelligence: Record<string, CompetencyIntelligence>;
  assessments: Array<{
    id: string;
    stage: string;
    completedAt: string;
    topPathway: string | null;
    evidenceConfidence: string | null;
    careerAlignment: unknown[];
    developmentAreas: unknown[];
  }>;
  careerAlignmentSnapshots: Array<{
    career_pathway_id: string;
    alignment_state: string;
    evidence_confidence: string | null;
    evidence_count: number;
    evidence_source_count: number;
    generated_at: string;
    model_version: string;
  }>;
  generatedAt: string;
}

export interface CoachingSessionRecord {
  sessionId: string;
  coachId?: string;
  participantId: string;
  conductedAt: string;
  sessionType?: string;
  pathwaysExplored: string[];
  nextSteps: string[];
  careerActionPlan?: Array<{ goal: string; targetDate?: string; resources?: string }>;
  status: 'scheduled' | 'completed';
  createdAt?: string;
}

export interface CoachParticipant {
  userId: string;
  name: string;
  pathway: ParticipantPathway;
  aciaStatus: ACIAStatus;
  aciaStage?: string;
  aciaCompletedAt?: string;
  lastActivity: string;
  emergingPathways: string[];
  coachingStatus: CoachingStatus;
  followUpDue?: string;
  guidanceRequired: boolean;
  school?: string;
  region?: string;
  competencies?: Array<{ key: string; label: string; state: EvidenceState }>;
  careerAlignments?: Array<{ pathwayId: string; label: string; alignment: AlignmentLevel }>;
  coachNotes?: string;
}

export interface CoachingSession {
  sessionId: string;
  participantId: string;
  participantName: string;
  conductedAt: string;
  pathwaysExplored: string[];
  nextSteps: string[];
  status: 'scheduled' | 'completed';
  notes?: string;
}

export interface CoachReferral {
  referralId: string;
  participantId: string;
  participantName: string;
  referralType: string;
  organization?: string;
  status: ReferralStatus;
  createdAt: string;
  notes?: string;
}

export interface CoachDashboardData {
  coach: {
    name: string;
    coachType: string;
    organization: string;
    approvalStatus: string;
  };
  stats: {
    totalParticipants: number;
    aciaCompleted: number;
    guidanceRequired: number;
    activePathways: number;
    followUpsDue: number;
  };
  participants: CoachParticipant[];
  coachingSessions: CoachingSession[];
  referrals: CoachReferral[];
  metadata: { generatedAt: string };
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
  pathway?: string;
  aciaStatus?: string;
  coachingStatus?: string;
  school?: string;
  region?: string;
}): Promise<CoachDashboardData> {
  const query = buildQueryString({
    pathway: params.pathway,
    aciaStatus: params.aciaStatus,
    coachingStatus: params.coachingStatus,
    school: params.school,
    region: params.region,
  });
  return request<CoachDashboardData>(`/dashboard/coach${query ? `?${query}` : ''}`);
}

export async function submitCompetencyObservation(body: {
  participantId: string;
  competencyId: string;
  evidenceState: EvidenceState;
  evidenceSource?: EvidenceSource;
  observerType?: string;
  observationContext?: string;
  structuredObservation?: string;
  evidenceConfidence?: 'low' | 'moderate' | 'high';
  sessionId?: string;
  occurredAt?: string;
}): Promise<{ evidenceId: string; createdAt: string }> {
  return request('/coach/evidence', { method: 'POST', body });
}

export async function createCoachingSession(body: {
  participantId: string;
  conductedAt?: string;
  sessionType?: string;
  pathwaysExplored?: string[];
  nextSteps?: string[];
  careerActionPlan?: Array<{ goal: string; targetDate?: string; resources?: string }>;
  coachPrivateNotes?: string;
  status?: 'scheduled' | 'completed';
}): Promise<{ sessionId: string; createdAt: string }> {
  return request('/coach/sessions', { method: 'POST', body });
}

export async function fetchParticipantIntelligence(participantId?: string): Promise<ParticipantIntelligenceProfile> {
  const query = participantId ? `?participantId=${encodeURIComponent(participantId)}` : '';
  return request<ParticipantIntelligenceProfile>(`/participant/intelligence${query}`);
}

export async function fetchCoachEvidence(participantId: string): Promise<{ participantId: string; intelligence: Record<string, CompetencyIntelligence> }> {
  return request(`/coach/evidence/${encodeURIComponent(participantId)}`);
}
