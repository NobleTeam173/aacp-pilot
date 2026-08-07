import { useState } from 'react';
import type { EvidenceItem } from '../types';

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
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
  { id: 'nose', label: 'Nose Cone', x: 80, y: 120, r: 18, issue: null, severity: 'ok', found: false },
  { id: 'l_engine', label: 'Left Engine', x: 155, y: 155, r: 20, issue: 'Oil residue on cowling', severity: 'caution', found: false },
  { id: 'r_engine', label: 'Right Engine', x: 155, y: 85, r: 20, issue: null, severity: 'ok', found: false },
  { id: 'l_wing_tip', label: 'Left Wing Tip', x: 250, y: 195, r: 15, issue: 'Nav light cracked', severity: 'defect', found: false },
  { id: 'r_wing_tip', label: 'Right Wing Tip', x: 250, y: 45, r: 15, issue: null, severity: 'ok', found: false },
  { id: 'l_main_gear', label: 'Left Main Gear', x: 190, y: 175, r: 14, issue: null, severity: 'ok', found: false },
  { id: 'r_main_gear', label: 'Right Main Gear', x: 190, y: 65, r: 14, issue: null, severity: 'ok', found: false },
  { id: 'nose_gear', label: 'Nose Gear', x: 95, y: 148, r: 14, issue: 'Low tyre pressure', severity: 'caution', found: false },
  { id: 'fuselage', label: 'Fuselage Mid', x: 175, y: 120, r: 16, issue: null, severity: 'ok', found: false },
  { id: 'tail', label: 'Tail Section', x: 310, y: 120, r: 18, issue: 'Antenna loose', severity: 'defect', found: false },
  { id: 'flap_l', label: 'Left Flap', x: 225, y: 170, r: 13, issue: null, severity: 'ok', found: false },
  { id: 'flap_r', label: 'Right Flap', x: 225, y: 70, r: 13, issue: null, severity: 'ok', found: false },
  // Three additional zones — pitot tube cover is the most critical defect to catch
  { id: 'pitot_tube', label: 'Pitot Tube', x: 108, y: 138, r: 13, issue: 'Pitot cover installed — not removed post-maintenance', severity: 'defect', found: false },
  { id: 'static_port', label: 'Static Port', x: 130, y: 112, r: 11, issue: null, severity: 'ok', found: false },
  { id: 'l_fuel_cap', label: 'Left Fuel Cap', x: 215, y: 163, r: 12, issue: null, severity: 'ok', found: false },
];

const DEFECTS = ZONES.filter(z => z.severity !== 'ok');

interface Props {
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

export function AircraftInspection({ onComplete }: Props) {
  const [zones, setZones] = useState<InspectionZone[]>(ZONES);
  const [selected, setSelected] = useState<InspectionZone | null>(null);
  const [completed, setCompleted] = useState(false);
  const [startTime] = useState(Date.now());

  const inspected = zones.filter(z => z.found);
  const defectsFound = zones.filter(z => z.found && z.severity !== 'ok');
  const allInspected = inspected.length === zones.length;

  function handleClick(zone: InspectionZone) {
    if (completed) return;
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, found: true } : z));
    setSelected({ ...zone, found: true });
  }

  function handleComplete() {
    setCompleted(true);
    const elapsed = (Date.now() - startTime) / 1000;
    const coverage = inspected.length / zones.length;
    const defectRate = defectsFound.length / DEFECTS.length;
    const foundPitot = defectsFound.some(z => z.id === 'pitot_tube');

    // Pitot cover is the most safety-critical find — bonus for catching it
    const safetyBase = defectRate > 0.6 ? 0.8 : defectRate > 0.3 ? 0.5 : 0.1;
    const safetyDelta = foundPitot ? Math.min(1, safetyBase + 0.2) : safetyBase;

    const evidence: Omit<EvidenceItem, 'mission'>[] = [
      { key: 'attention_to_detail', delta: coverage * 0.8 + defectRate * 0.2 },
      { key: 'systematic_reasoning', delta: coverage > 0.8 ? 0.7 : coverage > 0.5 ? 0.3 : 0 },
      { key: 'safety_mindset', delta: safetyDelta },
      { key: 'procedural_compliance', delta: allInspected ? 0.8 : coverage },
      { key: 'mechanical_reasoning', delta: defectRate * 0.8 },
    ];

    if (elapsed < 90) evidence.push({ key: 'multitasking_ability', delta: 0.5 });

    onComplete(evidence);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 20 }}>
      <div style={{
        background: '#0f1a0f',
        border: '1px solid #1a3a1a',
        borderRadius: 12,
        padding: '10px 16px',
        color: '#86efac',
        fontSize: 13,
      }}>
        Tap each zone on the aircraft to inspect it. Report all findings before departure.
      </div>

      <style>{`
        @keyframes inspPulse {
          0%, 100% { opacity: 0.6; r: 18px; }
          50% { opacity: 1; r: 22px; }
        }
        .insp-zone:hover circle { filter: brightness(1.4); }
      `}</style>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width={420} height={260} viewBox="0 0 420 260"
            style={{ background: 'linear-gradient(160deg, #050a14 0%, #0a1020 100%)', borderRadius: 16, border: `1px solid ${C.border}`, display: 'block' }}>

            {/* Ground shadow */}
            <ellipse cx={210} cy={242} rx={160} ry={10} fill="#000" opacity={0.4} />

            {/* Fuselage main body */}
            <ellipse cx={210} cy={128} rx={148} ry={24} fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1.5} />
            {/* Fuselage highlight */}
            <ellipse cx={210} cy={122} rx={140} ry={8} fill="#2a3f58" opacity={0.4} />

            {/* Nose cone */}
            <path d="M 62,128 Q 48,128 44,128 Q 48,116 62,116 Z" fill="#2d4a6a" />
            <ellipse cx={66} cy={128} rx={28} ry={14} fill="#253646" stroke="#2d4a6a" strokeWidth={1} />
            {/* Nose cockpit windows */}
            <ellipse cx={68} cy={124} rx={6} ry={4} fill="#1a3a5c" stroke="#3b6ea8" strokeWidth={0.8} opacity={0.9} />
            <ellipse cx={78} cy={124} rx={5} ry={3.5} fill="#1a3a5c" stroke="#3b6ea8" strokeWidth={0.8} opacity={0.9} />

            {/* Tail fin vertical */}
            <path d="M 316,128 L 348,80 L 355,80 L 355,128 Z" fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1} />
            {/* Horizontal stabilisers */}
            <polygon points="318,128 365,108 360,118 330,128" fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1} />
            <polygon points="318,128 365,148 360,138 330,128" fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1} />

            {/* Wings */}
            <polygon points="185,128 272,210 252,210 205,128" fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1.5} />
            <polygon points="185,128 272,46 252,46 205,128" fill="#1e2d3d" stroke="#2d4a6a" strokeWidth={1.5} />
            {/* Wing highlight */}
            <polygon points="190,126 268,204 260,202 208,126" fill="#253646" opacity={0.3} />
            <polygon points="190,130 268,52 260,54 208,130" fill="#253646" opacity={0.3} />

            {/* Flaps */}
            <polygon points="228,128 268,190 258,194 218,132" fill="#172230" stroke="#2d4a6a" strokeWidth={0.8} />
            <polygon points="228,128 268,66 258,62 218,124" fill="#172230" stroke="#2d4a6a" strokeWidth={0.8} />

            {/* Left engine pod */}
            <ellipse cx={158} cy={164} rx={26} ry={12} fill="#253646" stroke="#2d4a6a" strokeWidth={1.5} />
            <ellipse cx={138} cy={164} rx={10} ry={11} fill="#172230" stroke="#2d4a6a" strokeWidth={1} />
            <ellipse cx={178} cy={164} rx={6} ry={8} fill="#172230" stroke="#2d4a6a" strokeWidth={0.8} />

            {/* Right engine pod */}
            <ellipse cx={158} cy={92} rx={26} ry={12} fill="#253646" stroke="#2d4a6a" strokeWidth={1.5} />
            <ellipse cx={138} cy={92} rx={10} ry={11} fill="#172230" stroke="#2d4a6a" strokeWidth={1} />
            <ellipse cx={178} cy={92} rx={6} ry={8} fill="#172230" stroke="#2d4a6a" strokeWidth={0.8} />

            {/* Nose gear */}
            <rect x={96} y={140} width={5} height={22} fill="#374151" />
            <rect x={90} y={160} width={16} height={5} rx={2} fill="#4b5563" />
            <ellipse cx={98} cy={164} rx={8} ry={5} fill="#1f2937" stroke="#374151" strokeWidth={1} />

            {/* Left main gear */}
            <rect x={192} y={182} width={5} height={20} fill="#374151" />
            <ellipse cx={194} cy={202} rx={9} ry={5} fill="#1f2937" stroke="#374151" strokeWidth={1} />

            {/* Right main gear */}
            <rect x={192} y={58} width={5} height={20} fill="#374151" />
            <ellipse cx={194} cy={58} rx={9} ry={5} fill="#1f2937" stroke="#374151" strokeWidth={1} />

            {/* Fuselage cabin windows row */}
            {[105, 125, 145, 165, 185, 205, 225, 245, 265, 285].map((x, i) => (
              <ellipse key={i} cx={x} cy={122} rx={5} ry={3.5}
                fill="#1a3a5c" stroke="#3b6ea8" strokeWidth={0.7} opacity={0.7} />
            ))}
            <ellipse cx={190} cy={62} rx={8} ry={4} fill="#374151" />

            {/* Inspection zones */}
            {zones.map(zone => {
              const color = !zone.found ? '#60a5fa' : zone.severity === 'ok' ? C.green : zone.severity === 'caution' ? C.amber : C.red;
              return (
                <g key={zone.id} className="insp-zone" onClick={() => handleClick(zone)} style={{ cursor: completed ? 'default' : 'pointer' }}>
                  {/* Pulse ring for unfound zones */}
                  {!zone.found && !completed && (
                    <circle cx={zone.x} cy={zone.y} r={zone.r + 4} fill="none" stroke="#60a5fa" strokeWidth={1.5} opacity={0.4}>
                      <animate attributeName="r" values={`${zone.r + 2};${zone.r + 8};${zone.r + 2}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Glow for defects */}
                  {zone.found && zone.severity !== 'ok' && (
                    <circle cx={zone.x} cy={zone.y} r={zone.r + 6} fill={color} opacity={0.15}>
                      <animate attributeName="opacity" values="0.15;0.3;0.15" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle cx={zone.x} cy={zone.y} r={zone.r}
                    fill={color} fillOpacity={zone.found ? 0.25 : 0.15}
                    stroke={color} strokeWidth={zone.found ? 2 : 1.5}
                  />
                  {zone.found && zone.severity !== 'ok' && (
                    <text x={zone.x} y={zone.y + 5} textAnchor="middle" fill={color} fontSize={13} fontWeight="bold">!</text>
                  )}
                  {zone.found && zone.severity === 'ok' && (
                    <text x={zone.x} y={zone.y + 5} textAnchor="middle" fill={C.green} fontSize={11} fontWeight="bold">✓</text>
                  )}
                  {!zone.found && (
                    <text x={zone.x} y={zone.y + 4} textAnchor="middle" fill="#93c5fd" fontSize={10}>?</text>
                  )}
                </g>
              );
            })}
          </svg>

          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            {[{ color: C.green, label: 'OK' }, { color: C.amber, label: 'Caution' }, { color: C.red, label: 'Defect' }, { color: '#60a5fa', label: 'Not inspected' }].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.grey }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                {label}
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
            <div style={{
              background: selected.severity === 'ok' ? '#0f1a0f' : selected.severity === 'caution' ? '#1a1400' : '#1a0505',
              border: `1px solid ${selected.severity === 'ok' ? '#1a3a1a' : selected.severity === 'caution' ? '#3a2a00' : '#3a0505'}`,
              borderRadius: 12,
              padding: 14,
              marginBottom: 12,
            }}>
              <div style={{ color: C.grey, fontSize: 11, marginBottom: 4 }}>Last Inspected</div>
              <div style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>{selected.label}</div>
              <div style={{
                color: selected.severity === 'ok' ? C.green : selected.severity === 'caution' ? C.amber : C.red,
                fontSize: 13,
                marginTop: 6,
              }}>
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

      <button
        onClick={handleComplete}
        disabled={completed || inspected.length < 8}
        style={{
          background: completed || inspected.length < 8 ? '#2d1118' : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          color: completed || inspected.length < 8 ? C.grey : 'white',
          border: 'none',
          borderRadius: 12,
          padding: '13px',
          cursor: completed || inspected.length < 8 ? 'not-allowed' : 'pointer',
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {completed ? 'Mission Complete ✓' : inspected.length < 8 ? `Inspect at least 8 zones (${inspected.length}/8)` : 'Submit Inspection Report →'}
      </button>
    </div>
  );
}
