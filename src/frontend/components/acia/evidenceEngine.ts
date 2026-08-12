import type {
  ACIASession, CompetencyKey, EvidenceState, EvidenceConfidence,
  CompetencyObservation, QuestionResponse, EvidenceItem,
  EvidenceKey, EVIDENCE_KEY_TO_COMPETENCY,
} from './types';
import { EVIDENCE_KEY_TO_COMPETENCY as KEY_MAP } from './types';
import type { QuestionRecord } from './types';

// ── Thresholds for converting raw score → evidence state ─────────────────────
// rawScore is average of observations, range approximately -1 to +1
function scoreToState(rawScore: number, observationCount: number): EvidenceState {
  if (observationCount === 0) return 'insufficient';
  if (observationCount === 1 && rawScore < 0.3) return 'emerging';
  if (rawScore >= 0.7) return 'strong';
  if (rawScore >= 0.45) return 'demonstrated';
  if (rawScore >= 0.2) return 'developing';
  if (rawScore > 0) return 'emerging';
  return 'insufficient';
}

function observationCountToConfidence(count: number, diversity: number): EvidenceConfidence {
  if (count >= 4 && diversity >= 3) return 'high';
  if (count >= 2 && diversity >= 2) return 'moderate';
  return 'low';
}

// ── Build competency index from all session evidence ──────────────────────────
export function computeCompetencyIndex(
  responses: QuestionResponse[],
  legacyEvidence: EvidenceItem[],
): Partial<Record<CompetencyKey, CompetencyObservation>> {
  const totals: Partial<Record<CompetencyKey, { sum: number; count: number; familyCodes: Set<string> }>> = {};

  const add = (k: CompetencyKey, delta: number, familyCode?: string) => {
    if (!totals[k]) totals[k] = { sum: 0, count: 0, familyCodes: new Set() };
    totals[k]!.sum += delta;
    totals[k]!.count += 1;
    if (familyCode) totals[k]!.familyCodes.add(familyCode);
  };

  // From question bank responses
  for (const resp of responses) {
    for (const [key, delta] of Object.entries(resp.competencyEvidence)) {
      if (delta !== undefined) add(key as CompetencyKey, delta);
    }
  }

  // From legacy visual missions (translate EvidenceKey → CompetencyKey)
  for (const item of legacyEvidence) {
    const mapped = KEY_MAP[item.key as EvidenceKey];
    if (mapped) add(mapped, item.delta, 'visual');
  }

  const result: Partial<Record<CompetencyKey, CompetencyObservation>> = {};
  for (const [key, data] of Object.entries(totals) as [CompetencyKey, typeof totals[CompetencyKey]][]) {
    if (!data) continue;
    const rawScore = data.count > 0 ? data.sum / data.count : 0;
    result[key] = {
      key,
      state: scoreToState(rawScore, data.count),
      confidence: observationCountToConfidence(data.count, data.familyCodes.size),
      observationCount: data.count,
      rawScore,
    };
  }

  return result;
}

// ── Classify a rubric response using predefined indicators ────────────────────
// Returns a competency evidence delta map based on indicator presence
export function classifyRubricResponse(
  question: QuestionRecord,
  detectedIndicators: string[],
): Partial<Record<CompetencyKey, number>> {
  const evidence: Partial<Record<CompetencyKey, { sum: number; count: number }>> = {};

  for (const rubricItem of question.evidenceRubric) {
    const detected = detectedIndicators.includes(rubricItem.indicator);
    const delta = rubricItem.positive
      ? (detected ? 0.8 : 0.0)
      : (detected ? -0.3 : 0.0); // negative indicators reduce evidence when present

    if (delta !== 0) {
      if (!evidence[rubricItem.competency]) evidence[rubricItem.competency] = { sum: 0, count: 0 };
      evidence[rubricItem.competency]!.sum += delta;
      evidence[rubricItem.competency]!.count += 1;
    }
  }

  const result: Partial<Record<CompetencyKey, number>> = {};
  for (const [key, data] of Object.entries(evidence) as [CompetencyKey, { sum: number; count: number }][]) {
    result[key] = data.count > 0 ? data.sum / data.count : 0;
  }

  // Always add small positive evidence for primary competency when participant engages
  if (!result[question.primaryCompetency]) {
    result[question.primaryCompetency] = 0.2; // participation baseline
  }

  return result;
}

// ── Build the system prompt for Claude to classify a response ─────────────────
export function buildClassificationPrompt(
  question: QuestionRecord,
  variantText: string,
  response: string,
  expectedCorrect?: string,
): string {
  const indicators = question.evidenceRubric
    .map(r => `- ${r.indicator}: ${r.description}`)
    .join('\n');

  const correctContext = expectedCorrect
    ? `\nOBJECTIVE ANSWER KEY (for reference only — do not mention to participant):\n${expectedCorrect}\n`
    : '';

  return `You are an aviation competency evidence classifier. Your role is to classify a participant's response against predefined behavioural indicators.

IMPORTANT: You are NOT scoring or grading. You are identifying which predefined indicators are present in the participant's response.

QUESTION ASKED:
${variantText}
${correctContext}
PARTICIPANT RESPONSE:
${response}

PREDEFINED INDICATORS TO CHECK:
${indicators}

For each indicator, determine if evidence of it is present in the response. Be generous — partial evidence counts. Look for the spirit of the indicator, not just exact keywords.

Reply with ONLY a JSON object in this exact format:
{
  "detected": ["indicator_key_1", "indicator_key_2"],
  "notDetected": ["indicator_key_3"]
}

Where detected[] contains the indicator keys that ARE present in the response.`;
}

// ── Build a QuestionResponse from classification results ──────────────────────
export function buildQuestionResponse(
  question: QuestionRecord,
  variantText: string,
  responseText: string,
  detectedIndicators: string[],
  responseTimeMs?: number,
): QuestionResponse {
  return {
    questionId: question.questionId,
    variantText,
    responseText,
    observedIndicators: detectedIndicators,
    competencyEvidence: classifyRubricResponse(question, detectedIndicators),
    timestamp: new Date().toISOString(),
    responseTimeMs,
  };
}

// ── Get top competencies to highlight in the profile ─────────────────────────
export function getTopCompetencies(
  competencies: Partial<Record<CompetencyKey, CompetencyObservation>>,
  limit = 6,
): CompetencyObservation[] {
  const stateOrder: Record<EvidenceState, number> = {
    strong: 5, demonstrated: 4, developing: 3, emerging: 2, insufficient: 1,
  };

  return Object.values(competencies)
    .filter((obs): obs is CompetencyObservation => obs !== undefined && obs.state !== 'insufficient')
    .sort((a, b) => {
      const stateDiff = stateOrder[b.state] - stateOrder[a.state];
      if (stateDiff !== 0) return stateDiff;
      return b.rawScore - a.rawScore;
    })
    .slice(0, limit);
}

export function getDevelopmentOpportunities(
  competencies: Partial<Record<CompetencyKey, CompetencyObservation>>,
): CompetencyObservation[] {
  return Object.values(competencies)
    .filter((obs): obs is CompetencyObservation =>
      obs !== undefined && (obs.state === 'emerging' || obs.state === 'developing')
    )
    .slice(0, 3);
}
