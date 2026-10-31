import type { EvidenceItem, EvidenceKey, ACIASession, ShadowEvidenceRecord, MissionId, M1Context } from './types';

export function recordEvidence(session: ACIASession, items: Omit<EvidenceItem, 'mission'>[], missionId: ACIASession['missions'][0]['id']): ACIASession {
  const newItems = items.map(i => ({ ...i, mission: missionId }));
  return { ...session, evidence: [...session.evidence, ...newItems] };
}

export function aggregateEvidence(evidence: EvidenceItem[]): Record<EvidenceKey, number> {
  const totals: Record<string, { sum: number; count: number }> = {};
  for (const item of evidence) {
    if (!totals[item.key]) totals[item.key] = { sum: 0, count: 0 };
    totals[item.key].sum += item.delta;
    totals[item.key].count += 1;
  }
  const result: Record<string, number> = {};
  for (const [key, { sum, count }] of Object.entries(totals)) {
    result[key] = count > 0 ? sum / count : 0;
  }
  return result as Record<EvidenceKey, number>;
}

// ── Shadow evidence helpers ───────────────────────────────────────────────────
// All AI-classified evidence goes to session.shadowEvidence[] only.
// It is NOT fed into computeCompetencyIndex() or career pathway calculations
// until product owner approval and evidenceScoringVersion migration.

function buildShadowClassificationPrompt(
  missionId: MissionId,
  sourceType: ShadowEvidenceRecord['sourceType'],
  contextDescription: string,
  participantText: string,
): string {
  return `You are an evidence classifier for an aviation and aerospace career assessment.

Mission: ${missionId.toUpperCase()}
Source type: ${sourceType}
Context: ${contextDescription}

Participant response:
"""
${participantText}
"""

Classify this response by identifying which of the following evidence indicators are present. Return ONLY a JSON object: { "detected": string[], "observedPerformance": string, "explainedReasoning": string }

Evidence indicators to detect:
- curiosity_initiative: participant asks questions or expresses genuine interest in learning more
- communication_clarity: ideas are expressed clearly with appropriate structure
- safety_spontaneous: participant voluntarily references safety, risk, or hazard without being prompted
- systematic_approach: participant describes or demonstrates a step-by-step or structured approach
- procedural_awareness: participant references rules, procedures, standards, or compliance requirements
- reflective_learning: participant demonstrates learning from experience or articulates what they would do differently
- analytical_reasoning: participant breaks down a problem or situation into components
- aviation_context_awareness: participant connects their response to aviation or aerospace operational context
- insufficient_evidence: response is too brief or off-topic to classify meaningfully

Negative indicators (presence of these is meaningful):
- response_avoidance: participant declines to engage with the question without explanation
- factual_error_safety: participant states something factually incorrect about safety or procedures

Respond with valid JSON only. No other text.`;
}

export async function classifyMissionChatForShadow(
  messages: { role: string; content: string }[],
  missionId: 'm1' | 'm9',
  chatEndpoint: string,
  token: string | null,
  interactionRef?: string,
): Promise<ShadowEvidenceRecord | null> {
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return null;

  const combinedText = userMessages.map(m => m.content).join('\n\n---\n\n');
  const contextDescription = missionId === 'm1'
    ? 'Discovery conversation — ACIA advisor exploring participant background and interests'
    : 'Reflection conversation — participant reviewing their assessment experience and what they learned';

  try {
    const prompt = buildShadowClassificationPrompt(missionId, 'chat', contextDescription, combinedText);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(chatEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], systemPrompt: '' }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = typeof data.content === 'string' ? data.content : data.message ?? '';

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      id: `shadow_${missionId}_${Date.now()}`,
      missionId,
      sourceType: 'chat',
      interactionRef,
      detectedIndicators: Array.isArray(parsed.detected) ? parsed.detected : [],
      observedPerformance: parsed.observedPerformance ?? undefined,
      explainedReasoning: parsed.explainedReasoning ?? undefined,
      classifiedAt: new Date().toISOString(),
      evidenceScoringVersion: 'shadow_v1',
    };
  } catch {
    return null;
  }
}

export async function classifyReasoningResponseForShadow(
  questionId: string,
  questionVariant: string,
  responseText: string,
  missionId: MissionId,
  chatEndpoint: string,
  token: string | null,
): Promise<ShadowEvidenceRecord | null> {
  const contextDescription = `Question bank item — mission ${missionId.toUpperCase()}: "${questionVariant.substring(0, 120)}"`;
  try {
    const prompt = buildShadowClassificationPrompt(missionId, 'reasoning_response', contextDescription, responseText);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(chatEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], systemPrompt: '' }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = typeof data.content === 'string' ? data.content : data.message ?? '';

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      id: `shadow_${missionId}_${questionId}_${Date.now()}`,
      missionId,
      sourceType: 'reasoning_response',
      interactionRef: questionId,
      detectedIndicators: Array.isArray(parsed.detected) ? parsed.detected : [],
      observedPerformance: parsed.observedPerformance ?? undefined,
      explainedReasoning: parsed.explainedReasoning ?? undefined,
      classifiedAt: new Date().toISOString(),
      evidenceScoringVersion: 'shadow_v1',
    };
  } catch {
    return null;
  }
}

export function appendShadowEvidence(session: ACIASession, record: ShadowEvidenceRecord): ACIASession {
  return {
    ...session,
    shadowEvidence: [...(session.shadowEvidence ?? []), record],
  };
}

// ── M1 context extraction ─────────────────────────────────────────────────────
export async function extractM1Context(
  messages: { role: string; content: string }[],
  chatEndpoint: string,
  token: string | null,
): Promise<M1Context | null> {
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return null;

  const combinedText = userMessages.map(m => m.content).join('\n\n---\n\n');
  const prompt = `You are analysing a discovery conversation from an aviation career assessment.

Extract the following from the participant's messages. Return ONLY valid JSON: { "interests": string[], "educationSignal": string|null, "motivationType": string|null, "transferableBackground": string|null }

Rules:
- interests: list of specific aviation/aerospace career areas mentioned (e.g. ["pilot", "atc", "maintenance"]). Empty array if none stated.
- educationSignal: one of "aviation", "stem", "trades", "other", or null if not determinable
- motivationType: one of "intrinsic" (passion-driven), "extrinsic" (job/salary), "exploratory" (undecided), or null
- transferableBackground: brief domain label if participant has relevant prior experience (e.g. "military", "healthcare", "engineering"), otherwise null

Participant messages:
"""
${combinedText}
"""

Respond with valid JSON only.`;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(chatEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], systemPrompt: '' }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = typeof data.content === 'string' ? data.content : data.message ?? '';

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      interests: Array.isArray(parsed.interests) ? parsed.interests : [],
      educationSignal: parsed.educationSignal ?? undefined,
      motivationType: parsed.motivationType ?? undefined,
      transferableBackground: parsed.transferableBackground ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── Legacy keyword function — disabled for new assessments ───────────────────
// This function is retained ONLY for historical session compatibility.
// Do NOT call it for new assessment sessions (2026+).
// It produced keyword-proxy scores that did not reflect genuine competency evidence.
export function evidenceFromChatMessages_DEPRECATED(
  _messages: { role: string; content: string }[],
  _missionId: 'm1' | 'm9',
): Omit<EvidenceItem, 'mission'>[] {
  return [];
}
