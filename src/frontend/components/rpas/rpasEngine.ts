import type { CompetencyKey } from '../acia/types';

export type RpasApplicationDomain =
  | 'infrastructure_monitoring'
  | 'search_and_rescue'
  | 'geospatial_mapping'
  | 'thermal_imaging'
  | 'inspection'
  | 'agriculture'
  | 'public_safety'
  | 'defence'
  | 'other';

export const RPAS_DOMAIN_LABELS: Record<RpasApplicationDomain, string> = {
  infrastructure_monitoring: 'Infrastructure Monitoring',
  search_and_rescue:         'Search & Rescue',
  geospatial_mapping:        'Geospatial Mapping',
  thermal_imaging:           'Thermal Imaging',
  inspection:                'Inspection Operations',
  agriculture:               'Precision Agriculture',
  public_safety:             'Public Safety',
  defence:                   'Defence & Security',
  other:                     'Other',
};

export const TC_CERT_LABELS: Record<string, string> = {
  none:              'No certification',
  basic:             'TC Basic Operations',
  advanced:          'TC Advanced Operations',
  pilot_certificate: 'Pilot Certificate',
};

export const EXPERIENCE_LABELS: Record<string, string> = {
  none:       'No experience',
  hobbyist:   'Hobbyist / recreational',
  commercial: 'Commercial operations',
  certified:  'Certified / licensed operator',
};

// Competencies most relevant to RPAS Hub participants by domain
const DOMAIN_COMPETENCY_WEIGHTS: Record<RpasApplicationDomain, CompetencyKey[]> = {
  infrastructure_monitoring: ['AP', 'SA', 'PS', 'PR'],
  search_and_rescue:         ['SA', 'DM', 'CM', 'MT'],
  geospatial_mapping:        ['AP', 'SR', 'PR', 'PS'],
  thermal_imaging:           ['AP', 'SA', 'MR', 'PS'],
  inspection:                ['AP', 'PR', 'SA', 'MR'],
  agriculture:               ['PR', 'AP', 'PS', 'SA'],
  public_safety:             ['DM', 'SA', 'CM', 'MT'],
  defence:                   ['SA', 'DM', 'AP', 'MT'],
  other:                     ['SA', 'AP', 'PS', 'DM'],
};

export interface RpasCompetencyInsight {
  key: CompetencyKey;
  label: string;
  relevance: 'primary' | 'supporting';
  alignmentState: string;
}

export interface RpasProfile {
  userId: string;
  tcCertStatus: string | null;
  experienceLevel: string | null;
  practicalContext: string | null;
  applicationDomains: RpasApplicationDomain[];
  hubStatus: string;
}

export interface RpasHubStatus {
  hubStatus: string;
  intakeComplete: boolean;
  aciaIntakeStatus: { id: string; status: string; completedAt: string | null } | null;
  enrollment: { status: string; enrolledAt: string } | null;
}

// Journey step labels for the Hub participant view
export const HUB_STEPS = [
  { key: 'intake',        label: 'Profile Intake',           description: 'Complete your RPAS background profile' },
  { key: 'assessment',    label: 'ACIA™ RPAS Intelligence',  description: 'Complete your personalized career intelligence assessment' },
  { key: 'profile_ready', label: 'Career Intelligence Ready', description: 'Review your RPAS career intelligence profile' },
  { key: 'enrolled',      label: 'Applied RPAS Program',     description: '1-week applied RPAS workforce program' },
  { key: 'complete',      label: 'Workforce Profile',        description: 'Your RPAS workforce profile and next-step pathway' },
] as const;

export type HubStepKey = typeof HUB_STEPS[number]['key'];

export function currentStepIndex(hubStatus: string): number {
  const idx = HUB_STEPS.findIndex(s => s.key === hubStatus);
  return idx >= 0 ? idx : 0;
}
