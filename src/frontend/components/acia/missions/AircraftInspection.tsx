import { useState, useRef, useCallback, lazy, Suspense } from 'react';
import type { EvidenceItem } from '../types';
import { AircraftAssembly } from './AircraftAssembly';
import {
  IMG_OVERVIEW,
  IMG_NOSE,
  IMG_PITOT_TUBE,
  IMG_STATIC_PORT,
  IMG_NOSE_GEAR,
  IMG_L_FUEL_CAP,
  IMG_L_ENGINE,
  IMG_L_WING_TIP,
  IMG_L_MAIN_GEAR,
  IMG_R_MAIN_GEAR,
  IMG_TAIL,
} from './AircraftImages';
import type { Zone3D } from './Aircraft3DViewer';
import { ZONE_3D_POSITIONS } from './zone3dPositions';
import { MissionReasoningResponse, type ReasoningResponses, type ReasoningQuestion } from './MissionReasoningResponse';

// Lazy-load the 3D viewer so Three.js (~500KB) is only fetched when the participant
// explicitly switches to 3D mode. The 2D experience is completely unaffected.
const Aircraft3DViewer = lazy(() =>
  import('./Aircraft3DViewer').then(m => ({ default: m.Aircraft3DViewer }))
);

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
};

interface InspectionZone {
  id: string;
  label: string;
  x: number;
  y: number;
  r: number;
  issue: string | null;
  severity: 'ok' | 'caution' | 'defect';
  found: boolean;
}

const ZONES: InspectionZone[] = [
  { id: 'nose', label: 'Nose Cone', x: 52, y: 132, r: 18, issue: null, severity: 'ok', found: false },
  { id: 'l_engine', label: 'Left Engine', x: 265, y: 197, r: 20, issue: 'Oil residue on cowling', severity: 'caution', found: false },
  { id: 'r_engine', label: 'Right Engine', x: 324, y: 197, r: 20, issue: null, severity: 'ok', found: false },
  { id: 'l_wing_tip', label: 'Left Wing Tip', x: 176, y: 55, r: 15, issue: 'Nav light cracked', severity: 'defect', found: false },
  { id: 'r_wing_tip', label: 'Right Wing Tip', x: 393, y: 55, r: 15, issue: null, severity: 'ok', found: false },
  { id: 'l_main_gear', label: 'Left Main Gear', x: 316, y: 232, r: 14, issue: null, severity: 'ok', found: false },
  { id: 'r_main_gear', label: 'Right Main Gear', x: 350, y: 232, r: 14, issue: null, severity: 'ok', found: false },
  { id: 'nose_gear', label: 'Nose Gear', x: 103, y: 232, r: 14, issue: 'Low tyre pressure', severity: 'caution', found: false },
  { id: 'fuselage', label: 'Fuselage Mid', x: 390, y: 132, r: 16, issue: null, severity: 'ok', found: false },
  { id: 'tail', label: 'Tail Section', x: 622, y: 108, r: 18, issue: 'Antenna loose', severity: 'defect', found: false },
  { id: 'flap_l', label: 'Left Flap', x: 235, y: 183, r: 13, issue: null, severity: 'ok', found: false },
  { id: 'flap_r', label: 'Right Flap', x: 282, y: 183, r: 13, issue: null, severity: 'ok', found: false },
  // Three additional zones — pitot tube cover is the most critical defect to catch
  { id: 'pitot_tube', label: 'Pitot Tube', x: 84, y: 116, r: 13, issue: 'Pitot cover installed — not removed post-maintenance', severity: 'defect', found: false },
  { id: 'static_port', label: 'Static Port', x: 116, y: 150, r: 11, issue: null, severity: 'ok', found: false },
  { id: 'l_fuel_cap', label: 'Left Fuel Cap', x: 224, y: 110, r: 12, issue: null, severity: 'ok', found: false },
];

const DEFECTS = ZONES.filter(z => z.severity !== 'ok');

// Close-up photos for each inspection zone (revealed on click)
// Zones with real photos use data URIs; zones without use SVG fallback
const ZONE_CLOSEUP: Record<string, string> = {
  nose: IMG_NOSE,
  pitot_tube: IMG_PITOT_TUBE,
  static_port: IMG_STATIC_PORT,
  nose_gear: IMG_NOSE_GEAR,
  l_fuel_cap: IMG_L_FUEL_CAP,
  l_engine: IMG_L_ENGINE,
  r_engine: IMG_L_ENGINE,
  l_wing_tip: IMG_L_WING_TIP,
  r_wing_tip: IMG_L_WING_TIP,
  l_main_gear: IMG_L_MAIN_GEAR,
  r_main_gear: IMG_R_MAIN_GEAR,
  tail: IMG_TAIL,
  fuselage: `data:image/svg+xml,<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="80" fill="%230a1020"/><rect x="0" y="15" width="120" height="50" fill="%23c8d2dc" rx="4"/><line x1="0" y1="58" x2="120" y2="58" stroke="%238F0909" stroke-width="3" opacity="0.7"/><rect x="12" y="22" width="22" height="14" rx="3" fill="%231a3a5a" opacity="0.9"/><rect x="40" y="22" width="22" height="14" rx="3" fill="%231a3a5a" opacity="0.9"/><rect x="68" y="22" width="22" height="14" rx="3" fill="%231a3a5a" opacity="0.9"/><rect x="96" y="22" width="22" height="14" rx="3" fill="%231a3a5a" opacity="0.9"/></svg>`,
  flap_l: `data:image/svg+xml,<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="80" fill="%230a1020"/><rect x="5" y="20" width="110" height="30" fill="%23b8c2ce" rx="3"/><rect x="5" y="48" width="110" height="10" fill="%23a8b2be" rx="2"/><line x1="35" y1="20" x2="35" y2="58" stroke="%239aaabb" stroke-width="1" stroke-dasharray="3,3"/><line x1="65" y1="20" x2="65" y2="58" stroke="%239aaabb" stroke-width="1" stroke-dasharray="3,3"/><line x1="95" y1="20" x2="95" y2="58" stroke="%239aaabb" stroke-width="1" stroke-dasharray="3,3"/></svg>`,
  flap_r: `data:image/svg+xml,<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="80" fill="%230a1020"/><rect x="5" y="20" width="110" height="30" fill="%23b8c2ce" rx="3"/><rect x="5" y="48" width="110" height="10" fill="%23a8b2be" rx="2"/><line x1="35" y1="20" x2="35" y2="58" stroke="%239aaabb" stroke-width="1" stroke-dasharray="3,3"/><line x1="65" y1="20" x2="65" y2="58" stroke="%239aaabb" stroke-width="1" stroke-dasharray="3,3"/><line x1="95" y1="20" x2="95" y2="58" stroke="%239aaabb" stroke-width="1" stroke-dasharray="3,3"/></svg>`,
};

interface Props {
  isRpas?: boolean;
  sessionId?: string;
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

export function AircraftInspection({ isRpas, sessionId, onComplete }: Props) {
  if (isRpas) return <RpasPreflightInspection onComplete={onComplete} />;
  return <AircraftInspectionGeneral sessionId={sessionId} onComplete={onComplete} />;
}

// ── RPAS Pre-flight Inspection ────────────────────────────────────────────────

const RPAS_ZONES: InspectionZone[] = [
  { id: 'motor_fl', label: 'Motor — Front Left', x: 105, y: 75, r: 16, issue: null, severity: 'ok', found: false },
  { id: 'motor_fr', label: 'Motor — Front Right', x: 220, y: 75, r: 16, issue: 'Prop blade cracked — must not fly', severity: 'defect', found: false },
  { id: 'motor_rl', label: 'Motor — Rear Left', x: 105, y: 185, r: 16, issue: 'Motor mount loose', severity: 'defect', found: false },
  { id: 'motor_rr', label: 'Motor — Rear Right', x: 220, y: 185, r: 16, issue: null, severity: 'ok', found: false },
  { id: 'battery', label: 'Battery Pack', x: 163, y: 130, r: 18, issue: 'Battery swelling detected — do not use', severity: 'defect', found: false },
  { id: 'camera', label: 'Camera / Gimbal', x: 163, y: 165, r: 14, issue: null, severity: 'ok', found: false },
  { id: 'gps_ant', label: 'GPS Antenna', x: 163, y: 95, r: 13, issue: 'GPS antenna cover missing — exposed to moisture', severity: 'caution', found: false },
  { id: 'sd_card', label: 'SD Card / Storage', x: 185, y: 148, r: 11, issue: null, severity: 'ok', found: false },
  { id: 'body_fl', label: 'Arm — Front Left', x: 130, y: 100, r: 12, issue: null, severity: 'ok', found: false },
  { id: 'body_fr', label: 'Arm — Front Right', x: 196, y: 100, r: 12, issue: null, severity: 'ok', found: false },
  { id: 'body_rl', label: 'Arm — Rear Left', x: 130, y: 160, r: 12, issue: null, severity: 'ok', found: false },
  { id: 'body_rr', label: 'Arm — Rear Right', x: 196, y: 160, r: 12, issue: null, severity: 'ok', found: false },
  { id: 'rc_link', label: 'RC Link Indicator', x: 80, y: 130, r: 13, issue: null, severity: 'ok', found: false },
  { id: 'landing_gear', label: 'Landing Gear', x: 163, y: 210, r: 14, issue: 'Landing leg cracked — shock absorption compromised', severity: 'caution', found: false },
  { id: 'obstacle', label: 'Obstacle Sensors', x: 245, y: 130, r: 13, issue: null, severity: 'ok', found: false },
];

function RpasPreflightInspection({ onComplete }: { onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [zones, setZones] = useState<InspectionZone[]>(RPAS_ZONES);
  const [selected, setSelected] = useState<InspectionZone | null>(null);
  const [completed, setCompleted] = useState(false);
  const [startTime] = useState(Date.now());

  const inspected = zones.filter(z => z.found);
  const defectsFound = zones.filter(z => z.found && z.severity !== 'ok');
  const RPAS_DEFECTS = RPAS_ZONES.filter(z => z.severity !== 'ok');
  const allInspected = inspected.length === zones.length;
  const batteryFound = defectsFound.some(z => z.id === 'battery');
  const propFound = defectsFound.some(z => z.id === 'motor_fr');

  function handleClick(zone: InspectionZone) {
    if (completed) return;
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, found: true } : z));
    setSelected({ ...zone, found: true });
  }

  function handleComplete() {
    setCompleted(true);
    const elapsed = (Date.now() - startTime) / 1000;
    const coverage = inspected.length / zones.length;
    const defectRate = defectsFound.length / RPAS_DEFECTS.length;
    const criticalCaught = (batteryFound ? 1 : 0) + (propFound ? 1 : 0);
    const safetyDelta = Math.min(1, defectRate * 0.6 + criticalCaught * 0.2);

    const motorFrFound = defectsFound.some(z => z.id === 'motor_fr');
    const motorRlFound = defectsFound.some(z => z.id === 'motor_rl');
    const spatialCorrect = (motorFrFound ? 1 : 0) + (motorRlFound ? 1 : 0);

    const evidence: Omit<EvidenceItem, 'mission'>[] = [
      { key: 'attention_to_detail', delta: coverage * 0.8 + defectRate * 0.2 },
      { key: 'systematic_reasoning', delta: coverage > 0.8 ? 0.75 : coverage > 0.5 ? 0.4 : 0.15 },
      { key: 'safety_mindset', delta: safetyDelta },
      { key: 'procedural_compliance', delta: allInspected ? 0.85 : coverage },
      { key: 'mechanical_reasoning', delta: defectRate * 0.75 },
      { key: 'spatial_reasoning', delta: spatialCorrect === 2 ? 0.75 : spatialCorrect === 1 ? 0.45 : 0.2 },
    ];
    onComplete(evidence);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 20 }}>
      <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: '10px 16px', color: '#86efac', fontSize: 13 }}>
        You are preparing a quadcopter for a commercial infrastructure inspection mission. Tap each zone to inspect it. Report all findings before takeoff — a single missed defect can cause a mission loss or injury.
      </div>
      <style>{`@keyframes inspPulse { 0%,100%{opacity:0.6} 50%{opacity:1} } .insp-zone:hover circle { filter: brightness(1.4); }`}</style>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width={330} height={270} viewBox="0 0 330 270"
            style={{ background: 'linear-gradient(160deg, #050a14 0%, #0a1020 100%)', borderRadius: 16, border: `1px solid ${C.border}`, display: 'block' }}>
            {/* Central body */}
            <rect x={138} y={108} width={50} height={50} rx={8} fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1.5} />
            {/* Arms */}
            <line x1={163} y1={130} x2={110} y2={85} stroke="#253646" strokeWidth={10} strokeLinecap="round" />
            <line x1={163} y1={130} x2={216} y2={85} stroke="#253646" strokeWidth={10} strokeLinecap="round" />
            <line x1={163} y1={140} x2={110} y2={185} stroke="#253646" strokeWidth={10} strokeLinecap="round" />
            <line x1={163} y1={140} x2={216} y2={185} stroke="#253646" strokeWidth={10} strokeLinecap="round" />
            {/* Motors */}
            {[[105,75],[220,75],[105,185],[220,185]].map(([mx,my],i) => (
              <ellipse key={i} cx={mx} cy={my} rx={18} ry={10} fill="#172230" stroke="#2d4a6a" strokeWidth={1.5} />
            ))}
            {/* Props */}
            {[[105,75],[220,75],[105,185],[220,185]].map(([mx,my],i) => (
              <g key={`p${i}`}>
                <ellipse cx={mx} cy={my} rx={22} ry={4} fill="none" stroke="#3d4a5c" strokeWidth={1} transform={`rotate(${i*45} ${mx} ${my})`} />
              </g>
            ))}
            {/* Camera gimbal */}
            <ellipse cx={163} cy={168} rx={12} ry={8} fill="#172230" stroke="#4a7aaa" strokeWidth={1.5} />
            <circle cx={163} cy={168} r={5} fill="#0a1520" stroke="#60a5fa" strokeWidth={1} />
            {/* Battery slot */}
            <rect x={145} y={112} width={36} height={16} rx={4} fill="#1a2030" stroke="#334155" strokeWidth={1} />
            {/* GPS dome */}
            <ellipse cx={163} cy={95} rx={10} ry={7} fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1} />
            {/* Landing gear */}
            {[[148,210],[178,210]].map(([lx,ly],i) => (
              <g key={`l${i}`}>
                <line x1={lx} y1={165} x2={lx} y2={ly} stroke="#374151" strokeWidth={3} />
                <ellipse cx={lx} cy={ly} rx={8} ry={3} fill="#1f2937" stroke="#374151" strokeWidth={1} />
              </g>
            ))}
            {/* Inspection zones */}
            {zones.map(zone => {
              const color = !zone.found ? '#60a5fa' : zone.severity === 'ok' ? C.green : zone.severity === 'caution' ? C.amber : C.red;
              return (
                <g key={zone.id} className="insp-zone" onClick={() => handleClick(zone)} style={{ cursor: completed ? 'default' : 'pointer' }}>
                  {!zone.found && !completed && (
                    <circle cx={zone.x} cy={zone.y} r={zone.r + 4} fill="none" stroke="#60a5fa" strokeWidth={1.5} opacity={0.4}>
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
            {[{ color: C.green, label: 'OK' }, { color: C.amber, label: 'Caution' }, { color: C.red, label: 'Defect' }, { color: '#60a5fa', label: 'Not inspected' }].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.grey }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} /> {label}
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ color: C.grey, fontSize: 12, marginBottom: 8 }}>Pre-flight Progress</div>
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
      <button onClick={handleComplete} disabled={completed || inspected.length < 8} style={{ background: completed || inspected.length < 8 ? '#2d1118' : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, color: completed || inspected.length < 8 ? C.grey : 'white', border: 'none', borderRadius: 12, padding: '13px', cursor: completed || inspected.length < 8 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
        {completed ? 'Mission Complete ✓' : inspected.length < 8 ? `Continue inspecting — ${inspected.length} of ${zones.length} zones checked` : `Submit Pre-flight Report (${inspected.length}/${zones.length} zones checked)`}
      </button>
    </div>
  );
}

// ── Career intelligence questions — NOT fed into scoring ─────────────────────
const M2_QUESTIONS: ReasoningQuestion[] = [
  {
    id: 'observation',
    label: 'Observation',
    prompt: 'As you examine the aircraft, what details attract your attention, and why?',
    placeholder: 'Describe what you noticed and what drew your eye to it…',
    minLength: 40,
  },
  {
    id: 'reasoning',
    label: 'Reasoning',
    prompt: 'You notice something that appears different from what you expected. How would you approach understanding the difference, and what information would you want before reaching a conclusion?',
    placeholder: 'Describe how you would investigate and what you would need to know…',
    minLength: 50,
  },
  {
    id: 'transferable',
    label: 'Transferable Capabilities',
    prompt: 'Describe a situation from your education, work or personal experience where careful observation helped you identify or understand a problem. How did you approach it, and what strengths did you use?',
    placeholder: 'Share an example — it doesn\'t need to be aviation related…',
    minLength: 60,
  },
];

// ── General aviation inspection ───────────────────────────────────────────────
function AircraftInspectionGeneral({ sessionId, onComplete }: { sessionId?: string; onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [assemblyDone, setAssemblyDone] = useState(false);
  const assemblyEvidence = useRef<Omit<EvidenceItem, 'mission'>[]>([]);
  const [zones, setZones] = useState<InspectionZone[]>(ZONES);
  const [selected, setSelected] = useState<InspectionZone | null>(null);
  const [inspectionDone, setInspectionDone] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [startTime] = useState(Date.now());
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [selected3dId, setSelected3dId] = useState<string | null>(null);

  const inspected = zones.filter(z => z.found);
  const defectsFound = zones.filter(z => z.found && z.severity !== 'ok');
  const allInspected = inspected.length === zones.length;

  // Persist inspection state across mode switches via zone array reference
  const handleZoneClick2D = useCallback((zone: InspectionZone) => {
    if (inspectionDone) return;
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, found: true } : z));
    setSelected({ ...zone, found: true });
  }, [inspectionDone]);

  const handleZoneClick3D = useCallback((id: string) => {
    if (inspectionDone) return;
    setZones(prev => prev.map(z => z.id === id ? { ...z, found: true } : z));
    const zone = zones.find(z => z.id === id);
    if (zone) setSelected({ ...zone, found: true });
    setSelected3dId(id);
  }, [inspectionDone, zones]);

  // Build Zone3D array from current zone state for the 3D viewer
  const zones3d: Zone3D[] = zones.map(z => ({
    id: z.id,
    label: z.label,
    position: ZONE_3D_POSITIONS[z.id] ?? [0, 0.3, 0],
    severity: z.severity,
    issue: z.issue,
    found: z.found,
  }));

  function handleInspectionSubmit() {
    if (inspectionDone || inspected.length < 8) return;
    setInspectionDone(true);
  }

  function handleAssemblyComplete(evidence: Omit<EvidenceItem, 'mission'>[]) {
    assemblyEvidence.current = evidence;
    setAssemblyDone(true);
  }

  function handleReasoningComplete(_responses: ReasoningResponses) {
    // Responses stored in localStorage by MissionReasoningResponse — NOT fed into evidence scoring
    setCompleted(true);
    const elapsed = (Date.now() - startTime) / 1000;
    const coverage = inspected.length / zones.length;
    const defectRate = defectsFound.length / DEFECTS.length;
    const foundPitot = defectsFound.some(z => z.id === 'pitot_tube');

    const safetyBase = defectRate > 0.6 ? 0.8 : defectRate > 0.3 ? 0.5 : 0.1;
    const safetyDelta = foundPitot ? Math.min(1, safetyBase + 0.2) : safetyBase;

    const foundLEngine = defectsFound.some(z => z.id === 'l_engine');
    const foundLWingTip = defectsFound.some(z => z.id === 'l_wing_tip');
    const lateralCorrect = (foundLEngine ? 1 : 0) + (foundLWingTip ? 1 : 0);

    const inspectionEvidence: Omit<EvidenceItem, 'mission'>[] = [
      { key: 'attention_to_detail', delta: coverage * 0.8 + defectRate * 0.2 },
      { key: 'systematic_reasoning', delta: coverage > 0.8 ? 0.7 : coverage > 0.5 ? 0.3 : 0 },
      { key: 'safety_mindset', delta: safetyDelta },
      { key: 'procedural_compliance', delta: allInspected ? 0.8 : coverage },
      { key: 'mechanical_reasoning', delta: defectRate * 0.8 },
      { key: 'spatial_reasoning', delta: lateralCorrect === 2 ? 0.7 : lateralCorrect === 1 ? 0.4 : 0.2 },
    ];

    onComplete([...assemblyEvidence.current, ...inspectionEvidence]);
  }

  if (!assemblyDone) {
    return <AircraftAssembly sessionId={sessionId} onComplete={handleAssemblyComplete} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 20 }}>
      {/* Phase 1: Walkaround */}
      {!inspectionDone && (
        <>
          <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: '10px 16px', color: '#86efac', fontSize: 13 }}>
            Tap each zone on the aircraft to inspect it. Report all findings before departure. A thorough walkaround covers every zone — you may submit once 8 or more zones are checked.
          </div>

          {/* View mode toggle */}
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start' }}>
            {(['2d', '3d'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                style={{
                  background: viewMode === mode ? `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})` : C.bgCard,
                  color: viewMode === mode ? 'white' : C.grey,
                  border: `1px solid ${viewMode === mode ? C.crimson : C.border}`,
                  borderRadius: 8,
                  padding: '6px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {mode === '2d' ? '2D Diagram' : '3D View'}
              </button>
            ))}
          </div>

          <style>{`
            @keyframes inspPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
            .insp-zone:hover circle { filter: brightness(1.4); }
          `}</style>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Viewer area — full width */}
            <div style={{ width: '100%' }}>
              {viewMode === '2d' ? (
                <>
                  {/* Overview photo with hotspot overlays */}
                  <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                    <img
                      src={IMG_OVERVIEW}
                      alt="Aircraft 214 — exterior inspection overview"
                      style={{ width: '100%', display: 'block', filter: 'brightness(1.08) contrast(1.05)' }}
                      draggable={false}
                    />
                    {/* Hotspot zones — positions as % of image (aviation-technical validation pending) */}
                    {zones.map(zone => {
                      const color = !zone.found ? '#60a5fa' : zone.severity === 'ok' ? C.green : zone.severity === 'caution' ? C.amber : C.red;
                      // positions calibrated to labeled dots in Aircraft 214 overview image
                      const pct: Record<string, [number, number]> = {
                        nose:        [4.5,  52],
                        pitot_tube:  [17.5, 60],
                        static_port: [11.5, 70],
                        nose_gear:   [14.0, 86],
                        l_engine:    [44.0, 80],
                        l_main_gear: [51.0, 88],
                        r_main_gear: [62.0, 76],
                        l_fuel_cap:  [64.0, 40],
                        fuselage:    [38.0, 48],
                        tail:        [83.0, 26],
                        l_wing_tip:  [98.5, 42],
                        r_wing_tip:  [28.0, 18],
                        flap_l:      [33.0, 74],
                        flap_r:      [52.0, 72],
                        r_engine:    [48.0, 76],
                      };
                      const [left, top] = pct[zone.id] ?? [50, 50];
                      return (
                        <button
                          key={zone.id}
                          onClick={() => handleZoneClick2D(zone)}
                          title={zone.label}
                          style={{
                            position: 'absolute',
                            left: `${left}%`,
                            top: `${top}%`,
                            transform: 'translate(-50%, -50%)',
                            width: 32, height: 32,
                            borderRadius: '50%',
                            border: `2px solid ${color}`,
                            background: zone.found ? `${color}33` : 'rgba(0,0,0,0.45)',
                            color: zone.found ? color : '#93c5fd',
                            fontSize: zone.found ? 14 : 13,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 0 0 3px ${color}44, 0 2px 8px rgba(0,0,0,0.6)`,
                            transition: 'all 0.2s',
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          {zone.found
                            ? (zone.severity === 'ok' ? '✓' : '!')
                            : '?'}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                    {[{ color: C.green, label: 'OK' }, { color: C.amber, label: 'Caution' }, { color: C.red, label: 'Defect' }, { color: '#60a5fa', label: 'Not inspected' }].map(({ color, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.grey }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} /> {label}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <Suspense fallback={
                    <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #050a14 0%, #0a1020 100%)', borderRadius: 16, color: '#94a3b8', fontSize: 13 }}>
                      Loading 3D viewer…
                    </div>
                  }>
                    <Aircraft3DViewer
                      zones={zones3d}
                      completed={false}
                      onZoneClick={handleZoneClick3D}
                      selectedId={selected3dId}
                    />
                  </Suspense>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                    {[{ color: '#22c55e', label: 'OK' }, { color: '#f59e0b', label: 'Caution' }, { color: '#ef4444', label: 'Defect' }, { color: '#60a5fa', label: 'Not inspected' }].map(({ color, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.grey }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} /> {label}
                      </div>
                    ))}
                  </div>
                  <div style={{ color: C.grey, fontSize: 12, marginTop: 6 }}>
                    Accessibility: switch to 2D Diagram mode for a fully flat view with the same inspection zones.
                  </div>
                </>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px' }}>
              <span style={{ color: C.grey, fontSize: 12, whiteSpace: 'nowrap' }}>Inspection Progress</span>
              <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(inspected.length / zones.length) * 100}%`, background: C.crimson, borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
              <span style={{ color: C.white, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>{inspected.length}/{zones.length}</span>
            </div>

            {/* Close-Up Inspection Findings */}
            <div>
              <div style={{ color: C.white, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Close-Up Inspection Findings</div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
                {zones.map(zone => {
                  const badgeColor = !zone.found ? '#60a5fa' : zone.severity === 'ok' ? C.green : zone.severity === 'caution' ? C.amber : C.red;
                  const badgeLabel = !zone.found ? 'Inspect' : zone.severity === 'ok' ? 'Clear' : zone.severity === 'caution' ? 'Caution' : 'Defect';
                  const isSelected = selected?.id === zone.id;
                  return (
                    <div key={zone.id} onClick={() => handleZoneClick2D(zone)} style={{
                      flexShrink: 0,
                      width: 118,
                      background: isSelected ? (zone.severity === 'ok' ? '#0f1a0f' : zone.severity === 'caution' ? '#1a1400' : '#1a0505') : C.bgCard,
                      border: `1.5px solid ${isSelected ? badgeColor : C.border}`,
                      borderRadius: 10,
                      cursor: 'pointer',
                      overflow: 'hidden',
                      transition: 'border-color 0.2s',
                    }}>
                      {/* Close-up photo — revealed after inspection */}
                      {zone.found && ZONE_CLOSEUP[zone.id] ? (
                        <img
                          src={ZONE_CLOSEUP[zone.id]}
                          alt={zone.label}
                          style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block', filter: 'brightness(1.1) contrast(1.08) saturate(1.1)' }}
                          draggable={false}
                        />
                      ) : (
                        <div style={{ width: '100%', height: 72, background: '#060c18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                          <span style={{ color: '#60a5fa', opacity: 0.5 }}>?</span>
                        </div>
                      )}
                      <div style={{ padding: '7px 8px' }}>
                        <div style={{ color: C.white, fontSize: 10, fontWeight: 600, lineHeight: 1.3, marginBottom: 4 }}>{zone.label}</div>
                        <div style={{
                          display: 'inline-block',
                          background: badgeColor + '22',
                          color: badgeColor,
                          border: `1px solid ${badgeColor}44`,
                          borderRadius: 4,
                          padding: '1px 6px',
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.04em',
                        }}>{badgeLabel}</div>
                        {zone.found && zone.severity !== 'ok' && (
                          <div style={{ color: badgeColor, fontSize: 9, marginTop: 4, lineHeight: 1.3 }}>{zone.issue}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Findings log — only when defects found */}
            {defectsFound.length > 0 && (
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ color: C.grey, fontSize: 11, marginBottom: 8, fontWeight: 600 }}>Findings Log</div>
                {defectsFound.map(z => (
                  <div key={z.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                    <span style={{ color: z.severity === 'defect' ? C.red : C.amber, fontSize: 12, flexShrink: 0 }}>●</span>
                    <span style={{ color: C.white, fontSize: 12 }}>{z.label}: {z.issue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleInspectionSubmit}
            disabled={inspected.length < 8}
            style={{
              background: inspected.length < 8 ? '#2d1118' : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
              color: inspected.length < 8 ? C.grey : 'white',
              border: 'none', borderRadius: 12, padding: '13px',
              cursor: inspected.length < 8 ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: 14,
            }}
          >
            {inspected.length < 8 ? `Continue inspecting — ${inspected.length} of ${zones.length} zones checked` : `Submit Inspection Report → (${inspected.length}/${zones.length} zones checked)`}
          </button>
        </>
      )}

      {/* Phase 2: Reflection questions — not fed into scoring */}
      {inspectionDone && !completed && (
        <>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ color: C.grey, fontSize: 11, marginBottom: 6 }}>Inspection Complete</div>
            <div style={{ color: C.white, fontSize: 14 }}>
              You checked {inspected.length}/{zones.length} zones and found {defectsFound.length} issue{defectsFound.length !== 1 ? 's' : ''}.
            </div>
          </div>

          <div style={{ color: C.white, fontSize: 15, fontWeight: 600 }}>Career Intelligence Reflection</div>

          <MissionReasoningResponse
            questions={M2_QUESTIONS}
            storageKey="acia_m2_reasoning"
            sessionId={sessionId}
            serverEndpoint="/acia/m2/responses"
            onComplete={handleReasoningComplete}
          />
        </>
      )}

      {completed && (
        <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: 16, textAlign: 'center', color: '#86efac', fontWeight: 700 }}>
          Mission 2 Complete ✓
        </div>
      )}
    </div>
  );
}
