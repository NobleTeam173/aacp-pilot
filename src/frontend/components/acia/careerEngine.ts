import type {
  CompetencyKey, CareerAlignment, PathwayId, AlignmentLevel,
  EvidenceConfidence, CompetencyObservation,
} from './types';
import { COMPETENCY_LABELS } from './types';
import { computeCompetencyIndex, getTopCompetencies } from './evidenceEngine';
import type { EvidenceItem, QuestionResponse } from './types';

export const SCORING_VERSION = '2.0.0';

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
  // ── Flight Operations ────────────────────────────────────────────────────────
  flight_instructor: {
    CM: 1.0, SA: 0.9, DM: 0.9, PR: 0.8, AL: 0.8, SO: 0.8, WM: 0.6, PS: 0.5,
  },
  helicopter_pilot: {
    SA: 1.0, DM: 1.0, SR: 0.9, MT: 0.9, SO: 0.9, CM: 0.8, AP: 0.7, WM: 0.6,
  },
  bush_pilot: {
    DM: 1.0, SA: 1.0, SO: 0.9, SR: 0.8, AP: 0.8, MT: 0.8, AL: 0.6, PS: 0.6,
  },
  float_plane_pilot: {
    DM: 1.0, SA: 1.0, SR: 0.9, SO: 0.9, AP: 0.8, MT: 0.7, CM: 0.6,
  },
  medevac_pilot: {
    SA: 1.0, DM: 1.0, SO: 0.9, CM: 0.9, MT: 0.9, AP: 0.7, PR: 0.7,
  },
  cargo_pilot: {
    SA: 1.0, DM: 0.9, PR: 0.9, SO: 0.9, MT: 0.8, CM: 0.7, AP: 0.6,
  },
  check_pilot: {
    SA: 1.0, DM: 1.0, CM: 1.0, PR: 0.9, SO: 0.9, AL: 0.8, AP: 0.7,
  },
  sim_instructor: {
    DM: 1.0, CM: 1.0, SA: 0.9, PR: 0.9, AL: 0.9, PS: 0.7, MT: 0.6,
  },
  // ── MRO / Maintenance Specialty ──────────────────────────────────────────────
  composite_tech: {
    AP: 1.0, MR: 0.9, PR: 1.0, SO: 0.9, SR: 0.8, PS: 0.6, AL: 0.5,
  },
  ndt_technician: {
    AP: 1.0, PR: 1.0, MR: 0.9, SO: 0.9, PS: 0.8, AL: 0.6, SR: 0.5,
  },
  sheet_metal_tech: {
    AP: 1.0, MR: 1.0, PR: 0.9, SO: 0.9, SR: 0.7, PS: 0.6,
  },
  power_plant_tech: {
    MR: 1.0, AP: 0.9, PR: 1.0, SO: 0.9, PS: 0.8, DM: 0.6, AL: 0.5,
  },
  airframe_tech: {
    MR: 1.0, AP: 0.9, PR: 1.0, SO: 0.9, SR: 0.7, PS: 0.7,
  },
  // ── Quality & Safety ─────────────────────────────────────────────────────────
  quality_inspector: {
    AP: 1.0, PR: 1.0, SO: 0.9, PS: 0.8, MR: 0.8, DM: 0.7, AL: 0.5,
  },
  qa_engineer: {
    AP: 1.0, PR: 0.9, PS: 1.0, SO: 0.9, AL: 0.8, DM: 0.7, CM: 0.6,
  },
  safety_investigator: {
    PS: 1.0, DM: 1.0, SA: 0.9, SO: 0.9, CM: 0.8, AL: 0.8, PR: 0.7,
  },
  aviation_safety_officer: {
    SO: 1.0, DM: 0.9, CM: 0.9, PR: 0.9, PS: 0.8, SA: 0.8, AL: 0.7,
  },
  sms_coordinator: {
    SO: 1.0, PR: 1.0, CM: 0.9, DM: 0.8, PS: 0.8, AL: 0.7, SA: 0.7,
  },
  // ── ATC / FSS Adjacent ───────────────────────────────────────────────────────
  operations_controller: {
    MT: 1.0, SA: 1.0, CM: 0.9, WM: 0.9, DM: 0.9, PR: 0.8, SO: 0.7,
  },
  flight_dispatcher: {
    SA: 1.0, WM: 1.0, DM: 0.9, CM: 0.9, MT: 0.9, PR: 0.8, PS: 0.6,
  },
  cns_atm_specialist: {
    MR: 1.0, MT: 1.0, SA: 0.9, CM: 0.8, WM: 0.8, DM: 0.8, PR: 0.7,
  },
  // ── Ground / Airport Operations ──────────────────────────────────────────────
  load_planner: {
    AP: 1.0, PS: 0.9, MT: 0.8, PR: 0.8, SA: 0.7, SO: 0.7, CM: 0.6,
  },
  fueling_tech: {
    SO: 1.0, PR: 0.9, AP: 0.8, MT: 0.7, SA: 0.6, CM: 0.5,
  },
  airside_safety: {
    SO: 1.0, SA: 1.0, CM: 0.9, PR: 0.9, DM: 0.8, MT: 0.7,
  },
  airport_security: {
    SA: 1.0, SO: 0.9, DM: 0.9, CM: 0.9, MT: 0.7, PR: 0.7, AP: 0.6,
  },
  wildlife_control: {
    SA: 1.0, SO: 0.9, DM: 0.9, CM: 0.7, AP: 0.6,
  },
  cargo_ops: {
    MT: 0.9, SA: 0.9, SO: 0.9, PR: 0.8, CM: 0.7, AP: 0.7, DM: 0.6,
  },
  // ── RPAS ─────────────────────────────────────────────────────────────────────
  rpas_instructor: {
    CM: 1.0, SA: 0.9, DM: 0.9, PR: 0.8, AL: 0.8, SO: 0.8, SR: 0.7,
  },
  rpas_operations_mgr: {
    SA: 1.0, DM: 1.0, CM: 0.9, SO: 0.9, MT: 0.8, PR: 0.7, AL: 0.7,
  },
  rpas_inspector: {
    AP: 1.0, PR: 1.0, SO: 0.9, MR: 0.8, SR: 0.7, PS: 0.7, AL: 0.6,
  },
  // ── Aerospace / Space ────────────────────────────────────────────────────────
  satellite_technician: {
    MR: 1.0, AP: 1.0, PR: 0.9, SO: 0.9, PS: 0.8, SR: 0.7, AL: 0.6,
  },
  propulsion_engineer: {
    PS: 1.0, MR: 1.0, AP: 0.9, AL: 0.9, SR: 0.7, DM: 0.6, SO: 0.6,
  },
  spacecraft_assembler: {
    AP: 1.0, MR: 0.9, PR: 1.0, SO: 0.9, SR: 0.8, PS: 0.6,
  },
  systems_test_tech: {
    PS: 1.0, AP: 0.9, MR: 0.9, PR: 0.9, AL: 0.8, SO: 0.7, DM: 0.6,
  },
  aerospace_systems_eng: {
    PS: 1.0, AL: 1.0, SR: 0.8, MR: 0.9, AP: 0.8, DM: 0.7, CM: 0.6,
  },
  aerospace_quality_eng: {
    AP: 1.0, PR: 1.0, PS: 0.9, SO: 0.9, AL: 0.8, DM: 0.7, MR: 0.7,
  },
  defense_avionics: {
    MR: 1.0, AP: 1.0, PR: 0.9, SO: 0.9, PS: 0.8, SR: 0.7, DM: 0.6,
  },
  nav_systems_tech: {
    MR: 1.0, AP: 0.9, PR: 1.0, SO: 0.8, PS: 0.8, SR: 0.6, DM: 0.6,
  },
  // ── Education / Simulation ───────────────────────────────────────────────────
  sim_engineer: {
    PS: 1.0, MR: 0.9, AP: 0.9, AL: 0.9, SR: 0.8, DM: 0.6, PR: 0.7,
  },
  aerospace_instructor: {
    CM: 1.0, AL: 1.0, SA: 0.8, DM: 0.8, PR: 0.7, PS: 0.7, SO: 0.7,
  },
  aviation_meteorologist: {
    PS: 1.0, SA: 0.9, CM: 0.9, DM: 0.8, AL: 0.8, AP: 0.6,
  },
  // ── Management / Operations ──────────────────────────────────────────────────
  airline_ops_manager: {
    DM: 1.0, CM: 1.0, MT: 0.9, SA: 0.9, SO: 0.8, PR: 0.8, AL: 0.7,
  },
  airport_ops_manager: {
    SA: 1.0, CM: 1.0, DM: 1.0, MT: 0.9, SO: 0.9, PR: 0.8, AL: 0.7,
  },
  mro_manager: {
    DM: 1.0, PR: 0.9, CM: 0.9, SO: 0.9, AL: 0.8, PS: 0.7, MT: 0.7,
  },
  aerospace_project_mgr: {
    DM: 1.0, CM: 1.0, AL: 0.9, PS: 0.9, MT: 0.9, SA: 0.7, SO: 0.7,
  },
  human_factors_specialist: {
    PS: 1.0, CM: 1.0, AL: 0.9, SA: 0.9, DM: 0.8, SO: 0.8, AP: 0.7,
  },
  passenger_services: {
    CM: 1.0, SA: 0.8, SO: 0.8, DM: 0.7, MT: 0.7, AP: 0.6,
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
  // ── Flight Operations ────────────────────────────────────────────────────────
  flight_instructor: {
    label: 'Flight Instructor',
    description: 'Your ability to communicate complex concepts clearly, maintain situational awareness, and adapt your teaching approach aligns with the demands of flight instruction.',
    observedStrengthLabels: {
      CM: 'Clear, structured explanatory communication',
      SA: 'Strong situational awareness — models safe habits',
      DM: 'Sound judgment under training conditions',
      AL: 'Adaptive teaching orientation',
    },
    nextSteps: [
      "Research Transport Canada Flight Instructor Rating requirements",
      "Explore flight instructor programs at approved Canadian flight training units",
      "Connect with an AACP Pilot pathway mentor",
    ],
  },
  helicopter_pilot: {
    label: 'Helicopter Pilot',
    description: 'Your spatial awareness, precise decision-making in dynamic environments, and multitasking capacity align with the unique demands of rotary-wing operations.',
    observedStrengthLabels: {
      SA: 'Strong dynamic situational awareness',
      DM: 'Precise decisions in complex environments',
      SR: 'Spatial reasoning and orientation',
      MT: 'Simultaneous task management',
    },
    nextSteps: [
      "Research Transport Canada Helicopter PPL and CPL pathways",
      "Explore helicopter pilot training programs at Canadian flight schools",
      "Connect with an AACP Helicopter pathway mentor",
    ],
  },
  bush_pilot: {
    label: 'Bush / Remote Pilot',
    description: 'Your decisive judgment, situational awareness in unstructured environments, and adaptability align with the demands of remote and off-strip operations.',
    observedStrengthLabels: {
      DM: 'Decisive under uncertainty and resource constraints',
      SA: 'Strong awareness in unstructured environments',
      SO: 'Safety-first orientation in high-risk settings',
      SR: 'Spatial reasoning and terrain awareness',
    },
    nextSteps: [
      "Research float, ski, and tundra tire endorsements available through Transport Canada",
      "Explore bush flying training programs in northern Canada",
      "Connect with an AACP remote operations mentor",
    ],
  },
  float_plane_pilot: {
    label: 'Float Plane Pilot',
    description: 'Your spatial reasoning, sound judgment in variable conditions, and precision handling instincts align with float plane and water-based operations.',
    observedStrengthLabels: {
      DM: 'Sound judgment in variable conditions',
      SA: 'Strong environmental situational awareness',
      SR: 'Spatial reasoning and landing zone assessment',
      AP: 'Precise handling and approach judgment',
    },
    nextSteps: [
      "Research Transport Canada Seaplane/Float endorsement requirements",
      "Explore float plane training schools across BC, Ontario, and northern provinces",
      "Connect with an AACP remote operations mentor",
    ],
  },
  medevac_pilot: {
    label: 'Medevac / Air Ambulance Pilot',
    description: 'Your ability to maintain situational awareness under pressure, communicate clearly with medical personnel, and prioritize competing demands aligns with medevac operations.',
    observedStrengthLabels: {
      SA: 'Strong situational awareness under pressure',
      DM: 'Decisive judgment in time-critical situations',
      CM: 'Clear coordination with crew and dispatch',
      MT: 'Manages competing demands effectively',
    },
    nextSteps: [
      "Research medevac operator hiring requirements (typically CPL IFR + multi-engine)',",
      "Explore IFR and night rating progression pathways",
      "Connect with an AACP Pilot pathway mentor specializing in charter operations",
    ],
  },
  cargo_pilot: {
    label: 'Cargo / Freight Pilot',
    description: 'Your procedural discipline, situational awareness, and reliable decision-making align with the demands of cargo and freight flight operations.',
    observedStrengthLabels: {
      SA: 'Strong pre-flight and en-route awareness',
      DM: 'Reliable decisions under operational constraint',
      PR: 'Disciplined procedure adherence',
      SO: 'Safety-conscious cargo operations orientation',
    },
    nextSteps: [
      "Research Transport Canada CPL and IFR rating pathways",
      "Explore cargo operator hiring criteria across Canada",
      "Connect with an AACP Pilot pathway mentor",
    ],
  },
  check_pilot: {
    label: 'Check Pilot / Examiner',
    description: 'Your precise situational awareness, communication discipline, and procedural mastery align with the evaluation and standards role of a check pilot or designated examiner.',
    observedStrengthLabels: {
      SA: 'Comprehensive situational monitoring',
      DM: 'Precise evaluation judgment',
      CM: 'Clear, structured feedback delivery',
      PR: 'Procedural mastery and standards orientation',
    },
    nextSteps: [
      "Research Transport Canada Check Pilot authorization requirements",
      "Explore Designated Flight Test Examiner (DFTE) pathways",
      "Connect with an AACP senior Pilot pathway mentor",
    ],
  },
  sim_instructor: {
    label: 'Simulator Instructor',
    description: 'Your scenario-construction thinking, clear communication, and adaptive teaching approach align with full-motion simulator instruction environments.',
    observedStrengthLabels: {
      DM: 'Scenario judgment and debriefing clarity',
      CM: 'Precise, instructive communication',
      SA: 'Awareness of trainee performance cues',
      AL: 'Adaptive instructional approach',
    },
    nextSteps: [
      "Research approved training organization (ATO) simulator instructor pathways",
      "Explore airline training centre opportunities in Canada",
      "Connect with an AACP Flight Training pathway mentor",
    ],
  },
  // ── MRO / Maintenance Specialty ──────────────────────────────────────────────
  composite_tech: {
    label: 'Composite Repair Technician',
    description: 'Your precision, spatial awareness, and methodical approach align with the highly controlled environment of composite repair and manufacturing.',
    observedStrengthLabels: {
      AP: 'High precision in layup and repair work',
      MR: 'Strong material and structural reasoning',
      PR: 'Disciplined procedure adherence',
      SO: 'Safety-conscious with composite materials',
    },
    nextSteps: [
      "Explore composite technician programs at Canadian aerospace colleges",
      "Research opportunities with Canadian composite and MRO shops",
      "Connect with an AACP Manufacturing pathway mentor",
    ],
  },
  ndt_technician: {
    label: 'NDT / Non-Destructive Testing Technician',
    description: 'Your attention to subtle detail, structured analysis, and precision align with the critical demands of non-destructive testing in aviation.',
    observedStrengthLabels: {
      AP: 'Detects subtle anomalies and discrepancies',
      PR: 'Rigorous testing procedure adherence',
      MR: 'Mechanical and material reasoning',
      PS: 'Structured fault identification approach',
    },
    nextSteps: [
      "Research CGSB NDT certification levels (MT, PT, UT, RT)",
      "Explore NDT training programs at Canadian colleges and MRO training providers",
      "Connect with an AACP Maintenance pathway mentor",
    ],
  },
  sheet_metal_tech: {
    label: 'Sheet Metal Technician',
    description: 'Your spatial reasoning, mechanical aptitude, and precision align with structural sheet metal work in aircraft maintenance and manufacturing.',
    observedStrengthLabels: {
      AP: 'High precision in forming and fitting',
      MR: 'Strong mechanical and structural reasoning',
      SR: 'Spatial component and dimension reasoning',
      PR: 'Disciplined repair procedure approach',
    },
    nextSteps: [
      "Explore aircraft sheet metal and structural repair programs at Canadian colleges",
      "Research MRO opportunities across Canadian operators",
      "Connect with an AACP Maintenance pathway mentor",
    ],
  },
  power_plant_tech: {
    label: 'Power Plant Technician',
    description: 'Your mechanical reasoning, systematic diagnosis, and precision align with the complex demands of aircraft engine maintenance and overhaul.',
    observedStrengthLabels: {
      MR: 'Strong engine system reasoning',
      AP: 'High precision in measurement and torquing',
      PR: 'Rigorous procedure and documentation adherence',
      PS: 'Systematic fault diagnosis approach',
    },
    nextSteps: [
      "Research Transport Canada AME (M2 — power plant) licensing pathway",
      "Explore engine run-up and overhaul training programs",
      "Connect with an AACP Maintenance pathway mentor",
    ],
  },
  airframe_tech: {
    label: 'Airframe Technician',
    description: 'Your mechanical aptitude, procedural precision, and spatial awareness align with airframe inspection, repair, and maintenance work.',
    observedStrengthLabels: {
      MR: 'Strong structural and systems reasoning',
      AP: 'High attention to inspection detail',
      PR: 'Disciplined procedure and logbook adherence',
      SR: 'Spatial component and assembly reasoning',
    },
    nextSteps: [
      "Research Transport Canada AME (M1 — airframe) licensing pathway",
      "Explore airframe technician programs at Canadian aviation colleges",
      "Connect with an AACP Maintenance pathway mentor",
    ],
  },
  // ── Quality & Safety ─────────────────────────────────────────────────────────
  quality_inspector: {
    label: 'Quality Control Inspector',
    description: 'Your meticulous attention to detail, procedural discipline, and analytical mindset align with the high-stakes quality inspection environment in aviation and aerospace.',
    observedStrengthLabels: {
      AP: 'Catches subtle non-conformances',
      PR: 'Rigorous documentation and inspection adherence',
      SO: 'Safety-conscious quality orientation',
      PS: 'Structured defect analysis approach',
    },
    nextSteps: [
      "Research Transport Canada Approved Maintenance Organization (AMO) inspector requirements",
      "Explore quality control and auditing programs at Canadian colleges",
      "Connect with an AACP Quality pathway mentor",
    ],
  },
  qa_engineer: {
    label: 'Quality Assurance Engineer',
    description: 'Your analytical thinking, procedural mastery, and drive for continuous improvement align with quality assurance systems and audit functions in aviation.',
    observedStrengthLabels: {
      AP: 'Systematic and precise quality orientation',
      PS: 'Root-cause analysis and process improvement thinking',
      PR: 'Rigorous standards and documentation adherence',
      AL: 'Continuous improvement mindset',
    },
    nextSteps: [
      "Explore aerospace quality engineering and auditing programs",
      "Research AS9100 and Transport Canada regulatory quality frameworks",
      "Connect with an AACP Quality pathway mentor",
    ],
  },
  safety_investigator: {
    label: 'Aviation Safety Investigator',
    description: 'Your analytical depth, structured reasoning, and ability to draw defensible conclusions from complex evidence align with aviation safety investigation work.',
    observedStrengthLabels: {
      PS: 'Structured systems and causal analysis',
      DM: 'Evidence-based decision-making',
      SA: 'Situational reconstruction from incomplete data',
      CM: 'Clear, precise investigative communication',
    },
    nextSteps: [
      "Research Transportation Safety Board (TSB) of Canada career pathways",
      "Explore safety investigation and human factors programs",
      "Connect with an AACP Safety pathway mentor",
    ],
  },
  aviation_safety_officer: {
    label: 'Aviation Safety Officer',
    description: 'Your safety-first orientation, sound judgment, and systematic thinking align with the organizational safety officer role in aviation operations.',
    observedStrengthLabels: {
      SO: 'Internalized safety culture orientation',
      DM: 'Risk-informed decision-making',
      CM: 'Effective safety communication',
      PR: 'Systematic procedure and SMS adherence',
    },
    nextSteps: [
      "Research Transport Canada Safety Management System (SMS) requirements",
      "Explore aviation safety officer certification programs",
      "Connect with an AACP Safety pathway mentor",
    ],
  },
  sms_coordinator: {
    label: 'Safety Management System Coordinator',
    description: 'Your procedural discipline, communication clarity, and systematic safety mindset align with the SMS coordination role within approved aviation organizations.',
    observedStrengthLabels: {
      SO: 'Deep safety-first orientation',
      PR: 'Systematic procedure and record maintenance',
      CM: 'Clear safety promotion communication',
      DM: 'Risk-informed process judgment',
    },
    nextSteps: [
      "Research Transport Canada SMS implementation requirements (CAR Part I Subpart 7)",
      "Explore SMS coordinator training programs",
      "Connect with an AACP Safety pathway mentor",
    ],
  },
  // ── ATC / FSS Adjacent ───────────────────────────────────────────────────────
  operations_controller: {
    label: 'Operations Controller',
    description: 'Your ability to maintain a real-time operational picture, manage competing priorities, and communicate under pressure aligns with operations control centre work.',
    observedStrengthLabels: {
      MT: 'Exceptional simultaneous demand capacity',
      SA: 'Real-time operational awareness',
      CM: 'Precise, structured ops communication',
      WM: 'Strong working memory and update tracking',
    },
    nextSteps: [
      "Research airline and operator OCC hiring criteria",
      "Explore operations control programs at Canadian aviation colleges",
      "Connect with an AACP Operations pathway mentor",
    ],
  },
  flight_dispatcher: {
    label: 'Flight Dispatcher',
    description: 'Your situational awareness, working memory, and structured decision-making under operational constraint align with the flight dispatch and release function.',
    observedStrengthLabels: {
      SA: 'Strong pre-departure and en-route awareness',
      WM: 'Reliable retention and updating of operational data',
      DM: 'Sound go/no-go judgment under constraint',
      CM: 'Precise crew and operations communication',
    },
    nextSteps: [
      "Research Transport Canada Aircraft Dispatcher licensing requirements",
      "Explore flight dispatch programs at Canadian aviation colleges",
      "Connect with an AACP Operations pathway mentor",
    ],
  },
  cns_atm_specialist: {
    label: 'CNS / ATM Systems Specialist',
    description: 'Your technical reasoning, precision, and working memory align with communication, navigation, and surveillance systems work in air traffic management.',
    observedStrengthLabels: {
      MR: 'Strong technical systems reasoning',
      MT: 'Simultaneous systems monitoring capacity',
      SA: 'Operational awareness in technical environments',
      WM: 'Strong working memory for system states',
    },
    nextSteps: [
      "Research NAV CANADA CNS technologist pathways",
      "Explore electronics engineering technology programs with avionics specialization",
      "Connect with an AACP ATC/CNS pathway mentor",
    ],
  },
  // ── Ground / Airport Operations ──────────────────────────────────────────────
  load_planner: {
    label: 'Load Planner / Weight & Balance Specialist',
    description: 'Your precision, analytical thinking, and multitasking capacity align with the load planning and weight-and-balance function in commercial aviation.',
    observedStrengthLabels: {
      AP: 'High precision in weight and balance calculations',
      PS: 'Analytical approach to load optimization',
      MT: 'Manages multiple flight load sequences simultaneously',
      PR: 'Rigorous documentation and procedure adherence',
    },
    nextSteps: [
      "Research airline and cargo ground handling load planning roles",
      "Explore weight and balance certification training",
      "Connect with an AACP Ground Operations pathway mentor",
    ],
  },
  fueling_tech: {
    label: 'Aircraft Fueling Technician',
    description: 'Your safety consciousness, procedural discipline, and reliable attention to detail align with the critical safety demands of aircraft fueling operations.',
    observedStrengthLabels: {
      SO: 'Safety-first fueling and handling orientation',
      PR: 'Disciplined fueling procedure adherence',
      AP: 'Detail-oriented during servicing operations',
      MT: 'Manages concurrent turnaround demands',
    },
    nextSteps: [
      "Research Transport Canada fuel handling certification requirements",
      "Explore fueling technician training programs at Canadian airports",
      "Connect with an AACP Ground Operations pathway mentor",
    ],
  },
  airside_safety: {
    label: 'Airside Safety Officer',
    description: 'Your safety orientation, situational awareness, and clear communication align with the airside safety and compliance function at Canadian airports.',
    observedStrengthLabels: {
      SO: 'Comprehensive safety-first orientation',
      SA: 'Strong airside situational awareness',
      CM: 'Clear safety communication with operations staff',
      PR: 'Disciplined compliance and reporting adherence',
    },
    nextSteps: [
      "Research Transport Canada Airport Security and Safety regulations (Aerodrome Standards)",
      "Explore airside safety certification programs",
      "Connect with an AACP Airport Operations pathway mentor",
    ],
  },
  airport_security: {
    label: 'Airport Security Screener / Officer',
    description: 'Your situational awareness, sound judgment, and communication skills align with the screening and security function in the aviation security environment.',
    observedStrengthLabels: {
      SA: 'Vigilant situational awareness',
      SO: 'Safety and security-conscious orientation',
      DM: 'Sound screening judgment',
      CM: 'Clear, professional passenger communication',
    },
    nextSteps: [
      "Research CATSA screening officer selection and training requirements",
      "Explore airport security programs at Canadian colleges",
      "Connect with an AACP Airport Operations pathway mentor",
    ],
  },
  wildlife_control: {
    label: 'Airport Wildlife Control Officer',
    description: 'Your situational awareness, safety judgment, and precise operational responses align with the wildlife hazard management function at Canadian airports.',
    observedStrengthLabels: {
      SA: 'Strong environmental situational awareness',
      SO: 'Safety-conscious airside operations',
      DM: 'Quick, accurate hazard response decisions',
      AP: 'Precise observation and documentation',
    },
    nextSteps: [
      "Research Transport Canada Wildlife Hazard Management Advisory Circular requirements",
      "Explore wildlife control officer training programs",
      "Connect with an AACP Airport Operations pathway mentor",
    ],
  },
  cargo_ops: {
    label: 'Cargo Operations Agent',
    description: 'Your multitasking capacity, procedural discipline, and safety awareness align with the fast-paced cargo and freight operations environment.',
    observedStrengthLabels: {
      MT: 'Manages competing cargo priorities',
      SA: 'Operational awareness in ramp and warehouse',
      SO: 'Safety-conscious cargo handling',
      PR: 'Disciplined documentation and compliance',
    },
    nextSteps: [
      "Research cargo agent and dangerous goods certification requirements",
      "Explore freight and cargo operations programs at Canadian colleges",
      "Connect with an AACP Ground Operations pathway mentor",
    ],
  },
  // ── RPAS ─────────────────────────────────────────────────────────────────────
  rpas_instructor: {
    label: 'RPAS / Drone Flight Instructor',
    description: 'Your communication clarity, situational awareness, and adaptive teaching approach align with RPAS operator instruction and training.',
    observedStrengthLabels: {
      CM: 'Clear, structured instructional communication',
      SA: 'Strong RPAS operational situational awareness',
      DM: 'Sound judgment in training scenarios',
      AL: 'Adaptive instructional orientation',
    },
    nextSteps: [
      "Research Transport Canada Advanced RPAS Pilot Certificate requirements",
      "Explore RPAS instructor endorsement pathways",
      "Connect with an AACP UAV/RPAS pathway mentor",
    ],
  },
  rpas_operations_mgr: {
    label: 'RPAS Operations Manager',
    description: 'Your situational awareness, decision-making, and ability to coordinate safety-critical operations align with managing RPAS fleet and crew operations.',
    observedStrengthLabels: {
      SA: 'Strong operational situational awareness',
      DM: 'Sound go/no-go and operational judgment',
      CM: 'Clear crew and stakeholder communication',
      SO: 'Safety-first RPAS operational orientation',
    },
    nextSteps: [
      "Research Transport Canada RPAS complex operations and fleet management requirements",
      "Explore UAS operations management programs",
      "Connect with an AACP UAV/RPAS pathway mentor",
    ],
  },
  rpas_inspector: {
    label: 'RPAS Airworthiness Inspector',
    description: 'Your technical precision, procedural discipline, and attention to mechanical detail align with RPAS airworthiness inspection and certification.',
    observedStrengthLabels: {
      AP: 'High precision in technical inspection',
      PR: 'Rigorous airworthiness procedure adherence',
      MR: 'Strong RPAS mechanical and systems reasoning',
      SR: 'Spatial component orientation and assessment',
    },
    nextSteps: [
      "Research Transport Canada RPAS airworthiness requirements",
      "Explore RPAS maintenance and inspection certification programs",
      "Connect with an AACP UAV/RPAS pathway mentor",
    ],
  },
  // ── Aerospace / Space ────────────────────────────────────────────────────────
  satellite_technician: {
    label: 'Satellite Systems Technician',
    description: 'Your mechanical aptitude, precision, and systematic approach align with the high-reliability assembly and testing environment of satellite systems.',
    observedStrengthLabels: {
      MR: 'Strong space systems and hardware reasoning',
      AP: 'High precision in assembly and testing',
      PR: 'Disciplined cleanroom procedure adherence',
      SO: 'Safety-conscious with sensitive space hardware',
    },
    nextSteps: [
      "Explore satellite systems technician programs at Canadian post-secondary institutions",
      "Research opportunities with Canadian Space Agency (CSA) contractors",
      "Connect with an AACP Aerospace/Space pathway mentor",
    ],
  },
  propulsion_engineer: {
    label: 'Aerospace Propulsion Engineer',
    description: 'Your analytical systems thinking, mechanical depth, and drive to understand physical mechanisms at a fundamental level align with propulsion engineering.',
    observedStrengthLabels: {
      PS: 'Fundamental systems-level problem solving',
      MR: 'Strong mechanical and thermodynamic reasoning',
      AL: 'Deep technical curiosity and fast learning',
      AP: 'Precision in analysis and test data',
    },
    nextSteps: [
      "Explore mechanical or aerospace engineering programs (B.Eng) at Canadian universities",
      "Research propulsion research programs and NSERC opportunities",
      "Connect with an AACP STEM/Aerospace pathway mentor",
    ],
  },
  spacecraft_assembler: {
    label: 'Spacecraft Assembler / Integration Technician',
    description: 'Your precision, spatial reasoning, and procedural discipline align with the exacting standards of spacecraft assembly and system integration.',
    observedStrengthLabels: {
      AP: 'Exceptional precision in cleanroom assembly',
      MR: 'Strong mechanical and systems integration reasoning',
      PR: 'Disciplined integration procedure adherence',
      SR: 'Spatial component orientation and fitting',
    },
    nextSteps: [
      "Explore spacecraft assembly and systems integration programs",
      "Research CSA and prime contractor technician opportunities",
      "Connect with an AACP Aerospace/Space pathway mentor",
    ],
  },
  systems_test_tech: {
    label: 'Aerospace Systems Test Technician',
    description: 'Your analytical approach, precision, and structured troubleshooting align with the test and verification environment in aerospace systems development.',
    observedStrengthLabels: {
      PS: 'Structured fault-finding and test analysis',
      AP: 'High precision in instrumentation and measurement',
      MR: 'Strong systems cause-and-effect reasoning',
      PR: 'Rigorous test procedure adherence',
    },
    nextSteps: [
      "Explore electronics engineering technology programs with aerospace specialization",
      "Research systems test technician roles at Canadian aerospace primes",
      "Connect with an AACP Aerospace pathway mentor",
    ],
  },
  aerospace_systems_eng: {
    label: 'Aerospace Systems Engineer',
    description: 'Your systems-level analytical thinking, technical curiosity, and structured reasoning align with the multidisciplinary demands of aerospace systems engineering.',
    observedStrengthLabels: {
      PS: 'Strong systems-level analysis and decomposition',
      AL: 'Intellectual curiosity and learning agility',
      MR: 'Rigorous technical and mechanical reasoning',
      SR: 'Spatial and technical systems reasoning',
    },
    nextSteps: [
      "Explore aerospace or systems engineering programs at accredited Canadian universities",
      "Research INCOSE (CSEP) systems engineering certification pathways",
      "Connect with an AACP STEM/Aerospace pathway mentor",
    ],
  },
  aerospace_quality_eng: {
    label: 'Aerospace Quality Engineer',
    description: 'Your precision, analytical depth, and procedural mastery align with the quality engineering function in aerospace manufacturing and MRO.',
    observedStrengthLabels: {
      AP: 'High precision and quality orientation',
      PR: 'Rigorous documentation and standards adherence',
      PS: 'Root-cause analysis and process improvement thinking',
      SO: 'Safety-conscious quality systems orientation',
    },
    nextSteps: [
      "Research AS9100 and Nadcap accreditation in the Canadian aerospace supply chain",
      "Explore aerospace quality engineering programs",
      "Connect with an AACP Quality pathway mentor",
    ],
  },
  defense_avionics: {
    label: 'Defence Avionics Technician',
    description: 'Your precision, mechanical aptitude, and systematic diagnostic approach align with the demanding avionics maintenance environment on defence platforms.',
    observedStrengthLabels: {
      MR: 'Strong electronic and mechanical systems reasoning',
      AP: 'High precision in system diagnosis',
      PR: 'Rigorous military maintenance procedure adherence',
      SO: 'Safety-conscious in complex defence environments',
    },
    nextSteps: [
      "Explore Canadian Armed Forces aircraft technician trades (AEC, AVS)",
      "Research RCAF aircraft systems technician pathways",
      "Connect with an AACP Defence pathway mentor",
    ],
  },
  nav_systems_tech: {
    label: 'Navigation Systems Technician',
    description: 'Your mechanical and electronic reasoning, precision, and systematic approach align with the installation, testing, and maintenance of navigation systems.',
    observedStrengthLabels: {
      MR: 'Strong navigation electronics systems reasoning',
      AP: 'High precision in signal testing and alignment',
      PR: 'Disciplined calibration procedure adherence',
      SO: 'Safety-conscious in navigation-critical systems',
    },
    nextSteps: [
      "Explore avionics or electronics engineering technology programs",
      "Research NAV CANADA and airline navigation systems technician opportunities",
      "Connect with an AACP Avionics/CNS pathway mentor",
    ],
  },
  // ── Education / Simulation ───────────────────────────────────────────────────
  sim_engineer: {
    label: 'Flight Simulator Engineer',
    description: 'Your analytical curiosity, spatial reasoning, and technical problem-solving align with the complex domain of flight simulation engineering and fidelity validation.',
    observedStrengthLabels: {
      PS: 'Analytical systems and fidelity problem-solving',
      MR: 'Strong mechanical and aero-dynamics reasoning',
      AL: 'Deep technical curiosity and fast learning',
      SR: 'Strong spatial and aerodynamic modelling reasoning',
    },
    nextSteps: [
      "Explore aerospace or software engineering programs with simulation focus",
      "Research CAE, FlightSafety, and Frasca career pathways in Canada",
      "Connect with an AACP STEM/Aerospace pathway mentor",
    ],
  },
  aerospace_instructor: {
    label: 'Aerospace / Aviation Instructor',
    description: 'Your communication ability, learning agility, and ability to explain complex concepts clearly align with classroom and applied instruction in aerospace programs.',
    observedStrengthLabels: {
      CM: 'Clear, structured explanatory communication',
      AL: 'Strong learning and adaptation orientation',
      SA: 'Broad contextual situational awareness',
      DM: 'Sound curriculum and instructional judgment',
    },
    nextSteps: [
      "Research post-secondary aerospace instructor qualifications in your province",
      "Explore Aviation & Aerospace Instructor programs at Canadian colleges",
      "Connect with an AACP Education pathway mentor",
    ],
  },
  aviation_meteorologist: {
    label: 'Aviation Meteorologist',
    description: 'Your analytical thinking, situational awareness, and communication precision align with the demanding role of producing and conveying aviation weather products.',
    observedStrengthLabels: {
      PS: 'Strong analytical and pattern-recognition thinking',
      SA: 'Operational awareness of weather-flight interactions',
      CM: 'Precise, actionable weather briefing communication',
      DM: 'Sound forecasting judgment under uncertainty',
    },
    nextSteps: [
      "Research Environment and Climate Change Canada (ECCC) meteorologist pathways",
      "Explore atmospheric science and meteorology programs at Canadian universities",
      "Connect with an AACP ATC/Weather pathway mentor",
    ],
  },
  // ── Management / Operations ──────────────────────────────────────────────────
  airline_ops_manager: {
    label: 'Airline Operations Manager',
    description: 'Your decision-making precision, communication discipline, and ability to manage complex competing priorities align with airline operational management.',
    observedStrengthLabels: {
      DM: 'Sound operational decisions under pressure',
      CM: 'Effective cross-functional communication',
      MT: 'Manages complex competing operational priorities',
      SA: 'Strong operational picture awareness',
    },
    nextSteps: [
      "Research airline operations management development programs",
      "Explore aviation management programs at Canadian post-secondary institutions",
      "Connect with an AACP Operations Management pathway mentor",
    ],
  },
  airport_ops_manager: {
    label: 'Airport Operations Manager',
    description: 'Your situational awareness, leadership communication, and ability to manage safety-critical operations align with airport operations management.',
    observedStrengthLabels: {
      SA: 'Strong airport operational situational awareness',
      CM: 'Leadership-grade communication',
      DM: 'Sound operational decisions under constraint',
      MT: 'Exceptional competing-priority management',
    },
    nextSteps: [
      "Research Airports Council International (ACI) airport management pathways",
      "Explore airport operations management programs in Canada",
      "Connect with an AACP Airport Management pathway mentor",
    ],
  },
  mro_manager: {
    label: 'MRO / Maintenance Manager',
    description: 'Your decisive leadership, procedural mastery, and communication clarity align with managing maintenance, repair, and overhaul operations.',
    observedStrengthLabels: {
      DM: 'Sound maintenance release and go decisions',
      PR: 'Rigorous quality and airworthiness standards adherence',
      CM: 'Clear technical and operational communication',
      SO: 'Safety-first maintenance culture orientation',
    },
    nextSteps: [
      "Research Transport Canada Accountable Executive and MOM requirements",
      "Explore MRO management and aviation business programs",
      "Connect with an AACP Maintenance Management pathway mentor",
    ],
  },
  aerospace_project_mgr: {
    label: 'Aerospace Project Manager',
    description: 'Your structured analytical thinking, communication precision, and ability to coordinate complex systems work align with aerospace project management.',
    observedStrengthLabels: {
      DM: 'Decisive and evidence-informed project judgment',
      CM: 'Clear stakeholder and team communication',
      AL: 'Adaptive learning orientation across disciplines',
      PS: 'Structured systems decomposition and planning',
    },
    nextSteps: [
      "Research PMI PMP certification and aerospace project management pathways",
      "Explore aerospace business and management programs at Canadian universities",
      "Connect with an AACP STEM/Aerospace pathway mentor",
    ],
  },
  human_factors_specialist: {
    label: 'Human Factors Specialist',
    description: 'Your analytical curiosity, communication ability, and systems thinking align with the human factors and ergonomics function in aviation safety and design.',
    observedStrengthLabels: {
      PS: 'Strong systems and cognitive analysis thinking',
      CM: 'Precise and empathetic communication',
      AL: 'Broad interdisciplinary learning orientation',
      SA: 'Contextual human-system situational awareness',
    },
    nextSteps: [
      "Research Human Factors and Ergonomics Society (HFES) certification pathways",
      "Explore industrial psychology and human factors programs at Canadian universities",
      "Connect with an AACP Safety/Human Factors pathway mentor",
    ],
  },
  passenger_services: {
    label: 'Passenger Services Agent',
    description: 'Your communication clarity, situational awareness, and ability to manage people under pressure align with the passenger services and customer experience function.',
    observedStrengthLabels: {
      CM: 'Clear, calm passenger communication',
      SA: 'Awareness of gate and terminal operations',
      SO: 'Safety-conscious passenger handling',
      DM: 'Sound judgment under irregular operations',
    },
    nextSteps: [
      "Research airline and airport passenger services hiring criteria",
      "Explore customer service and aviation operations programs at Canadian colleges",
      "Connect with an AACP Ground/Airport Operations pathway mentor",
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
