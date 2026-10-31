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

// ── S1: Aircraft Exterior Inspection ─────────────────────────────────────────
function S1Inspection({ onComplete }: { onComplete: (zones: Zone[], items: TaggedEvidence[]) => void }) {
  const [zones, setZones] = useState<Zone[]>(ZONES);
  const [selected, setSelected] = useState<Zone | null>(null);
  const [done, setDone] = useState(false);

  const inspected = zones.filter(z => z.found);
  const defectsFound = zones.filter(z => z.found && z.severity !== 'ok');

  const handleClick = useCallback((zone: Zone) => {
    if (done) return;
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, found: true } : z));
    setSelected({ ...zone, found: true });
  }, [done]);

  function handleSubmit() {
    setDone(true);
    const coverage = inspected.length / zones.length;
    const defectRate = defectsFound.length / DEFECTS.length;
    const foundPitot = defectsFound.some(z => z.id === 'pitot_tube');
    const foundOil   = defectsFound.some(z => z.id === 'l_engine');
    const items: TaggedEvidence[] = [
      ev('attention_to_detail', coverage * 0.7 + defectRate * 0.3, 0),
      ev('systematic_reasoning', coverage > 0.85 ? 0.75 : coverage > 0.6 ? 0.45 : 0.15, 0),
      ev('safety_mindset', foundPitot ? Math.min(1, defectRate * 0.7 + 0.25) : defectRate * 0.6, 0),
      ev('procedural_compliance', coverage > 0.8 ? 0.75 : coverage, 0),
    ];
    if (foundOil) items.push(ev('mechanical_reasoning', 0.5, 0));
    onComplete(zones, items);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: '10px 16px', color: '#86efac', fontSize: 13 }}>
        <strong>Scenario 1 — Aircraft Exterior Inspection</strong><br />
        You are the AME responsible for this aircraft before it returns to service. Tap each zone to conduct your inspection. Document all findings — nothing should leave here unexamined.
      </div>
      <style>{`@keyframes inspPulse{0%,100%{opacity:0.6}50%{opacity:1}} .insp-z:hover circle{filter:brightness(1.4)}`}</style>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flexShrink: 0 }}>
          <svg width={420} height={260} viewBox="0 0 420 260"
            style={{ background: 'linear-gradient(160deg,#050a14 0%,#0a1020 100%)', borderRadius: 16, border: `1px solid ${C.border}`, display: 'block' }}>
            <ellipse cx={210} cy={242} rx={160} ry={10} fill="#000" opacity={0.4} />
            <ellipse cx={210} cy={128} rx={148} ry={24} fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1.5} />
            <ellipse cx={210} cy={122} rx={140} ry={8} fill="#2a3f58" opacity={0.4} />
            <path d="M 62,128 Q 48,128 44,128 Q 48,116 62,116 Z" fill="#2d4a6a" />
            <ellipse cx={66} cy={128} rx={28} ry={14} fill="#253646" stroke="#2d4a6a" strokeWidth={1} />
            <path d="M 316,128 L 348,80 L 355,80 L 355,128 Z" fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1} />
            <polygon points="318,128 365,108 360,118 330,128" fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1} />
            <polygon points="318,128 365,148 360,138 330,128" fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1} />
            <polygon points="185,128 272,210 252,210 205,128" fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1.5} />
            <polygon points="185,128 272,46 252,46 205,128" fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1.5} />
            <polygon points="228,128 268,190 258,194 218,132" fill="#172230" stroke="#2d4a6a" strokeWidth={0.8} />
            <polygon points="228,128 268,66 258,62 218,124" fill="#172230" stroke="#2d4a6a" strokeWidth={0.8} />
            <ellipse cx={158} cy={164} rx={26} ry={12} fill="#253646" stroke="#2d4a6a" strokeWidth={1.5} />
            <ellipse cx={158} cy={92}  rx={26} ry={12} fill="#253646" stroke="#2d4a6a" strokeWidth={1.5} />
            <rect x={96} y={140} width={5} height={22} fill="#374151" />
            <rect x={90} y={160} width={16} height={5} rx={2} fill="#4b5563" />
            <ellipse cx={98} cy={164} rx={8} ry={5} fill="#1f2937" stroke="#374151" strokeWidth={1} />
            <rect x={192} y={182} width={5} height={20} fill="#374151" />
            <ellipse cx={194} cy={202} rx={9} ry={5} fill="#1f2937" stroke="#374151" strokeWidth={1} />
            <rect x={192} y={58} width={5} height={20} fill="#374151" />
            <ellipse cx={194} cy={58} rx={9} ry={5} fill="#1f2937" stroke="#374151" strokeWidth={1} />
            {zones.map(zone => {
              const color = !zone.found ? C.blue : zone.severity === 'ok' ? C.green : zone.severity === 'caution' ? C.amber : C.red;
              return (
                <g key={zone.id} className="insp-z" onClick={() => handleClick(zone)} style={{ cursor: done ? 'default' : 'pointer' }}>
                  {!zone.found && !done && (
                    <circle cx={zone.x} cy={zone.y} r={zone.r + 4} fill="none" stroke={C.blue} strokeWidth={1.5} opacity={0.4}>
                      <animate attributeName="r" values={`${zone.r+2};${zone.r+8};${zone.r+2}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {zone.found && zone.severity !== 'ok' && (
                    <circle cx={zone.x} cy={zone.y} r={zone.r + 6} fill={color} opacity={0.15}>
                      <animate attributeName="opacity" values="0.15;0.3;0.15" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle cx={zone.x} cy={zone.y} r={zone.r} fill={color} fillOpacity={zone.found ? 0.25 : 0.15} stroke={color} strokeWidth={zone.found ? 2 : 1.5} />
                  {zone.found && zone.severity !== 'ok' && <text x={zone.x} y={zone.y+5} textAnchor="middle" fill={color} fontSize={13} fontWeight="bold">!</text>}
                  {zone.found && zone.severity === 'ok' && <text x={zone.x} y={zone.y+5} textAnchor="middle" fill={C.green} fontSize={11} fontWeight="bold">✓</text>}
                  {!zone.found && <text x={zone.x} y={zone.y+4} textAnchor="middle" fill="#93c5fd" fontSize={10}>?</text>}
                </g>
              );
            })}
          </svg>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            {[{ color: C.green, label: 'OK' }, { color: C.amber, label: 'Caution' }, { color: C.red, label: 'Defect' }, { color: C.blue, label: 'Not inspected' }].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.grey }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />{label}
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ color: C.grey, fontSize: 12, marginBottom: 8 }}>Inspection Progress</div>
            <div style={{ color: C.white, fontSize: 22, fontWeight: 700 }}>{inspected.length}/{zones.length}</div>
            <div style={{ color: C.grey, fontSize: 12 }}>zones checked</div>
            <div style={{ height: 4, background: C.border, borderRadius: 4, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(inspected.length / zones.length) * 100}%`, background: C.crimson, borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
          </div>
          {selected && (
            <div style={{ background: selected.severity === 'ok' ? '#0f1a0f' : selected.severity === 'caution' ? '#1a1400' : '#1a0505', border: `1px solid ${selected.severity === 'ok' ? '#1a3a1a' : selected.severity === 'caution' ? '#3a2a00' : '#3a0505'}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ color: C.grey, fontSize: 11, marginBottom: 4 }}>Last Inspected</div>
              <div style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>{selected.label}</div>
              <div style={{ color: selected.severity === 'ok' ? C.green : selected.severity === 'caution' ? C.amber : C.red, fontSize: 13, marginTop: 6 }}>
                {selected.severity === 'ok' ? '✓ No issues found' : `⚠ ${selected.issue}`}
              </div>
            </div>
          )}
          {defectsFound.length > 0 && (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ color: C.grey, fontSize: 11, marginBottom: 8 }}>Findings Log</div>
              {defectsFound.map(z => (
                <div key={z.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: z.severity === 'defect' ? C.red : C.amber, fontSize: 12, flexShrink: 0 }}>●</span>
                  <span style={{ color: C.white, fontSize: 12 }}>{z.label}: {z.issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <button onClick={handleSubmit} disabled={done || inspected.length < 6}
        style={{ background: done || inspected.length < 6 ? '#2d1118' : `linear-gradient(135deg,${C.crimson},${C.crimsonD})`, color: done || inspected.length < 6 ? C.grey : 'white', border: 'none', borderRadius: 12, padding: '13px', cursor: done || inspected.length < 6 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
        {done ? 'Inspection Complete ✓' : inspected.length < 6 ? `Continue inspection — ${inspected.length}/${zones.length} zones checked` : `Complete Inspection Report → (${inspected.length}/${zones.length} zones)`}
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
    const handoverConsistent = docFindings >= 2 && hasConcept(st, CONCEPTS.navLightMention || CONCEPTS.oilResidueFound);
    const handoverSafety     = hasConcept(st, CONCEPTS.safetyGround);
    const handoverOutstanding = hasConcept(st, CONCEPTS.handoverComplete);

    // Distinguishes confirmed from assumed (uses hedging language)
    const distinguishesUncertainty = /appear|suggest|possibl|may|might|indicat|further|not.{0,10}confirm/i.test(lt);

    const items: TaggedEvidence[] = [];

    // Documentation quality
    if (docFindings >= 3) items.push(ev('attention_to_detail', 0.8, 3));
    else if (docFindings >= 2) items.push(ev('attention_to_detail', 0.5, 3));
    else if (docFindings >= 1) items.push(ev('attention_to_detail', 0.3, 3));

    if (docOutstanding)           items.push(ev('systematic_reasoning', 0.6, 3));
    if (docNextSteps)             items.push(ev('systematic_reasoning', 0.4, 3));
    if (distinguishesUncertainty) items.push(ev('systematic_reasoning', 0.3, 3));
    if (docSafety)                items.push(ev('safety_mindset', 0.65, 3));
    if (docRegulatory)            items.push(ev('procedural_compliance', 0.5, 3));

    // Supervisor handover
    if (docFindings >= 2)         items.push(ev('communication_quality', 0.4 + (docFindings >= 3 ? 0.3 : 0), 3));
    if (handoverSafety)           items.push(ev('safety_mindset', 0.4, 3));
    if (handoverOutstanding)      items.push(ev('communication_quality', 0.3, 3));

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
