import type { VrTelemetryEvent } from '../telemetry/vrTelemetry';

export interface CareerCoachInput {
  userId: string;
  userProfile: Record<string, unknown>;
  cohortId?: string;
  currentCompetencies: Array<{ competencyId: string; status: string; level?: string; competencyIndex?: number }>;
  assessmentStatus: Array<{ assessmentId: string; status: string }>;
  readinessIndex?: number;
  careerPaths?: Array<{ roleId: string; name: string; targetLevel?: string }>;
  context?: string;
}

export interface CareerCoachRecommendation {
  title: string;
  description: string;
  type: 'skill' | 'training' | 'assessment' | 'badge' | 'next_step';
  confidence?: number;
  relatedCompetencyIds?: string[];
}

export interface CareerCoachOutput {
  recommendations: CareerCoachRecommendation[];
  motivation: string;
  rationale: string;
  sources?: string[];
  needsHumanReview?: boolean;
}

export interface CareerCoachService {
  generateRecommendations(input: CareerCoachInput): Promise<CareerCoachOutput>;
}

export interface CompetencyEvaluatorInput {
  assessmentId: string;
  userId: string;
  competencyId: string;
  competencyRubric: Array<{ level: string; criteria: string; weight?: number }>;
  vrTelemetryEvents?: VrTelemetryEvent[];
  evidenceItems?: Array<{ id: string; type: string; summary: string; quality?: number }>;
  assessmentHistory?: Array<{ assessmentId: string; result: string; competencyIndex?: number }>;
  context?: string;
}

export interface CompetencyEvaluatorOutput {
  recommendedLevel: string;
  competencyIndex: number;
  confidence: number;
  strengths: string[];
  weaknesses: string[];
  suggestedRubricLevel?: string;
  rationale: string;
  flags?: string[];
}

export interface CompetencyEvaluatorService {
  evaluate(input: CompetencyEvaluatorInput): Promise<CompetencyEvaluatorOutput>;
}

export interface WorkforceAnalystInput {
  cohortId: string;
  roleFamilyIds?: string[];
  competencyIndexes: Array<{ competencyId: string; averageIndex: number }>;
  demandSignals?: Array<{ roleId: string; demandLevel: string; notes?: string }>;
  timeframe?: string;
  context?: string;
}

export interface WorkforceAnalystOutput {
  cohortSummary: {
    participantCount: number;
    averageReadinessIndex: number;
    readinessBands: Record<'high' | 'medium' | 'low', number>;
  };
  trendInsights: Array<{ date: string; readinessAverage: number }>;
  gapMap: Array<{ roleFamilyId: string; gapScore: number; averageReadinessIndex: number }>;
  riskFlags: string[];
  recommendations: string[];
  rationale: string;
}

export interface WorkforceAnalystService {
  analyze(input: WorkforceAnalystInput): Promise<WorkforceAnalystOutput>;
}

export interface MatchingEngineInput {
  userId: string;
  roleId: string;
  cohortId: string;
  readinessIndex: number;
  competencyProfile: Array<{ competencyId: string; proficiency: string; competencyIndex?: number }>;
  employerRequirements?: Array<{ competencyId: string; importance: number; minimumIndex?: number }>;
  matchPreferences?: Record<string, unknown>;
  context?: string;
}

export interface MatchingEngineOutput {
  matchScore: number;
  fitSummary: string;
  recommendations: string[];
  status: 'candidate' | 'recommended' | 'matched' | 'rejected';
  rationale: string;
  flags?: string[];
}

export interface MatchingEngineService {
  match(input: MatchingEngineInput): Promise<MatchingEngineOutput>;
}
