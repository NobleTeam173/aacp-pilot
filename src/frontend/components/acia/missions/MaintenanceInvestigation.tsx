import { useState, useCallback } from 'react';
import type { EvidenceItem } from '../types';

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  crimson: '#8F0909', crimsonD: '#721010',
  bg: '#0f0a0b', bgCard: '#1a0d10', border: '#3d1020',
  white: '#f1f5f9', grey: '#94a3b8',
  green: '#22c55e', amber: '#f59e0b', red: '#ef4444', blue: '#60a5fa',
};

// ── Competency helpers ────────────────────────────────────────────────────────
type EvidenceKey = EvidenceItem['key'];
type TaggedEvidence = Omit<EvidenceItem, 'mission'> & { _sc: number };

function ev(key: EvidenceKey, delta: number, sc: number): TaggedEvidence {
  return { key, delta, _sc: sc };
}

// ── Semantic concept matching ─────────────────────────────────────────────────
type Cluster = RegExp[];
function hasConcept(text: string, cluster: Cluster): boolean {
  return cluster.some(p => p.test(text));
}

const CONCEPTS = {
  recordDiscrepancy: [
    /discrepan/i, /contradict/i, /doesn.{0,4}t.{0,5}match/i, /mismatch/i,
    /inconsist/i, /conflict/i, /differ.{0,10}record/i, /record.{0,10}differ/i,
    /not.{0,10}align/i, /doesn.{0,4}t.{0,5}reflect/i, /doesn.{0,4}t.{0,5}show/i,
  ] as Cluster,
  navLightMention: [
    /nav.{0,10}light/i, /navigation.{0,10}light/i, /wing.{0,10}tip/i,
    /cracked/i, /lens/i,
  ] as Cluster,
  oilResidueFound: [
    /oil.{0,15}resid/i, /resid.{0,15}oil/i, /oil.{0,15}cowl/i,
    /oil.{0,15}leak/i, /leak.{0,15}oil/i, /engine.{0,15}oil/i,
  ] as Cluster,
  pitotMention: [
    /pitot/i, /pitot.{0,10}cover/i, /cover.{0,10}pitot/i,
    /airspeed.{0,15}cover/i, /not.{0,10}removed/i, /still.{0,5}install/i,
  ] as Cluster,
  tyreMention: [
    /tyre/i, /tire/i, /nose.{0,10}gear/i, /pressure/i, /low.{0,10}tyre/i,
    /tyre.{0,10}pressure/i,
  ] as Cluster,
  oilSystemCause: [
    /seal/i, /gasket/i, /o.{0,2}ring/i, /fitting/i, /connection/i,
    /worn/i, /crack.{0,10}in/i, /loose.{0,10}fitting/i, /joint/i,
    /internal.{0,10}leak/i, /source.{0,15}oil/i,
  ] as Cluster,
  oilNextStep: [
    /inspect/i, /pressure.{0,10}test/i, /run.{0,4}up/i, /borescope/i,
    /trace/i, /identify.{0,10}source/i, /further.{0,15}invest/i,
    /before.{0,10}fly/i, /before.{0,10}releas/i,
  ] as Cluster,
  safetyGround: [
    /grounded/i, /not.{0,10}airworthy/i, /do.{0,5}not.{0,5}fly/i,
    /not.{0,10}releas/i, /cannot.{0,10}releas/i, /should.{0,10}not.{0,10}releas/i,
    /unsafe/i, /must.{0,10}not.{0,10}fly/i, /not.{0,10}clear.{0,10}for/i,
    /withheld/i, /hold/i,
  ] as Cluster,
  handoverComplete: [
    /nav.{0,10}light/i, /oil/i, /tyre/i, /pitot/i,
    /outstanding/i, /unresolved/i, /not.{0,10}releas/i,
    /requires.{0,15}attention/i, /needs.{0,15}address/i,
  ] as Cluster,
  resistPressure: [
    /cannot/i, /can.{0,2}t/i, /will.{0,5}not/i, /won.{0,2}t/i,
    /not.{0,10}rush/i, /airworthy/i, /must.{0,10}complet/i,
    /2.{0,5}hour.{0,10}(not|insufficient)/i,
    /safety.{0,10}(cannot|first|priority)/i,
    /not.{0,10}safe.{0,10}to/i, /unresolved/i, /open.{0,10}item/i,
  ] as Cluster,
  prioritySafety: [
    /safety.{0,10}(critical|first|priority)/i, /airworthiness/i,
    /highest.{0,10}priority/i, /most.{0,10}(critical|important|urgent)/i,
    /address.{0,10}first/i, /fix.{0,10}before/i, /must.{0,10}resolve/i,
  ] as Cluster,
  regulatoryRef: [
    /regul/i, /procedure/i, /require/i, /documented/i, /certif/i,
    /sign.{0,5}off/i, /compliance/i, /protocol/i, /maintenance.{0,10}manual/i,
    /standard/i,
  ] as Cluster,
};

// ── Inspection zones (same aircraft, AME context) ─────────────────────────────
interface Zone {
  id: string; label: string; x: number; y: number; r: number;
  issue: string | null; severity: 'ok' | 'caution' | 'defect'; found: boolean;
}

const ZONES: Zone[] = [
  { id: 'nose',       label: 'Nose Cone',    x: 80,  y: 120, r: 18, issue: null,                                                   severity: 'ok',     found: false },
  { id: 'l_engine',   label: 'Left Engine',  x: 155, y: 155, r: 20, issue: 'Oil residue on engine cowling',                       severity: 'caution', found: false },
  { id: 'r_engine',   label: 'Right Engine', x: 155, y: 85,  r: 20, issue: null,                                                   severity: 'ok',     found: false },
  { id: 'l_wing_tip', label: 'Left Wing Tip',x: 250, y: 195, r: 15, issue: 'Navigation light lens cracked',                       severity: 'defect', found: false },
  { id: 'r_wing_tip', label: 'Right Wing Tip',x: 250, y: 45, r: 15, issue: null,                                                   severity: 'ok',     found: false },
  { id: 'l_main_gear',label: 'Left Main Gear',x:190, y: 175, r: 14, issue: null,                                                   severity: 'ok',     found: false },
  { id: 'r_main_gear',label: 'Right Main Gear',x:190,y: 65,  r: 14, issue: null,                                                   severity: 'ok',     found: false },
  { id: 'nose_gear',  label: 'Nose Gear',    x: 95,  y: 148, r: 14, issue: 'Tyre worn — below serviceable limits',                severity: 'caution', found: false },
  { id: 'fuselage',   label: 'Fuselage Mid', x: 175, y: 120, r: 16, issue: null,                                                   severity: 'ok',     found: false },
  { id: 'tail',       label: 'Tail Section', x: 310, y: 120, r: 18, issue: 'VHF antenna mounting loose',                          severity: 'defect', found: false },
  { id: 'flap_l',     label: 'Left Flap',   x: 225, y: 170, r: 13, issue: null,                                                   severity: 'ok',     found: false },
  { id: 'flap_r',     label: 'Right Flap',  x: 225, y: 70,  r: 13, issue: null,                                                   severity: 'ok',     found: false },
  { id: 'pitot_tube', label: 'Pitot Tube',  x: 108, y: 138, r: 13, issue: 'Pitot cover still installed — not removed post-maintenance', severity: 'defect', found: false },
  { id: 'static_port',label: 'Static Port', x: 130, y: 112, r: 11, issue: null,                                                   severity: 'ok',     found: false },
  { id: 'l_fuel_cap', label: 'Left Fuel Cap',x: 215, y: 163, r: 12, issue: null,                                                  severity: 'ok',     found: false },
];
const DEFECTS = ZONES.filter(z => z.severity !== 'ok');

// ── Maintenance records ───────────────────────────────────────────────────────
interface MaintenanceRecord {
  id: string; system: string; description: string; techName: string; daysAgo: number; status: string;
}
const RECORDS: MaintenanceRecord[] = [
  {
    id: 'rec_nav', system: 'Navigation Light — Left Wing Tip',
    description: 'Navigation light assembly replacement completed. Left wing tip nav light replaced with serviceable unit. Functional check passed. Released to service.',
    techName: 'J. Martinez (AME #4471)', daysAgo: 3, status: 'Complete — Released',
  },
  {
    id: 'rec_gear', system: 'Nose Landing Gear — Tyre & Brake Inspection',
    description: 'Nose gear tyre condition checked. Tread depth measured at 4.2 mm — within serviceable limits. Brake assembly inspected — no wear beyond limits. Released to service.',
    techName: 'R. Patel (AME #3892)', daysAgo: 8, status: 'Complete — Released',
  },
  {
    id: 'rec_engine', system: 'Engine — Oil System Inspection (Left)',
    description: 'Engine oil system inspected per schedule. Oil level confirmed within limits. No abnormal residue, leaks, or contamination noted. Cowling area wiped clean. Released to service.',
    techName: 'J. Martinez (AME #4471)', daysAgo: 3, status: 'Complete — Released',
  },
];

// ── Lubrication system nodes ──────────────────────────────────────────────────
interface OilNode { id: string; label: string; x: number; y: number; detail: string; }
const OIL_NODES: OilNode[] = [
  { id: 'reservoir', label: 'Oil Reservoir',    x: 80,  y: 60,
    detail: 'Stores engine oil. Current level: within limits. Cap and filler neck: no visible residue or overflow.' },
  { id: 'filter',    label: 'Oil Filter',       x: 200, y: 60,
    detail: 'Filters contaminants before oil enters the system. Filter housing exterior: clean. Last replaced: 12 days ago.' },
  { id: 'pump',      label: 'Oil Pump',         x: 300, y: 120,
    detail: 'Pressurises oil for distribution. Pump housing and fittings: small amount of dried residue noted at output fitting.' },
  { id: 'dist',      label: 'Distribution Lines',x: 300, y: 200,
    detail: 'Supply lines carry pressurised oil to engine components. Lines inspected: no visible cracks. Connection at lower firewall fitting: minor seepage trace.' },
  { id: 'engine',    label: 'Engine Components', x: 200, y: 260,
    detail: 'Oil lubricates bearings, cylinder walls, and moving parts. Cowling interior shows oil residue consistent with a slow external leak from a fitting or seal.' },
  { id: 'return',    label: 'Return Line',       x: 80,  y: 200,
    detail: 'Returns oil from engine back to reservoir. Return line: no external residue noted. Connections appear intact.' },
];

// ── Priority items ────────────────────────────────────────────────────────────
interface PriorityItem { id: string; title: string; description: string; category: 'safety' | 'operational' | 'admin'; }
const PRIORITY_ITEMS: PriorityItem[] = [
  { id: 'oil',   title: 'Engine Oil System Investigation', description: 'Source of oil residue on engine cowling not yet identified. Origin may be pump fitting or distribution line.', category: 'safety' },
  { id: 'nav',   title: 'Nav Light Lens Replacement',     description: 'Left wing tip navigation light lens cracked. Records indicate prior replacement — discrepancy unresolved.', category: 'safety' },
  { id: 'tyre',  title: 'Nose Gear Tyre Serviceability',  description: 'Tyre appears worn beyond serviceable limits. Records from 8 days ago noted tyre as within limits.', category: 'safety' },
  { id: 'admin', title: 'Maintenance Record Update',      description: 'Three records have discrepancies with current aircraft condition. Records require review and correction.', category: 'admin' },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  sessionId?: string;
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

type Phase = 's1' | 's2' | 's3' | 's4' | 's5';

// ── Main orchestrator ─────────────────────────────────────────────────────────
export function MaintenanceInvestigation({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('s1');
  const [allEvidence, setAllEvidence] = useState<TaggedEvidence[]>([]);
  // Carry-forward state
  const [foundDefectIds, setFoundDefectIds] = useState<string[]>([]);
  const [logbook, setLogbook] = useState<LogbookEntry>(EMPTY_LOGBOOK);

  function addEvidence(items: TaggedEvidence[]) {
    setAllEvidence(prev => [...prev, ...items]);
  }

  function handleS1Complete(zones: Zone[], items: TaggedEvidence[]) {
    setFoundDefectIds(zones.filter(z => z.found && z.severity !== 'ok').map(z => z.id));
    addEvidence(items);
    setPhase('s2');
  }

  function handleS2Complete(items: TaggedEvidence[]) {
    addEvidence(items);
    setPhase('s3');
  }

  function handleS3Complete(items: TaggedEvidence[]) {
    addEvidence(items);
    setPhase('s4');
  }

  function handleS4Complete(items: TaggedEvidence[], lb: LogbookEntry) {
    addEvidence(items);
    setLogbook(lb);
    setPhase('s5');
  }

  function handleS5Complete(items: TaggedEvidence[]) {
    const combined = [...allEvidence, ...items];

    // Diversity-aware aggregation per key
    const byKey: Record<string, TaggedEvidence[]> = {};
    for (const item of combined) {
      (byKey[item.key] ??= []).push(item);
    }

    const result: Omit<EvidenceItem, 'mission'>[] = [];
    for (const [key, items2] of Object.entries(byKey)) {
      const positives = items2.filter(i => i.delta > 0);
      const negatives = items2.filter(i => i.delta <= 0);
      if (positives.length === 0 && negatives.length === 0) continue;
      const avg = positives.reduce((s, i) => s + i.delta, 0) / Math.max(1, positives.length);
      const negAvg = negatives.reduce((s, i) => s + i.delta, 0) / Math.max(1, negatives.length);
      const distinctScenarios = new Set(positives.filter(i => i.delta >= 0.4).map(i => i._sc)).size;
      const consistencyBonus = distinctScenarios >= 3 ? 0.1 : distinctScenarios >= 2 ? 0.05 : 0;
      const delta = Math.min(avg + consistencyBonus, 1.0) + negAvg;
      if (Math.abs(delta) > 0.01) result.push({ key: key as EvidenceItem['key'], delta });
    }

    onComplete(result);
  }

  const stepLabels: Record<Phase, string> = {
    s1: 'Aircraft Inspection', s2: 'Maintenance Records',
    s3: 'Mechanical Investigation', s4: 'Maintenance Handover', s5: 'Maintenance Priorities',
  };
  const phases: Phase[] = ['s1', 's2', 's3', 's4', 's5'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 20 }}>
      {/* Progress indicator */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {phases.map((p, i) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: phases.indexOf(phase) > i ? C.green : phase === p ? C.crimson : C.bgCard,
              border: `1px solid ${phases.indexOf(phase) > i ? C.green : phase === p ? C.crimson : C.border}`,
              color: C.white, fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>{phases.indexOf(phase) > i ? '✓' : i + 1}</div>
            <span style={{ color: phase === p ? C.white : C.grey, fontSize: 11 }}>{stepLabels[p]}</span>
            {i < phases.length - 1 && <span style={{ color: C.border, fontSize: 11, marginLeft: 4 }}>›</span>}
          </div>
        ))}
      </div>

      {phase === 's1' && <S1Inspection onComplete={handleS1Complete} />}
      {phase === 's2' && <S2Records foundDefectIds={foundDefectIds} onComplete={handleS2Complete} />}
      {phase === 's3' && <S3Mechanical foundDefectIds={foundDefectIds} onComplete={handleS3Complete} />}
      {phase === 's4' && <S4Handover foundDefectIds={foundDefectIds} onComplete={handleS4Complete} />}
      {phase === 's5' && <S5Priorities logbook={logbook} onComplete={handleS5Complete} />}
    </div>
  );
}

// ── Zone observation text ──────────────────────────────────────────────────────
const ZONE_OBSERVATIONS: Record<string, string> = {
  nose:        'Nose cone surface is smooth and intact. No visible damage, delamination or impact marks. Radome attachment appears flush and secure.',
  l_engine:    'Examining the left engine cowling access panel. You notice a dark streak running along the lower edge of the cowling — consistent with a fluid trail. The surrounding surface is dry, but the residue appears to originate from behind the panel. Approximately 15 cm long, running aft from the cowling seam.',
  r_engine:    'Right engine cowling and intake area inspected. Cowling surface is clean with no visible fluid traces. Intake lip is undamaged. Fan blades appear correctly seated and undamaged.',
  l_wing_tip:  'Left wing tip navigation light assembly. The mounting appears secure. On closer examination, the lens cover shows a crack — a hairline fracture running across approximately one-third of the lens surface. The crack is structural; the lens is no longer sealed against moisture ingress.',
  r_wing_tip:  'Right wing tip and navigation light assembly inspected. Lens is intact and clear. Mounting secure. No damage or corrosion noted.',
  l_main_gear: 'Left main landing gear assembly. Tyre tread depth appears within serviceable limits. Brake assembly visible — no hydraulic fluid traces on the caliper or axle. Gear door seals appear intact.',
  r_main_gear: 'Right main landing gear inspected. Tyre condition appears normal. No visible hydraulic leaks or unusual wear. Gear door and linkages appear secure.',
  nose_gear:   'Nose landing gear examined. The tyre surface shows significant wear — the tread is visibly shallow and in areas near the centreline appears worn to the wear indicators. This tyre is below what you would expect for a recently serviced aircraft.',
  fuselage:    'Mid-fuselage skin panels inspected. No obvious dents, scratches through the paint, or fastener anomalies. Drain masts appear clear. Belly skin around the wing-fuselage join shows no fluid staining.',
  tail:        'Tail section and stabilisers inspected. Moving to the VHF antenna mounted aft on the upper fuselage: the antenna base shows visible movement when light pressure is applied — the mounting hardware appears loose. The antenna is not firmly secured.',
  flap_l:      'Left trailing edge flaps inspected in the stowed position. Flap surface skin is intact. No hydraulic leaks at the actuator. Flap track and roller assemblies appear clean and undamaged.',
  flap_r:      'Right flap assembly inspected. Flap surface undamaged. Actuator connections appear secure. No fluid traces along the track or actuator housing.',
  pitot_tube:  'Forward fuselage pitot-static area examined. The pitot tube cover — a red-flagged protective cap — is still installed on the pitot tube. It has not been removed following maintenance. A "Remove Before Flight" streamer is attached and clearly visible.',
  static_port: 'Static port examined. Ports are clear and unobstructed. No cover fitted. Port openings appear clean and free of blockage.',
  l_fuel_cap:  'Left wing fuel cap and filler collar inspected. Cap is seated and secure. Filler collar surface is clean with no fuel staining or residue around the seal area.',
};

// ── Hotspot positions on the hangar photo ─────────────────────────────────────
const ZONE_HOTSPOTS: Record<string, { left: string; top: string }> = {
  nose:         { left: '8%',  top: '22%' },
  pitot_tube:   { left: '15%', top: '36%' },
  static_port:  { left: '21%', top: '45%' },
  nose_gear:    { left: '23%', top: '70%' },
  l_main_gear:  { left: '33%', top: '76%' },
  l_engine:     { left: '40%', top: '52%' },
  fuselage:     { left: '58%', top: '36%' },
  flap_l:       { left: '47%', top: '63%' },
  l_fuel_cap:   { left: '55%', top: '61%' },
  r_engine:     { left: '52%', top: '27%' },
  r_main_gear:  { left: '63%', top: '66%' },
  flap_r:       { left: '69%', top: '54%' },
  l_wing_tip:   { left: '77%', top: '17%' },
  r_wing_tip:   { left: '17%', top: '10%' },
  tail:         { left: '86%', top: '27%' },
};

// ── Zone close-up visuals ──────────────────────────────────────────────────────
function ZoneCloseup({ zoneId, severity }: { zoneId: string; severity: string }) {
  const bg = '#0a0e14';
  const panelBg = '#141820';

  if (zoneId === 'l_engine') {
    return (
      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        <img src="/images/engine.jpg" alt="Engine close-up" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block', opacity: 0.85 }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', padding: '20px 10px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
          <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 600 }}>Oil residue observed — cowling lower seam</span>
        </div>
      </div>
    );
  }
  if (zoneId === 'r_engine') {
    return (
      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        <img src="/images/img2.jpeg" alt="Engine intake" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', padding: '20px 10px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
          <span style={{ color: '#22c55e', fontSize: 11, fontWeight: 600 }}>Engine intake — no anomalies</span>
        </div>
      </div>
    );
  }

  // SVG close-up illustrations for remaining zones
  const svgs: Record<string, JSX.Element> = {
    nose: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        <rect x="0" y="130" width="240" height="30" fill={panelBg} />
        {/* Nose cone profile */}
        <path d="M 30,80 Q 70,30 200,78 Q 70,130 30,80 Z" fill="#d4d8de" stroke="#b0b4ba" strokeWidth="1.5" />
        <path d="M 55,72 Q 100,48 175,78" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
        {/* Radome seam */}
        <path d="M 80,55 Q 130,45 180,78 Q 130,112 80,105" fill="none" stroke="#8090a0" strokeWidth="1" strokeDasharray="4,3" />
        {/* Pitot probe tip */}
        <line x1="198" y1="79" x2="228" y2="79" stroke="#aaa" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="199" cy="79" r="4" fill="#999" />
        <text x="120" y="148" textAnchor="middle" fill="#64748b" fontSize="10">Nose cone — surface intact</text>
      </svg>
    ),
    l_wing_tip: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        {/* Wing surface */}
        <rect x="0" y="110" width="240" height="50" fill="#1a1e28" />
        <rect x="0" y="104" width="240" height="8" fill="#2a2e38" />
        {/* Nav light housing */}
        <rect x="82" y="52" width="76" height="60" rx="10" fill="#2a2e3a" stroke="#3a3e4a" strokeWidth="1.5" />
        {/* Lens — cracked red */}
        <ellipse cx="120" cy="78" rx="26" ry="22" fill="#cc1a1a" opacity="0.75" />
        <ellipse cx="120" cy="78" rx="26" ry="22" fill="none" stroke="#ff4444" strokeWidth="1.5" />
        {/* Crack lines */}
        <line x1="105" y1="60" x2="133" y2="92" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" />
        <line x1="118" y1="63" x2="136" y2="81" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
        {/* Mounting hardware */}
        {[90,150].map(x => [60,94].map(y => <circle key={`${x}${y}`} cx={x} cy={y} r="4" fill="#3a4050" stroke="#555" strokeWidth="1" />))}
        {/* Crack indicator arrow */}
        <path d="M 148,58 L 158,50" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="160" cy="48" r="5" fill="none" stroke="#ef4444" strokeWidth="1.5" />
        <text x="120" y="148" textAnchor="middle" fill="#ef4444" fontSize="10">Navigation light — cracked lens</text>
      </svg>
    ),
    r_wing_tip: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        <rect x="0" y="110" width="240" height="50" fill="#1a1e28" />
        <rect x="0" y="104" width="240" height="8" fill="#2a2e38" />
        <rect x="82" y="52" width="76" height="60" rx="10" fill="#2a2e3a" stroke="#3a3e4a" strokeWidth="1.5" />
        {/* Clean green lens */}
        <ellipse cx="120" cy="78" rx="26" ry="22" fill="#14532d" opacity="0.8" />
        <ellipse cx="120" cy="78" rx="26" ry="22" fill="none" stroke="#22c55e" strokeWidth="1.5" />
        {/* Lens highlight */}
        <ellipse cx="112" cy="70" rx="10" ry="7" fill="rgba(255,255,255,0.12)" />
        {[90,150].map(x => [60,94].map(y => <circle key={`${x}${y}`} cx={x} cy={y} r="4" fill="#3a4050" stroke="#555" strokeWidth="1" />))}
        <text x="120" y="148" textAnchor="middle" fill="#22c55e" fontSize="10">Navigation light — no defects</text>
      </svg>
    ),
    nose_gear: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        <rect x="0" y="140" width="240" height="20" fill={panelBg} />
        {/* Strut assembly */}
        <rect x="110" y="10" width="20" height="55" fill="#5a6070" rx="4" />
        <rect x="100" y="62" width="40" height="12" fill="#6a7080" rx="3" />
        {/* Torque links */}
        <path d="M 115,35 L 105,62 M 125,35 L 135,62" stroke="#708090" strokeWidth="4" strokeLinecap="round" />
        {/* Wheel */}
        <ellipse cx="120" cy="118" rx="52" ry="52" fill="#111" />
        <ellipse cx="120" cy="118" rx="44" ry="44" fill="#1a1a1a" />
        {/* Worn tread — minimal grooves */}
        <ellipse cx="120" cy="118" rx="51" ry="51" fill="none" stroke="#2a2a2a" strokeWidth="2" />
        {/* Shallow tread grooves (worn) */}
        {[-30,-15,0,15,30].map(angle => {
          const rad = (angle * Math.PI) / 180;
          const x1 = 120 + 44 * Math.sin(rad); const y1 = 118 - 44 * Math.cos(rad);
          const x2 = 120 + 51 * Math.sin(rad); const y2 = 118 - 51 * Math.cos(rad);
          return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2e2e2e" strokeWidth="3" />;
        })}
        {/* Wear indicator dots (at tread limit) */}
        <circle cx="120" cy="67" r="4" fill="#ef4444" />
        <circle cx="120" cy="169" r="4" fill="#ef4444" />
        <circle cx="68" cy="118" r="4" fill="#ef4444" />
        <circle cx="172" cy="118" r="4" fill="#ef4444" />
        {/* Wheel hub */}
        <ellipse cx="120" cy="118" rx="18" ry="18" fill="#2a3040" stroke="#4a5060" strokeWidth="2" />
        {[0,60,120,180,240,300].map(a => {
          const r = (a * Math.PI) / 180;
          return <line key={a} x1={120 + 6*Math.cos(r)} y1={118 + 6*Math.sin(r)} x2={120 + 16*Math.cos(r)} y2={118 + 16*Math.sin(r)} stroke="#5a6070" strokeWidth="2" strokeLinecap="round" />;
        })}
        <text x="120" y="155" textAnchor="middle" fill="#ef4444" fontSize="10">Nose gear tyre — worn to indicators</text>
      </svg>
    ),
    l_main_gear: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        <rect x="0" y="138" width="240" height="22" fill={panelBg} />
        {/* Main strut */}
        <rect x="108" y="5" width="24" height="60" fill="#5a6070" rx="4" />
        <rect x="95" y="62" width="50" height="14" fill="#6a7080" rx="3" />
        {/* Brake caliper */}
        <rect x="68" y="95" width="20" height="35" rx="4" fill="#3a4050" stroke="#4a5060" strokeWidth="1.5" />
        <rect x="152" y="95" width="20" height="35" rx="4" fill="#3a4050" stroke="#4a5060" strokeWidth="1.5" />
        {/* Tyre — left wheel */}
        <ellipse cx="80" cy="118" rx="36" ry="36" fill="#111" />
        <ellipse cx="80" cy="118" rx="30" ry="30" fill="#1a1a1a" />
        {/* Tread grooves — serviceable */}
        {[-45,0,45,90,135,180,225,270].map(a => {
          const r = (a * Math.PI) / 180;
          return <line key={a} x1={80 + 30*Math.cos(r)} y1={118 + 30*Math.sin(r)} x2={80 + 36*Math.cos(r)} y2={118 + 36*Math.sin(r)} stroke="#303030" strokeWidth="3.5" />;
        })}
        <ellipse cx="80" cy="118" rx="12" ry="12" fill="#2a3040" stroke="#4a5060" strokeWidth="1.5" />
        {/* Tyre — right wheel */}
        <ellipse cx="160" cy="118" rx="36" ry="36" fill="#111" />
        <ellipse cx="160" cy="118" rx="30" ry="30" fill="#1a1a1a" />
        {[-45,0,45,90,135,180,225,270].map(a => {
          const r = (a * Math.PI) / 180;
          return <line key={a} x1={160 + 30*Math.cos(r)} y1={118 + 30*Math.sin(r)} x2={160 + 36*Math.cos(r)} y2={118 + 36*Math.sin(r)} stroke="#303030" strokeWidth="3.5" />;
        })}
        <ellipse cx="160" cy="118" rx="12" ry="12" fill="#2a3040" stroke="#4a5060" strokeWidth="1.5" />
        <text x="120" y="152" textAnchor="middle" fill="#22c55e" fontSize="10">Main landing gear — serviceable</text>
      </svg>
    ),
    r_main_gear: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        <rect x="0" y="138" width="240" height="22" fill={panelBg} />
        <rect x="108" y="5" width="24" height="60" fill="#5a6070" rx="4" />
        <rect x="95" y="62" width="50" height="14" fill="#6a7080" rx="3" />
        <rect x="68" y="95" width="20" height="35" rx="4" fill="#3a4050" stroke="#4a5060" strokeWidth="1.5" />
        <rect x="152" y="95" width="20" height="35" rx="4" fill="#3a4050" stroke="#4a5060" strokeWidth="1.5" />
        {[80, 160].map(cx => (
          <g key={cx}>
            <ellipse cx={cx} cy="118" rx="36" ry="36" fill="#111" />
            <ellipse cx={cx} cy="118" rx="30" ry="30" fill="#1a1a1a" />
            {[-45,0,45,90,135,180,225,270].map(a => {
              const r = (a * Math.PI) / 180;
              return <line key={a} x1={cx + 30*Math.cos(r)} y1={118 + 30*Math.sin(r)} x2={cx + 36*Math.cos(r)} y2={118 + 36*Math.sin(r)} stroke="#303030" strokeWidth="3.5" />;
            })}
            <ellipse cx={cx} cy="118" rx="12" ry="12" fill="#2a3040" stroke="#4a5060" strokeWidth="1.5" />
          </g>
        ))}
        <text x="120" y="152" textAnchor="middle" fill="#22c55e" fontSize="10">Main landing gear — no anomalies</text>
      </svg>
    ),
    fuselage: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        {/* Fuselage belly panels */}
        <ellipse cx="120" cy="80" rx="110" ry="55" fill="#d4d8de" stroke="#b0b4ba" strokeWidth="1.5" />
        {/* Panel seam lines */}
        {[40,80,120,160,200].map(x => (
          <line key={x} x1={x} y1={40} x2={x} y2={120} stroke="#b0b4ba" strokeWidth="0.8" strokeDasharray="3,4" />
        ))}
        {/* Horizontal seam */}
        <line x1="10" y1="80" x2="230" y2="80" stroke="#b0b4ba" strokeWidth="0.8" strokeDasharray="3,4" />
        {/* Fasteners */}
        {[40,80,120,160,200].map(x => [50,80,110].map(y => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="2.5" fill="#999" />
        )))}
        {/* Drain mast */}
        <rect x="114" y="124" width="12" height="18" rx="3" fill="#8090a0" />
        <ellipse cx="120" cy="142" rx="6" ry="3" fill="#6a7a8a" />
        <text x="120" y="157" textAnchor="middle" fill="#22c55e" fontSize="10">Fuselage skin — no anomalies</text>
      </svg>
    ),
    tail: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        {/* Fuselage aft section */}
        <rect x="20" y="60" width="200" height="60" rx="8" fill="#d4d8de" stroke="#b0b4ba" strokeWidth="1.5" />
        {/* VHF blade antenna — tilted/loose */}
        <g transform="translate(120,60) rotate(-8)">
          <rect x="-6" y="-50" width="12" height="52" rx="3" fill="#4a5060" stroke="#5a6070" strokeWidth="1.5" />
          {/* Loose mounting base — gap visible */}
          <rect x="-10" y="-4" width="20" height="8" rx="2" fill="#3a4050" stroke="#ef4444" strokeWidth="1.5" />
          <rect x="-6" y="0" width="12" height="5" fill={bg} opacity="0.5" />
          {/* Movement arrows */}
          <path d="M -18,-30 L -25,-38 M -18,-30 L -26,-22" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M 18,-30 L 25,-38 M 18,-30 L 26,-22" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </g>
        {/* Warning indicator */}
        <circle cx="120" cy="28" r="12" fill="#f59e0b" opacity="0.15" />
        <text x="120" y="34" textAnchor="middle" fill="#f59e0b" fontSize="14" fontWeight="bold">!</text>
        <text x="120" y="150" textAnchor="middle" fill="#f59e0b" fontSize="10">VHF antenna — loose mounting</text>
      </svg>
    ),
    flap_l: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        {/* Wing trailing edge */}
        <path d="M 0,50 L 240,80 L 240,160 L 0,160 Z" fill="#c8cdd4" stroke="#a8adb4" strokeWidth="1" />
        {/* Flap panel */}
        <path d="M 20,85 L 220,115 L 220,145 L 20,145 Z" fill="#b8bdc4" stroke="#a0a5ac" strokeWidth="1.5" />
        {/* Flap track */}
        <rect x="60" y="82" width="10" height="65" rx="3" fill="#6a7080" />
        <rect x="170" y="82" width="10" height="65" rx="3" fill="#6a7080" />
        {/* Actuator */}
        <rect x="108" y="78" width="24" height="40" rx="4" fill="#5a6070" stroke="#6a7080" strokeWidth="1.5" />
        <line x1="120" y1="118" x2="120" y2="140" stroke="#7a8090" strokeWidth="5" strokeLinecap="round" />
        <text x="120" y="155" textAnchor="middle" fill="#22c55e" fontSize="10">Left flap — no anomalies</text>
      </svg>
    ),
    flap_r: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        <path d="M 0,50 L 240,80 L 240,160 L 0,160 Z" fill="#c8cdd4" stroke="#a8adb4" strokeWidth="1" />
        <path d="M 20,85 L 220,115 L 220,145 L 20,145 Z" fill="#b8bdc4" stroke="#a0a5ac" strokeWidth="1.5" />
        <rect x="60" y="82" width="10" height="65" rx="3" fill="#6a7080" />
        <rect x="170" y="82" width="10" height="65" rx="3" fill="#6a7080" />
        <rect x="108" y="78" width="24" height="40" rx="4" fill="#5a6070" stroke="#6a7080" strokeWidth="1.5" />
        <line x1="120" y1="118" x2="120" y2="140" stroke="#7a8090" strokeWidth="5" strokeLinecap="round" />
        <text x="120" y="155" textAnchor="middle" fill="#22c55e" fontSize="10">Right flap — no anomalies</text>
      </svg>
    ),
    pitot_tube: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        {/* Fuselage surface */}
        <rect x="0" y="90" width="240" height="70" fill="#d4d8de" />
        <rect x="0" y="84" width="240" height="8" fill="#b0b4ba" />
        {/* Pitot tube body */}
        <rect x="50" y="60" width="130" height="18" rx="4" fill="#8a9090" stroke="#6a7070" strokeWidth="1.5" />
        <ellipse cx="180" cy="69" rx="8" ry="9" fill="#7a8080" stroke="#5a6060" strokeWidth="1.5" />
        {/* Pitot mount */}
        <rect x="80" y="72" width="20" height="20" rx="3" fill="#707878" stroke="#5a6060" strokeWidth="1" />
        {/* RED COVER — installed */}
        <rect x="170" y="54" width="52" height="30" rx="6" fill="#cc1a1a" stroke="#ff3333" strokeWidth="2" />
        <rect x="172" y="56" width="48" height="26" rx="5" fill="#dd2222" />
        {/* "RBF" text on cover */}
        <text x="196" y="72" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">RBF</text>
        {/* Streamer */}
        <path d="M 218,70 Q 228,60 235,55 Q 238,45 230,48 Q 240,42 235,52 Q 228,56 220,68" fill="none" stroke="#ff4444" strokeWidth="2" strokeLinecap="round" />
        {/* Warning badge */}
        <circle cx="40" cy="60" r="14" fill="#cc1a1a" opacity="0.2" />
        <text x="40" y="65" textAnchor="middle" fill="#ef4444" fontSize="16" fontWeight="bold">!</text>
        <text x="120" y="150" textAnchor="middle" fill="#ef4444" fontSize="10">Pitot tube — cover still installed</text>
      </svg>
    ),
    static_port: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        <rect x="0" y="30" width="240" height="130" fill="#c8cdd4" />
        {/* Panel seams */}
        <line x1="0" y1="90" x2="240" y2="90" stroke="#a8adb4" strokeWidth="1" strokeDasharray="4,5" />
        <line x1="120" y1="30" x2="120" y2="160" stroke="#a8adb4" strokeWidth="1" strokeDasharray="4,5" />
        {/* Static ports — two ports */}
        <circle cx="85" cy="80" r="10" fill={bg} stroke="#8a9090" strokeWidth="2" />
        <circle cx="85" cy="80" r="6" fill="#0a0e14" />
        <circle cx="155" cy="80" r="10" fill={bg} stroke="#8a9090" strokeWidth="2" />
        <circle cx="155" cy="80" r="6" fill="#0a0e14" />
        {/* OK indicators */}
        <circle cx="85" cy="80" r="14" fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.6" />
        <circle cx="155" cy="80" r="14" fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.6" />
        <text x="120" y="150" textAnchor="middle" fill="#22c55e" fontSize="10">Static ports — clear and unobstructed</text>
      </svg>
    ),
    l_fuel_cap: (
      <svg viewBox="0 0 240 160" style={{ width: '100%', height: 160, display: 'block' }}>
        <rect width="240" height="160" fill={bg} />
        {/* Wing surface */}
        <ellipse cx="120" cy="90" rx="110" ry="55" fill="#c8cdd4" stroke="#a8adb4" strokeWidth="1.5" />
        {/* Wing panel lines */}
        {[60,120,180].map(x => <line key={x} x1={x} y1={45} x2={x} y2={135} stroke="#a8adb4" strokeWidth="0.7" strokeDasharray="3,4" />)}
        {/* Fuel cap collar */}
        <ellipse cx="120" cy="82" rx="30" ry="14" fill="#8a9090" stroke="#6a7070" strokeWidth="2" />
        <ellipse cx="120" cy="82" rx="22" ry="10" fill="#9aa0a0" stroke="#7a8080" strokeWidth="1.5" />
        {/* Cap handle/grip marks */}
        <ellipse cx="120" cy="82" rx="14" ry="7" fill="#a8b0b0" />
        {[-20,-10,0,10,20].map(dx => <line key={dx} x1={120+dx} y1={77} x2={120+dx} y2={87} stroke="#8a9090" strokeWidth="1.5" />)}
        {/* Seal ring */}
        <ellipse cx="120" cy="82" rx="28" ry="13" fill="none" stroke="#6a7070" strokeWidth="1" strokeDasharray="3,3" />
        <text x="120" y="150" textAnchor="middle" fill="#22c55e" fontSize="10">Fuel cap — seated and secure</text>
      </svg>
    ),
  };

  const el = svgs[zoneId];
  if (!el) {
    return (
      <div style={{ height: 160, background: panelBg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#4a5060', fontSize: 12 }}>Inspection area</span>
      </div>
    );
  }
  return <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>{el}</div>;
}

// ── S1: Photo-based Aircraft Exterior Inspection ───────────────────────────────
function S1Inspection({ onComplete }: { onComplete: (zones: Zone[], items: TaggedEvidence[]) => void }) {
  const [zones, setZones] = useState<Zone[]>(ZONES);
  const [openZoneId, setOpenZoneId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const inspected    = zones.filter(z => z.found);
  const defectsFound = zones.filter(z => z.found && z.severity !== 'ok');
  const openZone     = zones.find(z => z.id === openZoneId) ?? null;

  function handleHotspotClick(zone: Zone) {
    if (done) return;
    setOpenZoneId(zone.id);
    if (!zone.found) {
      setZones(prev => prev.map(z => z.id === zone.id ? { ...z, found: true } : z));
    }
  }

  function handleSubmit() {
    if (done || inspected.length < 6) return;
    setDone(true);
    const coverage   = inspected.length / zones.length;
    const defectRate = defectsFound.length / DEFECTS.length;
    const foundPitot   = defectsFound.some(z => z.id === 'pitot_tube');
    const foundOil     = defectsFound.some(z => z.id === 'l_engine');
    const foundLWingTip = defectsFound.some(z => z.id === 'l_wing_tip');
    const lateralCorrect = (foundOil ? 1 : 0) + (foundLWingTip ? 1 : 0);
    const items: TaggedEvidence[] = [
      ev('attention_to_detail', coverage * 0.7 + defectRate * 0.3, 0),
      ev('systematic_reasoning', coverage > 0.85 ? 0.75 : coverage > 0.6 ? 0.45 : 0.15, 0),
      ev('safety_mindset', foundPitot ? Math.min(1, defectRate * 0.7 + 0.25) : defectRate * 0.6, 0),
      ev('procedural_compliance', coverage > 0.8 ? 0.75 : coverage, 0),
      ev('spatial_reasoning', lateralCorrect === 2 ? 0.7 : lateralCorrect === 1 ? 0.4 : 0.2, 0),
    ];
    if (foundOil) items.push(ev('mechanical_reasoning', 0.5, 0));
    onComplete(zones, items);
  }

  const severityColor = (z: Zone) =>
    !z.found ? '#60a5fa' : z.severity === 'ok' ? C.green : z.severity === 'caution' ? C.amber : C.red;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        @keyframes hs-pulse-ring {
          0%,100% { transform: translate(-50%,-50%) scale(1); opacity: 0.8; }
          50%      { transform: translate(-50%,-50%) scale(1.7); opacity: 0; }
        }
        .hs-ring {
          position: absolute; width: 32px; height: 32px;
          border-radius: 50%; border: 2px solid #60a5fa;
          animation: hs-pulse-ring 2s ease-in-out infinite;
          pointer-events: none;
        }
        .hs-btn { transition: transform 0.12s; }
        .hs-btn:hover { transform: translate(-50%,-50%) scale(1.3) !important; }
      `}</style>

      <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: '10px 16px', color: '#86efac', fontSize: 13 }}>
        <strong>Scenario 1 — Aircraft Exterior Inspection</strong><br />
        You are the AME responsible for Aircraft 214 before it returns to service. Tap each inspection hotspot to conduct your walkaround. Close-up views appear below the main photo.
      </div>

      {/* ── Main hangar photo + hotspots ── */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        <img
          src="/images/ame-hangar.jpg"
          alt="Aircraft in maintenance hangar"
          style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 420 }}
          draggable={false}
        />
        {/* Light dim overlay when a zone panel is open */}
        {openZoneId && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', pointerEvents: 'none' }} />
        )}
        {/* Hotspot buttons */}
        {zones.map(zone => {
          const pos   = ZONE_HOTSPOTS[zone.id];
          if (!pos) return null;
          const color = severityColor(zone);
          const isOpen = openZoneId === zone.id;
          return (
            <div key={zone.id} style={{ position: 'absolute', left: pos.left, top: pos.top }}>
              {!zone.found && !done && (
                <div className="hs-ring" style={{ left: pos.left, top: pos.top, position: 'fixed', display: 'none' }} />
              )}
              {!zone.found && !done && (
                <div style={{
                  position: 'absolute', width: 40, height: 40, borderRadius: '50%',
                  border: '2px solid #60a5fa', opacity: 0,
                  animation: 'hs-pulse-ring 2s ease-in-out infinite',
                  transform: 'translate(-50%,-50%)', pointerEvents: 'none',
                }} />
              )}
              <button
                className="hs-btn"
                onClick={() => handleHotspotClick(zone)}
                title={zone.label}
                style={{
                  position: 'absolute',
                  transform: 'translate(-50%,-50%)',
                  width: 30, height: 30,
                  borderRadius: '50%',
                  background: isOpen ? 'white' : zone.found ? `${color}dd` : 'rgba(96,165,250,0.9)',
                  border: `2px solid ${isOpen ? 'white' : color}`,
                  boxShadow: isOpen ? '0 0 0 3px rgba(255,255,255,0.4), 0 2px 10px rgba(0,0,0,0.6)' : '0 1px 6px rgba(0,0,0,0.5)',
                  cursor: done ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isOpen ? '#0a0e14' : 'white',
                  fontSize: 12, fontWeight: 700, zIndex: isOpen ? 10 : 5,
                }}>
                {zone.found ? (zone.severity !== 'ok' ? '!' : '✓') : '+'}
              </button>
            </div>
          );
        })}
        {/* Progress badge */}
        <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ background: 'rgba(0,0,0,0.75)', borderRadius: 8, padding: '4px 10px', color: C.white, fontSize: 12, fontWeight: 600 }}>
            {inspected.length}/{zones.length} inspected
          </div>
          {defectsFound.length > 0 && (
            <div style={{ background: 'rgba(139,0,0,0.8)', borderRadius: 8, padding: '4px 10px', color: '#fca5a5', fontSize: 12, fontWeight: 600 }}>
              {defectsFound.length} finding{defectsFound.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        {/* Legend */}
        <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 8, background: 'rgba(0,0,0,0.65)', borderRadius: 8, padding: '5px 10px' }}>
          {[{ color: C.blue, label: 'Inspect' }, { color: C.green, label: 'OK' }, { color: C.amber, label: 'Caution' }, { color: C.red, label: 'Defect' }].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.grey }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Close-up panel (appears when zone selected) ── */}
      {openZone && (
        <div style={{
          background: openZone.severity === 'defect' ? '#14050a' : openZone.severity === 'caution' ? '#120e02' : C.bgCard,
          border: `1px solid ${openZone.severity === 'defect' ? '#4a0a14' : openZone.severity === 'caution' ? '#3a2a04' : C.border}`,
          borderRadius: 14, overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ color: C.grey, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Close-up Inspection</div>
              <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>{openZone.label}</div>
              {openZone.found && (
                <div style={{
                  background: openZone.severity === 'defect' ? '#2a0a0a' : openZone.severity === 'caution' ? '#2a1a00' : '#0a2a0a',
                  color: openZone.severity === 'defect' ? C.red : openZone.severity === 'caution' ? C.amber : C.green,
                  borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                }}>
                  {openZone.severity === 'ok' ? '✓ Clear' : openZone.severity === 'caution' ? '⚠ Caution' : '⚠ Defect'}
                </div>
              )}
            </div>
            <button onClick={() => setOpenZoneId(null)}
              style={{ background: 'none', border: 'none', color: C.grey, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>✕</button>
          </div>
          {/* Panel body: close-up visual + observation text */}
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {/* Close-up visual */}
            <div style={{ flex: '0 0 240px', minWidth: 200 }}>
              <ZoneCloseup zoneId={openZone.id} severity={openZone.severity} />
            </div>
            {/* Observation text */}
            <div style={{ flex: '1 1 200px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <div style={{ color: C.grey, fontSize: 12, lineHeight: 1.65 }}>
                {ZONE_OBSERVATIONS[openZone.id] ?? ''}
              </div>
              {openZone.found && openZone.severity !== 'ok' && (
                <div style={{ background: openZone.severity === 'defect' ? '#2a0808' : '#281c02', borderRadius: 8, padding: '8px 12px', marginTop: 4 }}>
                  <div style={{ color: openZone.severity === 'defect' ? C.red : C.amber, fontSize: 11, fontWeight: 700, marginBottom: 3 }}>
                    {openZone.severity === 'defect' ? '⚠ Defect — log this finding' : '⚠ Caution — note for monitoring'}
                  </div>
                  <div style={{ color: C.white, fontSize: 12 }}>{openZone.issue}</div>
                </div>
              )}
              {openZone.found && openZone.severity === 'ok' && (
                <div style={{ color: C.green, fontSize: 12, marginTop: 4 }}>✓ No anomalies at this location — continue walkaround</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Findings log ── */}
      {defectsFound.length > 0 && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ color: C.grey, fontSize: 11, marginBottom: 8, fontWeight: 600, letterSpacing: '0.06em' }}>FINDINGS LOG</div>
          {defectsFound.map(z => (
            <div key={z.id} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
              <span style={{ color: z.severity === 'defect' ? C.red : C.amber, fontSize: 11, flexShrink: 0, marginTop: 1 }}>●</span>
              <span style={{ color: C.white, fontSize: 12, lineHeight: 1.4 }}>{z.label}: <span style={{ color: C.grey }}>{z.issue}</span></span>
            </div>
          ))}
        </div>
      )}

      <button onClick={handleSubmit} disabled={done || inspected.length < 6}
        style={{ background: done || inspected.length < 6 ? '#2d1118' : `linear-gradient(135deg,${C.crimson},${C.crimsonD})`, color: done || inspected.length < 6 ? C.grey : 'white', border: 'none', borderRadius: 12, padding: '13px', cursor: done || inspected.length < 6 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
        {done ? 'Inspection Complete ✓' : inspected.length < 6 ? `Continue walkaround — ${inspected.length}/${zones.length} areas checked` : `Complete Inspection Report → (${inspected.length}/${zones.length} areas inspected)`}
      </button>
    </div>
  );
}

// ── S2: Maintenance Records ───────────────────────────────────────────────────
function S2Records({ foundDefectIds, onComplete }: { foundDefectIds: string[]; onComplete: (items: TaggedEvidence[]) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleOpen(id: string) {
    setOpenId(id === openId ? null : id);
    setReviewedIds(prev => new Set([...prev, id]));
  }

  function handleSubmit() {
    if (response.trim().length < 40) return;
    setSubmitted(true);
    const t = response.toLowerCase();

    const sawNavDiscrep   = hasConcept(t, CONCEPTS.navLightMention) && hasConcept(t, CONCEPTS.recordDiscrepancy);
    const sawOilDiscrep   = hasConcept(t, CONCEPTS.oilResidueFound) && hasConcept(t, CONCEPTS.recordDiscrepancy);
    const sawTyreDiscrep  = hasConcept(t, CONCEPTS.tyreMention) && hasConcept(t, CONCEPTS.recordDiscrepancy);
    const sawPitot        = hasConcept(t, CONCEPTS.pitotMention);
    const sawGenDiscrep   = hasConcept(t, CONCEPTS.recordDiscrepancy);

    const discrepCount = [sawNavDiscrep, sawOilDiscrep, sawTyreDiscrep].filter(Boolean).length;
    const coverageBonus = discrepCount >= 3 ? 0.2 : discrepCount >= 2 ? 0.1 : 0;

    const items: TaggedEvidence[] = [];
    if (sawGenDiscrep)                     items.push(ev('procedural_compliance', 0.6, 1));
    if (discrepCount >= 2)                 items.push(ev('procedural_compliance', 0.2, 1));
    if (sawNavDiscrep || sawOilDiscrep || sawTyreDiscrep)
                                           items.push(ev('attention_to_detail', 0.5 + coverageBonus, 1));
    if (discrepCount >= 2)                 items.push(ev('systematic_reasoning', 0.6, 1));
    if (discrepCount >= 3)                 items.push(ev('systematic_reasoning', 0.2, 1));
    if (sawPitot)                          items.push(ev('safety_mindset', 0.5, 1));
    if (reviewedIds.size < RECORDS.length) items.push(ev('systematic_reasoning', -0.2, 1));

    onComplete(items);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#0f1420', border: '1px solid #1a2a40', borderRadius: 12, padding: '10px 16px', color: '#93c5fd', fontSize: 13 }}>
        <strong>Scenario 2 — Maintenance Record Review</strong><br />
        Below are the three most recent maintenance records for this aircraft. Review each record and compare it against what you observed during your inspection.
      </div>

      {RECORDS.map(rec => {
        const isOpen = openId === rec.id;
        const reviewed = reviewedIds.has(rec.id);
        return (
          <div key={rec.id} style={{ background: C.bgCard, border: `1px solid ${reviewed ? C.border : C.blue + '55'}`, borderRadius: 12, overflow: 'hidden' }}>
            <button onClick={() => handleOpen(rec.id)} style={{ width: '100%', background: 'none', border: 'none', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: C.white }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{rec.system}</div>
                <div style={{ fontSize: 11, color: C.grey, marginTop: 2 }}>{rec.daysAgo} day{rec.daysAgo !== 1 ? 's' : ''} ago · {rec.techName}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: C.green, background: '#0f2a0f', border: '1px solid #1a4a1a', padding: '2px 8px', borderRadius: 6 }}>{rec.status}</span>
                <span style={{ color: C.grey, fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${C.border}` }}>
                <div style={{ color: C.grey, fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>{rec.description}</div>
              </div>
            )}
          </div>
        );
      })}

      {reviewedIds.size > 0 && !submitted && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
            Based on the records and your inspection findings, what do you notice?
          </label>
          <div style={{ color: C.grey, fontSize: 12 }}>
            Describe any discrepancies between what was recorded and what you observed. Be specific about which systems concern you.
          </div>
          <textarea
            value={response}
            onChange={e => setResponse(e.target.value)}
            rows={5}
            placeholder="e.g. The nav light record says the unit was replaced and released to service 3 days ago, but the lens I inspected appears cracked…"
            style={{ background: '#0f0a0b', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, color: C.white, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          <button onClick={handleSubmit} disabled={response.trim().length < 40}
            style={{ background: response.trim().length < 40 ? '#2d1118' : `linear-gradient(135deg,${C.crimson},${C.crimsonD})`, color: response.trim().length < 40 ? C.grey : 'white', border: 'none', borderRadius: 10, padding: '11px', cursor: response.trim().length < 40 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
            {response.trim().length < 40 ? `Continue — ${40 - response.trim().length} more characters` : 'Submit Record Analysis →'}
          </button>
        </div>
      )}

      {submitted && (
        <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: 14, color: '#86efac', fontSize: 13 }}>
          Record analysis submitted. Proceeding to mechanical investigation.
        </div>
      )}
    </div>
  );
}

// ── S3: Mechanical System Investigation ───────────────────────────────────────
function S3Mechanical({ foundDefectIds, onComplete }: { foundDefectIds: string[]; onComplete: (items: TaggedEvidence[]) => void }) {
  const [selectedNode, setSelectedNode] = useState<OilNode | null>(null);
  const [exploredIds, setExploredIds] = useState<Set<string>>(new Set());
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const foundOil = foundDefectIds.includes('l_engine');

  function handleNodeClick(node: OilNode) {
    setSelectedNode(node);
    setExploredIds(prev => new Set([...prev, node.id]));
  }

  function handleSubmit() {
    if (response.trim().length < 50) return;
    setSubmitted(true);
    const t = response.toLowerCase();

    const identifiedCause   = hasConcept(t, CONCEPTS.oilSystemCause);
    const proposedNextStep  = hasConcept(t, CONCEPTS.oilNextStep);
    const referencesSafety  = hasConcept(t, CONCEPTS.safetyGround);

    const systemCoverage = exploredIds.size / OIL_NODES.length;
    const items: TaggedEvidence[] = [
      ev('systematic_reasoning', systemCoverage > 0.7 ? 0.7 : systemCoverage > 0.4 ? 0.45 : 0.2, 2),
    ];
    if (identifiedCause)  items.push(ev('mechanical_reasoning', 0.75, 2));
    if (proposedNextStep) items.push(ev('mechanical_reasoning', 0.3, 2));
    if (proposedNextStep) items.push(ev('systematic_reasoning', 0.2, 2));
    if (referencesSafety) items.push(ev('safety_mindset', 0.5, 2));
    if (!identifiedCause) items.push(ev('mechanical_reasoning', 0.2, 2));

    onComplete(items);
  }

  // SVG layout: nodes connected by lines
  const connections: [string, string][] = [
    ['reservoir', 'filter'], ['filter', 'pump'], ['pump', 'dist'],
    ['dist', 'engine'], ['engine', 'return'], ['return', 'reservoir'],
  ];
  const nodeMap: Record<string, OilNode> = Object.fromEntries(OIL_NODES.map(n => [n.id, n]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#1a0d00', border: '1px solid #3d2a00', borderRadius: 12, padding: '10px 16px', color: '#fcd34d', fontSize: 13 }}>
        <strong>Scenario 3 — Mechanical System Investigation</strong><br />
        {foundOil
          ? 'Your inspection found oil residue on the engine cowling. The maintenance record shows no anomalies. Explore the lubrication system below to investigate.'
          : 'Explore the engine lubrication system. Understanding how oil flows through the system will help you identify potential sources of contamination.'}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* SVG diagram */}
        <div style={{ background: '#050a14', border: `1px solid ${C.border}`, borderRadius: 16, padding: 8, flexShrink: 0 }}>
          <svg width={380} height={320} viewBox="0 0 380 320">
            {connections.map(([aId, bId]) => {
              const a = nodeMap[aId], b = nodeMap[bId];
              return <line key={`${aId}-${bId}`} x1={a.x + 40} y1={a.y + 18} x2={b.x + 40} y2={b.y + 18} stroke="#2d4a6a" strokeWidth={2} strokeDasharray="4 3" />;
            })}
            {OIL_NODES.map(node => {
              const explored = exploredIds.has(node.id);
              const isSelected = selectedNode?.id === node.id;
              return (
                <g key={node.id} onClick={() => handleNodeClick(node)} style={{ cursor: 'pointer' }}>
                  <rect x={node.x} y={node.y} width={80} height={36} rx={8}
                    fill={isSelected ? '#1a2a3a' : explored ? '#0f1820' : '#0a1018'}
                    stroke={isSelected ? C.amber : explored ? '#2d6a8a' : '#2d4a6a'}
                    strokeWidth={isSelected ? 2 : 1.5} />
                  <text x={node.x + 40} y={node.y + 15} textAnchor="middle" fill={C.white} fontSize={10} fontWeight="600">{node.label.split(' ').slice(0, 2).join(' ')}</text>
                  <text x={node.x + 40} y={node.y + 28} textAnchor="middle" fill={C.grey} fontSize={9}>{node.label.split(' ').slice(2).join(' ')}</text>
                  {!explored && (
                    <circle cx={node.x + 72} cy={node.y + 8} r={5} fill={C.blue} opacity={0.7}>
                      <animate attributeName="opacity" values="0.7;0.3;0.7" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {explored && <text x={node.x + 72} y={node.y + 13} textAnchor="middle" fill={C.green} fontSize={10}>✓</text>}
                </g>
              );
            })}
            <text x={190} y={310} textAnchor="middle" fill={C.grey} fontSize={11}>Tap each component to inspect it</text>
          </svg>
        </div>

        {/* Detail panel */}
        <div style={{ flex: 1, minWidth: 200 }}>
          {selectedNode ? (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ color: C.amber, fontSize: 12, marginBottom: 4 }}>Inspection Detail</div>
              <div style={{ color: C.white, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{selectedNode.label}</div>
              <div style={{ color: C.grey, fontSize: 13, lineHeight: 1.6 }}>{selectedNode.detail}</div>
            </div>
          ) : (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ color: C.grey, fontSize: 13 }}>Select a component to inspect it.</div>
              <div style={{ color: C.grey, fontSize: 11, marginTop: 8 }}>Explored: {exploredIds.size}/{OIL_NODES.length}</div>
            </div>
          )}
          {exploredIds.size >= 3 && !submitted && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
                What is the most likely cause of the oil residue, and what would you do next?
              </label>
              <textarea
                value={response}
                onChange={e => setResponse(e.target.value)}
                rows={4}
                placeholder="e.g. Based on the residue trace near the pump output fitting and the distribution line connection, I suspect a loose fitting or worn O-ring. I would pressure-test the oil system before any further flight…"
                style={{ background: '#0f0a0b', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, color: C.white, fontSize: 12, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              <button onClick={handleSubmit} disabled={response.trim().length < 50}
                style={{ background: response.trim().length < 50 ? '#2d1118' : `linear-gradient(135deg,${C.crimson},${C.crimsonD})`, color: response.trim().length < 50 ? C.grey : 'white', border: 'none', borderRadius: 10, padding: '11px', cursor: response.trim().length < 50 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
                {response.trim().length < 50 ? `Continue — ${50 - response.trim().length} more characters` : 'Submit Mechanical Assessment →'}
              </button>
            </div>
          )}
        </div>
      </div>

      {submitted && (
        <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: 14, color: '#86efac', fontSize: 13 }}>
          Assessment submitted. Proceeding to handover.
        </div>
      )}
    </div>
  );
}

// ── Logbook entry type ────────────────────────────────────────────────────────
interface LogbookEntry {
  activityType: string;
  observations: string;
  infoReviewed: string;
  outstandingConcerns: string;
  recommendedNextSteps: string;
  supervisorClarification: string;
}

const EMPTY_LOGBOOK: LogbookEntry = {
  activityType: '', observations: '', infoReviewed: '',
  outstandingConcerns: '', recommendedNextSteps: '', supervisorClarification: '',
};

// ── S4: Digital Maintenance Logbook + Supervisor Handover ────────────────────
function S4Handover({ foundDefectIds, onComplete }: {
  foundDefectIds: string[];
  onComplete: (items: TaggedEvidence[], logbook: LogbookEntry) => void;
}) {
  const [phase, setPhase] = useState<'logbook' | 'review' | 'handover' | 'done'>('logbook');
  const [logbook, setLogbook] = useState<LogbookEntry>(EMPTY_LOGBOOK);
  const [showRef, setShowRef] = useState(false);
  const [supervisorResponse, setSupervisorResponse] = useState('');

  const foundDefects = ZONES.filter(z => foundDefectIds.includes(z.id));
  const foundIssues  = ZONES.filter(z => foundDefectIds.includes(z.id) && z.severity !== 'ok');

  function updateField(field: keyof LogbookEntry, val: string) {
    setLogbook(prev => ({ ...prev, [field]: val }));
  }

  const logbookComplete = [
    logbook.observations, logbook.outstandingConcerns, logbook.recommendedNextSteps,
  ].every(f => f.trim().length >= 20);

  function handleLogbookSubmit() {
    if (!logbookComplete) return;
    setPhase('review');
  }

  function handleConfirmAndHandover() {
    setPhase('handover');
  }

  function handleFinalSubmit() {
    if (supervisorResponse.trim().length < 30) return;
    setPhase('done');

    const lb = logbook;
    const lt = (lb.observations + ' ' + lb.outstandingConcerns + ' ' + lb.recommendedNextSteps + ' ' + lb.supervisorClarification).toLowerCase();
    const st = supervisorResponse.toLowerCase();

    // How many distinct findings appear in their documentation
    const docFindings = [
      hasConcept(lt, CONCEPTS.navLightMention),
      hasConcept(lt, CONCEPTS.oilResidueFound) || hasConcept(lt, CONCEPTS.oilSystemCause),
      hasConcept(lt, CONCEPTS.tyreMention),
      hasConcept(lt, CONCEPTS.pitotMention),
    ].filter(Boolean).length;

    const docOutstanding   = hasConcept(lt, CONCEPTS.handoverComplete) || hasConcept(lt, CONCEPTS.safetyGround);
    const docNextSteps     = hasConcept(lt, CONCEPTS.oilNextStep);
    const docSafety        = hasConcept(lt, CONCEPTS.safetyGround);
    const docRegulatory    = hasConcept(lt, CONCEPTS.regulatoryRef);

    // Supervisor handover quality
    const handoverMentionsFindings = hasConcept(st, CONCEPTS.navLightMention) || hasConcept(st, CONCEPTS.oilResidueFound) || hasConcept(st, CONCEPTS.tyreMention) || hasConcept(st, CONCEPTS.pitotMention);
    const handoverConsistent  = docFindings >= 2 && handoverMentionsFindings;
    const handoverSafety      = hasConcept(st, CONCEPTS.safetyGround);
    const handoverOutstanding = hasConcept(st, CONCEPTS.handoverComplete);

    // Distinguishes confirmed from assumed (uses hedging language)
    const distinguishesUncertainty = /appear|suggest|possibl|may|might|indicat|further|not.{0,10}confirm/i.test(lt);

    // Mechanical reasoning — root cause analysis for oil system
    const docRootCause   = hasConcept(lt, CONCEPTS.oilSystemCause);
    const docMechNextStep = hasConcept(lt, CONCEPTS.oilNextStep);

    // Decision quality — grounds vs releases aircraft
    const recommendsGround   = hasConcept(lt, CONCEPTS.safetyGround) || hasConcept(st, CONCEPTS.safetyGround);
    const recommendsRelease  = /return.{0,10}service|clear.{0,10}flight|airworthy.{0,10}for/i.test(lt + ' ' + st);

    const items: TaggedEvidence[] = [];

    // Documentation completeness → AP
    if (docFindings >= 3) items.push(ev('attention_to_detail', 0.8, 3));
    else if (docFindings >= 2) items.push(ev('attention_to_detail', 0.5, 3));
    else if (docFindings >= 1) items.push(ev('attention_to_detail', 0.3, 3));

    // Systematic documentation → PS
    if (docOutstanding)           items.push(ev('systematic_reasoning', 0.6, 3));
    if (docNextSteps)             items.push(ev('systematic_reasoning', 0.4, 3));
    if (distinguishesUncertainty) items.push(ev('systematic_reasoning', 0.3, 3));

    // Safety documentation → SO
    if (docSafety)        items.push(ev('safety_mindset', 0.65, 3));
    if (handoverSafety)   items.push(ev('safety_mindset', 0.4, 3));

    // Regulatory references → PR
    if (docRegulatory)    items.push(ev('procedural_compliance', 0.5, 3));

    // Root cause analysis for oil system → MR
    if (docRootCause)     items.push(ev('mechanical_reasoning', 0.55, 3));
    if (docMechNextStep)  items.push(ev('mechanical_reasoning', 0.35, 3));

    // Decision quality — correctly withholds release vs. unsafe release → DM
    if (recommendsGround && !recommendsRelease) items.push(ev('decision_quality', 0.7, 3));
    else if (!recommendsGround && !recommendsRelease) items.push(ev('decision_quality', 0.2, 3));
    else if (recommendsRelease) items.push(ev('decision_quality', -0.3, 3));

    // Handover communication quality → CM
    if (handoverConsistent)  items.push(ev('communication_quality', 0.5, 3));
    else if (docFindings >= 2) items.push(ev('communication_quality', 0.3, 3));
    if (handoverOutstanding) items.push(ev('communication_quality', 0.3, 3));

    onComplete(items, logbook);
  }

  const LOGBOOK_FIELDS: { key: keyof LogbookEntry; label: string; hint: string; rows: number; required: boolean }[] = [
    { key: 'activityType',          label: 'Inspection / Investigation Activity', hint: 'Describe the type of activity performed.', rows: 2, required: false },
    { key: 'observations',          label: 'Observations and Findings',           hint: 'What did you observe? Describe each finding. Distinguish confirmed observations from items that require further investigation.', rows: 5, required: true },
    { key: 'infoReviewed',          label: 'Relevant Information Reviewed',       hint: 'What records, documents or system information did you consult?', rows: 3, required: false },
    { key: 'outstandingConcerns',   label: 'Outstanding Concerns',                hint: 'List any concerns that remain unresolved and the reason they are open.', rows: 4, required: true },
    { key: 'recommendedNextSteps',  label: 'Recommended Next Steps',              hint: 'What actions would you recommend before this aircraft returns to service?', rows: 3, required: true },
    { key: 'supervisorClarification', label: 'Supervisor Review or Clarification Required', hint: 'Are there any items you would flag to a supervisor or that require a decision beyond your current authority?', rows: 3, required: false },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#1a0a14', border: '1px solid #3d1040', borderRadius: 12, padding: '10px 16px', color: '#d8b4fe', fontSize: 13 }}>
        <strong>Scenario 4 — Maintenance Logbook and Supervisor Handover</strong><br />
        Complete the digital maintenance logbook for Aircraft 214 based on your investigation. Once submitted, you will present your findings to the AME supervisor.
      </div>

      {/* Reference panel — collapsible */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <button onClick={() => setShowRef(v => !v)}
          style={{ width: '100%', background: 'none', border: 'none', padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: C.white }}>
          <span style={{ fontSize: 12, color: C.grey }}>Reference — Your Investigation Findings (tap to expand)</span>
          <span style={{ color: C.grey, fontSize: 13 }}>{showRef ? '▲' : '▼'}</span>
        </button>
        {showRef && (
          <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              <div>
                <div style={{ color: C.grey, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>INSPECTION FINDINGS — AIRCRAFT 214</div>
                {foundIssues.length === 0
                  ? <div style={{ color: C.grey, fontSize: 12 }}>No defects recorded during inspection.</div>
                  : foundIssues.map(z => (
                    <div key={z.id} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                      <span style={{ color: z.severity === 'defect' ? C.red : C.amber, fontSize: 11, flexShrink: 0 }}>●</span>
                      <span style={{ color: C.white, fontSize: 12 }}><strong>{z.label}:</strong> {z.issue}</span>
                    </div>
                  ))}
              </div>
              <div>
                <div style={{ color: C.grey, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>MAINTENANCE RECORDS REVIEWED</div>
                {RECORDS.map(r => (
                  <div key={r.id} style={{ marginBottom: 6 }}>
                    <div style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>{r.system}</div>
                    <div style={{ color: C.grey, fontSize: 11 }}>{r.daysAgo} days ago · {r.techName} · {r.status}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ color: C.grey, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>OIL SYSTEM INVESTIGATION</div>
                <div style={{ color: C.white, fontSize: 12 }}>Oil residue noted at pump output fitting and distribution line firewall connection. Return line and reservoir: no external residue. Source not confirmed.</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {phase === 'logbook' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Aircraft ID — display only */}
          <div style={{ background: '#0f1020', border: `1px solid #1a2a4a`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ color: C.grey, fontSize: 11, marginBottom: 2 }}>Aircraft Identification</div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>Regional Aircraft 214</div>
            <div style={{ color: C.grey, fontSize: 11 }}>Date: {new Date().toISOString().slice(0, 10)}</div>
          </div>

          {LOGBOOK_FIELDS.map(f => (
            <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
                {f.label}{f.required && <span style={{ color: C.red, marginLeft: 4 }}>*</span>}
              </label>
              <div style={{ color: C.grey, fontSize: 12 }}>{f.hint}</div>
              <textarea
                value={logbook[f.key]}
                onChange={e => updateField(f.key, e.target.value)}
                rows={f.rows}
                placeholder=""
                style={{ background: '#0f0a0b', border: `1px solid ${logbook[f.key].trim().length > 0 ? '#2d4a6a' : C.border}`, borderRadius: 10, padding: 10, color: C.white, fontSize: 12, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
              />
            </div>
          ))}

          <div style={{ color: C.grey, fontSize: 12 }}>Fields marked <span style={{ color: C.red }}>*</span> require at least one sentence to proceed.</div>
          <button onClick={handleLogbookSubmit} disabled={!logbookComplete}
            style={{ background: !logbookComplete ? '#2d1118' : `linear-gradient(135deg,${C.crimson},${C.crimsonD})`, color: !logbookComplete ? C.grey : 'white', border: 'none', borderRadius: 10, padding: '12px', cursor: !logbookComplete ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
            {!logbookComplete ? 'Complete required fields to continue' : 'Review Logbook Entry →'}
          </button>
        </div>
      )}

      {phase === 'review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>Review Your Logbook Entry</div>
          <div style={{ color: C.grey, fontSize: 12 }}>Review and revise any field before submitting for supervisor review.</div>

          {LOGBOOK_FIELDS.map(f => logbook[f.key].trim() ? (
            <div key={f.key} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ color: C.grey, fontSize: 11, marginBottom: 4 }}>{f.label}</div>
              <textarea
                value={logbook[f.key]}
                onChange={e => updateField(f.key, e.target.value)}
                rows={Math.min(f.rows + 1, 6)}
                style={{ width: '100%', background: 'transparent', border: 'none', color: C.white, fontSize: 12, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none', padding: 0 }}
              />
            </div>
          ) : null)}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setPhase('logbook')}
              style={{ background: C.bgCard, color: C.grey, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              ← Back to Edit
            </button>
            <button onClick={handleConfirmAndHandover}
              style={{ background: `linear-gradient(135deg,${C.crimson},${C.crimsonD})`, color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13, flex: 1 }}>
              Submit for Supervisor Review →
            </button>
          </div>
        </div>
      )}

      {phase === 'handover' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ color: C.grey, fontSize: 11, marginBottom: 4 }}>Logbook submitted — Aircraft 214 · {new Date().toISOString().slice(0, 10)}</div>
            <div style={{ color: C.green, fontSize: 12 }}>✓ Entry recorded</div>
          </div>

          <div style={{ background: '#1a1400', border: '1px solid #3a3000', borderRadius: 12, padding: 14 }}>
            <div style={{ color: C.amber, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>AME Supervisor</div>
            <div style={{ color: C.white, fontSize: 13, lineHeight: 1.6 }}>
              "I've reviewed your logbook entry. Please walk me through it — what did you observe, what remains unresolved, and what would you recommend investigating next?"
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>Your response</label>
            <textarea
              value={supervisorResponse}
              onChange={e => setSupervisorResponse(e.target.value)}
              rows={6}
              placeholder="Walk the supervisor through your findings, what remains open, and your recommended next steps…"
              style={{ background: '#0f0a0b', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, color: C.white, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            <button onClick={handleFinalSubmit} disabled={supervisorResponse.trim().length < 30}
              style={{ background: supervisorResponse.trim().length < 30 ? '#2d1118' : `linear-gradient(135deg,${C.crimson},${C.crimsonD})`, color: supervisorResponse.trim().length < 30 ? C.grey : 'white', border: 'none', borderRadius: 10, padding: '11px', cursor: supervisorResponse.trim().length < 30 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
              {supervisorResponse.trim().length < 30 ? `Continue — ${30 - supervisorResponse.trim().length} more characters` : 'Submit Handover →'}
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: 14, color: '#86efac', fontSize: 13 }}>
          Handover complete. Proceeding to maintenance priorities.
        </div>
      )}
    </div>
  );
}

// ── S5: Maintenance Priorities (with logbook access) ──────────────────────────
function S5Priorities({ logbook, onComplete }: { logbook: LogbookEntry; onComplete: (items: TaggedEvidence[]) => void }) {
  const [order, setOrder] = useState<string[]>([]);
  const [priorityDone, setPriorityDone] = useState(false);
  const [pressureResponse, setPressureResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showLogbook, setShowLogbook] = useState(false);
  const [suppNote, setSuppNote] = useState('');
  const [showSuppNote, setShowSuppNote] = useState(false);
  const [suppSaved, setSuppSaved] = useState(false);

  function toggleItem(id: string) {
    if (priorityDone) return;
    setOrder(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handlePrioritySubmit() {
    if (order.length < 3) return;
    setPriorityDone(true);
  }

  function handleFinalSubmit() {
    if (pressureResponse.trim().length < 30) return;
    setSubmitted(true);
    const pt = pressureResponse.toLowerCase();

    const safetyFirst        = hasConcept(pt, CONCEPTS.prioritySafety);
    const resists            = hasConcept(pt, CONCEPTS.resistPressure);
    const citesRegul         = hasConcept(pt, CONCEPTS.regulatoryRef);
    const consultedLogbook   = showLogbook;
    const addedSuppNote      = suppSaved && suppNote.trim().length > 10;

    const oilIdx   = order.indexOf('oil');
    const navIdx   = order.indexOf('nav');
    const tyreIdx  = order.indexOf('tyre');
    const adminIdx = order.indexOf('admin');
    const safetyBeforeAdmin  = [oilIdx, navIdx, tyreIdx].every(i => i === -1 || adminIdx === -1 || i < adminIdx);

    const items: TaggedEvidence[] = [
      ev('systematic_reasoning', order.length >= 4 ? 0.65 : order.length >= 3 ? 0.45 : 0.2, 4),
    ];
    if (safetyBeforeAdmin)  items.push(ev('safety_mindset', 0.55, 4));
    if (safetyFirst)        items.push(ev('safety_mindset', 0.45, 4));
    if (resists)            items.push(ev('safety_mindset', 0.4, 4));
    if (resists)            items.push(ev('procedural_compliance', 0.5, 4));
    if (citesRegul)         items.push(ev('procedural_compliance', 0.3, 4));
    if (safetyFirst || resists) items.push(ev('communication_quality', 0.4, 4));
    if (addedSuppNote)      items.push(ev('procedural_compliance', 0.3, 4));

    onComplete(items);
  }

  const priorityMap: Record<string, PriorityItem> = Object.fromEntries(PRIORITY_ITEMS.map(p => [p.id, p]));
  const LOGBOOK_DISPLAY_FIELDS: { key: keyof LogbookEntry; label: string }[] = [
    { key: 'observations',          label: 'Observations and Findings' },
    { key: 'outstandingConcerns',   label: 'Outstanding Concerns' },
    { key: 'recommendedNextSteps',  label: 'Recommended Next Steps' },
    { key: 'supervisorClarification', label: 'Supervisor Clarification Required' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#0a1a0a', border: '1px solid #1a4a1a', borderRadius: 12, padding: '10px 16px', color: '#86efac', fontSize: 13 }}>
        <strong>Scenario 5 — Maintenance Priorities and Operational Pressure</strong><br />
        Your logbook is available for reference. Four items require attention. Rank them by priority, then respond to an operational question.
      </div>

      {/* Logbook reference panel */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <button onClick={() => setShowLogbook(v => !v)}
          style={{ width: '100%', background: 'none', border: 'none', padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: C.white }}>
          <span style={{ fontSize: 12 }}>📋 Your Maintenance Logbook — Aircraft 214 (tap to open)</span>
          <span style={{ color: C.grey, fontSize: 13 }}>{showLogbook ? '▲' : '▼'}</span>
        </button>
        {showLogbook && (
          <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ color: C.grey, fontSize: 11, margin: '10px 0 8px', fontWeight: 600 }}>AIRCRAFT MAINTENANCE LOGBOOK — REGIONAL AIRCRAFT 214</div>
            {LOGBOOK_DISPLAY_FIELDS.map(f => logbook[f.key].trim() ? (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <div style={{ color: C.grey, fontSize: 11, marginBottom: 3 }}>{f.label}</div>
                <div style={{ color: C.white, fontSize: 12, lineHeight: 1.6, background: '#0f0a0b', padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.border}` }}>{logbook[f.key]}</div>
              </div>
            ) : null)}

            {/* Supplementary note */}
            {!showSuppNote && !suppSaved && (
              <button onClick={() => setShowSuppNote(true)}
                style={{ background: 'none', border: `1px dashed ${C.border}`, borderRadius: 8, padding: '7px 12px', color: C.grey, cursor: 'pointer', fontSize: 12, marginTop: 4 }}>
                + Add Supplementary Note
              </button>
            )}
            {showSuppNote && !suppSaved && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ color: C.grey, fontSize: 11 }}>Supplementary Note — {new Date().toISOString().slice(0, 10)} (supplements original entry)</div>
                <textarea
                  value={suppNote}
                  onChange={e => setSuppNote(e.target.value)}
                  rows={3}
                  placeholder="Add a clearly identified supplementary note — this will not overwrite your original entry."
                  style={{ background: '#0f0a0b', border: `1px solid #2d4a6a`, borderRadius: 8, padding: 8, color: C.white, fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setSuppSaved(true); setShowSuppNote(false); }}
                    disabled={suppNote.trim().length < 10}
                    style={{ background: suppNote.trim().length < 10 ? '#2d1118' : `linear-gradient(135deg,${C.crimson},${C.crimsonD})`, color: suppNote.trim().length < 10 ? C.grey : 'white', border: 'none', borderRadius: 7, padding: '7px 14px', cursor: suppNote.trim().length < 10 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12 }}>
                    Save Note
                  </button>
                  <button onClick={() => setShowSuppNote(false)}
                    style={{ background: C.bgCard, color: C.grey, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontSize: 12 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {suppSaved && (
              <div style={{ marginTop: 8, background: '#0a140a', border: '1px solid #1a3a1a', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ color: C.green, fontSize: 11, marginBottom: 3 }}>Supplementary Note — {new Date().toISOString().slice(0, 10)}</div>
                <div style={{ color: C.white, fontSize: 12, lineHeight: 1.5 }}>{suppNote}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {!priorityDone && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PRIORITY_ITEMS.map(item => {
              const rankIdx = order.indexOf(item.id);
              const isSelected = rankIdx !== -1;
              return (
                <button key={item.id} onClick={() => toggleItem(item.id)}
                  style={{ background: isSelected ? (item.category === 'safety' ? '#1a0a0a' : '#0a0a1a') : C.bgCard, border: `1px solid ${isSelected ? (item.category === 'safety' ? C.red : C.blue) : C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: isSelected ? (item.category === 'safety' ? C.red : C.blue) : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white', fontSize: 13, fontWeight: 700 }}>
                    {isSelected ? rankIdx + 1 : ''}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{item.title}</div>
                    <div style={{ color: C.grey, fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>{item.description}</div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: item.category === 'safety' ? C.red : C.grey, background: item.category === 'safety' ? '#2a0505' : '#1a1a2a', border: `1px solid ${item.category === 'safety' ? '#5a0505' : '#2a2a4a'}`, padding: '1px 7px', borderRadius: 4 }}>
                        {item.category === 'safety' ? 'Safety / Airworthiness' : 'Administrative'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ color: C.grey, fontSize: 12 }}>Tap to rank in priority order. Tap again to remove. Select at least 3.</div>
          <button onClick={handlePrioritySubmit} disabled={order.length < 3}
            style={{ background: order.length < 3 ? '#2d1118' : `linear-gradient(135deg,${C.crimson},${C.crimsonD})`, color: order.length < 3 ? C.grey : 'white', border: 'none', borderRadius: 10, padding: '11px', cursor: order.length < 3 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
            {order.length < 3 ? `Select at least 3 items (${order.length} selected)` : 'Confirm Priority Order →'}
          </button>
        </>
      )}

      {priorityDone && !submitted && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ color: C.grey, fontSize: 11, marginBottom: 6 }}>Your Priority Order</div>
            {order.map((id, i) => (
              <div key={id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 5 }}>
                <span style={{ color: C.white, fontSize: 12, fontWeight: 700, width: 16 }}>{i + 1}.</span>
                <span style={{ color: C.white, fontSize: 12 }}>{priorityMap[id]?.title}</span>
              </div>
            ))}
          </div>

          <div style={{ background: '#1a1400', border: '1px solid #3a3000', borderRadius: 12, padding: 14 }}>
            <div style={{ color: C.amber, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>— Operations Coordinator</div>
            <div style={{ color: C.white, fontSize: 13, lineHeight: 1.6 }}>
              "I understand there are items outstanding on Aircraft 214. The client for the charter flight has already arrived. Can we push through the paperwork and get the aircraft released in the next two hours? The pilot is ready."
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>Your response</label>
            <textarea
              value={pressureResponse}
              onChange={e => setPressureResponse(e.target.value)}
              rows={5}
              placeholder="How do you respond to the operations coordinator?"
              style={{ background: '#0f0a0b', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, color: C.white, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            <button onClick={handleFinalSubmit} disabled={pressureResponse.trim().length < 30}
              style={{ background: pressureResponse.trim().length < 30 ? '#2d1118' : `linear-gradient(135deg,${C.crimson},${C.crimsonD})`, color: pressureResponse.trim().length < 30 ? C.grey : 'white', border: 'none', borderRadius: 10, padding: '11px', cursor: pressureResponse.trim().length < 30 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
              {pressureResponse.trim().length < 30 ? `Continue — ${30 - pressureResponse.trim().length} more characters` : 'Complete Mission 2 →'}
            </button>
          </div>
        </div>
      )}

      {submitted && (
        <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: 16, textAlign: 'center', color: '#86efac', fontWeight: 700, fontSize: 14 }}>
          Mission 2 Complete ✓
        </div>
      )}
    </div>
  );
}
