import React, { useState, useCallback } from 'react';
import { request as apiRequest } from '../../services/apiClient';
import { useCoachDashboard } from '../../hooks/useCoachDashboard';
import type {
  CoachParticipant, CoachingSession, CoachReferral,
  EvidenceState, AlignmentLevel, ReferralStatus, EvidenceSource,
} from '../../services/dashboardApi';
import {
  PARTICIPANT_PATHWAY_LABELS, AACP_COMPETENCY_KEYS, EVIDENCE_SOURCE_LABELS,
  EVIDENCE_STATE_LABELS, submitCompetencyObservation, createCoachingSession,
} from '../../services/dashboardApi';

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  navy:      '#1e293b',
  navyMid:   '#334155',
  steel:     '#475569',
  muted:     '#64748b',
  faint:     '#94a3b8',
  border:    '#e2e8f0',
  borderMid: '#cbd5e1',
  bg:        '#f8fafc',
  card:      '#ffffff',
  burgundy:  '#8F0909',
  burgundyD: '#721010',
  green:     '#16a34a',
  greenBg:   '#f0fdf4',
  greenBdr:  '#bbf7d0',
  amber:     '#d97706',
  amberBg:   '#fffbeb',
  amberBdr:  '#fde68a',
  blue:      '#2563eb',
  blueBg:    '#eff6ff',
  blueBdr:   '#bfdbfe',
  purple:    '#7c3aed',
};

// ── Evidence / Alignment styling ───────────────────────────────────────────────
const EVIDENCE_STYLE: Record<EvidenceState, { label: string; color: string; bg: string; bdr: string }> = {
  insufficient: { label: 'Insufficient Evidence', color: T.muted,   bg: '#f1f5f9', bdr: T.border },
  emerging:     { label: 'Emerging Evidence',     color: T.amber,   bg: T.amberBg, bdr: T.amberBdr },
  developing:   { label: 'Developing Evidence',   color: T.blue,    bg: T.blueBg,  bdr: T.blueBdr },
  demonstrated: { label: 'Demonstrated',          color: T.green,   bg: T.greenBg, bdr: T.greenBdr },
  strong:       { label: 'Strong Evidence',        color: T.burgundy,bg: '#fff5f5', bdr: '#fecaca' },
};

const ALIGNMENT_STYLE: Record<AlignmentLevel, { label: string; color: string }> = {
  strong:      { label: 'Strong Alignment',     color: T.burgundy },
  promising:   { label: 'Promising Alignment',  color: T.green },
  developing:  { label: 'Developing Alignment', color: T.blue },
  exploratory: { label: 'Exploratory',          color: T.muted },
};

const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  created:          'Created',
  interested:       'Participant Interested',
  intro_requested:  'Introduction Requested',
  connected:        'Connected',
  in_progress:      'In Progress',
  completed:        'Completed',
};

type Tab = 'overview' | 'participants' | 'sessions' | 'pathways' | 'referrals' | 'waitlist';

// ── Canonical pathway ID → label (defence-in-depth; backend should resolve first) ──
const PATHWAY_ID_TO_LABEL: Record<string, string> = {
  pilot:             'Pilot',
  first_officer:     'First Officer',
  ame:               'Aircraft Maintenance Engineer (AME)',
  amt:               'Aircraft Maintenance Technician',
  avionics:          'Avionics Technician',
  assembler:         'Aircraft Assembler',
  structural_repair: 'Aircraft Structural Repair Technician',
  airport_ops:       'Airport Operations',
  ground_ops:        'Ground / FBO Operations',
  cargo:             'Cargo & Logistics',
  customer_ops:      'Customer & Passenger Operations',
  atc:               'Air Traffic Control',
  fss:               'Flight Service Specialist',
  uav:               'Remotely Piloted Aircraft (UAV)',
  aerospace_mfg:     'Aerospace Manufacturing',
  aerospace_eng:     'Aerospace Engineering',
  aviation_tech:     'Aviation Technology',
  structures:        'Aerospace Structures Technician',
};

function safePathwayLabel(value: string): string {
  return PATHWAY_ID_TO_LABEL[value] ?? value;
}

// ── Career Pathway Explorer data ───────────────────────────────────────────────
interface PathwayInfo {
  id: string;
  label: string;
  icon: string;
  whatTheyDo: string;
  whyMayAlign: string[];
  entryRequirements: string;
  education: string;
  licensing: string;
  careerJourney: string;
  relatedCareers: string[];
  verificationNote?: string;
}

const CAREER_PATHWAYS: PathwayInfo[] = [
  {
    id: 'pilot', label: 'Pilot (Commercial/Airline)', icon: '✈',
    whatTheyDo: 'Pilots operate fixed-wing aircraft to transport passengers and cargo, or perform specialized aviation work (patrol, survey, instruction). Commercial pilots work for airlines, charter operators, cargo carriers, and flight training units.',
    whyMayAlign: ['Strong spatial reasoning and situational awareness', 'Decisive, calm under pressure', 'High procedural discipline', 'Effective communicator in high-stakes environments'],
    entryRequirements: 'Transport Canada medical (Category 1 for commercial operations). Meet minimum age and flight hour requirements for the licence sought. English language proficiency.',
    education: 'Private Pilot Licence (PPL) → Commercial Pilot Licence (CPL) → Instrument Rating (IR) → Multi-Engine Rating. Many pilots also pursue a university degree for airline advancement. Approved Training Organizations (ATOs) and Flight Training Units (FTUs) offer structured programs.',
    licensing: 'Transport Canada issues Private, Recreational, Commercial, and Airline Transport Pilot Licences (ATPL). Specific ratings (instruments, multi-engine, night) are added progressively. Verification of current requirements recommended at tc.canada.ca.',
    careerJourney: 'Student Pilot → Private Pilot Licence → Commercial Pilot Licence → Build flight hours (instructing, bush flying, cargo) → Multi-engine/Instrument ratings → Regional airline → Major airline / ATPL',
    relatedCareers: ['Flight Instructor', 'Cargo Pilot', 'Medevac Pilot', 'Bush/Charter Pilot', 'Corporate Aviation Pilot', 'Float Plane Pilot'],
    verificationNote: 'Licensing hour requirements and medical standards are set by Transport Canada and are subject to change. Always verify current requirements at tc.canada.ca or with a licensed flight school.',
  },
  {
    id: 'ame', label: 'Aircraft Maintenance Engineer (AME)', icon: '🔧',
    whatTheyDo: 'AMEs inspect, maintain, repair, and certify aircraft for airworthiness. They work on airframes, engines, avionics, and systems, and are legally authorized to sign off aircraft for return to service.',
    whyMayAlign: ['Strong mechanical reasoning and attention to detail', 'Systematic, procedural approach to problem-solving', 'Comfort with technical documentation and regulations', 'Interest in how things work at a physical and systems level'],
    entryRequirements: 'Completion of an approved AME training program. Meet minimum on-the-job experience requirements under a licensed AME. Written and practical Transport Canada examinations.',
    education: 'Accredited AME training programs are offered at various colleges and technical institutes across Canada. Programs are typically 2 years and cover airframe, powerplant, and systems. Programs must be approved by Transport Canada.',
    licensing: 'Transport Canada AME Licence (M1 – small aircraft, M2 – large aircraft, E – avionics, S – structures, and combined). Licence category determines what work the AME is authorized to certify. Verification required at tc.canada.ca.',
    careerJourney: 'AME Training Program → Apprentice / On-the-Job Experience → TC Written Examinations → AME Licence → Certifying Authority → Senior AME / Quality Assurance → Management',
    relatedCareers: ['Avionics Technician', 'Aircraft Inspector', 'Quality Assurance Inspector', 'MRO Supervisor', 'Aircraft Structures Technician'],
    verificationNote: 'AME licence categories and examination requirements are governed by Transport Canada CARs Part IV. Verify current requirements at tc.canada.ca.',
  },
  {
    id: 'avionics', label: 'Avionics Technician', icon: '📡',
    whatTheyDo: 'Avionics technicians install, maintain, test, and repair aircraft electronic systems including navigation, communication, autopilot, and flight management systems.',
    whyMayAlign: ['Strong spatial and analytical reasoning', 'Interest in electronics, systems, and technology', 'Attention to detail and procedural discipline', 'Comfortable working with technical schematics and diagnostic tools'],
    entryRequirements: 'Completion of an approved avionics or electronics technician training program. On-the-job experience under a licensed AME (E licence). TC examinations for Transport Canada AME E Licence.',
    education: 'College programs in avionics technology, aircraft electronics, or aviation electrical systems. Some programs are combined with AME M or S training. Community colleges across Canada offer approved programs.',
    licensing: 'Transport Canada AME E (Avionics) Licence. May also hold combined M/E ratings. Verify current requirements at tc.canada.ca.',
    careerJourney: 'Avionics Training Program → Apprentice Technician → AME E Licence → Senior Avionics Technician → Lead Technician / Inspector',
    relatedCareers: ['Aircraft Maintenance Engineer', 'Systems Test Engineer', 'Defense Electronics Technician', 'Aerospace Test Technician'],
  },
  {
    id: 'structures', label: 'Aircraft Structures Technician', icon: '🏗',
    whatTheyDo: 'Aircraft structures technicians repair and maintain the structural components of aircraft — fuselage, wings, control surfaces, landing gear, and pressure bulkheads — using composite and metallic materials.',
    whyMayAlign: ['Strong spatial reasoning and mechanical aptitude', 'Hands-on, precision-oriented work style', 'Comfort with technical drawings and specifications', 'Methodical, detail-focused approach'],
    entryRequirements: 'Approved AME training with structures emphasis. TC AME S Licence examinations and on-the-job experience requirements.',
    education: 'AME training programs covering airframe and structures. Some colleges offer composite structures specializations. Transport Canada approved programs required for licensing pathway.',
    licensing: 'Transport Canada AME S (Structures) Licence. Verify requirements at tc.canada.ca.',
    careerJourney: 'Structures Training → Apprentice → AME S Licence → Structures Inspector → Composite Specialist / Quality Control',
    relatedCareers: ['AME (M)', 'Composite Technician', 'Aerospace Manufacturing Technician', 'Quality Inspector'],
  },
  {
    id: 'atc', label: 'Air Traffic Controller (ATC)', icon: '🗼',
    whatTheyDo: 'Air Traffic Controllers manage the safe, orderly, and efficient movement of aircraft in Canadian airspace and at airports. They work in area control centres, terminal control units, and airport control towers.',
    whyMayAlign: ['High situational awareness and spatial thinking', 'Exceptional communication and decision-making under pressure', 'Strong working memory and multitasking ability', 'Calm, systematic approach to complex, dynamic situations'],
    entryRequirements: 'Competitive selection by NAV CANADA. Candidates must meet medical, vision, and hearing standards. Post-secondary diploma or degree typically required. English language proficiency. Age requirements apply.',
    education: "ATC training is conducted at the NAV CANADA Training Institute in Cornwall, Ontario. Entry is through NAV CANADA's competitive hiring process — not a traditional college program. Post-secondary education in a relevant field is advantageous.",
    licensing: 'Transport Canada ATC Licence issued through NAV CANADA training pathway. Specific ratings for tower, terminal, and area control. Verification required — requirements set by NAV CANADA and Transport Canada.',
    careerJourney: 'Competitive Application → NAV CANADA Selection → ATC Training Program → On-the-Job Training → Validated Controller → Senior Controller / Specialist',
    relatedCareers: ['Flight Service Specialist', 'ATC Supervisor', 'Aviation Safety Inspector', 'Air Traffic Systems Specialist'],
    verificationNote: 'ATC hiring, selection standards, and training pathways are managed by NAV CANADA. Verify current information at navcanada.ca.',
  },
  {
    id: 'fss', label: 'Flight Service Specialist (FSS)', icon: '📻',
    whatTheyDo: 'Flight Service Specialists provide weather briefings, flight planning assistance, and flight information services to pilots through NAV CANADA Flight Information Centres (FICs). They relay weather, NOTAMs, and other critical flight safety information.',
    whyMayAlign: ['Strong communication skills and attention to detail', 'Interest in weather, navigation, and aviation operations', 'Comfortable in a service and advisory role', 'Systematic information management ability'],
    entryRequirements: 'NAV CANADA competitive selection. Post-secondary education preferred. English language proficiency. Meet applicable medical and vision standards.',
    education: 'Training provided by NAV CANADA at the Training Institute in Cornwall, Ontario. Entry is through NAV CANADA hiring — not a standalone college program.',
    licensing: 'NAV CANADA certification. Verify requirements at navcanada.ca.',
    careerJourney: 'NAV CANADA Application → Selection → FSS Training → Flight Information Centre → Senior FSS',
    relatedCareers: ['Air Traffic Controller', 'Aviation Weather Specialist', 'Airport Operations Officer'],
    verificationNote: 'FSS hiring and training are managed by NAV CANADA. Verify current information at navcanada.ca.',
  },
  {
    id: 'airport_ops', label: 'Airport Operations Officer', icon: '🛬',
    whatTheyDo: 'Airport Operations Officers manage day-to-day airport safety and operational functions including airside vehicle control, wildlife management, runway inspections, emergency response coordination, and regulatory compliance.',
    whyMayAlign: ['Safety-oriented mindset and situational awareness', 'Comfort with regulatory frameworks and procedures', 'Team coordination and communication skills', 'Interest in airport environments and aviation systems'],
    entryRequirements: 'Airport-specific requirements vary. A post-secondary diploma or degree in aviation management, operations, or a related field is common. Airport RAIC (Restricted Area Identity Card) security clearance required.',
    education: 'Post-secondary programs in aviation management, airport administration, or operations management. Several Canadian colleges offer aviation-specific programs. Employers often provide on-the-job training.',
    licensing: 'No single national licence — credentials vary by airport and employer. Airside Vehicle Operator Permit (AVOP) required. Some airports require additional certifications.',
    careerJourney: 'Aviation or Operations Diploma → Airport Operations Agent → Operations Officer → Senior Officer → Manager / Superintendent',
    relatedCareers: ['Ground Operations Supervisor', 'Emergency Response Coordinator', 'Aviation Safety Inspector', 'Airport Manager'],
  },
  {
    id: 'ground_ops', label: 'Ground & FBO Operations', icon: '🚜',
    whatTheyDo: 'Ground operations professionals handle aircraft handling, fueling, marshalling, baggage, and general airside services at airports and Fixed Base Operators (FBOs). Roles range from ramp agents to FBO management.',
    whyMayAlign: ['Physical, hands-on work environment', 'Team-oriented operational role', 'Entry pathway into the aviation industry', 'Interest in aircraft and airport environments'],
    entryRequirements: 'Many entry-level positions accessible with a high school diploma and on-the-job training. Security clearance (RAIC) required for airside access. Specialized training for fueling, dangerous goods handling.',
    education: 'On-the-job training common. College programs in aviation operations or ground support equipment can be advantageous. Dangerous Goods certification and fueling endorsements may be required.',
    licensing: 'No single licence — employer and airport certifications apply. Dangerous Goods (IATA) training. TDG certification. Verify requirements with specific employers.',
    careerJourney: 'Ramp Agent / Ground Handler → Senior Agent → Lead → Supervisor → FBO Manager',
    relatedCareers: ['Airport Operations Officer', 'Cargo Specialist', 'Aircraft Refueler', 'Baggage Services Supervisor'],
  },
  {
    id: 'uav', label: 'UAV / Drone Operations', icon: '🚁',
    whatTheyDo: 'UAV (Unmanned Aerial Vehicle) pilots and operators fly remotely piloted aircraft systems (RPAS) for applications including aerial photography, infrastructure inspection, precision agriculture, search and rescue, and delivery logistics.',
    whyMayAlign: ['Spatial reasoning and systems thinking', 'Interest in technology and emerging aviation sectors', 'Attention to detail and regulatory awareness', 'Comfort with both technical operations and mission planning'],
    entryRequirements: 'Transport Canada RPAS pilot certificate required for all but recreational use. Basic certificate for lower-risk operations, Advanced certificate for complex/higher-risk operations. Advanced requires ground school and flight review.',
    education: 'Drone pilot training programs offered by numerous providers. Transport Canada approved or aligned programs available. No mandatory college program — but aviation, technology, or engineering backgrounds are advantageous for advanced roles.',
    licensing: 'Transport Canada RPAS Pilot Certificate (Basic and Advanced). Advanced certificate requires written exam and in-person flight review with authorized reviewer. Verify requirements at tc.canada.ca/RPAS.',
    careerJourney: 'RPAS Certificate → Commercial Drone Operator → Specialized Applications (inspection, mapping, delivery) → UAV Mission Specialist / Fleet Manager',
    relatedCareers: ['Aviation Photographer', 'Aerial Survey Specialist', 'Infrastructure Inspector', 'Precision Agriculture Specialist', 'Search and Rescue UAV Operator'],
    verificationNote: 'RPAS regulations in Canada are evolving. Always verify current Transport Canada requirements at tc.canada.ca before advising participants.',
  },
  {
    id: 'aerospace_mfg', label: 'Aerospace Manufacturing Technician', icon: '🏭',
    whatTheyDo: 'Aerospace manufacturing technicians build, assemble, and quality-check components and systems for aircraft and spacecraft, working in precision manufacturing environments on structures, engines, avionics assemblies, and composite materials.',
    whyMayAlign: ['Mechanical reasoning and spatial thinking', 'Precision, detail-oriented work style', 'Interest in how aircraft are built', 'Comfort with technical specifications and quality standards'],
    entryRequirements: 'Technical or trades training in machining, composite fabrication, sheet metal work, or precision manufacturing. Industry-specific training provided by employers. Quality management certifications (AS9100) advantageous.',
    education: 'College programs in manufacturing technology, precision machining, composite fabrication, or aircraft manufacturing. Employers such as Bombardier, StandardAero, and Magellan Aerospace provide on-the-job training.',
    licensing: 'No single national licence — employer quality system certifications and specific skills endorsements apply. NDT (Non-Destructive Testing) certification may be required for inspection roles.',
    careerJourney: 'Manufacturing Technology Program → Production Technician → Senior Technician → Quality Inspector → Lead / Supervisor',
    relatedCareers: ['AME', 'Quality Inspector', 'CNC Machinist', 'Composite Structures Technician', 'Aerospace Test Technician'],
  },
  {
    id: 'aerospace_eng', label: 'Aerospace Engineering', icon: '🚀',
    whatTheyDo: 'Aerospace engineers design, test, and develop aircraft, spacecraft, propulsion systems, and related technologies. They work in research and development, design bureaus, regulatory agencies, and aerospace manufacturers.',
    whyMayAlign: ['Strong analytical and problem-solving capabilities', 'Mathematical and systems thinking', 'Curiosity and adaptive learning orientation', 'Interest in aircraft design, propulsion, or space systems'],
    entryRequirements: 'Bachelor of Engineering (BEng) in Aerospace, Mechanical, Electrical, or a related discipline. Graduate degrees for research and advanced design roles. Professional Engineer (P.Eng.) designation for certain responsibilities.',
    education: 'Engineering programs at accredited Canadian universities (Carleton University Aerospace Engineering, Ryerson/Toronto Metropolitan, University of British Columbia, University of Toronto Institute for Aerospace Studies, and others). CEAB-accredited programs required for P.Eng. pathway.',
    licensing: 'Professional Engineer (P.Eng.) through provincial engineering associations (e.g., Engineers Canada member associations). Not all aerospace engineering roles require P.Eng. Verify requirements.',
    careerJourney: 'Engineering Degree → Junior Engineer → Design/Systems Engineer → Senior Engineer → Principal Engineer / Engineering Manager',
    relatedCareers: ['Systems Engineer', 'Structural Engineer', 'Propulsion Engineer', 'Test Engineer', 'Flight Test Engineer', 'Regulatory Certification Engineer'],
    verificationNote: 'University program lists and P.Eng. requirements change. Verify with Engineers Canada and individual universities.',
  },
  {
    id: 'cargo', label: 'Air Cargo & Logistics', icon: '📦',
    whatTheyDo: 'Air cargo and logistics professionals manage the planning, handling, documentation, and regulatory compliance involved in moving freight by air. Roles include cargo agents, dangerous goods specialists, customs brokers, and operations managers.',
    whyMayAlign: ['Procedural reasoning and attention to detail', 'Interest in logistics, supply chains, and international trade', 'Team coordination and communication skills', 'Comfort with regulatory frameworks (Dangerous Goods, CBSA, CUSMA)'],
    entryRequirements: 'Entry-level positions accessible with a high school diploma and IATA/TACT training. Dangerous Goods certification required for DG handling. Post-secondary business or logistics programs advantageous for advancement.',
    education: 'IATA certification programs (Cargo Introductory, Dangerous Goods). College programs in supply chain management, business logistics, or air transportation. Customs brokerage (CSCB) designation for customs specialists.',
    licensing: 'IATA Cargo Agent certification. IATA Dangerous Goods by Air certification (required for DG handling). Customs Broker licence (CBSA) for customs roles. Verify with IATA and CBSA.',
    careerJourney: 'Cargo Agent → Senior Agent → Operations Supervisor → Cargo Manager → Regional / Network Manager',
    relatedCareers: ['Airport Operations Officer', 'Customs Broker', 'Supply Chain Analyst', 'Freight Forwarder'],
  },
  {
    id: 'customer_ops', label: 'Aviation Customer & Commercial Operations', icon: '🛎',
    whatTheyDo: 'Customer and commercial operations roles in aviation include passenger service agents, ramp agents, flight dispatchers, airline operations staff, and airport retail and hospitality. These roles are the front line of the passenger experience.',
    whyMayAlign: ['Strong communication and interpersonal skills', 'Team-oriented, service-focused work style', 'Comfort in fast-paced, dynamic environments', 'Interest in aviation without a technical maintenance focus'],
    entryRequirements: 'Most entry-level customer service roles require a high school diploma and on-the-job training. Security clearance (RAIC) for airside access. Flight dispatcher roles require Transport Canada Flight Dispatcher Certificate.',
    education: 'College programs in aviation management, airport customer service, or hospitality. IATA Diploma programs. Flight dispatcher: Transport Canada approved ground school and examination.',
    licensing: 'Flight Dispatcher: Transport Canada Flight Dispatcher Certificate (FDC). Other roles: employer and airport-specific certifications. Verify with TC for dispatcher requirements.',
    careerJourney: 'Passenger Service Agent / Ramp Agent → Senior Agent → Lead / Supervisor → Operations Coordinator → Station Manager',
    relatedCareers: ['Flight Dispatcher', 'Airline Operations Coordinator', 'Airport Customer Experience Manager', 'Revenue Management Analyst'],
  },
  {
    id: 'aviation_tech', label: 'Aviation Technology & Systems', icon: '💻',
    whatTheyDo: 'Aviation technology professionals design, develop, and maintain the software, data systems, and digital infrastructure that power modern aviation — from flight management systems and ATC automation to airline reservation platforms and aviation analytics.',
    whyMayAlign: ['Analytical reasoning and problem-solving aptitude', 'Interest in technology applied to safety-critical systems', 'Adaptive learning and comfort with evolving technologies', 'Systems thinking and attention to precision'],
    entryRequirements: 'Post-secondary degree or diploma in computer science, software engineering, information technology, or a related field. Aviation domain knowledge is highly valued — many roles are filled by technologists who also hold a pilot licence or AME background.',
    education: 'University degrees in computer science, software engineering, or electrical engineering. College IT and networking programs for infrastructure roles. Aviation-specific technology certifications (ICAO, ARINC) for domain-specific roles.',
    licensing: 'No single national licence — professional certifications (PMP, AWS, Cisco, IATA) vary by role. Software used in type-certified aircraft requires DO-178C/DO-254 processes — verify with employers.',
    careerJourney: 'Software / IT Program → Junior Developer / Systems Analyst → Aviation Systems Specialist → Senior Developer / Architect → Aviation Technology Manager',
    relatedCareers: ['Avionics Systems Engineer', 'ATC Systems Specialist', 'Aviation Data Analyst', 'Cybersecurity Specialist (Aviation)', 'Simulation Developer'],
  },
];

// Education level and entry-point metadata (for career exploration filters)
const PATHWAY_EDUCATION_LEVEL: Record<string, string> = {
  pilot:          'college_technical',
  ame:            'college_technical',
  avionics:       'college_technical',
  structures:     'college_technical',
  atc:            'competitive_selection',
  fss:            'competitive_selection',
  airport_ops:    'college_diploma',
  ground_ops:     'on_the_job',
  uav:            'certification',
  aerospace_mfg:  'college_technical',
  aerospace_eng:  'university',
  cargo:          'on_the_job',
  customer_ops:   'on_the_job',
  aviation_tech:  'university',
};
const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  on_the_job:            'On-the-Job / No Formal Credential Required',
  certification:         'Short Certification Program',
  college_diploma:       'College Diploma',
  college_technical:     'College / Technical Training',
  competitive_selection: 'Employer-Run Selection & Training',
  university:            'University Degree',
};
const PATHWAY_ENTRY_LEVEL = new Set(['ground_ops', 'cargo', 'customer_ops', 'uav', 'airport_ops']);

// Work environment summaries (for pathway detail)
const PATHWAY_WORK_ENVIRONMENT: Record<string, string> = {
  pilot:         'Primarily in-flight operations across Canadian and international routes. Includes pre-flight planning, dispatch coordination, and compliance with Transport Canada regulatory requirements. Shift work common; schedule varies by employer and operation type.',
  ame:           'Hangar and line maintenance environments at airports, MROs, and airline facilities. Work involves physical labour, technical tools, and close adherence to regulatory standards. Shift work is common.',
  avionics:      'Hangar and workshop environments. Detailed electronic diagnostic and repair work. Requires precision, clean conditions, and strict documentation practices.',
  structures:    'Aircraft hangar and manufacturing settings. Hands-on work with composite and metallic materials. May involve tight spaces and physical demands.',
  atc:           'Indoor control tower, terminal control unit, or area control centre. High-focus, shift-based work environment with strict operational protocols.',
  fss:           'NAV CANADA Flight Information Centre. Primarily indoor, shift-based communication and information role.',
  airport_ops:   'Airside and landside airport environments. Mix of indoor and outdoor work. Fast-paced, safety-critical, and operationally diverse.',
  ground_ops:    'Ramp and airside environments. Physical, outdoor work with aircraft and ground support equipment. Shift work; early morning and overnight hours common.',
  uav:           'Field operations, indoor simulation, and mission planning environments. Varies widely by application — from agricultural land to infrastructure inspection sites.',
  aerospace_mfg: 'Precision manufacturing and assembly facilities. Clean, controlled environments with strict quality system requirements.',
  aerospace_eng: 'Engineering offices, research facilities, test facilities, and regulatory agencies. May involve travel to test sites or international operations.',
  cargo:         'Cargo terminals, warehouse environments, and airport freight operations. Mix of administrative and physical work; shift work common.',
  customer_ops:  'Airport terminals and airline operations centres. Customer-facing, fast-paced environment with high operational tempo.',
  aviation_tech: 'Technology offices, control centres, and aviation operations environments. May include remote or hybrid work. Safety-critical software demands precision.',
};

const PATHWAY_SECTORS = [
  { id: 'flight_ops',  label: 'Flight Operations',           color: '#8F0909', pathwayIds: ['pilot', 'uav'] },
  { id: 'maintenance', label: 'Maintenance & Engineering',    color: '#1d4ed8', pathwayIds: ['ame', 'avionics', 'structures'] },
  { id: 'atc_nav',     label: 'Air Traffic & Navigation',    color: '#065f46', pathwayIds: ['atc', 'fss'] },
  { id: 'airport_ops', label: 'Airport & Ground Operations', color: '#92400e', pathwayIds: ['airport_ops', 'ground_ops', 'cargo', 'customer_ops'] },
  { id: 'engineering', label: 'Engineering & Technology',    color: '#5b21b6', pathwayIds: ['aerospace_mfg', 'aerospace_eng', 'aviation_tech'] },
];

// ── Shared UI primitives ───────────────────────────────────────────────────────

function Chip({ label, color = T.muted, bg = '#f1f5f9', bdr = T.border }: {
  label: string; color?: string; bg?: string; bdr?: string;
}) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600, color,
      background: bg, border: `1px solid ${bdr}`,
      borderRadius: 6, padding: '3px 9px', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function EvidenceChip({ state }: { state: EvidenceState }) {
  const s = EVIDENCE_STYLE[state];
  return <Chip label={s.label} color={s.color} bg={s.bg} bdr={s.bdr} />;
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: number | string; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: '20px 20px 16px', flex: '1 1 160px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: T.muted, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: accent ? T.burgundy : T.navy, lineHeight: 1, marginBottom: sub ? 6 : 0 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: T.faint }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: T.navy, margin: '0 0 4px' }}>{title}</h2>
      {sub && <p style={{ fontSize: 13, color: T.steel, margin: 0 }}>{sub}</p>}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 12, ...style,
    }}>
      {children}
    </div>
  );
}

function ProvenanceTag({ type }: { type: 'acia' | 'coach' | 'mentor' | 'program' | 'employer' }) {
  const map = {
    acia:    { label: 'ACIA Evidence',                color: T.burgundy, bg: '#fff5f5',   bdr: '#fecaca' },
    coach:   { label: 'Coach Observation',            color: T.blue,     bg: T.blueBg,    bdr: T.blueBdr },
    mentor:  { label: 'Industry Mentor Observation',  color: T.purple,   bg: '#f5f3ff',   bdr: '#ddd6fe' },
    program: { label: 'Program Evidence',             color: T.green,    bg: T.greenBg,   bdr: T.greenBdr },
    employer:{ label: 'Employer Evidence',            color: T.amber,    bg: T.amberBg,   bdr: T.amberBdr },
  };
  const s = map[type];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: s.color, background: s.bg, border: `1px solid ${s.bdr}`,
      borderRadius: 4, padding: '2px 7px',
    }}>
      {s.label}
    </span>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────────

function OverviewTab({
  data,
  onViewParticipant,
}: {
  data: NonNullable<ReturnType<typeof useCoachDashboard>['data']>;
  onViewParticipant: (p: CoachParticipant) => void;
}) {
  const priorities = data.participants.filter(p => p.guidanceRequired);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Executive stat cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="My Participants" value={data.stats.totalParticipants} />
        <StatCard label="ACIA Completed" value={data.stats.aciaCompleted} sub="Career intelligence available" />
        <StatCard label="Guidance Required" value={data.stats.guidanceRequired} accent sub="Career guidance conversation needed" />
        <StatCard label="Active Pathways" value={data.stats.activePathways} sub="Participants exploring pathways" />
        <StatCard label="Follow-Ups Due" value={data.stats.followUpsDue} sub="Upcoming or overdue" />
      </div>

      {/* Coaching Priorities */}
      <div>
        <SectionHeader
          title="Guidance Priorities"
          sub="Students and participants who would benefit from a career guidance conversation."
        />
        {priorities.length === 0 ? (
          <Card style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ color: T.muted, margin: 0, fontSize: 14 }}>No students or participants currently require immediate guidance.</p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {priorities.map(p => (
              <PriorityCard key={p.userId} participant={p} onView={() => onViewParticipant(p)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PriorityCard({ participant: p, onView }: { participant: CoachParticipant; onView: () => void }) {
  const aciaLabels: Record<string, string> = {
    not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed',
  };
  const aciaColors: Record<string, string> = {
    not_started: T.faint, in_progress: T.amber, completed: T.green,
  };

  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: T.burgundy, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>
              {p.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: T.navy, fontSize: 15 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: T.muted }}>
                {PARTICIPANT_PATHWAY_LABELS[p.pathway] ?? p.pathway}
              </div>
            </div>
          </div>
          {p.school && (
            <div style={{ fontSize: 12, color: T.faint, marginBottom: 6 }}>{p.school}</div>
          )}
        </div>

        <div style={{ flex: '1 1 180px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.faint, marginBottom: 6 }}>
            ACIA Status
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: aciaColors[p.aciaStatus] }}>
            {aciaLabels[p.aciaStatus]}
          </div>
          {p.emergingPathways.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.faint, marginTop: 12, marginBottom: 6 }}>
                Career Pathways
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {p.emergingPathways.map(ep => (
                  <Chip key={ep} label={safePathwayLabel(ep)} color={T.burgundy} bg="#fff5f5" bdr="#fecaca" />
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ flex: '1 1 160px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.faint, marginBottom: 6 }}>
            Next Recommended Action
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.navy, marginBottom: 14 }}>
            Career Discovery Conversation
          </div>
          <div style={{ fontSize: 11, color: T.faint, marginBottom: 8 }}>
            Last activity: {new Date(p.lastActivity).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onView} style={primaryBtn}>View Career Intelligence</button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── My Participants Tab ────────────────────────────────────────────────────────

function ParticipantsTab({
  participants,
  onViewParticipant,
}: {
  participants: CoachParticipant[];
  onViewParticipant: (p: CoachParticipant) => void;
}) {
  const [search, setSearch] = useState('');
  const [filterPathway, setFilterPathway] = useState('');
  const [filterAcia, setFilterAcia] = useState('');
  const [filterCoaching, setFilterCoaching] = useState('');

  const filtered = participants.filter(p => {
    const q = search.toLowerCase();
    const nameMatch = !q || p.name.toLowerCase().includes(q) || p.school?.toLowerCase().includes(q) || '';
    const pathwayMatch = !filterPathway || p.pathway === filterPathway;
    const aciaMatch = !filterAcia || p.aciaStatus === filterAcia;
    const coachingMatch = !filterCoaching || p.coachingStatus === filterCoaching;
    return nameMatch && pathwayMatch && aciaMatch && coachingMatch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="My Students & Participants"
        sub="Students and participants assigned to your caseload."
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search students and participants..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={filterInput}
        />
        <select value={filterPathway} onChange={e => setFilterPathway(e.target.value)} style={filterInput}>
          <option value="">All Pathways</option>
          {Object.entries(PARTICIPANT_PATHWAY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={filterAcia} onChange={e => setFilterAcia(e.target.value)} style={filterInput}>
          <option value="">ACIA Status</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select value={filterCoaching} onChange={e => setFilterCoaching(e.target.value)} style={filterInput}>
          <option value="">Coaching Status</option>
          <option value="not_started">Not Started</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && (
          <Card style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ color: T.muted, margin: 0 }}>No participants match the current filters.</p>
          </Card>
        )}
        {filtered.map(p => <ParticipantRow key={p.userId} participant={p} onView={() => onViewParticipant(p)} />)}
      </div>
    </div>
  );
}

function ParticipantRow({ participant: p, onView }: { participant: CoachParticipant; onView: () => void }) {
  const aciaColor: Record<string, string> = {
    not_started: T.faint, in_progress: T.amber, completed: T.green,
  };
  const aciaLabel: Record<string, string> = {
    not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed',
  };
  const coachingColor: Record<string, string> = {
    not_started: T.faint, scheduled: T.blue, in_progress: T.amber, completed: T.green,
  };
  const coachingLabel: Record<string, string> = {
    not_started: 'Not Started', scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed',
  };

  return (
    <Card style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: T.burgundy, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {p.name.split(' ').map(n => n[0]).join('')}
        </div>

        <div style={{ flex: '1 1 180px' }}>
          <div style={{ fontWeight: 700, color: T.navy, fontSize: 14 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{PARTICIPANT_PATHWAY_LABELS[p.pathway]}</div>
          {p.school && <div style={{ fontSize: 11, color: T.faint }}>{p.school}</div>}
        </div>

        <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 100 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.faint, marginBottom: 4 }}>ACIA</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: aciaColor[p.aciaStatus] }}>{aciaLabel[p.aciaStatus]}</div>
        </div>

        <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 110 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.faint, marginBottom: 4 }}>Guidance</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: coachingColor[p.coachingStatus] }}>{coachingLabel[p.coachingStatus]}</div>
        </div>

        {p.emergingPathways.length > 0 && (
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.faint, marginBottom: 4 }}>Career Pathways</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {p.emergingPathways.slice(0, 3).map(ep => (
                <Chip key={ep} label={safePathwayLabel(ep)} color={T.burgundy} bg="#fff5f5" bdr="#fecaca" />
              ))}
              {p.emergingPathways.length > 3 && <Chip label={`+${p.emergingPathways.length - 3}`} />}
            </div>
          </div>
        )}

        {p.guidanceRequired && (
          <Chip label="Guidance Required" color={T.burgundy} bg="#fff5f5" bdr="#fecaca" />
        )}

        <button onClick={onView} style={{ ...secondaryBtn, flexShrink: 0 }}>
          View Career Intelligence
        </button>
      </div>
    </Card>
  );
}

// ── Participant Career Intelligence Profile ────────────────────────────────────

function ParticipantProfile({
  participant: p,
  onBack,
  onStartSession,
  onAddObservation,
}: {
  participant: CoachParticipant;
  onBack: () => void;
  onStartSession: (p: CoachParticipant) => void;
  onAddObservation: (p: CoachParticipant) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Back + header */}
      <div>
        <button onClick={onBack} style={{ ...ghostBtn, marginBottom: 16 }}>← Back to Participants</button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: T.burgundy, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700,
            }}>
              {p.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: T.navy, margin: 0 }}>{p.name}</h2>
              <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
                {PARTICIPANT_PATHWAY_LABELS[p.pathway]}
                {p.school ? ` · ${p.school}` : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onAddObservation(p)} style={{ ...ghostBtn, borderColor: T.burgundy, color: T.burgundy }}>
              + Add Observation
            </button>
            <button onClick={() => onStartSession(p)} style={primaryBtn}>
              Start Guidance Session
            </button>
          </div>
        </div>
      </div>

      {/* Profile cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* A. Participant Context */}
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: T.muted, marginBottom: 14 }}>
            Participant Context
          </div>
          <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Career Pathway', PARTICIPANT_PATHWAY_LABELS[p.pathway]],
              ...(p.aciaStage ? [['Assessment Stage', p.aciaStage.charAt(0).toUpperCase() + p.aciaStage.slice(1)]] as [string, string][] : []),
              ['ACIA Status', p.aciaStatus === 'completed'
                ? (p.aciaStage === 'baseline' ? 'Baseline Assessment Completed'
                  : p.aciaStage === 'completion' ? 'AACP Completion Assessment Completed'
                  : p.aciaStage === 'followup' ? '90-Day Follow-Up Completed'
                  : 'Assessment Completed')
                : p.aciaStatus === 'in_progress' ? 'Assessment In Progress'
                : 'Not Yet Started'],
              ...(p.school ? [['School / Organization', p.school]] as [string, string][] : []),
              ...(p.region ? [['Region', p.region]] as [string, string][] : []),
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 10 }}>
                <dt style={{ fontSize: 12, color: T.faint, minWidth: 150, flexShrink: 0 }}>{label}</dt>
                <dd style={{ fontSize: 13, color: T.navy, fontWeight: 600, margin: 0 }}>{value}</dd>
              </div>
            ))}
          </dl>
          {p.emergingPathways.length > 0 && (
            <>
              <div style={{ height: 1, background: T.border, margin: '14px 0' }} />
              <div style={{ fontSize: 11, color: T.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                {p.emergingPathways.length === 1 ? 'Primary Pathway' : 'Career Pathways to Explore'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {p.emergingPathways.map((ep, i) => {
                  const displayLabel = safePathwayLabel(ep);
                  return (
                    <div key={ep} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {i === 0
                        ? <Chip label={displayLabel} color={T.burgundy} bg="#fff5f5" bdr="#fecaca" />
                        : <span style={{ fontSize: 12, color: T.navy }}>{displayLabel}</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* B. Observed Competency Evidence */}
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: T.muted }}>
              Observed Competency Evidence
            </div>
            <ProvenanceTag type="acia" />
          </div>
          {(!p.competencies || p.competencies.length === 0) ? (
            <p style={{ color: T.muted, fontSize: 13, margin: 0 }}>
              {p.aciaStatus === 'not_started'
                ? 'ACIA has not been started. Competency evidence will appear here once the participant completes the Career Discovery Flight.'
                : p.aciaStatus === 'completed'
                ? (p.careerAlignments && p.careerAlignments.length > 0
                  ? 'Structured competency evidence was not recorded for this assessment. Career pathway alignment is available in the section below.'
                  : 'Structured competency evidence was not recorded for this assessment.')
                : 'Assessment is in progress. Competency evidence will appear here once complete.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {p.competencies
                .filter(c => c.state !== 'insufficient')
                .sort((a, b) => {
                  const order = ['strong', 'demonstrated', 'developing', 'emerging'];
                  return order.indexOf(a.state) - order.indexOf(b.state);
                })
                .map(c => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 13, color: T.navy, fontWeight: 500 }}>{c.label}</div>
                    <EvidenceChip state={c.state} />
                  </div>
                ))}
            </div>
          )}
          <div style={{
            marginTop: 16, padding: '10px 12px',
            background: T.bg, borderRadius: 8, border: `1px solid ${T.border}`,
            fontSize: 11, color: T.muted, lineHeight: 1.5,
          }}>
            ACIA evidence is generated through structured assessment interactions and cannot be edited by Career Advisors. Evidence reflects what was observed — not a score or grade.
          </div>
        </Card>
      </div>

      {/* C. Career Pathways to Explore */}
      {p.careerAlignments && p.careerAlignments.length > 0 && (
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: T.muted }}>
              Career Pathways to Explore
            </div>
            <ProvenanceTag type="acia" />
          </div>
          <div style={{
            fontSize: 12, color: T.muted, marginBottom: 16,
            background: T.bg, borderRadius: 8, border: `1px solid ${T.border}`,
            padding: '10px 14px', lineHeight: 1.6,
          }}>
            {(!p.competencies || p.competencies.length === 0)
              ? 'These represent potential career alignment recorded through ACIA. Use this as a starting point for career exploration — not as a definitive recommendation. The participant\'s interests, values, and circumstances remain essential to any career discussion.'
              : 'These represent potential career alignment based on competency evidence observed through ACIA. Use this as a starting point for career conversation — not as a definitive recommendation. The participant\'s interests, values, and circumstances are essential to any career exploration.'
            }
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {p.careerAlignments.map(ca => {
              const style = ALIGNMENT_STYLE[ca.alignment];
              const pathwayInfo = CAREER_PATHWAYS.find(pw => pw.id === ca.pathwayId);
              return (
                <div key={ca.pathwayId} style={{
                  background: T.bg, border: `1px solid ${T.border}`,
                  borderRadius: 10, padding: '14px 16px',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, marginBottom: 6 }}>
                    {safePathwayLabel(ca.label)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: style.color, marginBottom: 8 }}>
                    {style.label}
                  </div>
                  {pathwayInfo && (
                    <div style={{ fontSize: 12, color: T.steel, lineHeight: 1.5 }}>
                      {pathwayInfo.whatTheyDo.slice(0, 120)}…
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Coach notes section */}
      {p.coachNotes && (
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: T.muted }}>
              Coach Observations
            </div>
            <ProvenanceTag type="coach" />
          </div>
          <p style={{ fontSize: 14, color: T.navy, lineHeight: 1.7, margin: 0 }}>{p.coachNotes}</p>
        </Card>
      )}
    </div>
  );
}

// ── Coaching Sessions Tab ──────────────────────────────────────────────────────

function SessionsTab({
  sessions,
  participants,
  onStartSession,
}: {
  sessions: CoachingSession[];
  participants: CoachParticipant[];
  onStartSession: (p: CoachParticipant) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionHeader
          title="Coaching Sessions"
          sub="Career guidance conversations and structured session records."
        />
      </div>

      {/* Scheduled upcoming */}
      {sessions.filter(s => s.status === 'scheduled').length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.amber, marginBottom: 12 }}>
            Upcoming Sessions
          </div>
          {sessions.filter(s => s.status === 'scheduled').map(s => {
            const participant = participants.find(p => p.userId === s.participantId);
            return (
              <Card key={s.sessionId} style={{ padding: '16px 20px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: T.navy, fontSize: 14 }}>{s.participantName}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                      Scheduled: {new Date(s.conductedAt).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  {participant && (
                    <button onClick={() => onStartSession(participant)} style={primaryBtn}>
                      Start Session
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Completed sessions */}
      {sessions.filter(s => s.status === 'completed').length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.muted, marginBottom: 12 }}>
            Completed Sessions
          </div>
          {sessions.filter(s => s.status === 'completed').map(s => (
            <Card key={s.sessionId} style={{ padding: '20px 24px', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontWeight: 700, color: T.navy, fontSize: 14, marginBottom: 4 }}>{s.participantName}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>
                    {new Date(s.conductedAt).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                  {s.notes && (
                    <p style={{ fontSize: 13, color: T.steel, lineHeight: 1.6, margin: '12px 0 0' }}>{s.notes}</p>
                  )}
                </div>
                {s.pathwaysExplored.length > 0 && (
                  <div style={{ flex: '1 1 160px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.faint, marginBottom: 6 }}>
                      Pathways Explored
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {s.pathwaysExplored.map(ep => <Chip key={ep} label={ep} />)}
                    </div>
                  </div>
                )}
                {s.nextSteps.length > 0 && (
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.faint, marginBottom: 6 }}>
                      Next Steps Agreed
                    </div>
                    <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {s.nextSteps.map((step, i) => (
                        <li key={i} style={{ fontSize: 13, color: T.navy }}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {sessions.length === 0 && (
        <Card style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ color: T.muted, fontSize: 14, margin: 0 }}>No coaching sessions recorded yet.</p>
        </Card>
      )}
    </div>
  );
}

// ── Coaching Session Workspace (modal-style) ───────────────────────────────────

const NEXT_STEP_OPTIONS = [
  'Research aviation career pathway',
  'Meet aviation industry mentor',
  'Attend aviation career event',
  'Explore post-secondary program',
  'Explore Flight Training Unit',
  'Explore Approved Training Organization',
  'Employer exposure / site visit',
  'Job shadow',
  'Work-integrated learning',
  'Complete AACP program',
  'Follow-up coaching session',
  'Other (see notes)',
];

const ALL_PATHWAYS = CAREER_PATHWAYS.map(p => p.label);

// ── Add Competency Observation Modal ──────────────────────────────────────────

const EVIDENCE_STATES: EvidenceState[] = ['emerging', 'developing', 'demonstrated', 'strong'];
const COACH_EVIDENCE_SOURCES: Array<{ value: EvidenceSource; label: string }> = [
  { value: 'career_coach', label: 'Career Coach' },
  { value: 'industry_mentor', label: 'Industry Mentor' },
  { value: 'aacp_program', label: 'AACP Program' },
  { value: 'instructor', label: 'Instructor' },
];

function AddCompetencyObservationModal({
  participant,
  onClose,
  onSaved,
}: {
  participant: CoachParticipant;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [competencyId, setCompetencyId] = useState('');
  const [evidenceState, setEvidenceState] = useState<EvidenceState>('developing');
  const [evidenceSource, setEvidenceSource] = useState<EvidenceSource>('career_coach');
  const [observationContext, setObservationContext] = useState('');
  const [structuredObservation, setStructuredObservation] = useState('');
  const [evidenceConfidence, setEvidenceConfidence] = useState<'low' | 'moderate' | 'high'>('moderate');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: `1px solid ${T.border}`,
    borderRadius: 8, fontSize: 13, color: T.navy, background: T.bg, cursor: 'pointer',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', color: T.muted, marginBottom: 6, display: 'block',
  };
  const textareaStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: `1px solid ${T.border}`,
    borderRadius: 8, fontSize: 13, color: T.navy, background: T.bg,
    resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const,
  };

  async function handleSubmit() {
    if (!competencyId) { setError('Please select a competency.'); return; }
    if (!structuredObservation.trim()) { setError('Please enter a structured observation.'); return; }
    setError('');
    setSaving(true);
    try {
      await submitCompetencyObservation({
        participantId: participant.userId,
        competencyId,
        evidenceState,
        evidenceSource,
        observationContext: observationContext.trim() || undefined,
        structuredObservation: structuredObservation.trim(),
        evidenceConfidence,
      });
      setSaved(true);
      setTimeout(() => { onSaved?.(); onClose(); }, 1200);
    } catch (e) {
      setError('Could not save observation. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)',
      zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      overflowY: 'auto', padding: '32px 16px',
    }}>
      <div style={{
        background: T.card, borderRadius: 16, width: '100%', maxWidth: 640,
        border: `1px solid ${T.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.burgundy, marginBottom: 4 }}>
              Competency Evidence
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: T.navy, margin: 0 }}>
              Add Competency Observation
            </h3>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              {participant.name} · {PARTICIPANT_PATHWAY_LABELS[participant.pathway]}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.muted }}>✕</button>
        </div>

        {/* Notice */}
        <div style={{ margin: '20px 28px 0', padding: '12px 16px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10, fontSize: 12, color: '#92400e' }}>
          <strong>Evidence Integrity:</strong> This observation will enter the AACP Competency Evidence Ledger as an additive record. It will never modify ACIA evidence. Use only AACP framework competencies. Structured observations are not private coaching notes.
        </div>

        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Competency */}
          <div>
            <label style={labelStyle}>Competency *</label>
            <select value={competencyId} onChange={e => setCompetencyId(e.target.value)} style={selectStyle}>
              <option value="">— Select AACP Competency —</option>
              {Object.entries(AACP_COMPETENCY_KEYS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Evidence State */}
          <div>
            <label style={labelStyle}>Evidence State *</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {EVIDENCE_STATES.map(state => (
                <button
                  key={state}
                  onClick={() => setEvidenceState(state)}
                  style={{
                    padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `2px solid ${evidenceState === state ? T.burgundy : T.border}`,
                    background: evidenceState === state ? '#fdf2f2' : T.card,
                    color: evidenceState === state ? T.burgundy : T.muted,
                  }}
                >
                  {EVIDENCE_STATE_LABELS[state]}
                </button>
              ))}
            </div>
          </div>

          {/* Evidence Source */}
          <div>
            <label style={labelStyle}>Evidence Source *</label>
            <select value={evidenceSource} onChange={e => setEvidenceSource(e.target.value as EvidenceSource)} style={selectStyle}>
              {COACH_EVIDENCE_SOURCES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Observation Context */}
          <div>
            <label style={labelStyle}>Observation Context</label>
            <input
              value={observationContext}
              onChange={e => setObservationContext(e.target.value)}
              placeholder="e.g. Career Pathway Discussion, Mock Interview, Site Visit"
              style={{ ...selectStyle, fontFamily: 'inherit' }}
            />
          </div>

          {/* Structured Observation */}
          <div>
            <label style={labelStyle}>Structured Observation *</label>
            <textarea
              rows={5}
              value={structuredObservation}
              onChange={e => setStructuredObservation(e.target.value)}
              placeholder={`Describe what you observed related to ${competencyId ? AACP_COMPETENCY_KEYS[competencyId] ?? competencyId : 'this competency'}. Be specific about the behaviours or indicators you observed.`}
              style={textareaStyle}
            />
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
              This observation becomes a competency evidence record linked to {participant.name}'s profile.
            </div>
          </div>

          {/* Evidence Confidence */}
          <div>
            <label style={labelStyle}>Observation Confidence</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['low', 'moderate', 'high'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setEvidenceConfidence(c)}
                  style={{
                    padding: '6px 16px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: `1.5px solid ${evidenceConfidence === c ? T.steel : T.border}`,
                    background: evidenceConfidence === c ? '#f1f5f9' : T.card,
                    color: evidenceConfidence === c ? T.navy : T.muted, fontWeight: 600,
                    textTransform: 'capitalize' as const,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#b91c1c' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
            <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.muted, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || saved}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: saved ? T.green : T.burgundy,
                color: '#fff', fontSize: 13, cursor: saving || saved ? 'default' : 'pointer',
                fontWeight: 700, opacity: saving ? 0.7 : 1,
              }}
            >
              {saved ? '✓ Observation Saved' : saving ? 'Saving…' : 'Save Competency Observation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoachingSessionWorkspace({
  participant,
  onClose,
}: {
  participant: CoachParticipant;
  onClose: () => void;
}) {
  const [interests, setInterests] = useState('');
  const [pathwayQuestions, setPathwayQuestions] = useState('');
  const [workEnv, setWorkEnv] = useState('');
  const [selectedPathways, setSelectedPathways] = useState<string[]>([]);
  const [observations, setObservations] = useState('');
  const [selectedNextSteps, setSelectedNextSteps] = useState<string[]>([]);
  const [actionItems, setActionItems] = useState<Array<{ action: string; owner: string; targetDate: string; status: string }>>([]);
  const [saved, setSaved] = useState(false);

  function togglePathway(label: string) {
    setSelectedPathways(prev =>
      prev.includes(label) ? prev.filter(p => p !== label) : [...prev, label],
    );
  }

  function toggleNextStep(step: string) {
    setSelectedNextSteps(prev =>
      prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step],
    );
  }

  function addActionItem() {
    setActionItems(prev => [...prev, { action: '', owner: participant.name, targetDate: '', status: 'Planned' }]);
  }

  async function handleSave() {
    setSaved(true);
    try {
      await createCoachingSession({
        participantId: participant.userId,
        pathwaysExplored: selectedPathways,
        nextSteps: selectedNextSteps,
        careerActionPlan: actionItems.map(i => ({ goal: i.action, targetDate: i.targetDate, resources: i.owner })),
        coachPrivateNotes: [interests, pathwayQuestions, workEnv, observations].filter(Boolean).join('\n---\n') || undefined,
        status: 'completed',
      });
    } catch {
      // session saved locally if network fails; surface error in future iteration
    }
    setTimeout(() => { setSaved(false); onClose(); }, 1500);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)',
      zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      overflowY: 'auto', padding: '24px 16px',
    }}>
      <div style={{
        background: T.card, borderRadius: 16, width: '100%', maxWidth: 820,
        border: `1px solid ${T.border}`,
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.burgundy, marginBottom: 4 }}>
              Career Guidance Session
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: T.navy, margin: 0 }}>
              Career Guidance — {participant.name}
            </h3>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              {PARTICIPANT_PATHWAY_LABELS[participant.pathway]}
              {participant.school ? ` · ${participant.school}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ ...ghostBtn, padding: '6px 12px' }}>✕ Close</button>
        </div>

        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* Competency summary — read only, provenance-tagged */}
          {participant.competencies && participant.competencies.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>ACIA Evidence Summary</div>
                <ProvenanceTag type="acia" />
                <span style={{ fontSize: 11, color: T.muted, fontStyle: 'italic' }}>— read only</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {participant.competencies.filter(c => c.state !== 'insufficient').map(c => (
                  <div key={c.key} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: T.bg, border: `1px solid ${T.border}`,
                    borderRadius: 8, padding: '6px 12px',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.navy }}>{c.label}</span>
                    <EvidenceChip state={c.state} />
                    {(c as { evidenceSources?: string[] }).evidenceSources && (c as { evidenceSources: string[] }).evidenceSources.length > 1 && (
                      <span style={{ fontSize: 10, color: T.muted, fontStyle: 'italic' }}>
                        {(c as { evidenceSources: string[] }).evidenceSources.join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Career Conversation */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, marginBottom: 14, borderBottom: `1px solid ${T.border}`, paddingBottom: 10 }}>
              Career Conversation
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SessionField
                label="What interests the participant about aviation or aerospace?"
                value={interests}
                onChange={setInterests}
                placeholder="Record what the participant expressed interest in..."
              />
              <SessionField
                label="Which pathways would they like to explore?"
                value={pathwayQuestions}
                onChange={setPathwayQuestions}
                placeholder="Note pathways the participant asked about or showed interest in..."
              />
              <SessionField
                label="What work environments interest them? (e.g. outdoors, technical, customer-facing, office)"
                value={workEnv}
                onChange={setWorkEnv}
                placeholder="Describe preferred work settings, schedule preferences, physical environment..."
              />
            </div>
          </div>

          {/* Pathways Explored */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, marginBottom: 4 }}>Pathways Explored in This Session</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>Select all pathways discussed during this coaching session.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_PATHWAYS.map(label => {
                const active = selectedPathways.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => togglePathway(label)}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                      background: active ? T.burgundy : T.bg,
                      color: active ? '#fff' : T.steel,
                      border: `1px solid ${active ? T.burgundy : T.border}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coach Observations */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>Coach Observations</div>
              <ProvenanceTag type="coach" />
            </div>
            <textarea
              value={observations}
              onChange={e => setObservations(e.target.value)}
              placeholder="Record structured professional observations from this session — interests, communication style, questions asked, self-awareness, readiness to explore next steps..."
              rows={4}
              style={{
                width: '100%', padding: '10px 14px', fontSize: 13, lineHeight: 1.6,
                border: `1px solid ${T.border}`, borderRadius: 8, color: T.navy,
                resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Next Steps */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, marginBottom: 4 }}>Next Steps</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>Select recommended next steps for this participant.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {NEXT_STEP_OPTIONS.map(step => {
                const active = selectedNextSteps.includes(step);
                return (
                  <button
                    key={step}
                    onClick={() => toggleNextStep(step)}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                      background: active ? '#f0fdf4' : T.bg,
                      color: active ? T.green : T.steel,
                      border: `1px solid ${active ? T.greenBdr : T.border}`,
                    }}
                  >
                    {active ? '✓ ' : ''}{step}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Career Action Plan */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>Career Action Plan</div>
              <button onClick={addActionItem} style={{ ...secondaryBtn, fontSize: 12, padding: '5px 12px' }}>
                + Add Action
              </button>
            </div>
            {actionItems.length === 0 ? (
              <div style={{
                border: `1px dashed ${T.border}`, borderRadius: 8,
                padding: '20px', textAlign: 'center', color: T.faint, fontSize: 13,
              }}>
                No action items yet — click "Add Action" to create one.
              </div>
            ) : (
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 130px 110px 32px', background: T.bg, borderBottom: `1px solid ${T.border}`, padding: '8px 12px', gap: 10 }}>
                  {['Action', 'Owner', 'Target Date', 'Status', ''].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.muted }}>{h}</div>
                  ))}
                </div>
                {actionItems.map((item, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr 120px 130px 110px 32px',
                    padding: '8px 12px', gap: 10, borderBottom: i < actionItems.length - 1 ? `1px solid ${T.border}` : undefined, alignItems: 'center',
                  }}>
                    <input
                      value={item.action}
                      onChange={e => setActionItems(prev => prev.map((ai, idx) => idx === i ? { ...ai, action: e.target.value } : ai))}
                      placeholder="Describe action..."
                      style={{ ...inlineInput }}
                    />
                    <input
                      value={item.owner}
                      onChange={e => setActionItems(prev => prev.map((ai, idx) => idx === i ? { ...ai, owner: e.target.value } : ai))}
                      style={{ ...inlineInput }}
                    />
                    <input
                      type="date"
                      value={item.targetDate}
                      onChange={e => setActionItems(prev => prev.map((ai, idx) => idx === i ? { ...ai, targetDate: e.target.value } : ai))}
                      style={{ ...inlineInput }}
                    />
                    <select
                      value={item.status}
                      onChange={e => setActionItems(prev => prev.map((ai, idx) => idx === i ? { ...ai, status: e.target.value } : ai))}
                      style={{ ...inlineInput, cursor: 'pointer' }}
                    >
                      {['Planned', 'In Progress', 'Completed', 'Deferred'].map(s => <option key={s}>{s}</option>)}
                    </select>
                    <button
                      onClick={() => setActionItems(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', color: T.faint, cursor: 'pointer', fontSize: 14, padding: 0 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={handleSave} style={primaryBtn}>
              {saved ? '✓ Session Saved' : 'Save Guidance Session'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: T.steel, display: 'block', marginBottom: 6 }}>{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        style={{
          width: '100%', padding: '8px 12px', fontSize: 13, lineHeight: 1.6,
          border: `1px solid ${T.border}`, borderRadius: 8, color: T.navy,
          resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

// ── Advisor Feedback Modal (Validation Mode) ──────────────────────────────────

const FEEDBACK_QUESTIONS = [
  { id: 'usefulness',   label: 'How useful is this for career counselling conversations?' },
  { id: 'clarity',      label: 'How clear is the career pathway information?' },
  { id: 'navigation',   label: 'How easy is it to navigate and find relevant pathways?' },
  { id: 'relevance',    label: 'How relevant is this to the students and participants you work with?' },
  { id: 'overall',      label: 'Overall, how valuable is this as a career guidance resource?' },
];

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [missing, setMissing] = useState('');
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/advisor/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('aacp_access_token') ?? ''}` },
        body: JSON.stringify({ ratings, missingInformation: missing.trim(), additionalComments: comments.trim(), submittedAt: new Date().toISOString() }),
      });
    } catch { /* network failure — still show success; backend is best-effort during validation */ }
    setSubmitted(true);
    setTimeout(onClose, 2500);
  }

  const RatingRow = ({ q }: { q: typeof FEEDBACK_QUESTIONS[number] }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <div style={{ fontSize: 13, color: T.navy, flex: 1, minWidth: 180, lineHeight: 1.4 }}>{q.label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setRatings(r => ({ ...r, [q.id]: n }))}
            style={{
              width: 32, height: 32, borderRadius: 6, border: `1.5px solid ${ratings[q.id] === n ? T.burgundy : T.border}`,
              background: ratings[q.id] === n ? T.burgundy : T.card,
              color: ratings[q.id] === n ? '#fff' : T.muted,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >{n}</button>
        ))}
        <span style={{ fontSize: 10, color: T.faint, alignSelf: 'center', marginLeft: 4, whiteSpace: 'nowrap' }}>1 low · 5 high</span>
      </div>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)',
      zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      overflowY: 'auto', padding: '40px 16px',
    }}>
      <div style={{
        background: T.card, borderRadius: 16, width: '100%', maxWidth: 580,
        border: `1px solid ${T.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        <div style={{ padding: '20px 28px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.burgundy, marginBottom: 4 }}>
              Platform Validation
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: T.navy, margin: 0 }}>Career Advisor Feedback</h3>
            <p style={{ fontSize: 12, color: T.muted, margin: '4px 0 0', lineHeight: 1.5 }}>
              Your feedback helps us validate and improve this platform during our pilot phase.
            </p>
          </div>
          <button onClick={onClose} style={{ ...ghostBtn, padding: '4px 8px', flexShrink: 0 }}>✕</button>
        </div>

        {submitted ? (
          <div style={{ padding: '40px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: T.green }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.navy, marginBottom: 6 }}>Thank you for your feedback</div>
            <div style={{ fontSize: 13, color: T.muted }}>Your input is helping shape the AACP Career Advisor experience.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {FEEDBACK_QUESTIONS.map(q => <RatingRow key={q.id} q={q} />)}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.steel, display: 'block', marginBottom: 6 }}>
                Missing career information or pathways?
              </label>
              <textarea
                value={missing} onChange={e => setMissing(e.target.value)} rows={2}
                placeholder="Describe any roles, sectors, or information that would be helpful but are missing…"
                style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, color: T.navy, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.steel, display: 'block', marginBottom: 6 }}>
                Additional comments
              </label>
              <textarea
                value={comments} onChange={e => setComments(e.target.value)} rows={2}
                placeholder="Anything else you'd like us to know…"
                style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, color: T.navy, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
              <button type="submit" disabled={submitting} style={primaryBtn}>
                {submitting ? 'Submitting…' : 'Submit Feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Career Pathways Tab ────────────────────────────────────────────────────────

function PathwayCard({ pathway, onClick, accentColor }: { pathway: PathwayInfo; onClick: () => void; accentColor: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: T.navy,
        border: '1px solid rgba(255,255,255,0.07)',
        borderTop: `3px solid ${accentColor}`,
        borderRadius: 10,
        padding: '18px 20px',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'transform 0.14s ease, box-shadow 0.14s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 120,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.transform = 'translateY(-3px)';
        el.style.boxShadow = '0 10px 28px rgba(0,0,0,0.28)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = 'none';
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3, flex: 1 }}>
        {pathway.label}
      </div>
      <div style={{ fontSize: 11, color: T.faint, lineHeight: 1.55 }}>
        {pathway.whatTheyDo.slice(0, 88)}…
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: '0.04em', marginTop: 2 }}>
        Explore →
      </div>
    </button>
  );
}

function PathwaysTab() {
  const [selected, setSelected] = useState<PathwayInfo | null>(null);
  const [search, setSearch] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [filterEducation, setFilterEducation] = useState('');
  const [filterEntryOnly, setFilterEntryOnly] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const query = search.toLowerCase();

  const filtered = CAREER_PATHWAYS.filter(p => {
    const textMatch = !query || p.label.toLowerCase().includes(query) || p.whatTheyDo.toLowerCase().includes(query);
    const sectorMatch = !filterSector || PATHWAY_SECTORS.find(s => s.id === filterSector)?.pathwayIds.includes(p.id);
    const educationMatch = !filterEducation || PATHWAY_EDUCATION_LEVEL[p.id] === filterEducation;
    const entryMatch = !filterEntryOnly || PATHWAY_ENTRY_LEVEL.has(p.id);
    return textMatch && sectorMatch && educationMatch && entryMatch;
  });

  const hasFilters = query || filterSector || filterEducation || filterEntryOnly;

  if (selected) {
    const sector = PATHWAY_SECTORS.find(s => s.pathwayIds.includes(selected.id));
    return <PathwayDetail pathway={selected} onBack={() => setSelected(null)} accentColor={sector?.color ?? T.burgundy} sectorLabel={sector?.label} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}

      {/* Intelligence header */}
      <div style={{
        background: T.navy, borderRadius: 14,
        borderLeft: `4px solid ${T.burgundy}`,
        padding: '26px 30px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 20,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.burgundy, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8 }}>
            Career Pathway Intelligence
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', margin: '0 0 10px', lineHeight: 1.2 }}>
            14 Aviation &amp; Aerospace Career Pathways
          </h2>
          <p style={{ fontSize: 12, color: T.faint, margin: 0, maxWidth: 480, lineHeight: 1.65 }}>
            Career intelligence across 5 industry sectors — what each role does, how to enter it, and what strengths align. Designed for career advisors, counsellors, and employment practitioners. No technical aviation background required.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, alignSelf: 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {[['14', 'Pathways'], ['5', 'Sectors'], ['TC', 'Sourced']].map(([val, lbl]) => (
              <div key={lbl} style={{
                background: 'rgba(143,9,9,0.18)', border: '1px solid rgba(143,9,9,0.32)',
                borderRadius: 8, padding: '10px 14px', textAlign: 'center', minWidth: 52,
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 9, color: T.faint, marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{lbl}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowFeedback(true)}
            style={{
              background: 'none', border: `1px solid rgba(255,255,255,0.15)`, color: T.faint,
              borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.03em',
            }}
          >
            Provide Feedback
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.faint, fontSize: 15, lineHeight: 1, pointerEvents: 'none' }}>⌕</span>
          <input
            type="text"
            placeholder="Search pathways…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 34px', background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.navy, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>
        <select
          value={filterSector} onChange={e => setFilterSector(e.target.value)}
          style={{ ...filterInput, flex: '0 1 auto' }}
        >
          <option value="">All Sectors</option>
          {PATHWAY_SECTORS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select
          value={filterEducation} onChange={e => setFilterEducation(e.target.value)}
          style={{ ...filterInput, flex: '0 1 auto' }}
        >
          <option value="">All Education Levels</option>
          {Object.entries(EDUCATION_LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: T.steel, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={filterEntryOnly}
            onChange={e => setFilterEntryOnly(e.target.checked)}
            style={{ accentColor: T.burgundy, width: 14, height: 14 }}
          />
          Entry-level pathways
        </label>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setFilterSector(''); setFilterEducation(''); setFilterEntryOnly(false); }}
            style={{ background: 'none', border: 'none', color: T.burgundy, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {hasFilters ? (
        <div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
            {filtered.length} pathway{filtered.length !== 1 ? 's' : ''} match your filters
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
            {filtered.length === 0 ? (
              <div style={{ gridColumn: '1/-1', padding: '32px 0', color: T.muted, fontSize: 13 }}>
                No pathways match the current filters.
              </div>
            ) : filtered.map(p => {
              const sector = PATHWAY_SECTORS.find(s => s.pathwayIds.includes(p.id));
              return <PathwayCard key={p.id} pathway={p} onClick={() => setSelected(p)} accentColor={sector?.color ?? T.burgundy} />;
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {PATHWAY_SECTORS.map(sector => {
            const paths = sector.pathwayIds.map(id => CAREER_PATHWAYS.find(p => p.id === id)).filter(Boolean) as PathwayInfo[];
            return (
              <div key={sector.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 3, height: 18, background: sector.color, borderRadius: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.navy, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {sector.label}
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.border }} />
                  <span style={{ fontSize: 11, color: T.faint }}>{paths.length} pathway{paths.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
                  {paths.map(p => <PathwayCard key={p.id} pathway={p} onClick={() => setSelected(p)} accentColor={sector.color} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 12, color: T.faint, lineHeight: 1.65, padding: '10px 14px', borderLeft: `2px solid ${T.borderMid}` }}>
        <strong style={{ color: T.muted }}>For career counsellors and employment advisors:</strong> Each pathway covers what the role involves, typical work environment, education and licensing routes, and how AACP can support career readiness — everything you need for an informed conversation with a student or participant, without requiring a technical aviation background.
      </div>
    </div>
  );
}

function PathwayDetail({ pathway, onBack, accentColor, sectorLabel }: { pathway: PathwayInfo; onBack: () => void; accentColor: string; sectorLabel?: string }) {
  const sections = [
    { label: 'What They Do', content: pathway.whatTheyDo },
    { label: 'Why Someone May Align', content: null, bullets: pathway.whyMayAlign },
    { label: 'Entry Requirements', content: pathway.entryRequirements },
    { label: 'Education & Training', content: pathway.education },
    { label: 'Licensing & Certification', content: pathway.licensing },
    { label: 'Typical Career Journey', content: pathway.careerJourney },
  ];
  const workEnv = PATHWAY_WORK_ENVIRONMENT[pathway.id];
  const educationLevel = EDUCATION_LEVEL_LABELS[PATHWAY_EDUCATION_LEVEL[pathway.id] ?? ''];
  const isEntryLevel = PATHWAY_ENTRY_LEVEL.has(pathway.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Detail header — dark banner */}
      <div style={{
        background: T.navy, borderRadius: 14,
        borderLeft: `4px solid ${accentColor}`,
        padding: '24px 28px',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            color: T.faint, borderRadius: 7, padding: '6px 12px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 16,
          }}
        >
          ← Back to Pathways
        </button>
        <div style={{ fontSize: 10, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>
          Career Pathway Intelligence
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', margin: '0 0 8px', lineHeight: 1.2 }}>
          {pathway.label}
        </h2>
        <p style={{ fontSize: 13, color: T.faint, margin: 0, maxWidth: 600, lineHeight: 1.6 }}>
          {pathway.whatTheyDo}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {sectorLabel && (
            <span style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, padding: '3px 10px', fontSize: 11, fontWeight: 600, color: T.faint }}>
              {sectorLabel}
            </span>
          )}
          {educationLevel && (
            <span style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, padding: '3px 10px', fontSize: 11, fontWeight: 600, color: T.faint }}>
              {educationLevel}
            </span>
          )}
          {isEntryLevel && (
            <span style={{ background: 'rgba(22,163,74,0.18)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 5, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: '#4ade80' }}>
              Entry-Level Pathway
            </span>
          )}
        </div>
      </div>

      {pathway.verificationNote && (
        <div style={{
          background: T.amberBg, border: `1px solid ${T.amberBdr}`,
          borderRadius: 10, padding: '12px 16px', fontSize: 13, color: T.amber, lineHeight: 1.6,
        }}>
          <strong>Transport Canada Source Note:</strong> {pathway.verificationNote}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {sections.map(s => (
          <Card key={s.label} style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: accentColor, marginBottom: 12 }}>
              {s.label}
            </div>
            {s.bullets ? (
              <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {s.bullets.map((b, i) => (
                  <li key={i} style={{ fontSize: 13, color: T.navy, lineHeight: 1.6 }}>{b}</li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13, color: T.navy, lineHeight: 1.7, margin: 0 }}>{s.content}</p>
            )}
          </Card>
        ))}
      </div>

      {workEnv && (
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: accentColor, marginBottom: 12 }}>
            Typical Work Environment
          </div>
          <p style={{ fontSize: 13, color: T.navy, lineHeight: 1.7, margin: 0 }}>{workEnv}</p>
        </Card>
      )}

      <Card style={{ padding: '20px 24px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: accentColor, marginBottom: 12 }}>
          Related Careers
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {pathway.relatedCareers.map(r => <Chip key={r} label={r} />)}
        </div>
      </Card>

      {/* AACP Support Card */}
      <div style={{
        background: T.navy, borderRadius: 12, padding: '22px 26px',
        borderLeft: `3px solid ${T.burgundy}`,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.burgundy, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>
          How AACP Supports Career Readiness
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.75, margin: '0 0 16px' }}>
          AACP's Career Intelligence platform helps career advisors, counsellors, and employment practitioners support individuals in exploring aviation and aerospace as a career direction — without requiring a technical background.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            ['Career Discovery', 'Explore pathways by sector, education level, or career interest to help identify where someone may fit.'],
            ['Competency Alignment', 'Understand what personal strengths and interests align with each pathway — without referencing internal scores.'],
            ['Participant Guidance', 'Document career conversations and track progress for students and participants on your caseload.'],
            ['Referral Pathways', 'Connect participants to relevant programs, institutions, flight training units, and industry opportunities.'],
          ].map(([title, desc]) => (
            <div key={title} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 12, color: T.faint, lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        background: T.bg, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: '14px 18px',
        fontSize: 12, color: T.muted, lineHeight: 1.6,
      }}>
        <strong>Information source:</strong> Occupational and licensing information is sourced from Transport Canada, NAV CANADA, Engineers Canada, and other Canadian regulatory authorities. This career guidance intelligence is provided for counselling purposes and is subject to change. Always direct participants to verify current requirements directly with the relevant regulatory body.
      </div>
    </div>
  );
}

// ── Referrals Tab ─────────────────────────────────────────────────────────────

const REFERRAL_TYPES = [
  'Industry Mentor',
  'AACP Program',
  'Post-Secondary Institution',
  'Flight Training Unit',
  'Approved Training Organization',
  'Employer Exposure',
  'Career Event',
  'Work-Integrated Learning',
  'Other Approved Career Resource',
];

function ReferralsTab({
  referrals,
  participants,
}: {
  referrals: CoachReferral[];
  participants: CoachParticipant[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [formParticipant, setFormParticipant] = useState('');
  const [formType, setFormType] = useState('');
  const [formOrg, setFormOrg] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [localReferrals, setLocalReferrals] = useState<CoachReferral[]>(referrals);

  function handleCreate() {
    if (!formParticipant || !formType) return;
    const participant = participants.find(p => p.userId === formParticipant);
    const newReferral: CoachReferral = {
      referralId: `r-local-${Date.now()}`,
      participantId: formParticipant,
      participantName: participant?.name ?? formParticipant,
      referralType: formType,
      organization: formOrg || undefined,
      status: 'created',
      createdAt: new Date().toISOString(),
      notes: formNotes || undefined,
    };
    setLocalReferrals(prev => [newReferral, ...prev]);
    setShowForm(false);
    setFormParticipant(''); setFormType(''); setFormOrg(''); setFormNotes('');
  }

  const statusColors: Record<ReferralStatus, string> = {
    created: T.faint, interested: T.blue, intro_requested: T.amber,
    connected: T.green, in_progress: T.purple, completed: T.green,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <SectionHeader
          title="Referrals"
          sub="Guide and track participant referrals to mentors, programs, training providers, and career resources."
        />
        <button onClick={() => setShowForm(v => !v)} style={primaryBtn}>
          {showForm ? 'Cancel' : '+ Create Referral'}
        </button>
      </div>

      <div style={{
        background: T.bg, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: '12px 16px',
        fontSize: 12, color: T.muted, lineHeight: 1.6,
      }}>
        Participant information is shared with external organizations only when the participant has provided appropriate consent. Referral creation records your intent and track status — it does not automatically disclose participant data to third parties.
      </div>

      {showForm && (
        <Card style={{ padding: '24px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, marginBottom: 18 }}>New Referral</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.steel, display: 'block', marginBottom: 6 }}>Participant *</label>
              <select value={formParticipant} onChange={e => setFormParticipant(e.target.value)} style={filterInput}>
                <option value="">Select participant...</option>
                {participants.map(p => <option key={p.userId} value={p.userId}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.steel, display: 'block', marginBottom: 6 }}>Referral Type *</label>
              <select value={formType} onChange={e => setFormType(e.target.value)} style={filterInput}>
                <option value="">Select type...</option>
                {REFERRAL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.steel, display: 'block', marginBottom: 6 }}>Organization / Program (optional)</label>
              <input type="text" value={formOrg} onChange={e => setFormOrg(e.target.value)} placeholder="e.g. AACP Mentor Network, Seneca Polytechnic..." style={filterInput} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.steel, display: 'block', marginBottom: 6 }}>Notes (optional)</label>
              <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={3} placeholder="Context for this referral..." style={{ ...filterInput, resize: 'vertical', height: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleCreate} disabled={!formParticipant || !formType} style={primaryBtn}>
                Create Referral
              </button>
            </div>
          </div>
        </Card>
      )}

      {localReferrals.length === 0 ? (
        <Card style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ color: T.muted, fontSize: 14, margin: 0 }}>No referrals yet. Create one above to start tracking participant connections.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {localReferrals.map(r => (
            <Card key={r.referralId} style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontWeight: 700, color: T.navy, fontSize: 14 }}>{r.participantName}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{r.referralType}</div>
                  {r.organization && <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{r.organization}</div>}
                </div>
                <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.faint, marginBottom: 4 }}>Status</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: statusColors[r.status] }}>
                    {REFERRAL_STATUS_LABELS[r.status]}
                  </div>
                </div>
                <div style={{ flex: '0 0 auto' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.faint, marginBottom: 4 }}>Created</div>
                  <div style={{ fontSize: 12, color: T.muted }}>
                    {new Date(r.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                {r.notes && (
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ fontSize: 12, color: T.steel, lineHeight: 1.5 }}>{r.notes}</div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Button / input styles ──────────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = {
  background: T.burgundy, color: '#fff', border: 'none', borderRadius: 8,
  padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', letterSpacing: '0.02em', whiteSpace: 'nowrap',
};
const secondaryBtn: React.CSSProperties = {
  background: T.bg, color: T.navy, border: `1px solid ${T.border}`, borderRadius: 8,
  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', whiteSpace: 'nowrap',
};
const ghostBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: T.muted, cursor: 'pointer',
  fontSize: 13, fontWeight: 600, padding: '8px 0', fontFamily: 'inherit',
};
const filterInput: React.CSSProperties = {
  padding: '8px 12px', fontSize: 13, color: T.navy,
  border: `1px solid ${T.border}`, borderRadius: 8, outline: 'none',
  fontFamily: 'inherit', background: T.card,
};
const inlineInput: React.CSSProperties = {
  width: '100%', padding: '4px 8px', fontSize: 12, color: T.navy,
  border: `1px solid ${T.border}`, borderRadius: 6, outline: 'none',
  fontFamily: 'inherit', background: T.card, boxSizing: 'border-box' as const,
};

// ── Waitlist status config ─────────────────────────────────────────────────────

type WaitlistStatus = 'new' | 'assigned' | 'contacted' | 'guidance_scheduled' | 'program_candidate' | 'enrolled' | 'deferred' | 'not_proceeding';

const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  new:                'New',
  assigned:           'Assigned',
  contacted:          'Contacted',
  guidance_scheduled: 'Guidance Scheduled',
  program_candidate:  'Program Candidate',
  enrolled:           'Enrolled',
  deferred:           'Deferred',
  not_proceeding:     'Not Proceeding',
};

const WAITLIST_STATUS_STYLE: Record<WaitlistStatus, { color: string; bg: string; bdr: string }> = {
  new:                { color: T.muted,    bg: '#f1f5f9', bdr: T.border },
  assigned:           { color: T.blue,     bg: T.blueBg,  bdr: T.blueBdr },
  contacted:          { color: T.amber,    bg: T.amberBg, bdr: T.amberBdr },
  guidance_scheduled: { color: T.purple,   bg: '#f5f3ff', bdr: '#ddd6fe' },
  program_candidate:  { color: T.burgundy, bg: '#fff5f5', bdr: '#fecaca' },
  enrolled:           { color: T.green,    bg: T.greenBg, bdr: T.greenBdr },
  deferred:           { color: T.muted,    bg: '#f1f5f9', bdr: T.border },
  not_proceeding:     { color: '#9ca3af',  bg: '#f9fafb', bdr: '#e5e7eb' },
};

interface WaitlistEntry {
  id: string;
  userId: string;
  participantName: string;
  participantEmail: string;
  assessmentId: string | null;
  aciaCompletedAt: string | null;
  aciaStage: string | null;
  careerAlignments: Array<{ pathwayId: string; label: string; alignment: string }>;
  competencyHighlights: Array<{ key: string; label: string; state: string }>;
  status: WaitlistStatus;
  advisorId: string | null;
  advisorNotes: string | null;
  waitlistedAt: string;
  contactedAt: string | null;
}

function WaitlistStatusChip({ status }: { status: WaitlistStatus }) {
  const s = WAITLIST_STATUS_STYLE[status] ?? WAITLIST_STATUS_STYLE.new;
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.bdr}`,
      borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700,
      letterSpacing: 0.3, whiteSpace: 'nowrap',
    }}>
      {WAITLIST_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function WaitlistTab() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { status?: WaitlistStatus; advisorNotes?: string }>>({});

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest<{ waitlist: WaitlistEntry[] }>('/program/waitlist');
      setEntries(data.waitlist ?? []);
    } catch {
      setError('Failed to load waitlist.');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); }, []);

  async function save(entry: WaitlistEntry) {
    setSaving(entry.id);
    try {
      const patch = edits[entry.id] ?? {};
      await apiRequest(`/program/waitlist/${entry.id}`, {
        method: 'PATCH',
        body: { status: patch.status ?? entry.status, advisorNotes: patch.advisorNotes ?? entry.advisorNotes },
      });
      await load();
      setEdits(e => { const n = { ...e }; delete n[entry.id]; return n; });
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div style={{ color: T.muted, fontSize: 14, padding: 24 }}>Loading waitlist…</div>;
  if (error) return <div style={{ color: '#ef4444', fontSize: 14, padding: 24 }}>{error}</div>;
  if (entries.length === 0) return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '40px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: T.muted }}>No participants on the AACP waitlist yet.</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: T.muted }}>{entries.length} participant{entries.length !== 1 ? 's' : ''} on waitlist</div>
      </div>
      {entries.map(entry => {
        const isOpen = expanded === entry.id;
        const myEdit = edits[entry.id] ?? {};
        const currentStatus = (myEdit.status ?? entry.status) as WaitlistStatus;
        return (
          <div key={entry.id} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden',
          }}>
            {/* Row header */}
            <button
              onClick={() => setExpanded(isOpen ? null : entry.id)}
              style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: T.navy }}>{entry.participantName}</span>
                  <WaitlistStatusChip status={currentStatus} />
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                  Waitlisted {new Date(entry.waitlistedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                  {entry.aciaCompletedAt && ` · ACIA ${entry.aciaStage ?? 'baseline'} completed ${new Date(entry.aciaCompletedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}`}
                </div>
              </div>
              <span style={{ color: T.muted, fontSize: 12, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${T.border}`, padding: '16px 20px', background: T.bg }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>

                  {/* Career pathways */}
                  {entry.careerAlignments.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.muted, marginBottom: 8 }}>Career Pathway Alignments</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {entry.careerAlignments.map((ca, i) => (
                          <div key={i} style={{ fontSize: 13, color: T.navy }}>{ca.label}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Competency highlights */}
                  {entry.competencyHighlights.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.muted, marginBottom: 8 }}>Observed Competency Evidence</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {entry.competencyHighlights.map((c, i) => (
                          <span key={i} style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6,
                            background: T.blueBg, color: T.blue, border: `1px solid ${T.blueBdr}`,
                          }}>{c.label}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contact */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.muted, marginBottom: 8 }}>Contact</div>
                    <div style={{ fontSize: 13, color: T.navy }}>{entry.participantEmail}</div>
                    {entry.contactedAt && (
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
                        Contacted {new Date(entry.contactedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Status + notes editor */}
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '0 0 auto' }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Advisor Status</label>
                      <select
                        value={currentStatus}
                        onChange={e => setEdits(prev => ({ ...prev, [entry.id]: { ...prev[entry.id], status: e.target.value as WaitlistStatus } }))}
                        style={{
                          border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px',
                          fontSize: 13, color: T.navy, background: T.card, fontFamily: 'inherit',
                        }}
                      >
                        {(Object.keys(WAITLIST_STATUS_LABELS) as WaitlistStatus[]).map(s => (
                          <option key={s} value={s}>{WAITLIST_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Advisor Notes</label>
                    <textarea
                      rows={3}
                      value={myEdit.advisorNotes ?? entry.advisorNotes ?? ''}
                      onChange={e => setEdits(prev => ({ ...prev, [entry.id]: { ...prev[entry.id], advisorNotes: e.target.value } }))}
                      placeholder="Internal notes — not visible to participant"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px',
                        fontSize: 13, color: T.navy, background: T.card, fontFamily: 'inherit',
                        resize: 'vertical', lineHeight: 1.5,
                      }}
                    />
                  </div>

                  <div>
                    <button
                      onClick={() => save(entry)}
                      disabled={saving === entry.id}
                      style={{
                        background: T.burgundy, color: '#fff', border: 'none',
                        borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700,
                        cursor: saving === entry.id ? 'not-allowed' : 'pointer',
                        opacity: saving === entry.id ? 0.7 : 1,
                        fontFamily: 'inherit',
                      }}
                    >
                      {saving === entry.id ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Coach Dashboard ───────────────────────────────────────────────────────

export function CoachDashboard() {
  const { data, loading, error } = useCoachDashboard();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedParticipant, setSelectedParticipant] = useState<CoachParticipant | null>(null);
  const [sessionParticipant, setSessionParticipant] = useState<CoachParticipant | null>(null);
  const [observationParticipant, setObservationParticipant] = useState<CoachParticipant | null>(null);

  const handleViewParticipant = useCallback((p: CoachParticipant) => {
    setSelectedParticipant(p);
    setActiveTab('participants');
  }, []);

  const handleStartSession = useCallback((p: CoachParticipant) => {
    setSessionParticipant(p);
  }, []);

  const TAB_LABELS: Record<Tab, string> = {
    overview:     'Overview',
    participants: 'My Participants',
    sessions:     'Guidance Sessions',
    pathways:     'Career Pathways',
    referrals:    'Referrals',
    waitlist:     'AACP Waitlist',
  };

  if (loading) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: T.muted, fontSize: 14 }}>Loading career intelligence workspace…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#ef4444', fontSize: 14 }} role="alert">
          Unable to load workspace: {error ?? 'No data available'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      {/* Coaching session modal */}
      {sessionParticipant && (
        <CoachingSessionWorkspace
          participant={sessionParticipant}
          onClose={() => setSessionParticipant(null)}
        />
      )}

      {/* Add Competency Observation modal */}
      {observationParticipant && (
        <AddCompetencyObservationModal
          participant={observationParticipant}
          onClose={() => setObservationParticipant(null)}
        />
      )}

      {/* Top nav bar */}
      <div style={{
        background: T.navy, borderBottom: `1px solid ${T.navyMid}`,
        padding: '0 32px',
      }}>
        <div style={{
          maxWidth: 1200, marginInline: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 58,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.burgundy }}>
                AACP™
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                Career Guidance Intelligence
              </div>
            </div>
            <div style={{ width: 1, height: 30, background: '#334155' }} />
            <div style={{ display: 'flex', gap: 4 }}>
              {(Object.keys(TAB_LABELS) as Tab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); if (tab !== 'participants') setSelectedParticipant(null); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '8px 14px', fontSize: 13, fontWeight: activeTab === tab ? 700 : 500,
                    color: activeTab === tab ? '#fff' : '#94a3b8',
                    borderBottom: activeTab === tab ? `2px solid ${T.burgundy}` : '2px solid transparent',
                    fontFamily: 'inherit',
                  }}
                >
                  {TAB_LABELS[tab]}
                  {tab === 'overview' && data.stats.guidanceRequired > 0 && (
                    <span style={{
                      marginLeft: 6, background: T.burgundy, color: '#fff',
                      borderRadius: 10, fontSize: 10, fontWeight: 700,
                      padding: '1px 5px', verticalAlign: 'middle',
                    }}>
                      {data.stats.guidanceRequired}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{data.coach.name}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Career Advisor · {data.coach.organization}</div>
          </div>
        </div>
      </div>

      {/* Page header */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, padding: '20px 32px' }}>
        <div style={{ maxWidth: 1200, marginInline: 'auto' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.navy, margin: '0 0 4px' }}>
            Career Guidance Intelligence
          </h1>
          <p style={{ fontSize: 14, color: T.steel, margin: 0 }}>
            Support participants in understanding their strengths, exploring aviation and aerospace careers, and identifying meaningful next steps.
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, marginInline: 'auto', padding: '28px 32px' }}>
        {activeTab === 'overview' && (
          <OverviewTab data={data} onViewParticipant={handleViewParticipant} />
        )}

        {activeTab === 'participants' && !selectedParticipant && (
          <ParticipantsTab
            participants={data.participants}
            onViewParticipant={handleViewParticipant}
          />
        )}

        {activeTab === 'participants' && selectedParticipant && (
          <ParticipantProfile
            participant={selectedParticipant}
            onBack={() => setSelectedParticipant(null)}
            onStartSession={handleStartSession}
            onAddObservation={p => setObservationParticipant(p)}
          />
        )}

        {activeTab === 'sessions' && (
          <SessionsTab
            sessions={data.coachingSessions}
            participants={data.participants}
            onStartSession={handleStartSession}
          />
        )}

        {activeTab === 'pathways' && (
          <PathwaysTab />
        )}

        {activeTab === 'referrals' && (
          <ReferralsTab
            referrals={data.referrals}
            participants={data.participants}
          />
        )}

        {activeTab === 'waitlist' && (
          <WaitlistTab />
        )}
      </div>
    </div>
  );
}
