import type {
  CompetencyKey, CareerAlignment, PathwayId, AlignmentLevel,
  EvidenceConfidence, CompetencyObservation,
} from './types';
import { COMPETENCY_LABELS } from './types';
import { computeCompetencyIndex, getTopCompetencies } from './evidenceEngine';
import type { EvidenceItem, QuestionResponse } from './types';

// ── Pathway competency weights ─────────────────────────────────────────────────
// Each pathway lists which competencies matter most (0–1)
const PATHWAY_WEIGHTS: Record<PathwayId, Partial<Record<CompetencyKey, number>>> = {
  pilot: {
    SA: 1.0, DM: 1.0, SO: 0.9, CM: 0.9, MT: 0.8, SR: 0.8,
    WM: 0.7, PR: 0.7, AP: 0.6, PS: 0.5, AL: 0.4, MR: 0.3,
  },
  first_officer: {
    SA: 1.0, DM: 0.9, CM: 1.0, SO: 0.9, MT: 0.8, SR: 0.7,
    WM: 0.7, PR: 0.8, AP: 0.6, PS: 0.5, AL: 0.5,
  },
  ame: {
    AP: 1.0, PR: 1.0, SO: 0.9, PS: 0.9, MR: 0.9,
    DM: 0.8, AL: 0.7, SA: 0.6, CM: 0.5, SR: 0.4,
  },
  amt: {
    MR: 1.0, AP: 0.9, PR: 1.0, PS: 0.9, SO: 0.9,
    DM: 0.5, SR: 0.5, AL: 0.4,
  },
  avionics: {
    AP: 1.0, MR: 0.9, PS: 0.9, PR: 1.0, SO: 0.9,
    AL: 0.7, SR: 0.5, CM: 0.4,
  },
  assembler: {
    AP: 1.0, MR: 0.9, PR: 0.9, SO: 0.8, SR: 0.7,
    PS: 0.6, AL: 0.5, CM: 0.4,
  },
  structural_repair: {
    AP: 1.0, SR: 1.0, MR: 0.9, SO: 0.9, PR: 0.8,
    PS: 0.7, AL: 0.5,
  },
  airport_ops: {
    SA: 1.0, CM: 1.0, SO: 0.9, MT: 0.9, DM: 0.8,
    PR: 0.7, AP: 0.6, WM: 0.5,
  },
  ground_ops: {
    SA: 0.9, SO: 1.0, CM: 0.8, PR: 0.8, MT: 0.7,
    AP: 0.7, DM: 0.6, WM: 0.5,
  },
  atc: {
    CM: 1.0, MT: 1.0, SA: 1.0, DM: 0.9, WM: 0.9,
    PR: 0.8, SR: 0.8, AP: 0.7, PS: 0.6, SO: 0.7,
  },
  fss: {
    CM: 1.0, SA: 0.9, WM: 0.9, PR: 0.8, MT: 0.8,
    DM: 0.8, AP: 0.7, SO: 0.7,
  },
  uav: {
    SR: 0.9, SA: 0.9, AP: 0.9, SO: 0.8, DM: 0.8,
    MR: 0.7, PR: 0.7, CM: 0.6, MT: 0.6,
  },
  aerospace: {
    PS: 1.0, AL: 1.0, MR: 0.9, SR: 0.8, AP: 0.7,
    DM: 0.6, CM: 0.5, SO: 0.5,
  },
};

const PATHWAY_META: Record<PathwayId, {
  label: string;
  description: string;
  observedStrengthLabels: Partial<Record<CompetencyKey, string>>;
  nextSteps: string[];
}> = {
  pilot: {
    label: 'Pilot',
    description: 'Your profile shows strong situational awareness, decisive thinking under pressure, and precise communication — the core qualities that define exceptional aviators.',
    observedStrengthLabels: {
      SA: 'Strong situational awareness — holds a multi-element mental picture',
      DM: 'Decisive under uncertainty',
      CM: 'Clear, structured communication style',
      SO: 'Internalized safety-first orientation',
      MT: 'Manages competing demands effectively',
    },
    nextSteps: [
      "Explore Transport Canada's Private Pilot Licence (PPL) requirements and approved flight training units",
      "Research AACP partner flight schools across your region",
      "Connect with an AACP Pilot pathway mentor for a one-on-one career conversation",
    ],
  },
  first_officer: {
    label: 'First Officer',
    description: 'Your communication precision, crew coordination instincts, and structured decision-making align strongly with professional flight deck operations as a First Officer.',
    observedStrengthLabels: {
      CM: 'Precise, unambiguous communication',
      SA: 'Strong dynamic situational awareness',
      PR: 'Disciplined procedural approach',
      DM: 'Sound decision-making under constraint',
      SO: 'Safety-conscious orientation',
    },
    nextSteps: [
      "Research CPL and ATPL licensing progression with Transport Canada",
      "Explore multi-crew cooperation training at Canadian aviation colleges",
      "Connect with an AACP Pilot pathway mentor",
    ],
  },
  ame: {
    label: 'Aircraft Maintenance Engineer (AME)',
    description: 'Your methodical approach, attention to detail, and strong safety instincts align closely with the precision demands of aircraft maintenance engineering.',
    observedStrengthLabels: {
      AP: 'High attention to detail — notices what others miss',
      PR: 'Methodical, procedure-driven approach',
      PS: 'Structured fault-diagnosis thinking',
      SO: 'Safety-conscious in ambiguous situations',
      MR: 'Strong technical and mechanical aptitude',
    },
    nextSteps: [
      "Research Transport Canada AME licensing pathways (M1, M2, E, S categories)",
      "Explore aviation maintenance training programs approved under CAR Part IV",
      "Connect with an AACP AME pathway mentor for guidance on the certification route",
    ],
  },
  amt: {
    label: 'Aircraft Maintenance Technician',
    description: 'Your hands-on technical reasoning, systematic troubleshooting, and consistent attention to detail make you well-suited for aircraft maintenance technician work.',
    observedStrengthLabels: {
      MR: 'Strong practical mechanical aptitude',
      AP: 'Detail-oriented and thorough',
      PR: 'Reliable, consistent procedure adherence',
      SO: 'Safety-aware across all tasks',
      PS: 'Structured troubleshooting approach',
    },
    nextSteps: [
      "Explore aviation technician diploma programs at approved Canadian colleges",
      "Research apprenticeship opportunities at MROs and regional operators",
      "Connect with an AACP Maintenance pathway mentor",
    ],
  },
  avionics: {
    label: 'Avionics Technician',
    description: 'Your precision, systematic diagnostic thinking, and technical curiosity align strongly with the complex systems environment of avionics maintenance.',
    observedStrengthLabels: {
      AP: 'High precision — catches subtle system discrepancies',
      MR: 'Strong system cause-and-effect reasoning',
      PS: 'Analytical approach to fault isolation',
      PR: 'Rigorous documentation and procedure adherence',
      SO: 'Safety-conscious with electrical and electronic systems',
    },
    nextSteps: [
      "Research avionics technician programs at Canadian aviation colleges (BCIT, SAIT, Canadore)",
      "Explore Transport Canada Avionics licensing requirements",
      "Connect with an AACP Avionics pathway mentor",
    ],
  },
  assembler: {
    label: 'Aircraft Assembler',
    description: 'Your precise attention to detail, ability to work from technical drawings, and consistent procedure adherence align with the high standards of aircraft assembly.',
    observedStrengthLabels: {
      AP: 'Exceptional precision and accuracy',
      MR: 'Mechanical spatial intelligence',
      PR: 'Disciplined procedural work ethic',
      SR: 'Strong component orientation and spatial reasoning',
      SO: 'Quality and safety conscious',
    },
    nextSteps: [
      "Explore aircraft assembly and manufacturing technician programs at Canadian colleges",
      "Research opportunities with Canadian aerospace manufacturers",
      "Connect with an AACP Manufacturing pathway mentor",
    ],
  },
  structural_repair: {
    label: 'Aircraft Structural Repair Technician',
    description: 'Your spatial reasoning, precision, and strong safety judgment align with the demanding structural assessment and repair environment.',
    observedStrengthLabels: {
      SR: 'Strong spatial and component orientation',
      AP: 'High precision — detects subtle structural discrepancies',
      MR: 'Sound mechanical and material reasoning',
      SO: 'Safety-first approach to structural decisions',
      PR: 'Procedure-driven structural repair approach',
    },
    nextSteps: [
      "Explore structural repair and composite repair programs at Canadian aviation colleges",
      "Research MRO opportunities with Transport Canada-approved repair organizations",
      "Connect with an AACP Structural Repair pathway mentor",
    ],
  },
  airport_ops: {
    label: 'Airport Operations',
    description: 'Your situational awareness, communication precision, and ability to manage competing priorities align with the dynamic environment of airport operations.',
    observedStrengthLabels: {
      SA: 'Strong operational picture — aware of multiple moving parts',
      CM: 'Clear, unambiguous operational communication',
      SO: 'Safety-first orientation in a complex environment',
      MT: 'Manages competing demands and disruptions effectively',
      DM: 'Sound decisions under operational pressure',
    },
    nextSteps: [
      "Research Airport Operations Officer programs and Canadian airport authority hiring requirements",
      "Explore Transport Canada's airport security and operations standards",
      "Connect with an AACP Airport Operations pathway mentor",
    ],
  },
  ground_ops: {
    label: 'Ground / FBO Operations',
    description: 'Your safety awareness, procedural discipline, and communication skills align well with the ramp and ground operations environment.',
    observedStrengthLabels: {
      SO: 'Safety-conscious in all ground activities',
      PR: 'Procedural discipline in high-consequence tasks',
      CM: 'Clear communication with crew and operations',
      SA: 'Situationally aware on the active apron',
      AP: 'Detail-oriented during ground servicing',
    },
    nextSteps: [
      "Explore ground handling and FBO operations training programs",
      "Research ramp agent and ground crew certification requirements",
      "Connect with an AACP Ground Operations pathway mentor",
    ],
  },
  atc: {
    label: 'Air Traffic Controller',
    description: 'Your ability to manage multiple information streams simultaneously, communicate precisely under pressure, and maintain a clear mental picture of dynamic situations points strongly toward air traffic control.',
    observedStrengthLabels: {
      MT: 'Exceptional simultaneous-demand capacity',
      CM: 'Precise, complete, unambiguous communication',
      SA: 'Excellent dynamic mental picture',
      DM: 'Fast, well-grounded decision-making',
      WM: 'Strong working memory and updating ability',
    },
    nextSteps: [
      "Research NAV CANADA's ATC selection process and aptitude testing requirements",
      "Explore Transport Canada ATC licensing requirements (ATCO licence)",
      "Connect with an AACP ATC pathway mentor for insight into the selection pipeline",
    ],
  },
  fss: {
    label: 'Flight Service Specialist',
    description: 'Your communication precision, situational awareness, and working memory align with the demanding environment of flight service provision.',
    observedStrengthLabels: {
      CM: 'Precise, structured information transfer',
      SA: 'Strong awareness of operational picture',
      WM: 'Reliable retention and updating of briefing information',
      PR: 'Procedural discipline in information delivery',
      DM: 'Sound judgment under operational constraint',
    },
    nextSteps: [
      "Research NAV CANADA Flight Service Specialist pathways",
      "Explore Transport Canada FSS licensing requirements",
      "Connect with an AACP ATC/FSS pathway mentor",
    ],
  },
  uav: {
    label: 'UAV / Drone Operations',
    description: 'Your spatial reasoning, situational awareness, and precision align with the growing field of UAV and drone operations.',
    observedStrengthLabels: {
      SR: 'Strong spatial and positional reasoning',
      SA: 'Operational situational awareness',
      AP: 'High precision in technical tasks',
      SO: 'Safety-conscious operational judgment',
      DM: 'Sound decisions in dynamic environments',
    },
    nextSteps: [
      "Research Transport Canada RPAS licensing requirements (Basic and Advanced)",
      "Explore UAV operations training programs across Canada",
      "Connect with an AACP UAV pathway mentor",
    ],
  },
  aerospace: {
    label: 'Aerospace & STEM Careers',
    description: 'Your analytical curiosity, drive to understand systems at depth, and structured problem-solving suggest a strong natural fit for aerospace engineering and STEM careers.',
    observedStrengthLabels: {
      PS: 'Strong analytical and systems-level thinking',
      AL: 'Intellectual curiosity and initiative — fast learner',
      MR: 'Rigorous technical and mechanical reasoning',
      SR: 'Spatial and technical reasoning ability',
      AP: 'Precision and detail orientation',
    },
    nextSteps: [
      "Explore accredited aerospace engineering programs (B.Eng/B.Sc) across Canadian universities",
      "Research NSERC undergraduate scholarships and industry co-op programs",
      "Connect with an AACP STEM pathway mentor to explore internship opportunities",
    ],
  },
};

// ── Alignment level based on weighted score ───────────────────────────────────
function scoreToAlignment(score: number, rank: number): AlignmentLevel {
  if (score >= 0.72) return 'strong';
  if (score >= 0.58) return rank <= 2 ? 'promising' : 'developing';
  if (score >= 0.42) return 'developing';
  if (score >= 0.28) return 'exploratory';
  return 'insufficient';
}

// ── Derive overall evidence confidence from competency coverage ───────────────
function overallConfidence(
  competencies: Partial<Record<CompetencyKey, CompetencyObservation>>,
  pathway: PathwayId,
): EvidenceConfidence {
  const weights = PATHWAY_WEIGHTS[pathway];
  let covered = 0;
  let total = 0;
  for (const [key, weight] of Object.entries(weights) as [CompetencyKey, number][]) {
    if (weight >= 0.7) {
      total++;
      if (competencies[key] && competencies[key]!.observationCount >= 1) covered++;
    }
  }
  const ratio = total > 0 ? covered / total : 0;
  if (ratio >= 0.75) return 'high';
  if (ratio >= 0.4) return 'moderate';
  return 'low';
}

export function computeAlignments(
  evidence: EvidenceItem[],
  responses: QuestionResponse[],
): CareerAlignment[] {
  const competencies = computeCompetencyIndex(responses, evidence);

  const pathwayScores: Record<PathwayId, number> = {} as Record<PathwayId, number>;

  for (const [pathway, weights] of Object.entries(PATHWAY_WEIGHTS) as [PathwayId, Partial<Record<CompetencyKey, number>>][]) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [key, weight] of Object.entries(weights) as [CompetencyKey, number][]) {
      const obs = competencies[key];
      const rawScore = obs ? obs.rawScore : 0;
      const normalized = (rawScore + 1) / 2; // -1..1 → 0..1
      weightedSum += normalized * weight;
      totalWeight += weight;
    }
    pathwayScores[pathway] = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  }

  const sorted = (Object.entries(pathwayScores) as [PathwayId, number][]).sort((a, b) => b[1] - a[1]);

  return sorted.map(([pathwayId, score], rank) => {
    const meta = PATHWAY_META[pathwayId];
    const alignment = scoreToAlignment(score, rank);
    const weights = PATHWAY_WEIGHTS[pathwayId];

    const observedStrengths = (Object.entries(meta.observedStrengthLabels) as [CompetencyKey, string][])
      .filter(([key]) => {
        const obs = competencies[key];
        return obs && obs.state !== 'insufficient' && obs.state !== 'emerging' &&
          (weights[key] ?? 0) >= 0.7;
      })
      .map(([, label]) => label)
      .slice(0, 3);

    const topObs = getTopCompetencies(competencies, 3);

    const developmentOpportunities = (Object.entries(weights) as [CompetencyKey, number][])
      .filter(([key, weight]) => {
        const obs = competencies[key];
        return weight >= 0.7 && (!obs || obs.state === 'insufficient' || obs.state === 'emerging');
      })
      .map(([key]) => COMPETENCY_LABELS[key])
      .slice(0, 2);

    return {
      pathwayId,
      label: meta.label,
      alignment,
      description: meta.description,
      observedStrengths: observedStrengths.length > 0
        ? observedStrengths
        : topObs.map(o => `${COMPETENCY_LABELS[o.key]} — ${o.state}`),
      developmentOpportunities,
      evidenceConfidence: overallConfidence(competencies, pathwayId),
      nextSteps: meta.nextSteps,
    };
  });
}

// ── Legacy helper for backward compatibility with visual missions ──────────────
export { COMPETENCY_LABELS };
