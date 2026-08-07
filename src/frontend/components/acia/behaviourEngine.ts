import type { EvidenceItem, EvidenceKey, ACIASession } from './types';

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

export function evidenceFromChatMessages(
  messages: { role: string; content: string }[],
  missionId: 'm1' | 'm9',
): Omit<EvidenceItem, 'mission'>[] {
  const userMessages = messages.filter(m => m.role === 'user');
  const items: Omit<EvidenceItem, 'mission'>[] = [];

  if (userMessages.length === 0) return items;

  const totalWords = userMessages.reduce((acc, m) => acc + m.content.split(/\s+/).length, 0);
  const avgWords = totalWords / userMessages.length;
  const allText = userMessages.map(m => m.content.toLowerCase()).join(' ');

  // Curiosity & Initiative: questions asked, exploratory language
  const questionCount = (allText.match(/\?/g) || []).length;
  const curiosityWords = (allText.match(/\b(why|how|what if|wonder|curious|interested|tell me|explain|does that mean|could|would)\b/g) || []).length;
  items.push({ key: 'curiosity', delta: Math.min(1, (questionCount * 0.2) + (curiosityWords * 0.12)) });

  // Communication quality: length, structure, vocabulary
  const avgWordsScore = Math.min(1, avgWords / 55);
  items.push({ key: 'communication_quality', delta: avgWordsScore });

  // Safety mindset: spontaneous safety vocabulary (not prompted)
  const safetyWords = (allText.match(/\b(safe|safety|risk|hazard|checklist|protocol|procedure|emergency|standard|regulation|comply|compliance|airworthy|incident|accident)\b/g) || []).length;
  items.push({ key: 'safety_mindset', delta: Math.min(1, safetyWords * 0.18) });

  // Systematic reasoning: sequential and structured language
  const sequentialWords = (allText.match(/\b(first|then|next|because|therefore|so|since|which means|that would|step|sequence|order|systematic|process)\b/g) || []).length;
  items.push({ key: 'systematic_reasoning', delta: Math.min(1, sequentialWords * 0.14) });

  // Procedural compliance: references to rules, procedures, requirements
  const proceduralWords = (allText.match(/\b(procedure|checklist|manual|regulation|required|requirement|must|standard|approved|certified|authorized|follow|adhere)\b/g) || []).length;
  items.push({ key: 'procedural_compliance', delta: Math.min(1, proceduralWords * 0.18) });

  // Learning agility & reflection — richer in M9 but present in M1 too
  if (missionId === 'm9') {
    const reflectiveWords = (allText.match(/\b(learned|realized|understand|improve|next time|would have|should have|could have|surprised|different|insight|perspective|changed|growth|now i)\b/g) || []).length;
    const depthScore = Math.min(1, reflectiveWords * 0.18);
    items.push({ key: 'learning_agility', delta: depthScore });
    // Longer reflection messages also signal learning engagement
    items.push({ key: 'attention_to_detail', delta: Math.min(1, avgWords / 70) });
  } else {
    // M1: learning agility from how they engage with new information
    const learningWords = (allText.match(/\b(didn't know|new to me|interesting|hadn't thought|makes sense|i see|now i understand|that explains|builds on)\b/g) || []).length;
    items.push({ key: 'learning_agility', delta: Math.min(0.7, learningWords * 0.25 + (userMessages.length >= 4 ? 0.2 : 0)) });
  }

  return items;
}
