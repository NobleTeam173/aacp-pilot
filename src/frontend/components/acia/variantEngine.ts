/**
 * Variant Engine — coupled numerical question generation with validation.
 *
 * Architecture:
 *   Question record (with variantGenerator) →
 *   generateVariant() →
 *   validate() →
 *   { text, variables, expectedCorrect, validationIssues }
 *
 * Any question with variantGenerator MUST pass validation before being served.
 * Questions that fail validation are logged and a replacement is selected.
 */

import type { QuestionRecord } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToleranceSpec {
  nominal: number;
  tolerance: number;
  unit: string;
  min: number;
  max: number;
  display: string;
}

export interface GeneratedVariant {
  text: string;
  variables: Record<string, string>;
  expectedCorrect?: string;   // for competency classifier context
  validationIssues: string[];
  isValid: boolean;
}

export interface ValidationIssueRecord {
  questionId: string;
  family: string;
  variant: string;
  issues: string[];
  timestamp: string;
  participantReported: boolean;
}

// ── In-memory validation log (admin visibility) ───────────────────────────────
const _validationLog: ValidationIssueRecord[] = [];

export function getValidationLog(): ValidationIssueRecord[] {
  return _validationLog;
}

export function logValidationIssue(
  question: QuestionRecord,
  variantText: string,
  issues: string[],
  participantReported = false,
): void {
  _validationLog.push({
    questionId: question.questionId,
    family: question.family,
    variant: variantText,
    issues,
    timestamp: new Date().toISOString(),
    participantReported,
  });
}

// ── Tolerance parser ──────────────────────────────────────────────────────────

export function parseTolerance(spec: string): ToleranceSpec | null {
  // Matches: "125 mm ± 1 mm" | "48.5 mm ± 0.5 mm" | "25 mm ± 0.15 mm"
  const m = spec.trim().match(/^([\d.]+)\s*([a-zA-Z°]+)\s*±\s*([\d.]+)\s*([a-zA-Z°]+)?$/);
  if (!m) return null;
  const nominal   = parseFloat(m[1]);
  const unit      = m[2];
  const tolerance = parseFloat(m[3]);
  return {
    nominal,
    tolerance,
    unit,
    min: +(nominal - tolerance).toFixed(4),
    max: +(nominal + tolerance).toFixed(4),
    display: spec.trim(),
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function rng(min: number, max: number, decimals: number): number {
  return +(min + Math.random() * (max - min)).toFixed(decimals);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Tolerance specification pool ──────────────────────────────────────────────
// Each spec is a self-consistent unit that generators reference directly.

const TOLERANCE_SPECS: ToleranceSpec[] = [
  parseTolerance('125 mm ± 1 mm')!,
  parseTolerance('48.5 mm ± 0.5 mm')!,
  parseTolerance('200 mm ± 2 mm')!,
  parseTolerance('75 mm ± 0.5 mm')!,
  parseTolerance('12.7 mm ± 0.25 mm')!,
];

function pickSpec(): ToleranceSpec {
  return TOLERANCE_SPECS[Math.floor(Math.random() * TOLERANCE_SPECS.length)];
}

// ── Generator: tolerance_outlier (BLUE-002) ───────────────────────────────────
// "Which component is outside the stated tolerance?"
// Contract: exactly ONE measurement outside, exactly THREE within.

function generateToleranceOutlier(template: string): GeneratedVariant {
  const MAX_ATTEMPTS = 10;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const spec = pickSpec();
    const { min, max, tolerance, unit } = spec;
    const dec = unit === 'mm' ? 2 : 3;
    const band = max - min;

    // 3 in-tolerance values — spread across the band, not all clustered
    const thirds = band / 3;
    const inValues: number[] = [
      rng(min + thirds * 0, min + thirds * 1, dec),
      rng(min + thirds * 1, min + thirds * 2, dec),
      rng(min + thirds * 2, max, dec),
    ];

    // 1 clearly out-of-tolerance value (at least 30% of tolerance band outside)
    const margin = tolerance * 0.3 + tolerance * Math.random() * 0.7;
    const outValue = Math.random() < 0.5
      ? +(min - margin).toFixed(dec)
      : +(max + margin).toFixed(dec);

    const all = shuffle([...inValues, outValue]);

    // Validate before accepting
    const outsideCount = all.filter(v => v < min || v > max).length;
    const insideCount  = all.filter(v => v >= min && v <= max).length;

    if (outsideCount !== 1 || insideCount !== 3) continue; // retry

    const labels   = all.map(v => `${v} ${unit}`);
    const [m1, m2, m3, m4] = labels;
    const correctLabel = `${outValue} ${unit}`;

    const text = template
      .replace('[TOLERANCE]', spec.display)
      .replace('[MEASURE1]', m1)
      .replace('[MEASURE2]', m2)
      .replace('[MEASURE3]', m3)
      .replace('[MEASURE4]', m4);

    return {
      text,
      variables: { TOLERANCE: spec.display, MEASURE1: m1, MEASURE2: m2, MEASURE3: m3, MEASURE4: m4 },
      expectedCorrect: correctLabel,
      validationIssues: [],
      isValid: true,
    };
  }

  // Exhausted attempts — return failure
  return {
    text: template,
    variables: {},
    validationIssues: [`tolerance_outlier: failed to generate valid variant after ${MAX_ATTEMPTS} attempts`],
    isValid: false,
  };
}

// ── Generator: out_of_round_hole (BLUE-006) ───────────────────────────────────
// "You measure the hole at [MEASURE1] on one side and [MEASURE2] on the opposite."
// Contract: both measurements must differ from each other (showing ovality) AND
//           at least one must be outside tolerance (showing non-conformance).
//           The tolerance spec must be plausible for a fastener hole.

const HOLE_SPECS: ToleranceSpec[] = [
  parseTolerance('25 mm ± 0.15 mm')!,
  parseTolerance('12.5 mm ± 0.10 mm')!,
  parseTolerance('8 mm ± 0.10 mm')!,
  parseTolerance('20 mm ± 0.20 mm')!,
  parseTolerance('32 mm ± 0.25 mm')!,
];

function generateOutOfRoundHole(template: string): GeneratedVariant {
  const MAX_ATTEMPTS = 10;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const spec = HOLE_SPECS[Math.floor(Math.random() * HOLE_SPECS.length)];
    const { min, max, unit, nominal, tolerance } = spec;
    const dec = 2;

    // One measurement slightly below min (out of tolerance)
    const m1 = rng(min - tolerance * 0.8, min - tolerance * 0.1, dec);
    // One measurement slightly above max (out of tolerance, opposite side of oval)
    const m2 = rng(max + tolerance * 0.1, max + tolerance * 0.8, dec);

    // Validate: they must differ, both outside, and differ from each other
    const m1Out  = m1 < min || m1 > max;
    const m2Out  = m2 < min || m2 > max;
    const differ = Math.abs(m2 - m1) > tolerance * 0.15; // detectable ovality

    if (!m1Out || !m2Out || !differ) continue;

    const m1Label = `${m1} ${unit}`;
    const m2Label = `${m2} ${unit}`;

    const text = template
      .replace('[TOLERANCE]', spec.display)
      .replace('[MEASURE1]', m1Label)
      .replace('[MEASURE2]', m2Label);

    return {
      text,
      variables: { TOLERANCE: spec.display, MEASURE1: m1Label, MEASURE2: m2Label },
      expectedCorrect: `Both measurements are outside ${spec.display}; hole is out-of-round`,
      validationIssues: [],
      isValid: true,
    };
  }

  return {
    text: template,
    variables: {},
    validationIssues: ['out_of_round_hole: failed to generate valid variant'],
    isValid: false,
  };
}

// ── Registry ──────────────────────────────────────────────────────────────────

type Generator = (template: string) => GeneratedVariant;

const GENERATORS: Record<string, Generator> = {
  tolerance_outlier:  generateToleranceOutlier,
  out_of_round_hole:  generateOutOfRoundHole,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a variant for a question that has a variantGenerator.
 * Returns null if the generator is unknown or all attempts produce invalid variants.
 */
export function generateVariant(question: QuestionRecord): GeneratedVariant | null {
  const genName = (question as QuestionRecord & { variantGenerator?: string }).variantGenerator;
  if (!genName) return null;

  const generator = GENERATORS[genName];
  if (!generator) {
    logValidationIssue(question, question.questionTemplate, [`Unknown generator: ${genName}`]);
    return null;
  }

  const result = generator(question.questionTemplate);

  if (!result.isValid) {
    logValidationIssue(question, result.text, result.validationIssues);
    return null;
  }

  return result;
}

/**
 * Post-hoc validation: check whether a generated variant text makes logical sense.
 * Used as a second-pass check even after generation.
 */
export function validateGeneratedVariant(
  question: QuestionRecord,
  variantText: string,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Detect any tolerance-related question and check for coherence
  const tolMatch = variantText.match(/([\d.]+)\s*mm\s*±\s*([\d.]+)\s*mm/);
  if (tolMatch) {
    const nominal = parseFloat(tolMatch[1]);
    const tol     = parseFloat(tolMatch[2]);
    const min = nominal - tol;
    const max = nominal + tol;

    // Extract all numeric measurements (e.g., "124.4 mm")
    const measureMatches = [...variantText.matchAll(/([\d.]+)\s*mm/g)];
    const measurements   = measureMatches
      .map(m => parseFloat(m[1]))
      .filter(v => v !== nominal && v !== tol && v !== min && v !== max);

    if (measurements.length >= 2) {
      const outsideCount = measurements.filter(v => v < min || v > max).length;

      // For "which is outside tolerance" questions — expect exactly 1 outlier
      if (/which component is outside/i.test(variantText)) {
        if (outsideCount === 0) issues.push(`All ${measurements.length} measurements are within tolerance — no correct answer exists`);
        if (outsideCount === measurements.length) issues.push(`All ${measurements.length} measurements are outside tolerance — question is trivial or invalid`);
        if (outsideCount > 1) issues.push(`${outsideCount} of ${measurements.length} measurements are outside tolerance — expected exactly 1`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Check whether a question's static variant (from applyVariants) is logically valid.
 * Call this for all questions without a variantGenerator to catch pre-existing issues.
 */
export function auditStaticVariant(
  question: QuestionRecord,
  variantText: string,
): { valid: boolean; issues: string[] } {
  return validateGeneratedVariant(question, variantText);
}
