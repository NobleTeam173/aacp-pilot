import type {
  CareerCoachInput,
  CareerCoachOutput,
  CareerCoachService,
  CompetencyEvaluatorInput,
  CompetencyEvaluatorOutput,
  CompetencyEvaluatorService,
  MatchingEngineInput,
  MatchingEngineOutput,
  MatchingEngineService,
  WorkforceAnalystInput,
  WorkforceAnalystOutput,
  WorkforceAnalystService,
} from './agentInterfaces';
import { calculateCompetencyIndex } from './competencyIndex';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export class CareerCoachServiceImpl implements CareerCoachService {
  async generateRecommendations(input: CareerCoachInput): Promise<CareerCoachOutput> {
    const readiness = clamp(input.readinessIndex ?? 0, 0, 100);
    const recommendations = [] as CareerCoachOutput['recommendations'];

    if (readiness < 50) {
      recommendations.push({
        title: 'Strengthen core competencies',
        description: 'Complete targeted training and simulation practice to improve the Competency Index for essential aviation tasks.',
        type: 'training',
        confidence: 0.75,
        relatedCompetencyIds: input.currentCompetencies.map((item) => item.competencyId),
      });
    } else if (readiness < 75) {
      recommendations.push({
        title: 'Validate demonstrated skills',
        description: 'Schedule an assessment or evidence submission to confirm competency improvements and update your Readiness Index.',
        type: 'assessment',
        confidence: 0.8,
        relatedCompetencyIds: input.currentCompetencies.filter((item) => item.competencyIndex !== undefined).map((item) => item.competencyId),
      });
    } else {
      recommendations.push({
        title: 'Prepare for role matching',
        description: 'Review employer requirements and focus on qualification gaps for your target role.',
        type: 'next_step',
        confidence: 0.85,
        relatedCompetencyIds: input.currentCompetencies.map((item) => item.competencyId),
      });
    }

    return {
      recommendations,
      motivation: 'Use your current readiness level to prioritize the next training or assessment steps.',
      rationale: `Generated ${recommendations.length} recommendation(s) from readiness index ${readiness}.`,
      sources: ['internal readiness model', 'cohort competency profile'],
      needsHumanReview: false,
    };
  }
}

export class CompetencyEvaluatorServiceImpl implements CompetencyEvaluatorService {
  async evaluate(input: CompetencyEvaluatorInput): Promise<CompetencyEvaluatorOutput> {
    const result = calculateCompetencyIndex(input);
    return {
      recommendedLevel: result.recommendedLevel,
      competencyIndex: result.competencyIndex,
      confidence: result.confidence,
      strengths: ['Telemetry-derived task performance', 'Rubric alignment on core criteria'],
      weaknesses: result.flags.includes('telemetry_anomaly')
        ? ['Potential telemetry anomaly detected, verify session integrity']
        : [],
      suggestedRubricLevel: result.recommendedLevel,
      rationale: result.rationale,
      flags: result.flags,
    };
  }
}

export class WorkforceAnalystServiceImpl implements WorkforceAnalystService {
  async analyze(input: WorkforceAnalystInput): Promise<WorkforceAnalystOutput> {
    const cohortSummary = {
      participantCount: Math.min(input.competencyIndexes.length, 50),
      averageReadinessIndex: input.competencyIndexes.length
        ? Number(
            (
              input.competencyIndexes.reduce((sum, item) => sum + item.averageIndex, 0) / input.competencyIndexes.length
            ).toFixed(1),
          )
        : 0,
      readinessBands: {
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    const trendInsights = [] as Array<{ date: string; readinessAverage: number }>;
    const gapMap = [] as Array<{ roleFamilyId: string; gapScore: number; averageReadinessIndex: number }>;

    const high = input.competencyIndexes.filter((item) => item.averageIndex >= 80).length;
    const medium = input.competencyIndexes.filter((item) => item.averageIndex >= 60 && item.averageIndex < 80).length;
    const low = input.competencyIndexes.filter((item) => item.averageIndex < 60).length;

    cohortSummary.readinessBands = {
      high: Math.round((high / Math.max(1, input.competencyIndexes.length)) * 100),
      medium: Math.round((medium / Math.max(1, input.competencyIndexes.length)) * 100),
      low: Math.round((low / Math.max(1, input.competencyIndexes.length)) * 100),
    };

    for (let i = 3; i >= 0; i -= 1) {
      trendInsights.push({
        date: `${i * 7}d`,
        readinessAverage: clamp(cohortSummary.averageReadinessIndex - i * 2, 0, 100),
      });
    }

    for (const roleFamilyId of input.roleFamilyIds ?? []) {
      const gapScore = 100 - cohortSummary.averageReadinessIndex;
      gapMap.push({
        roleFamilyId,
        gapScore: clamp(Math.round(gapScore), 0, 100),
        averageReadinessIndex: cohortSummary.averageReadinessIndex,
      });
    }

    const recommendations = [] as string[];
    if (cohortSummary.averageReadinessIndex < 60) {
      recommendations.push('Increase cohort competency development for low-readiness pathways.');
    } else {
      recommendations.push('Validate current cohort readiness with role-specific assessments.');
    }

    return {
      cohortSummary,
      trendInsights,
      gapMap,
      riskFlags: cohortSummary.averageReadinessIndex < 55 ? ['cohort_readiness_low'] : [],
      recommendations,
      rationale: 'Aggregated cohort readiness and gap metrics using available competency index inputs.',
    };
  }
}

export class MatchingEngineServiceImpl implements MatchingEngineService {
  async match(input: MatchingEngineInput): Promise<MatchingEngineOutput> {
    const profileScore = input.competencyProfile.length
      ? input.competencyProfile.reduce((sum, item) => sum + (item.competencyIndex ?? 50), 0) / input.competencyProfile.length
      : 50;

    const requirementBonus = input.employerRequirements
      ? input.employerRequirements.reduce((sum, req) => sum + (req.minimumIndex ? clamp(req.minimumIndex, 0, 100) / 100 : 0), 0)
      : 0;

    const rawScore = input.readinessIndex * 0.55 + profileScore * 0.35 + requirementBonus * 10;
    const matchScore = clamp(Math.round(rawScore), 0, 100);

    const status = matchScore >= 85 ? 'matched' : matchScore >= 70 ? 'recommended' : matchScore >= 55 ? 'candidate' : 'rejected';
    const recommendations = [] as string[];

    if (matchScore < 55) {
      recommendations.push('Improve competency alignment and readiness to become a stronger candidate.');
    } else if (matchScore < 85) {
      recommendations.push('Focus on closing remaining gaps before employer review.');
    } else {
      recommendations.push('Proceed to employer matching and placement review.');
    }

    return {
      matchScore,
      fitSummary: `Calculated fit using readiness index ${input.readinessIndex} and competency alignment ${Math.round(profileScore)}.`,
      recommendations,
      status,
      rationale: 'Used readiness and competency index alignment to produce a match recommendation.',
      flags: matchScore < 60 ? ['requires_coach_review'] : [],
    };
  }
}
