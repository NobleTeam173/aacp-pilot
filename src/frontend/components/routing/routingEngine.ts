// AACP Intelligent Program Routing Engine
// Pure logic module — no network calls, no side effects.
// Called client-side during registration and server-side for validation.

export type CareerStage =
  | 'exploring'
  | 'student'
  | 'stem'
  | 'transition'
  | 'aviation_professional'
  | 'intl_aviation_professional';

export type Program = 'cdr' | 'awtp' | 'rpas_hub' | 'human_review';

export type Specialization = 'engine_maintenance' | 'ame' | 'pilot' | 'rpas' | null;

export type AviationBackground = 'yes' | 'no' | 'in_progress';

export type OccupationalInterest =
  | 'engine_maintenance'
  | 'ame_airframe'
  | 'pilot_flight_ops'
  | 'rpas_drones'
  | 'atc'
  | 'not_sure';

export type RpasObjective = 'exploring' | 'transition';

export interface RoutingAnswers {
  careerStage: CareerStage;
  aviationBackground?: AviationBackground;  // null = not yet asked
  occupationalInterest?: OccupationalInterest;
  rpasObjective?: RpasObjective;            // only when rpas interest flagged
}

export type RoutingConfidence = 'high' | 'medium' | 'low';

export interface RoutingResult {
  recommendedProgram: Program;
  recommendedSpecialization: Specialization;
  confidence: RoutingConfidence;
  rationale: string;
  requiresHumanReview: boolean;
  alternativePrograms: Program[];
}

// Which follow-up questions are needed given answers so far.
// Returns the next question key to ask, or null when routing is resolved.
export type FollowUpQuestion =
  | 'aviationBackground'
  | 'occupationalInterest'
  | 'rpasObjective'
  | null;

const AVIATION_PROFESSIONAL_STAGES = new Set<CareerStage>([
  'aviation_professional',
  'intl_aviation_professional',
]);

const STEM_OR_TRANSITION_STAGES = new Set<CareerStage>([
  'stem',
  'transition',
  'exploring',
  'student',
]);

function isRpasInterest(interest?: OccupationalInterest): boolean {
  return interest === 'rpas_drones';
}

export function getNextQuestion(answers: Partial<RoutingAnswers>): FollowUpQuestion {
  const { careerStage, aviationBackground, occupationalInterest, rpasObjective } = answers;
  if (!careerStage) return null;

  // Aviation professionals always have aviation background — ask what interests them
  if (AVIATION_PROFESSIONAL_STAGES.has(careerStage)) {
    if (!occupationalInterest) return 'occupationalInterest';
    if (isRpasInterest(occupationalInterest) && !rpasObjective) return 'rpasObjective';
    return null;
  }

  // For all other stages, first ask about aviation background
  if (aviationBackground === undefined) return 'aviationBackground';

  // Once we know background, check if we need occupational interest
  if (occupationalInterest === undefined) return 'occupationalInterest';

  // If RPAS interest, clarify objective
  if (isRpasInterest(occupationalInterest) && !rpasObjective) return 'rpasObjective';

  return null;
}

export function computeRouting(answers: RoutingAnswers): RoutingResult {
  const { careerStage, aviationBackground, occupationalInterest, rpasObjective } = answers;

  const hasAviationBg =
    aviationBackground === 'yes' ||
    aviationBackground === 'in_progress' ||
    AVIATION_PROFESSIONAL_STAGES.has(careerStage);

  const rpas = isRpasInterest(occupationalInterest);
  const rpasExploring = rpas && (!rpasObjective || rpasObjective === 'exploring');
  const rpasTransition = rpas && rpasObjective === 'transition';
  const atcInterest = occupationalInterest === 'atc';

  // ATC: never an AWTP specialization
  if (atcInterest) {
    return {
      recommendedProgram: 'cdr',
      recommendedSpecialization: null,
      confidence: 'high',
      rationale:
        'Air traffic control career exploration is supported through the eight-week Aviation Career Pathways & Workforce Readiness Program. ATC is not offered as a two-week Workforce Transition specialization.',
      requiresHumanReview: false,
      alternativePrograms: [],
    };
  }

  // Aviation professionals with RPAS interest
  if (AVIATION_PROFESSIONAL_STAGES.has(careerStage)) {
    if (rpasExploring) {
      return {
        recommendedProgram: 'rpas_hub',
        recommendedSpecialization: null,
        confidence: 'high',
        rationale:
          'Based on your aviation background and interest in exploring RPAS opportunities, the one-week RPAS Workforce Hub is recommended.',
        requiresHumanReview: false,
        alternativePrograms: ['awtp'],
      };
    }
    if (rpasTransition) {
      return {
        recommendedProgram: 'awtp',
        recommendedSpecialization: 'rpas',
        confidence: 'high',
        rationale:
          'Based on your aviation background and goal of transitioning into an RPAS career, the two-week Aviation Workforce Transition Program — RPAS / Autonomous Systems specialization is recommended.',
        requiresHumanReview: false,
        alternativePrograms: ['rpas_hub'],
      };
    }
    // Standard AWTP — determine specialization
    const spec = resolveSpecialization(occupationalInterest);
    return {
      recommendedProgram: 'awtp',
      recommendedSpecialization: spec.specialization,
      confidence: spec.specialization ? 'high' : 'medium',
      rationale: spec.rationale(careerStage),
      requiresHumanReview: !spec.specialization,
      alternativePrograms: [],
    };
  }

  // RPAS interest for any background — Hub is open to all
  if (rpas) {
    if (rpasExploring || !rpasObjective) {
      return {
        recommendedProgram: 'rpas_hub',
        recommendedSpecialization: null,
        confidence: 'high',
        rationale:
          'The one-week RPAS Workforce Hub is open to all backgrounds and is recommended for individuals interested in drone applications and RPAS workforce opportunities.',
        requiresHumanReview: false,
        alternativePrograms: hasAviationBg ? ['awtp'] : ['cdr'],
      };
    }
    if (rpasTransition && hasAviationBg) {
      return {
        recommendedProgram: 'awtp',
        recommendedSpecialization: 'rpas',
        confidence: 'high',
        rationale:
          'Based on your aviation background and goal of transitioning into an RPAS career, the two-week Aviation Workforce Transition Program — RPAS / Autonomous Systems specialization is recommended.',
        requiresHumanReview: false,
        alternativePrograms: ['rpas_hub'],
      };
    }
    // RPAS transition intent but no aviation background → Hub
    return {
      recommendedProgram: 'rpas_hub',
      recommendedSpecialization: null,
      confidence: 'high',
      rationale:
        'The one-week RPAS Workforce Hub is recommended. The two-week RPAS / Autonomous Systems Workforce Transition is intended for participants with relevant aviation backgrounds.',
      requiresHumanReview: false,
      alternativePrograms: [],
    };
  }

  // Non-aviation-professional stages without RPAS interest
  if (STEM_OR_TRANSITION_STAGES.has(careerStage)) {
    if (!hasAviationBg) {
      // No aviation background → CDR
      // Exception: in_progress treated as partial — flag for review if occupational interest is specific
      const isSpecificInterest =
        occupationalInterest && occupationalInterest !== 'not_sure' && !atcInterest;
      return {
        recommendedProgram: 'cdr',
        recommendedSpecialization: null,
        confidence: isSpecificInterest ? 'medium' : 'high',
        rationale: buildCdrRationale(careerStage, isSpecificInterest),
        requiresHumanReview: false,
        alternativePrograms: [],
      };
    }

    // Has aviation background → AWTP
    const spec = resolveSpecialization(occupationalInterest);
    return {
      recommendedProgram: 'awtp',
      recommendedSpecialization: spec.specialization,
      confidence: spec.specialization ? 'high' : 'medium',
      rationale: spec.rationale(careerStage),
      requiresHumanReview: !spec.specialization,
      alternativePrograms: spec.specialization ? [] : [],
    };
  }

  // Fallback — insufficient information
  return {
    recommendedProgram: 'human_review',
    recommendedSpecialization: null,
    confidence: 'low',
    rationale:
      'There is insufficient information to generate a reliable program recommendation. An AACP advisor will review your registration and confirm your pathway.',
    requiresHumanReview: true,
    alternativePrograms: [],
  };
}

// Specialization resolution from occupational interest
function resolveSpecialization(interest?: OccupationalInterest): {
  specialization: Specialization;
  rationale: (stage: CareerStage) => string;
} {
  switch (interest) {
    case 'engine_maintenance':
      return {
        specialization: 'engine_maintenance',
        rationale: () =>
          'Based on your interest in aircraft engine maintenance and gas turbine technology, the Aircraft Engine Maintenance & Gas Turbine Technology specialization is recommended.',
      };
    case 'ame_airframe':
      return {
        specialization: 'ame',
        rationale: () =>
          'Based on your background and interest in aircraft maintenance, the Aircraft Maintenance Engineering (AME) specialization is recommended.',
      };
    case 'pilot_flight_ops':
      return {
        specialization: 'pilot',
        rationale: () =>
          'Based on your interest in flight operations, the Pilot / Flight Operations specialization is recommended.',
      };
    case 'rpas_drones':
      return {
        specialization: 'rpas',
        rationale: () =>
          'Based on your interest in RPAS and autonomous systems, the RPAS / Autonomous Systems specialization is recommended.',
      };
    case 'not_sure':
    default:
      return {
        specialization: null,
        rationale: (stage) =>
          `Based on your ${stageLabel(stage)}, the two-week Aviation Workforce Transition Program is recommended. An advisor will help identify the most appropriate specialization.`,
      };
  }
}

function buildCdrRationale(stage: CareerStage, hasSpecificInterest: boolean | undefined): string {
  const base =
    'The eight-week Aviation Career Pathways & Workforce Readiness Program is recommended to help you explore aviation career opportunities and build foundational industry awareness.';
  if (stage === 'stem' && hasSpecificInterest) {
    return (
      base +
      ' A STEM background is a valuable starting point. Relevant aviation education, training, or professional experience is required for direct entry into the two-week Workforce Transition Program.'
    );
  }
  return base;
}

function stageLabel(stage: CareerStage): string {
  const labels: Record<CareerStage, string> = {
    exploring: 'interest in exploring aviation',
    student: 'academic background',
    stem: 'STEM background',
    transition: 'professional background',
    aviation_professional: 'aviation experience',
    intl_aviation_professional: 'international aviation background',
  };
  return labels[stage] ?? 'background';
}

// Human-readable program labels for display
export const PROGRAM_LABELS: Record<Program, string> = {
  cdr: 'Aviation Career Pathways & Workforce Readiness (8 weeks)',
  awtp: 'Aviation Workforce Transition Program (2 weeks)',
  rpas_hub: 'RPAS Workforce Hub (1 week)',
  human_review: 'Pending Advisor Review',
};

export const SPECIALIZATION_LABELS: Record<NonNullable<Specialization>, string> = {
  engine_maintenance: 'Aircraft Engine Maintenance & Gas Turbine Technology',
  ame: 'Aircraft Maintenance Engineering (AME)',
  pilot: 'Pilot / Flight Operations',
  rpas: 'RPAS / Autonomous Systems',
};
