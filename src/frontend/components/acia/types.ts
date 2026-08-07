export type MissionId = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7' | 'm8' | 'm9';

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

export type PathwayId = 'pilot' | 'ame' | 'amt' | 'atc' | 'aerospace';

export interface EvidenceItem {
  key: EvidenceKey;
  delta: number;
  mission: MissionId;
  note?: string;
}

export type FitLevel = 'strong' | 'good' | 'possible';

export interface CareerAlignment {
  pathwayId: PathwayId;
  label: string;
  icon: string;
  description: string;
  fit: FitLevel;
  highlights: string[];
  nextSteps: string[];
}

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
  evidence: EvidenceItem[];
  missions: Mission[];
  currentMissionIndex: number;
  chatHistory: Record<string, ChatMessage[]>;
}
