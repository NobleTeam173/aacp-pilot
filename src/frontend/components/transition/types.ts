import type {
  CompetencyKey, CompetencyObservation, EvidenceConfidence, AlignmentLevel, QuestionResponse,
} from '../acia/types';

export type CareerStage = 'exploring' | 'student' | 'transition' | 'advancing';

export type EducationLevel =
  | 'high_school' | 'college_diploma' | 'bachelors' | 'masters'
  | 'doctorate' | 'trade_certificate' | 'professional_designation' | 'other';

export type ProfessionalDomain =
  | 'mechanical_engineering' | 'electrical_engineering' | 'software_it'
  | 'manufacturing_trades' | 'logistics_supply_chain' | 'healthcare'
  | 'project_operations' | 'construction_infrastructure' | 'energy_resources'
  | 'business_finance' | 'education' | 'other';

export interface TransitionProfile {
  confirmed: boolean;
  educationLevel?: EducationLevel;
  fieldOfStudy?: string;
  specialization?: string;
  institution?: string;
  professionalDesignation?: string;
  currentJobTitle?: string;
  currentIndustry?: string;
  yearsExperience?: number;
  previousRoles?: string[];
  technicalExperience?: string[];
  systemsExperience?: string[];
  leadershipExperience?: boolean;
  safetySensitiveWork?: boolean;
  regulatoryExposure?: boolean;
  projectManagementExperience?: boolean;
  customerInteraction?: boolean;
  certifications?: string[];
  aviationExperience?: string;
  aviationInterest?: string;
  careerTransitionGoal?: string;
  detectedDomain?: ProfessionalDomain;
}

export interface ConversationMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

export interface TransitionSession {
  sessionId: string;
  startedAt: string;
  careerStage: CareerStage;
  conversationHistory: ConversationMessage[];
  discoveryClosing: boolean;         // closing message appended, input locked
  conversationPhaseComplete: boolean;
  profile: TransitionProfile;
  profileReviewComplete: boolean;
  aciaResponses: QuestionResponse[];
  aciaAskedIds: string[];
  aciaComplete: boolean;
  aciaBridgeShown: boolean;          // user has acknowledged ACIA complete screen
  competencies: Partial<Record<CompetencyKey, CompetencyObservation>>;
  alignments: TransitionCareerAlignment[];
  resultsSaved: boolean;
}

export interface TransitionCareerAlignment {
  careerId: string;
  label: string;
  family: string;
  alignment: AlignmentLevel;
  description: string;
  professionalStrengths: string[];
  aciaObservedStrengths: string[];
  evidenceConfidence: EvidenceConfidence;
  transferableSkills: string[];
  aviationBridgeNeeded: string[];
  credentialNote: string;
  nextSteps: string[];
}

export interface TransitionCareer {
  id: string;
  label: string;
  family: string;
  description: string;
  relevantDomains: ProfessionalDomain[];
  competencyWeights: Partial<Record<CompetencyKey, number>>;
  transferableFrom: string[];
  aviationBridge: string[];
  credentialNote: string;
  nextSteps: string[];
}
