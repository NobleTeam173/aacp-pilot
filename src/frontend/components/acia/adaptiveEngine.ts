import type { ACIASession, CompetencyKey, QuestionRecord } from './types';
import { QUESTION_BANK, applyVariants } from './questionBank';
import { generateVariant, auditStaticVariant, logValidationIssue } from './variantEngine';

// ── Coverage targets (how many observations per competency before sufficient) ─
const COVERAGE_TARGETS: Partial<Record<CompetencyKey, number>> = {
  SO: 3, DM: 3, CM: 2, MR: 2, AP: 2, SR: 2,
  PS: 2, SA: 2, MT: 2, PR: 2, AL: 2, WM: 1, AK: 1,
};

// ── Session composition targets ───────────────────────────────────────────────
const FAMILY_TARGETS: Record<string, number> = {
  '01': 2,  // Discovery
  '02': 2,  // Spatial
  '03': 2,  // Mechanical
  '04': 1,  // Blueprint
  '05': 2,  // Attention & Precision
  '06': 3,  // Safety
  '07': 1,  // Mission Readiness
  '08': 2,  // Working Memory
  '09': 2,  // Multitasking
  '10': 2,  // Communication
  '11': 1,  // Regulatory
  '13': 2,  // AME/AMT
  '14': 2,  // Adaptive Learning
  '15': 1,  // Career Navigation
};

export interface SelectionContext {
  askedIds: string[];
  familyCounts: Record<string, number>;
  competencyCounts: Record<CompetencyKey, number>;
  interactionCount: number;
  careerInterests?: string[]; // detected from discovery phase
}

export function buildSelectionContext(session: ACIASession): SelectionContext {
  const familyCounts: Record<string, number> = {};
  const competencyCounts: Partial<Record<CompetencyKey, number>> = {};

  for (const resp of session.responses) {
    const q = QUESTION_BANK.find(q => q.questionId === resp.questionId);
    if (!q) continue;
    familyCounts[q.familyCode] = (familyCounts[q.familyCode] ?? 0) + 1;
    const inc = (k: CompetencyKey) => { competencyCounts[k] = (competencyCounts[k] ?? 0) + 1; };
    inc(q.primaryCompetency);
    q.secondaryCompetencies.forEach(inc);
  }

  return {
    askedIds: session.askedQuestionIds,
    familyCounts,
    competencyCounts: competencyCounts as Record<CompetencyKey, number>,
    interactionCount: session.responses.length,
  };
}

export function selectNextQuestion(
  session: ACIASession,
  overrideInteractionType?: string,
): { question: QuestionRecord; variant: string; expectedCorrect?: string } | null {
  const ctx = buildSelectionContext(session);
  const pool = QUESTION_BANK.filter(q =>
    q.status === 'active' &&
    !ctx.askedIds.includes(q.questionId) &&
    (!overrideInteractionType || q.interactionType === overrideInteractionType)
  );

  if (pool.length === 0) return null;

  // Score each candidate question
  const scored = pool.map(q => ({
    q,
    score: scoreQuestion(q, ctx),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Add some randomness within top 3 to avoid determinism
  const topN = Math.min(3, scored.length);

  // Try up to topN candidates; skip any whose variant fails validation
  for (let i = 0; i < Math.min(topN + 2, scored.length); i++) {
    const candidate = scored[Math.floor(Math.random() * Math.min(topN, scored.length))];
    const q = candidate.q;

    let variant: string;
    let expectedCorrect: string | undefined;

    if (q.variantGenerator) {
      // Use the coupled generator — validation is built-in
      const generated = generateVariant(q);
      if (!generated) continue; // generator failed validation → try next candidate
      variant = generated.text;
      expectedCorrect = generated.expectedCorrect;
    } else {
      // Static variant — apply substitutions then audit for logical coherence
      variant = applyVariants(q.questionTemplate, q.variantVariables);
      const audit = auditStaticVariant(q, variant);
      if (!audit.valid) {
        logValidationIssue(q, variant, audit.issues);
        continue; // skip this variant, try next candidate
      }
    }

    return { question: q, variant, expectedCorrect };
  }

  // Fallback: return best candidate without validation (ensures we always serve a question)
  const fallback = scored[0].q;
  const variant = fallback.variantGenerator
    ? (generateVariant(fallback)?.text ?? applyVariants(fallback.questionTemplate, fallback.variantVariables))
    : applyVariants(fallback.questionTemplate, fallback.variantVariables);
  return { question: fallback, variant };
}

function scoreQuestion(q: QuestionRecord, ctx: SelectionContext): number {
  let score = 0;

  // Prioritize families below their target
  const familyCount = ctx.familyCounts[q.familyCode] ?? 0;
  const familyTarget = FAMILY_TARGETS[q.familyCode] ?? 1;
  if (familyCount < familyTarget) score += 3;

  // Prioritize competencies below their target
  const primaryCount = ctx.competencyCounts[q.primaryCompetency] ?? 0;
  const primaryTarget = COVERAGE_TARGETS[q.primaryCompetency] ?? 2;
  if (primaryCount < primaryTarget) score += 4;

  // Don't over-saturate a family
  if (familyCount >= familyTarget * 2) score -= 5;

  // Discovery questions early
  if (q.interactionType === 'discovery' && ctx.interactionCount < 4) score += 3;

  // Memory questions mid-assessment
  if (q.interactionType === 'memory_recall' && ctx.interactionCount >= 6 && ctx.interactionCount <= 18) score += 2;

  // Adaptive learning questions in later phase
  if (q.familyCode === '14' && ctx.interactionCount >= 15) score += 2;

  // Prefer lower difficulty early in assessment
  if (ctx.interactionCount < 5 && q.difficulty <= 2) score += 2;

  // Introduce harder questions as assessment progresses
  if (ctx.interactionCount >= 10 && q.difficulty >= 3) score += 1;

  return score;
}

export function isAssessmentComplete(session: ACIASession): boolean {
  const ctx = buildSelectionContext(session);

  // Minimum 20 interactions
  if (ctx.interactionCount < 20) return false;

  // Hard cap at 35
  if (ctx.interactionCount >= 35) return true;

  // Check coverage across critical competencies
  const critical: CompetencyKey[] = ['SO', 'DM', 'CM', 'AP', 'SA', 'PS'];
  const covered = critical.filter(k => (ctx.competencyCounts[k] ?? 0) >= (COVERAGE_TARGETS[k] ?? 2));

  // Complete when 5 of 6 critical competencies have sufficient evidence
  return covered.length >= 5;
}
