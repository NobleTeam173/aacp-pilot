export interface VrTelemetryEvent {
  eventId: string;
  timestamp: string;
  eventType: string;
  details: Record<string, unknown>;
  qualityScore?: number;
}

export interface VrTelemetrySummary {
  totalEvents: number;
  eventCounts: Record<string, number>;
  anomalyCount: number;
  averageQuality: number;
  normalizedScore: number;
}

const TELEMETRY_WEIGHTS: Record<string, number> = {
  task_complete: 1.0,
  motion_stability: 0.9,
  control_accuracy: 0.9,
  timing: 0.8,
  error: -1.0,
  anomaly: -1.0,
  navigation: 0.7,
  compliance_check: 0.8,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function validateVrTelemetry(events: VrTelemetryEvent[]): boolean {
  return Array.isArray(events) && events.every((event) => {
    return (
      typeof event.eventId === 'string' &&
      typeof event.timestamp === 'string' &&
      typeof event.eventType === 'string' &&
      typeof event.details === 'object' &&
      event.details !== null &&
      (event.qualityScore === undefined || typeof event.qualityScore === 'number')
    );
  });
}

export function summarizeVrTelemetry(events: VrTelemetryEvent[]): VrTelemetrySummary {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      totalEvents: 0,
      eventCounts: {},
      anomalyCount: 0,
      averageQuality: 0,
      normalizedScore: 40,
    };
  }

  const eventCounts: Record<string, number> = {};
  let totalQuality = 0;
  let qualityCount = 0;
  let weightedScore = 0;
  let weightSum = 0;
  let anomalyCount = 0;

  for (const event of events) {
    const type = event.eventType || 'unknown';
    eventCounts[type] = (eventCounts[type] ?? 0) + 1;

    const quality = clamp(event.qualityScore ?? 0.7, 0, 1);
    totalQuality += quality;
    qualityCount += 1;

    const typeWeight = TELEMETRY_WEIGHTS[type] ?? 0.3;
    weightedScore += typeWeight * quality * 100;
    weightSum += Math.abs(typeWeight);

    const isAnomaly = type === 'error' || type === 'anomaly' || event.details?.anomaly === true;
    if (isAnomaly) {
      anomalyCount += 1;
    }
  }

  const averageQuality = qualityCount ? totalQuality / qualityCount : 0;
  const rawScore = weightSum ? weightedScore / weightSum : 40;
  const anomalyPenalty = anomalyCount * 4;
  const normalizedScore = clamp(rawScore - anomalyPenalty, 0, 100);

  return {
    totalEvents: events.length,
    eventCounts,
    anomalyCount,
    averageQuality,
    normalizedScore,
  };
}
