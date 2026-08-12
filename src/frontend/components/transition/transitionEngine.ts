import type { CompetencyKey, CompetencyObservation, EvidenceConfidence, AlignmentLevel, QuestionResponse } from '../acia/types';
import { computeCompetencyIndex, getTopCompetencies } from '../acia/evidenceEngine';
import { COMPETENCY_LABELS } from '../acia/types';
import type { TransitionProfile, TransitionCareer, TransitionCareerAlignment, ProfessionalDomain } from './types';

// ── Transition Career Catalogue ───────────────────────────────────────────────

export const TRANSITION_CAREERS: TransitionCareer[] = [
  {
    id: 'aircraft_reliability',
    label: 'Aircraft Reliability & Technical Operations',
    family: 'Technical Operations',
    description: 'Apply engineering and analytical expertise to reliability analysis, maintenance planning, and technical operations in MRO and airline environments.',
    relevantDomains: ['mechanical_engineering', 'energy_resources', 'manufacturing_trades'],
    competencyWeights: { PS: 1.0, MR: 0.9, AP: 0.9, SO: 0.8, PR: 0.8, AL: 0.7, SA: 0.6, DM: 0.6 },
    transferableFrom: ['Reliability analysis', 'Root cause analysis', 'Preventive maintenance', 'Asset management', 'Technical documentation', 'Safety systems', 'Data analysis'],
    aviationBridge: ['Aircraft systems familiarity', 'MRO workflows and terminology', 'Aviation maintenance documentation (CMM, AMM)', 'Canadian aviation regulatory environment (CARs)', 'Maintenance planning intervals and task cards'],
    credentialNote: 'AME licensing requires regulated aviation training and experience. Most technical operations analyst roles do not require a licence but benefit from aviation systems orientation.',
    nextSteps: [
      'Research MRO companies in Canada (Lufthansa Technik, Air Canada Maintenance, StandardAero) for technical operations roles',
      'Explore aviation systems familiarization programs through Transport Canada and Canadian aviation colleges',
      'Connect with an AACP Transition Mentor who moved from engineering into aviation technical operations',
    ],
  },
  {
    id: 'maintenance_planning',
    label: 'Maintenance Planning & MRO Analytics',
    family: 'Technical Operations',
    description: 'Translate operational analysis and scheduling experience into aviation maintenance planning, MRO scheduling, and asset lifecycle management.',
    relevantDomains: ['mechanical_engineering', 'project_operations', 'logistics_supply_chain'],
    competencyWeights: { PS: 1.0, AP: 0.9, PR: 0.9, MT: 0.8, SA: 0.8, DM: 0.7, SO: 0.7 },
    transferableFrom: ['Maintenance planning', 'Asset scheduling', 'Data analysis', 'Process optimization', 'Technical documentation', 'Lifecycle management'],
    aviationBridge: ['Aircraft maintenance intervals', 'MRO scheduling software', 'Aviation maintenance records and documentation requirements', 'Transport Canada Part V maintenance regulations'],
    credentialNote: 'No aviation licence required for most maintenance planning analyst roles. Aviation systems orientation and regulatory familiarity are typically expected.',
    nextSteps: [
      'Explore maintenance planning roles at Air Canada, Sunwing, WestJet, and Part 145 repair stations',
      'Research aviation maintenance management courses at BCIT and SAIT',
      'Connect with an AACP Transition Mentor in MRO planning and operations',
    ],
  },
  {
    id: 'avionics_systems',
    label: 'Avionics & Aircraft Electrical Systems',
    family: 'Avionics',
    description: 'Apply electrical engineering or electronics expertise to avionics maintenance, troubleshooting, and aircraft electrical systems in an MRO or airline environment.',
    relevantDomains: ['electrical_engineering'],
    competencyWeights: { AP: 1.0, MR: 1.0, PS: 0.9, PR: 0.9, SO: 0.8, SR: 0.7, AL: 0.7 },
    transferableFrom: ['Electronics troubleshooting', 'Electrical systems diagnostics', 'Controls and instrumentation', 'Systems integration', 'Schematic reading', 'Test and measurement'],
    aviationBridge: ['Aviation avionics systems architecture', 'Aircraft electrical wiring standards', 'Transport Canada AME (E category) licensing pathway', 'Aviation-specific test equipment and calibration'],
    credentialNote: 'Avionics technician roles in Canada typically require a Transport Canada AME (E) licence. Electrical engineering backgrounds may accelerate the regulated training pathway.',
    nextSteps: [
      'Research Transport Canada AME (E) licensing requirements and approved training organizations',
      'Explore avionics technician programs at BCIT, SAIT, and Canadore College',
      'Connect with an AACP Transition Mentor who transitioned from electrical engineering to avionics',
    ],
  },
  {
    id: 'aerospace_systems',
    label: 'Aerospace Systems Engineering',
    family: 'Aerospace Engineering',
    description: 'Apply systems or engineering expertise to aerospace development, certification, integration, and qualification programs at Canadian aerospace companies.',
    relevantDomains: ['mechanical_engineering', 'electrical_engineering'],
    competencyWeights: { PS: 1.0, MR: 0.9, SR: 0.8, AP: 0.8, AL: 1.0, SO: 0.7, DM: 0.7 },
    transferableFrom: ['Systems engineering', 'Requirements analysis', 'Integration and testing', 'Design verification', 'Technical documentation', 'Safety case development'],
    aviationBridge: ['Aviation certification processes (DO-178C, DO-254, CS-25)', 'Aerospace regulatory standards', 'Airworthiness requirements', 'Configuration management in regulated environments'],
    credentialNote: 'No aviation licence required for most aerospace systems engineering roles. Professional Engineering (P.Eng) designation is an asset. Aerospace-specific certification training adds credibility.',
    nextSteps: [
      'Research aerospace engineering roles at Bombardier, Pratt & Whitney Canada, CAE, and MDA Space',
      'Explore NSERC programs and university-industry partnerships in aerospace',
      'Connect with an AACP Transition Mentor in aerospace systems engineering',
    ],
  },
  {
    id: 'uav_systems',
    label: 'UAV & Drone Systems Specialist',
    family: 'UAV Technology',
    description: 'Apply software, electrical, or systems engineering experience to the rapidly growing field of unmanned aviation systems, BVLOS operations, and autonomous platforms.',
    relevantDomains: ['electrical_engineering', 'software_it', 'mechanical_engineering'],
    competencyWeights: { SA: 0.9, AP: 1.0, SR: 0.9, DM: 0.8, SO: 0.8, MR: 0.7, PS: 0.8 },
    transferableFrom: ['Systems integration', 'Software development', 'Controls engineering', 'Electronics', 'Autonomous systems', 'Data processing', 'GIS and geospatial'],
    aviationBridge: ['Transport Canada RPAS regulations (Basic and Advanced)', 'Aviation safety management', 'Airspace awareness and coordination', 'BVLOS operations requirements'],
    credentialNote: 'Transport Canada RPAS Advanced certificate required for complex commercial operations. Additional endorsements required for BVLOS operations.',
    nextSteps: [
      'Research Transport Canada RPAS licensing requirements for commercial operations',
      'Explore Canadian UAV companies (Percepto, Draganfly, Autonodyne, Iris Automation)',
      'Connect with an AACP Transition Mentor in UAV systems or operations',
    ],
  },
  {
    id: 'aviation_software',
    label: 'Aviation Software & Digital Systems',
    family: 'Aviation Technology',
    description: 'Apply software development, data engineering, or IT expertise to aviation software systems, airline operations technology, or aerospace simulation and modelling.',
    relevantDomains: ['software_it'],
    competencyWeights: { PS: 1.0, AL: 1.0, AP: 0.8, CM: 0.7, DM: 0.7, MT: 0.6 },
    transferableFrom: ['Software architecture', 'Systems reliability', 'DevOps and SRE', 'Data engineering', 'API design', 'Automated testing', 'Cybersecurity'],
    aviationBridge: ['DO-178C airborne software certification', 'Aviation-specific reliability standards', 'ICAO data standards', 'Airline operations technology landscape', 'Airside digital infrastructure requirements'],
    credentialNote: 'No aviation licence required. Airborne software roles involve compliance with DO-178C, which requires specialized certification awareness training.',
    nextSteps: [
      'Research aviation software roles at CAE, Thales, Collins Aerospace, Aireon, and NavBlue',
      'Explore DO-178C awareness training through specialist providers',
      'Connect with an AACP Transition Mentor in aviation software or digital systems',
    ],
  },
  {
    id: 'aviation_cybersecurity',
    label: 'Aviation Cybersecurity',
    family: 'Aviation Technology',
    description: 'Apply cybersecurity expertise to protect aviation infrastructure, airline operational systems, and connected aircraft environments.',
    relevantDomains: ['software_it'],
    competencyWeights: { PS: 1.0, AP: 0.9, SO: 1.0, PR: 0.8, AL: 0.8, CM: 0.7 },
    transferableFrom: ['Cybersecurity', 'Penetration testing', 'Risk assessment', 'Incident response', 'Security architecture', 'Compliance frameworks', 'Threat modelling'],
    aviationBridge: ['Aviation-specific threat landscape', 'ICAO cybersecurity framework', 'Transport Canada cybersecurity expectations', 'Aircraft connectivity architecture', 'Airport cyber-physical systems'],
    credentialNote: 'No aviation licence required. CISSP, CEH, or equivalent credentials are typically expected. Aviation security experience is increasingly valued.',
    nextSteps: [
      'Research aviation cybersecurity roles at NAV CANADA, Canadian airports, and aircraft operators',
      'Explore ICAO and IATA cybersecurity frameworks',
      'Connect with an AACP Transition Mentor in aviation technology and security',
    ],
  },
  {
    id: 'mro_supply_chain',
    label: 'MRO Supply Chain & Aviation Procurement',
    family: 'Aviation Logistics',
    description: 'Apply supply chain, procurement, or logistics expertise to aircraft parts management, MRO supply chains, and aviation inventory operations.',
    relevantDomains: ['logistics_supply_chain', 'project_operations'],
    competencyWeights: { MT: 0.9, SA: 0.8, DM: 0.8, PR: 0.8, CM: 0.7, AP: 0.7, PS: 0.7 },
    transferableFrom: ['Supply chain management', 'Procurement', 'Inventory control', 'Vendor management', 'Demand forecasting', 'Logistics coordination', 'Contract management'],
    aviationBridge: ['Aircraft parts traceability requirements', 'Airworthiness certificates (8130-3, EASA Form 1)', 'Suspect unapproved parts awareness', 'CAGE codes and aviation part numbering', 'Regulatory requirements for parts handling'],
    credentialNote: 'No aviation licence required. Understanding airworthiness documentation is important. APICS CPIM or equivalent supply chain credentials are an asset.',
    nextSteps: [
      'Research supply chain and procurement roles at StandardAero, Air Canada Maintenance, and Part 145 repair stations',
      'Explore aviation supply chain and airworthiness documentation awareness programs',
      'Connect with an AACP Transition Mentor in MRO supply chain',
    ],
  },
  {
    id: 'airport_airline_operations',
    label: 'Airline & Airport Operations Management',
    family: 'Operations',
    description: 'Apply operational leadership, logistics, or project management experience to airline operations, airport operations management, or FBO management roles.',
    relevantDomains: ['project_operations', 'logistics_supply_chain', 'business_finance'],
    competencyWeights: { SA: 1.0, MT: 1.0, DM: 0.9, CM: 0.9, SO: 0.8, PR: 0.7, WM: 0.7 },
    transferableFrom: ['Operations management', 'Shift management', 'Resource coordination', 'Stakeholder communication', 'KPI tracking', 'Process improvement', 'Emergency response'],
    aviationBridge: ['Airside operations regulations', 'Safety Management Systems (SMS)', 'Aircraft turnaround processes', 'Airport authority requirements', 'IATA Ground Operations Manual (IGOM)'],
    credentialNote: 'Airside Vehicle Operator Permit required for most Canadian airport operational roles. Airport Operations Officer programs exist at several Canadian colleges.',
    nextSteps: [
      'Research Airport Operations Officer programs at BCIT, SAIT, and Seneca College',
      'Explore operations management roles at Canadian airports and regional airlines',
      'Connect with an AACP Transition Mentor in airport or airline operations',
    ],
  },
  {
    id: 'aerospace_manufacturing',
    label: 'Aerospace Manufacturing Engineer',
    family: 'Aerospace Manufacturing',
    description: 'Apply manufacturing engineering, process engineering, or quality assurance expertise to aerospace production environments and aerospace tier suppliers.',
    relevantDomains: ['mechanical_engineering', 'manufacturing_trades', 'electrical_engineering'],
    competencyWeights: { AP: 1.0, PR: 1.0, PS: 0.9, MR: 0.9, SO: 0.8, SR: 0.7, AL: 0.6 },
    transferableFrom: ['Manufacturing process design', 'Quality systems (ISO 9001)', 'Lean and Six Sigma', 'Blueprint reading', 'GD&T', 'Tool and fixture design', 'First Article Inspection'],
    aviationBridge: ['AS9100 aerospace quality standard', 'First Article Inspection requirements in aviation', 'NADCAP special processes', 'Aerospace materials and composites', 'Production approval requirements'],
    credentialNote: 'No aviation licence required for most manufacturing engineering roles. AS9100 Lead Auditor certification and aerospace quality credentials add significant value.',
    nextSteps: [
      'Research manufacturing engineering roles at Bombardier, Magellan Aerospace, and Tier 1 suppliers',
      'Explore AS9100 certification and NADCAP awareness training',
      'Connect with an AACP Transition Mentor in aerospace manufacturing',
    ],
  },
  {
    id: 'aircraft_assembly',
    label: 'Aircraft Assembly & Structural Technician',
    family: 'Aerospace Manufacturing',
    description: 'Apply skilled trades, fabrication, or precision manufacturing experience to aircraft assembly, structural repair, or composite manufacturing.',
    relevantDomains: ['manufacturing_trades', 'construction_infrastructure'],
    competencyWeights: { AP: 1.0, MR: 1.0, PR: 0.9, SR: 0.9, SO: 0.8, PS: 0.6 },
    transferableFrom: ['Precision fabrication', 'Blueprint reading', 'Measurement and tolerances', 'Tool operation', 'Quality inspection', 'Work to specification', 'Trade skills'],
    aviationBridge: ['Aviation-grade materials and fasteners', 'Aircraft drawing conventions', 'Quality conformance requirements', 'Foreign Object Debris (FOD) control', 'Transport Canada production requirements'],
    credentialNote: 'No aviation licence required for most assembly roles. Red Seal trades (Machinist, Sheet Metal Worker) can accelerate entry into aerospace assembly.',
    nextSteps: [
      'Explore aircraft assembly technician programs at Canadian aviation colleges',
      'Research direct hiring programs at Bombardier, Magellan Aerospace, and Tier 1 suppliers',
      'Connect with an AACP Transition Mentor who transitioned from trades into aerospace assembly',
    ],
  },
  {
    id: 'aviation_project_management',
    label: 'Aviation Project & Program Manager',
    family: 'Operations',
    description: 'Apply project management, program delivery, or operational leadership experience to aviation capital projects, MRO programs, or airline transformation initiatives.',
    relevantDomains: ['project_operations', 'business_finance', 'logistics_supply_chain'],
    competencyWeights: { MT: 1.0, DM: 1.0, CM: 1.0, SA: 0.8, PR: 0.8, AL: 0.7, PS: 0.7 },
    transferableFrom: ['Project management', 'Stakeholder management', 'Budget management', 'Risk management', 'Change management', 'Vendor management', 'Scheduling'],
    aviationBridge: ['Aviation regulatory environment', 'Aviation safety culture', 'MRO and aircraft modification processes', 'TCCA coordination', 'Aviation programme lifecycles and AOG implications'],
    credentialNote: 'No aviation licence required. PMP or PRINCE2 credentials are typically expected. Aviation industry orientation and SMS awareness are practical advantages.',
    nextSteps: [
      'Research project management roles at Air Canada, WestJet, NAV CANADA, and Canadian airport authorities',
      'Explore aviation industry professional associations (ACI-NA, IATA) for networking and resources',
      'Connect with an AACP Transition Mentor in aviation project management',
    ],
  },
  {
    id: 'aviation_safety',
    label: 'Aviation Safety & SMS Professional',
    family: 'Safety',
    description: 'Apply safety management, risk, or quality assurance expertise to aviation safety programs, SMS implementation, and regulatory compliance in an aviation environment.',
    relevantDomains: ['healthcare', 'project_operations', 'energy_resources', 'manufacturing_trades'],
    competencyWeights: { SO: 1.0, PR: 1.0, DM: 0.9, PS: 0.9, CM: 0.8, AP: 0.8, SA: 0.8 },
    transferableFrom: ['Safety Management Systems', 'Incident investigation', 'Hazard identification', 'Risk assessment', 'Regulatory compliance', 'Quality systems', 'Root cause analysis'],
    aviationBridge: ['Transport Canada SMS requirements (CARs Part V)', 'Aviation accident investigation methodologies', 'Threat and Error Management (TEM)', 'Aviation occurrence reporting (CADORS)', 'Just Culture principles in aviation'],
    credentialNote: 'No aviation licence required. Canadian Aviation Safety Officer (CASO) designation and Transport Canada SMS training programs are recommended pathways.',
    nextSteps: [
      'Research safety management roles at airlines, airports, and NAV CANADA',
      'Explore Transport Canada SMS training and the CASO designation requirements',
      'Connect with an AACP Transition Mentor who transitioned from safety or healthcare into aviation',
    ],
  },
  {
    id: 'aviation_data_analytics',
    label: 'Aviation Data & Analytics',
    family: 'Aviation Technology',
    description: 'Apply data science, analytics, or quantitative expertise to fleet analytics, predictive maintenance, operational efficiency, or aviation safety data systems.',
    relevantDomains: ['software_it', 'business_finance', 'mechanical_engineering'],
    competencyWeights: { PS: 1.0, AL: 1.0, AP: 0.9, MT: 0.7, CM: 0.7, DM: 0.7 },
    transferableFrom: ['Data engineering', 'Statistical analysis', 'Machine learning', 'SQL and BI tools', 'Operational reporting', 'KPI development', 'Visualization'],
    aviationBridge: ['Aviation data standards (OOOI, ACARS, QAR)', 'Predictive maintenance in MRO', 'Flight Data Monitoring (FDM/FOQA)', 'Regulatory data reporting requirements'],
    credentialNote: 'No aviation licence required. Data science credentials (AWS/Azure data certifications, CDA) are valued. Aviation domain knowledge is a differentiator.',
    nextSteps: [
      'Research data and analytics roles at Air Canada, Porter Airlines, and MRO organizations',
      'Explore Flight Data Monitoring and predictive maintenance technology providers',
      'Connect with an AACP Transition Mentor in aviation analytics or technology',
    ],
  },
  {
    id: 'atc_fss',
    label: 'Air Traffic Services (ATC / FSS)',
    family: 'Air Traffic Services',
    description: 'Apply strong communication, multitasking, and cognitive performance capabilities to an air traffic controller or flight service specialist career.',
    relevantDomains: ['project_operations', 'software_it', 'healthcare', 'mechanical_engineering'],
    competencyWeights: { MT: 1.0, CM: 1.0, SA: 1.0, WM: 0.9, DM: 0.9, PR: 0.8, AP: 0.7 },
    transferableFrom: ['High-pressure decision making', 'Multitasking', 'Precise structured communication', 'Situational awareness', 'Cognitive performance under load', 'Operational monitoring'],
    aviationBridge: ['Transport Canada ATCO licence requirements', 'NAV CANADA selection and aptitude testing', 'Radar and airspace management', 'Aeronautical knowledge (meteorology, navigation)', 'Aviation communication phraseology'],
    credentialNote: 'ATC requires a Transport Canada ATCO licence. NAV CANADA manages its own selection and ab initio training pipeline, which is competitive and cognitively demanding.',
    nextSteps: [
      'Research NAV CANADA Air Traffic Controller and FSS application and selection requirements',
      'Review Transport Canada Air Traffic Controller licensing standards',
      'Connect with an AACP Transition Mentor who transitioned into air traffic services',
    ],
  },
];

// ── Professional domain → competency signal mapping ───────────────────────────

const DOMAIN_COMPETENCY_SIGNALS: Record<ProfessionalDomain, Partial<Record<CompetencyKey, number>>> = {
  mechanical_engineering:      { MR: 0.5, PS: 0.5, AP: 0.4, SO: 0.3, PR: 0.3 },
  electrical_engineering:      { MR: 0.4, PS: 0.5, AP: 0.5, SR: 0.3, AL: 0.3 },
  software_it:                 { PS: 0.6, AL: 0.6, AP: 0.4, MT: 0.3 },
  manufacturing_trades:        { AP: 0.6, MR: 0.5, PR: 0.5, SR: 0.4, SO: 0.3 },
  logistics_supply_chain:      { MT: 0.5, SA: 0.4, DM: 0.4, PR: 0.3, CM: 0.3 },
  healthcare:                  { SO: 0.6, DM: 0.5, CM: 0.5, PR: 0.5, AP: 0.3 },
  project_operations:          { MT: 0.6, DM: 0.5, CM: 0.5, SA: 0.4, PR: 0.3 },
  construction_infrastructure: { AP: 0.5, MR: 0.4, PR: 0.4, SO: 0.4, SR: 0.3 },
  energy_resources:            { SO: 0.5, MR: 0.4, PS: 0.4, PR: 0.4, AP: 0.3 },
  business_finance:            { DM: 0.4, CM: 0.4, MT: 0.4, PS: 0.3 },
  education:                   { CM: 0.5, AL: 0.5, PS: 0.3 },
  other:                       {},
};

// ── Two-source evidence: combine professional + ACIA ─────────────────────────

export function computeTransitionCompetencies(
  aciaResponses: QuestionResponse[],
  profile: TransitionProfile,
): Partial<Record<CompetencyKey, CompetencyObservation>> {
  // Source A: ACIA observed evidence (from question bank)
  const aciaCompetencies = computeCompetencyIndex(aciaResponses, []);

  // Source B: Professional evidence signals (from profile)
  const profSignals: Partial<Record<CompetencyKey, number>> = {};

  if (profile.detectedDomain) {
    const domainSignals = DOMAIN_COMPETENCY_SIGNALS[profile.detectedDomain] ?? {};
    for (const [key, val] of Object.entries(domainSignals) as [CompetencyKey, number][]) {
      profSignals[key] = (profSignals[key] ?? 0) + val;
    }
  }

  // Additional boosts from specific profile flags
  if (profile.safetySensitiveWork)          { profSignals['SO'] = (profSignals['SO'] ?? 0) + 0.3; }
  if (profile.regulatoryExposure)           { profSignals['PR'] = (profSignals['PR'] ?? 0) + 0.3; }
  if (profile.leadershipExperience)         { profSignals['CM'] = (profSignals['CM'] ?? 0) + 0.2; profSignals['DM'] = (profSignals['DM'] ?? 0) + 0.2; profSignals['MT'] = (profSignals['MT'] ?? 0) + 0.2; }
  if (profile.projectManagementExperience)  { profSignals['MT'] = (profSignals['MT'] ?? 0) + 0.2; profSignals['DM'] = (profSignals['DM'] ?? 0) + 0.2; profSignals['PS'] = (profSignals['PS'] ?? 0) + 0.15; }
  if (profile.customerInteraction)          { profSignals['CM'] = (profSignals['CM'] ?? 0) + 0.15; }

  const yearsBoost = Math.min((profile.yearsExperience ?? 0) / 20, 0.15);

  // Merge: ACIA evidence is the primary source; professional signals augment confidence/state
  const merged: Partial<Record<CompetencyKey, CompetencyObservation>> = { ...aciaCompetencies };

  for (const [key, signal] of Object.entries(profSignals) as [CompetencyKey, number][]) {
    const existing = merged[key];
    const boost = (signal + yearsBoost) * 0.5; // professional evidence has 50% weight of ACIA

    if (!existing) {
      // No ACIA evidence for this competency — create a professional-only observation
      const rawScore = Math.min(boost, 0.5); // cap professional-only at 'emerging/developing'
      merged[key] = {
        key,
        state: rawScore >= 0.4 ? 'developing' : rawScore >= 0.2 ? 'emerging' : 'insufficient',
        confidence: 'low',
        observationCount: 0,
        rawScore,
      };
    } else {
      // Blend with existing ACIA evidence — boost state and confidence
      const newRaw = Math.min(existing.rawScore + boost * 0.3, 1.0);
      const newObs = existing.observationCount;
      merged[key] = {
        ...existing,
        rawScore: newRaw,
        state: rawToState(newRaw, newObs),
        confidence: boostConfidence(existing.confidence),
      };
    }
  }

  return merged;
}

function rawToState(raw: number, obs: number): CompetencyObservation['state'] {
  if (raw >= 0.75 && obs >= 3)  return 'strong';
  if (raw >= 0.55 && obs >= 2)  return 'demonstrated';
  if (raw >= 0.35)               return 'developing';
  if (raw >= 0.15)               return 'emerging';
  return 'insufficient';
}

function boostConfidence(c: EvidenceConfidence): EvidenceConfidence {
  if (c === 'low') return 'moderate';
  if (c === 'moderate') return 'high';
  return 'high';
}

// ── Alignment computation ─────────────────────────────────────────────────────

export function computeTransitionAlignments(
  aciaResponses: QuestionResponse[],
  profile: TransitionProfile,
): TransitionCareerAlignment[] {
  const competencies = computeTransitionCompetencies(aciaResponses, profile);
  const topAcia = getTopCompetencies(competencies, 4);

  const scored = TRANSITION_CAREERS.map(career => {
    // ACIA-weighted score
    let weightedSum = 0, totalWeight = 0;
    for (const [key, weight] of Object.entries(career.competencyWeights) as [CompetencyKey, number][]) {
      const obs = competencies[key];
      const rawScore = obs ? obs.rawScore : 0;
      const norm = (rawScore + 1) / 2; // -1..1 → 0..1
      weightedSum += norm * weight;
      totalWeight += weight;
    }
    let score = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

    // Professional domain boost
    if (profile.detectedDomain && career.relevantDomains.includes(profile.detectedDomain)) {
      score = Math.min(score + 0.12, 1.0);
    }

    return { career, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map(({ career, score }, rank) => {
    const alignment = scoreToAlignment(score, rank);

    // Professional strengths matching career's transferableFrom
    const allProfSkills = [
      ...(profile.technicalExperience ?? []),
      ...(profile.systemsExperience ?? []),
      ...(profile.certifications ?? []),
      ...(profile.previousRoles ?? []),
    ].map(s => s.toLowerCase());

    const professionalStrengths = career.transferableFrom.filter(skill =>
      allProfSkills.some(s => s.includes(skill.toLowerCase().split(' ')[0])),
    ).slice(0, 3);

    // ACIA-observed strengths for this career
    const relevantKeys = Object.keys(career.competencyWeights) as CompetencyKey[];
    const aciaObservedStrengths = topAcia
      .filter(obs => relevantKeys.includes(obs.key) && obs.state !== 'insufficient')
      .map(obs => `${COMPETENCY_LABELS[obs.key]} — ${obs.state}`)
      .slice(0, 3);

    // Gaps: high-weight competencies with insufficient or no evidence
    const aviationBridgeNeeded = career.aviationBridge.slice(0, 3);

    // Skills already transferable
    const transferableSkills = professionalStrengths.length > 0
      ? professionalStrengths
      : career.transferableFrom.slice(0, 3);

    // Evidence confidence
    const evidenceConfidence: EvidenceConfidence =
      aciaResponses.length >= 12 ? 'high' :
      aciaResponses.length >= 6  ? 'moderate' :
      'low';

    return {
      careerId: career.id,
      label: career.label,
      family: career.family,
      alignment,
      description: career.description,
      professionalStrengths,
      aciaObservedStrengths,
      evidenceConfidence,
      transferableSkills,
      aviationBridgeNeeded,
      credentialNote: career.credentialNote,
      nextSteps: career.nextSteps,
    };
  });
}

function scoreToAlignment(score: number, rank: number): AlignmentLevel {
  if (score >= 0.70) return 'strong';
  if (score >= 0.57) return rank <= 2 ? 'promising' : 'developing';
  if (score >= 0.44) return 'developing';
  if (score >= 0.30) return 'exploratory';
  return 'insufficient';
}

// ── AI Mentor Prompts ─────────────────────────────────────────────────────────

export const TRANSITION_MENTOR_SYSTEM = `You are an AACP Career Transition Intelligence Mentor — a senior aviation professional conducting a structured professional discovery conversation.

YOUR ROLE IN THIS CONVERSATION:
You are gathering professional background information to form preliminary pathway hypotheses only. Actual career alignment will be determined by the ACIA assessment that follows — not by this conversation alone. Your job is to collect evidence, not to recommend careers.

ABSOLUTE PROHIBITIONS — never say any of the following in any form:
- Do NOT say a participant is "strongly aligned," "well-aligned," or "closely aligned" with any career
- Do NOT say a career is their "best match," "closest fit," "top pathway," "strongest option," or "ideal role"
- Do NOT give definitive career recommendations
- Do NOT rank careers by match quality
- Do NOT state that a career "is right for them" or "would suit them well"
- Do NOT summarise their profile and assign them to specific pathways as conclusions
- Do NOT use language that implies this conversation alone determined their career direction

PERMITTED LANGUAGE — when referencing potential pathways:
- "Your background gives ACIA a useful hypothesis to test in [pathway]."
- "That is a pathway worth exploring — I would want to see how the ACIA evidence develops."
- "We will need the ACIA assessment before I can say anything meaningful about alignment."
- "That transferable experience is relevant to [area]. How well it translates will become clearer through the ACIA missions."
- "Your [specific experience] opens a line of inquiry worth pursuing in the assessment."

CRITICAL RULES:
1. Ask ONLY ONE question per response. Never ask multiple questions in a single message.
2. Keep each response to 2–4 sentences before your single question.
3. Speak as a peer-level professional. Do NOT talk down to participants.
4. Acknowledge the specific words the participant just used before moving forward.
5. Use aviation language sparingly — do not force metaphors or jargon.
6. You are collecting evidence to form hypotheses — not giving career advice.
7. Stay strictly within: aviation, aerospace, career transition, professional development, education, training pathways, and AACP. Politely redirect anything outside this scope.
8. This conversation produces hypotheses only. ACIA observed evidence always takes precedence over professional background in determining alignment.

DISCOVERY AREAS (explore naturally — adapt order to what they share):
- Educational background and field of study
- Current role and primary responsibilities
- Previous roles and career progression
- Technical systems, tools, and equipment used
- Safety-sensitive or high-consequence work experience
- Regulatory or compliance exposure
- Leadership, team, or supervisory responsibilities
- A complex technical problem they solved
- How they manage competing priorities under pressure
- What draws them toward aviation or aerospace specifically
- Whether any aviation roles already interest them, or they prefer open discovery

TONE: Professional, warm, and genuinely curious. Sound like a senior aviation professional who is seriously interested in the participant's background — not an HR screener, not a chatbot. Never summarise with a verdict or career conclusion.

Begin by asking about their educational background and what they studied.`;

export const DISCOVERY_CLOSING_MESSAGE = "Thanks — I now have enough information about your professional background. Your experience gives us several pathways worth exploring, but I don't want to point you toward a career based only on work history. The next step is your ACIA assessment, where we'll independently observe how you approach technical, spatial, safety, decision-making, communication, and problem-solving challenges. That evidence is what determines alignment.";

export const buildExtractionPrompt = (conversation: { role: string; content: string }[]): string => {
  const history = conversation.map(m => `${m.role === 'assistant' ? 'Mentor' : 'Participant'}: ${m.content}`).join('\n\n');
  return `You have completed a professional discovery conversation. Extract structured information from it.

CONVERSATION:
${history}

Return ONLY valid JSON in this exact format (use null for fields that cannot be confidently determined):
{
  "educationLevel": "high_school|college_diploma|bachelors|masters|doctorate|trade_certificate|professional_designation|other",
  "fieldOfStudy": null,
  "specialization": null,
  "institution": null,
  "professionalDesignation": null,
  "currentJobTitle": null,
  "currentIndustry": null,
  "yearsExperience": null,
  "previousRoles": [],
  "technicalExperience": [],
  "systemsExperience": [],
  "leadershipExperience": null,
  "safetySensitiveWork": null,
  "regulatoryExposure": null,
  "projectManagementExperience": null,
  "customerInteraction": null,
  "certifications": [],
  "aviationExperience": null,
  "aviationInterest": null,
  "careerTransitionGoal": null,
  "detectedDomain": "mechanical_engineering|electrical_engineering|software_it|manufacturing_trades|logistics_supply_chain|healthcare|project_operations|construction_infrastructure|energy_resources|business_finance|education|other"
}`;
};
