import { normalizeVrTelemetry, summarizeVrTelemetry, VrTelemetryEvent } from '../telemetry/vrTelemetry';

export interface CompetencyIndexInput {
  assessmentId: string;
  userId: string;
  competencyId: string;
  competencyRubric: Array<{ level: string; criteria: string; weight?: number }>;
  vrTelemetryEvents?: VrTelemetryEvent[];
  evidenceItems?: Array<{ id: string; type: string; summary: string; quality?: number }>;
  assessmentHistory?: Array<{ assessmentId: string; result: string; competencyIndex: number }>;
  context?: string;
}

export interface CompetencyIndexComponents {
  telemetryIndex: number;
  evidenceIndex: number;
  rubricAlignment: number;
  historyAdjustment: number;
}

export interface CompetencyIndexResult {
  competencyIndex: number;
  confidence: number;
  recommendedLevel: string;
  rationale: string;
  components: CompetencyIndexComponents;
  flags: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function chooseRecommendedLevel(levels: string[], index: number): string {
  if (levels.length === 0) {
    return 'unknown';
  }

  const normalizedIndex = clamp(index, 0, 100);
  const buckets = [80, 65, 50, 0];
  const orderedLevels = [...new Set(levels)];

  for (let i = 0; i < buckets.length; i += 1) {
    if (normalizedIndex >= buckets[i]) {
      return orderedLevels[Math.min(i, orderedLevels.length - 1)];
    }
  }

  return orderedLevels[orderedLevels.length - 1];
}

function averageEvidenceQuality(items?: Array<{ quality?: number }>): number {
  if (!items || items.length === 0) {
    return 40;
  }

  const total = items.reduce((sum, item) => {
    const quality = typeof item.quality === 'number' ? clamp(item.quality, 0, 1) : 0.7;
    return sum + quality;
  }, 0);

  return clamp((total / items.length) * 100, 0, 100);
}

function calculateRubricAlignment(rubric: Array<{ level: string; weight?: number }>, telemetryIndex: number, evidenceIndex: number): number {
  if (rubric.length === 0) {
    return 50;
  }

  const base = (telemetryIndex * 0.45 + evidenceIndex * 0.35) / 0.8;
  const averageWeight = rubric.reduce((sum, item) => sum + (item.weight ?? 1), 0) / rubric.length;
  const adjustment = clamp((averageWeight - 1) * 10, -10, 10);
  return clamp(base + adjustment, 0, 100);
}

export function calculateCompetencyIndex(input: CompetencyIndexInput): CompetencyIndexResult {
  const telemetrySummary = summarizeVrTelemetry(input.vrTelemetryEvents ?? []);
  const telemetryIndex = telemetrySummary.totalEvents > 0 ? telemetrySummary.normalizedScore : 45;
  const evidenceIndex = averageEvidenceQuality(input.evidenceItems);
  const rubricAlignment = calculateRubricAlignment(input.competencyRubric, telemetryIndex, evidenceIndex);

  const rawIndex = telemetryIndex * 0.55 + evidenceIndex * 0.25 + rubricAlignment * 0.2;
  const baseIndex = clamp(rawIndex, 0, 100);

  const historyAdjustment = input.assessmentHistory && input.assessmentHistory.length > 0
    ? clamp(input.assessmentHistory[input.assessmentHistory.length - 1].competencyIndex / 10, -5, 5)
    : 0;

  const competencyIndex = clamp(Math.round(baseIndex + historyAdjustment), 0, 100);
  const confidence = clamp(
    0.5 +
      Math.min(0.4, (telemetrySummary.totalEvents / 20) * 0.1 + (input.evidenceItems?.length ?? 0) / 15) -
      (telemetrySummary.anomalyCount * 0.02),
    0,
    1,
  );

  const recommendedLevel = chooseRecommendedLevel(
    input.competencyRubric.map((item) => item.level),
    competencyIndex,
  );

  const flags: string[] = [];
  if (telemetrySummary.anomalyCount > 0) {
    flags.push('telemetry_anomaly');
  }

  return {
    competencyIndex,
    confidence,
    recommendedLevel,
    rationale: `Computed competency index from ${telemetrySummary.totalEvents} VR telemetry events, evidence quality of ${evidenceIndex.toFixed(0)}, and rubric alignment of ${rubricAlignment.toFixed(0)}.`,
    components: {
      telemetryIndex,
      evidenceIndex,
      rubricAlignment,
      historyAdjustment,
    },
    flags,
  };
}
