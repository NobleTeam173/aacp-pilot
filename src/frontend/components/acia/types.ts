// ── ACIA Competency Dimensions (13) ─────────────────────────────────────────
export type CompetencyKey =
  | 'SR'   // Spatial Reasoning
  | 'MR'   // Mechanical Reasoning
  | 'AP'   // Attention & Precision
  | 'PS'   // Problem Solving
  | 'SO'   // Safety Orientation
  | 'DM'   // Decision Making
  | 'WM'   // Working Memory
  | 'MT'   // Multitasking / Prioritization
  | 'CM'   // Communication
  | 'PR'   // Procedural Reasoning
  | 'SA'   // Situational Awareness
  | 'AL'   // Adaptive Learning
  | 'AK';  // Aviation Knowledge (kept separate from potential indices)

export const COMPETENCY_LABELS: Record<CompetencyKey, string> = {
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

// ── Evidence States (participant-facing) ─────────────────────────────────────
export type EvidenceState =
  | 'insufficient'
  | 'emerging'
  | 'developing'
  | 'demonstrated'
  | 'strong';

export const EVIDENCE_STATE_LABELS: Record<EvidenceState, string> = {
  insufficient: 'Insufficient Evidence',
  emerging: 'Emerging',
  developing: 'Developing',
  demonstrated: 'Demonstrated',
  strong: 'Strong Evidence',
};

export type EvidenceConfidence = 'low' | 'moderate' | 'high';

export interface CompetencyObservation {
  key: CompetencyKey;
  state: EvidenceState;
  confidence: EvidenceConfidence;
  observationCount: number;
  rawScore: number; // internal, never shown to participant
}

// ── Career Pathways (13) ─────────────────────────────────────────────────────
export type PathwayId =
  | 'pilot'
  | 'first_officer'
  | 'ame'
  | 'amt'
  | 'avionics'
  | 'assembler'
  | 'structural_repair'
  | 'airport_ops'
  | 'ground_ops'
  | 'atc'
  | 'fss'
  | 'uav'
  | 'aerospace';

export type AlignmentLevel =
  | 'strong'
  | 'promising'
  | 'developing'
  | 'exploratory'
  | 'insufficient';

export const ALIGNMENT_LABELS: Record<AlignmentLevel, string> = {
  strong: 'Strong Alignment',
  promising: 'Promising Alignment',
  developing: 'Developing Alignment',
  exploratory: 'Exploratory Alignment',
  insufficient: 'Insufficient Evidence',
};

export interface CareerAlignment {
  pathwayId: PathwayId;
  label: string;
  alignment: AlignmentLevel;
  description: string;
  observedStrengths: string[];
  developmentOpportunities: string[];
  evidenceConfidence: EvidenceConfidence;
  nextSteps: string[];
}

// ── Question Bank Schema ──────────────────────────────────────────────────────
export type InteractionType =
  | 'open_response'
  | 'open_response_scenario'
  | 'visual_spatial'
  | 'memory_recall'
  | 'prioritization'
  | 'communication'
  | 'discovery'
  | 'ai_mentor_chat'
  | 'inspection'
  | 'diagnosis'
  | 'puzzle'
  | 'instrument'
  | 'workload';

export type QuestionDifficulty = 1 | 2 | 3 | 4;
export type QuestionStatus = 'active' | 'draft' | 'retired';

export interface EvidenceIndicator {
  indicator: string;           // internal key
  label: string;               // display label
  description: string;         // what to look for
  competency: CompetencyKey;
  positive: boolean;           // true = presence is positive evidence
}

export interface QuestionRecord {
  questionId: string;
  family: string;
  familyCode: string;
  primaryCompetency: CompetencyKey;
  secondaryCompetencies: CompetencyKey[];
  careerContext: PathwayId[] | 'all';
  difficulty: QuestionDifficulty;
  interactionType: InteractionType;
  priorKnowledgeRequired: boolean;
  questionTemplate: string;
  variantVariables?: Record<string, string[]>;
  variantGenerator?: string;   // named coupled generator in variantEngine.ts
  evidenceRubric: EvidenceIndicator[];
  designNote?: string;
  adaptiveFollowUp?: string;
  repeatProtection: boolean;
  status: QuestionStatus;
  version: string;
}

// ── Session & Response Model ──────────────────────────────────────────────────
export interface QuestionResponse {
  questionId: string;
  variantText: string;         // exact variant served
  responseText: string;        // participant's answer
  observedIndicators: string[]; // rubric indicators detected
  competencyEvidence: Partial<Record<CompetencyKey, number>>; // -1 to +1
  timestamp: string;
  responseTimeMs?: number;
}

// ── Legacy evidence types (kept for visual mission compatibility) ─────────────
export type EvidenceKey =
  | 'safety_mindset'
  | 'systematic_reasoning'
  | 'communication_quality'
  | 'decision_quality'
  | 'curiosity'
  | 'learning_agility'
  | 'attention_to_detail'
  | 'situational_awareness'
  | 'stress_response'
  | 'mechanical_reasoning'
  | 'spatial_reasoning'
  | 'analytical_reasoning'
  | 'procedural_compliance'
  | 'multitasking_ability';

// Maps legacy EvidenceKey → CompetencyKey
export const EVIDENCE_KEY_TO_COMPETENCY: Record<EvidenceKey, CompetencyKey> = {
  safety_mindset: 'SO',
  systematic_reasoning: 'PS',
  communication_quality: 'CM',
  decision_quality: 'DM',
  curiosity: 'AL',
  learning_agility: 'AL',
  attention_to_detail: 'AP',
  situational_awareness: 'SA',
  stress_response: 'DM',
  mechanical_reasoning: 'MR',
  spatial_reasoning: 'SR',
  analytical_reasoning: 'PS',
  procedural_compliance: 'PR',
  multitasking_ability: 'MT',
};

export interface EvidenceItem {
  key: EvidenceKey;
  delta: number;
  mission: MissionId;
  note?: string;
}

// ── Mission model ─────────────────────────────────────────────────────────────
export type MissionId = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7' | 'm8' | 'm9';

export type FitLevel = 'strong' | 'good' | 'possible'; // legacy, kept for compatibility

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Mission {
  id: MissionId;
  title: string;
  subtitle: string;
  type: 'ai_chat' | 'inspection' | 'diagnosis' | 'puzzle' | 'graph' | 'decision' | 'atc' | 'workload' | 'reflection';
  estimatedMinutes: number;
  completed: boolean;
  startedAt?: string;
  completedAt?: string;
}

export interface ACIASession {
  sessionId: string;
  startedAt: string;
  completedAt?: string;
  evidence: EvidenceItem[];                // legacy visual mission evidence
  responses: QuestionResponse[];           // question bank responses
  askedQuestionIds: string[];              // repeat protection
  competencies: Partial<Record<CompetencyKey, CompetencyObservation>>;
  missions: Mission[];
  currentMissionIndex: number;
  chatHistory: Record<string, ChatMessage[]>;
  discoveredInterests?: string[];          // career interests from discovery phase
}
