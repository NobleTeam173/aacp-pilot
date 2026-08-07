import type { EvidenceKey, CareerAlignment, PathwayId, FitLevel } from './types';
import { aggregateEvidence } from './behaviourEngine';
import type { EvidenceItem } from './types';

// Weighted importance of each evidence key per pathway (0–1)
// Reflects the 15-strength taxonomy: each pathway prioritises the strengths most critical to that role
const PATHWAY_WEIGHTS: Record<PathwayId, Partial<Record<EvidenceKey, number>>> = {
  pilot: {
    situational_awareness: 1.0,
    decision_quality: 1.0,
    stress_response: 0.9,
    safety_mindset: 0.9,
    communication_quality: 0.8,
    spatial_reasoning: 0.8,
    multitasking_ability: 0.8,
    procedural_compliance: 0.7,
    attention_to_detail: 0.6,
    systematic_reasoning: 0.5,
    analytical_reasoning: 0.4,
    learning_agility: 0.4,
    curiosity: 0.3,
  },
  ame: {
    attention_to_detail: 1.0,
    procedural_compliance: 1.0,
    safety_mindset: 0.9,
    systematic_reasoning: 0.9,
    mechanical_reasoning: 0.9,
    decision_quality: 0.8,
    analytical_reasoning: 0.7,
    learning_agility: 0.6,
    curiosity: 0.6,
    situational_awareness: 0.5,
    communication_quality: 0.5,
    stress_response: 0.4,
  },
  amt: {
    mechanical_reasoning: 1.0,
    attention_to_detail: 0.9,
    procedural_compliance: 1.0,
    systematic_reasoning: 0.9,
    safety_mindset: 0.9,
    decision_quality: 0.5,
    spatial_reasoning: 0.5,
    curiosity: 0.4,
    analytical_reasoning: 0.4,
  },
  atc: {
    communication_quality: 1.0,
    multitasking_ability: 1.0,
    stress_response: 1.0,
    situational_awareness: 1.0,
    decision_quality: 0.9,
    procedural_compliance: 0.8,
    spatial_reasoning: 0.8,
    attention_to_detail: 0.7,
    analytical_reasoning: 0.7,
    systematic_reasoning: 0.5,
    safety_mindset: 0.6,
  },
  aerospace: {
    analytical_reasoning: 1.0,
    curiosity: 1.0,
    systematic_reasoning: 0.9,
    learning_agility: 0.9,
    spatial_reasoning: 0.8,
    mechanical_reasoning: 0.7,
    attention_to_detail: 0.7,
    decision_quality: 0.6,
    communication_quality: 0.5,
    safety_mindset: 0.5,
  },
};

const PATHWAY_META: Record<PathwayId, {
  label: string;
  icon: string;
  description: string;
  highlights: Record<string, string>;
  nextSteps: string[];
}> = {
  pilot: {
    label: 'Pilot',
    icon: '✈️',
    description: 'Your profile shows strong situational awareness, decisive thinking under pressure, and precise communication — the core qualities that define exceptional aviators. You demonstrate the kind of composed, structured decision-making that regulatory training will build on.',
    highlights: {
      situational_awareness: 'Strong situational awareness — holds a multi-element mental picture',
      decision_quality: 'Decisive under uncertainty',
      communication_quality: 'Clear, structured communication style',
      stress_response: 'Composed and accurate under pressure',
      safety_mindset: 'Internalized safety-first orientation',
    },
    nextSteps: [
      "Explore Transport Canada's Private Pilot Licence (PPL) requirements and approved flight training units",
      "Research AACP partner flight schools across your region",
      "Connect with an AACP Pilot pathway mentor for a one-on-one career conversation",
    ],
  },
  ame: {
    label: 'Aircraft Maintenance Engineer (AME)',
    icon: '🔧',
    description: 'Your methodical approach, attention to detail, and strong safety instincts align closely with the precision demands of aircraft maintenance engineering. You show the diagnostic thinking and procedural rigour that Transport Canada licencing is built on.',
    highlights: {
      attention_to_detail: 'High attention to detail — notices what others miss',
      procedural_compliance: 'Methodical, procedure-driven approach',
      systematic_reasoning: 'Structured fault-diagnosis thinking',
      safety_mindset: 'Safety-conscious in ambiguous situations',
      mechanical_reasoning: 'Strong technical and mechanical aptitude',
    },
    nextSteps: [
      "Research Transport Canada AME licensing pathways (M1, M2, E, S categories)",
      "Explore aviation maintenance training programs approved under CAR Part IV",
      "Connect with an AACP AME pathway mentor for guidance on the certification route",
    ],
  },
  amt: {
    label: 'Aircraft Maintenance Technician',
    icon: '⚙️',
    description: 'Your hands-on technical reasoning, systematic troubleshooting, and consistent attention to detail make you well-suited for aircraft maintenance technician work. You show the practical precision that sustains aircraft airworthiness every day.',
    highlights: {
      mechanical_reasoning: 'Strong practical mechanical aptitude',
      systematic_reasoning: 'Structured troubleshooting approach',
      attention_to_detail: 'Detail-oriented and thorough',
      procedural_compliance: 'Reliable, consistent procedure adherence',
      safety_mindset: 'Safety-aware across all tasks',
    },
    nextSteps: [
      "Explore aviation technician diploma programs at approved Canadian colleges",
      "Research apprenticeship opportunities at MROs and regional operators",
      "Connect with an AACP Maintenance pathway mentor",
    ],
  },
  atc: {
    label: 'Air Traffic Controller',
    icon: '📡',
    description: 'Your ability to manage multiple information streams simultaneously, communicate precisely under pressure, and maintain a clear mental picture of dynamic situations points strongly toward air traffic control. You show the composure and spatial reasoning that NAV CANADA selects for.',
    highlights: {
      multitasking_ability: 'Exceptional simultaneous-demand capacity',
      communication_quality: 'Precise, complete, unambiguous communication',
      stress_response: 'Calm and accurate under pressure',
      situational_awareness: 'Excellent dynamic mental picture',
      decision_quality: 'Fast, well-grounded decision-making',
    },
    nextSteps: [
      "Research NAV CANADA's ATC selection process and aptitude testing",
      "Explore Transport Canada ATC licensing requirements (ATCO licence)",
      "Connect with an AACP ATC pathway mentor for insight into the selection pipeline",
    ],
  },
  aerospace: {
    label: 'Aerospace & STEM',
    icon: '🚀',
    description: 'Your analytical curiosity, drive to understand systems at depth, and structured problem-solving suggest a strong natural fit for aerospace engineering and STEM careers. You ask the kind of questions that advance the field.',
    highlights: {
      analytical_reasoning: 'Strong analytical and systems-level thinking',
      curiosity: 'Intellectual curiosity and initiative',
      systematic_reasoning: 'Rigorous, structured reasoning',
      learning_agility: 'Fast learner who goes deeper than the surface',
      spatial_reasoning: 'Spatial and technical reasoning ability',
    },
    nextSteps: [
      "Explore accredited aerospace engineering programs (B.Eng/B.Sc) across Canadian universities",
      "Research NSERC undergraduate scholarships and industry co-op programs",
      "Connect with an AACP STEM pathway mentor to explore internship opportunities",
    ],
  },
};

// Maps evidence keys back to the 15-strength taxonomy for profile display
export const STRENGTH_LABELS: Record<EvidenceKey, string> = {
  safety_mindset: 'Safety Mindset',
  systematic_reasoning: 'Problem-Solving',
  communication_quality: 'Communication',
  decision_quality: 'Decision-Making',
  curiosity: 'Curiosity & Initiative',
  learning_agility: 'Learning Agility',
  attention_to_detail: 'Attention to Detail',
  situational_awareness: 'Situational Awareness',
  stress_response: 'Stress & Workload Management',
  mechanical_reasoning: 'Technical Aptitude',
  spatial_reasoning: 'Spatial Reasoning',
  analytical_reasoning: 'Analytical Reasoning',
  procedural_compliance: 'Consistency & Reliability',
  multitasking_ability: 'Multitasking Under Pressure',
};

export function strengthsFromEvidence(evidence: EvidenceItem[]): Array<{ key: EvidenceKey; label: string; score: number }> {
  const scores = aggregateEvidence(evidence);
  return (Object.entries(scores) as [EvidenceKey, number][])
    .filter(([, s]) => s > 0.05)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([key, score]) => ({ key, label: STRENGTH_LABELS[key], score }));
}

export function computeAlignments(evidence: EvidenceItem[]): CareerAlignment[] {
  const scores = aggregateEvidence(evidence);

  const pathwayScores: Record<PathwayId, number> = { pilot: 0, ame: 0, amt: 0, atc: 0, aerospace: 0 };

  for (const [pathway, weights] of Object.entries(PATHWAY_WEIGHTS) as [PathwayId, Partial<Record<EvidenceKey, number>>][]) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [key, weight] of Object.entries(weights) as [EvidenceKey, number][]) {
      const score = scores[key] ?? 0;
      weightedSum += (score + 1) / 2 * weight; // normalize -1..1 → 0..1
      totalWeight += weight;
    }
    pathwayScores[pathway] = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  }

  const sorted = (Object.entries(pathwayScores) as [PathwayId, number][]).sort((a, b) => b[1] - a[1]);

  return sorted.map(([pathwayId, score], index) => {
    const meta = PATHWAY_META[pathwayId];
    const fit: FitLevel = index === 0 ? 'strong' : score >= 0.6 ? 'good' : 'possible';

    const highlights = Object.entries(meta.highlights)
      .filter(([key]) => (scores[key as EvidenceKey] ?? 0) > 0.1)
      .map(([, label]) => label)
      .slice(0, 3);

    return {
      pathwayId,
      label: meta.label,
      icon: meta.icon,
      description: meta.description,
      fit,
      highlights: highlights.length > 0 ? highlights : [Object.values(meta.highlights)[0]],
      nextSteps: meta.nextSteps,
    };
  });
}
