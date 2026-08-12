import { useState } from 'react';
import type { EvidenceItem } from '../types';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bgCard: '#1a0d10',
  bg: '#0f0a0b',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  green: '#22c55e',
  red: '#ef4444',
};

interface CommunicationExercise {
  id: string;
  title: string;
  atcTransmission: string;
  callsign: string;
  template: string;
  blanks: string[];
  hints: string[];
  explanation: string;
}

const EXERCISES: CommunicationExercise[] = [
  {
    id: 'e1',
    title: 'Clearance Readback',
    atcTransmission: 'Air Canada 421, cleared to Vancouver International via DOVER3 departure, flight planned route. Climb and maintain FL280. Squawk 3471.',
    callsign: 'Air Canada 421',
    template: 'Cleared to [DEST] via [DEP], flight planned route, climb maintain [ALT], squawk [CODE], Air Canada 421.',
    blanks: ['Vancouver International', 'DOVER3 departure', 'FL280', '3471'],
    hints: ['Destination airport', 'Departure procedure name', 'Assigned altitude', 'Transponder code'],
    explanation: 'Correct readbacks must include all four elements: destination, departure procedure, cleared altitude, and squawk code — in order. In ICAO standard, the aircraft callsign goes at the END of the readback, confirming who is transmitting. Omitting any element is a partial readback and requires correction from ATC.',
  },
  {
    id: 'e2',
    title: 'Position Report',
    atcTransmission: 'WestJet 576, report passing BUMPO at FL350.',
    callsign: 'WestJet 576',
    template: '[CALLSIGN], passing [FIX] at [ALT], estimating [NEXT_FIX].',
    blanks: ['WestJet 576', 'BUMPO', 'FL350', 'next waypoint'],
    hints: ['Your callsign', 'Reporting fix', 'Current altitude', 'Estimated next fix'],
    explanation: 'Position reports confirm: callsign, fix being reported, current altitude, and the next reporting point with an estimate. This gives ATC the information needed to maintain an accurate traffic picture and plan separation. The estimate helps ATC anticipate the next transmission.',
  },
  {
    id: 'e3',
    title: 'Emergency Transmission',
    atcTransmission: 'Scenario: You are experiencing engine failure. Compose the MAYDAY call.',
    callsign: 'Golf Quebec Golf',
    template: 'MAYDAY MAYDAY MAYDAY, [ATC_UNIT], [CALLSIGN], [EMERGENCY_TYPE], [SOULS_ON_BOARD] POB, [FUEL_REMAINING] fuel remaining, [INTENTIONS].',
    blanks: ['Toronto Centre', 'Golf Quebec Golf', 'Engine failure', '4', '2 hours', 'Requesting immediate return to Toronto'],
    hints: ['ATC facility you are talking to', 'Your aircraft callsign', 'Nature of emergency', 'People on board', 'Fuel remaining', 'Your immediate intentions'],
    explanation: 'MAYDAY must be spoken three times. The full call includes: ATC unit, callsign, nature of emergency, souls on board, fuel remaining, and intentions — in that order. This gives ATC everything they need to coordinate search and rescue, clear airspace, and prepare emergency services. Missing any element forces a follow-up exchange that costs time.',
  },
  {
    id: 'e4',
    title: 'Sector Handover',
    atcTransmission: 'Incoming controller: "I\'m ready to accept Sector 3. Give me the picture."',
    callsign: 'Sector 3 — Outgoing Controller',
    template: 'Sector 3, [TRAFFIC_COUNT] aircraft. [SIGNIFICANT_TRAFFIC]. Special: [SPECIAL_CONDITION]. Next coordination: [NEXT_EVENT]. Weather: [WX_STATUS].',
    blanks: ['4', 'WJA822 at FL390, highest traffic', 'WJA630 inbound with medical priority', 'handoff to Montreal Centre in 8 minutes', 'clear in sector'],
    hints: ['Total aircraft count in sector', 'Most significant or highest aircraft', 'Any emergencies or special conditions', 'Next coordination or boundary event', 'Sector weather status'],
    explanation: 'Sector handovers must be complete — the incoming controller has zero context. A full handover covers: traffic count, significant or unusual aircraft (especially any with special handling), active emergencies, the next coordination event, and sector weather. An incomplete handover creates a gap in the new controller\'s mental picture and is a teamwork and safety failure.',
  },
];

interface Props {
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

export function ATCCommunication({ onComplete }: Props) {
  const [exIdx, setExIdx] = useState(0);
  const [inputs, setInputs] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [allScores, setAllScores] = useState<number[]>([]);

  const ex = EXERCISES[exIdx];
  const isLast = exIdx === EXERCISES.length - 1;

  function init() {
    setInputs(new Array(ex.blanks.length).fill(''));
  }

  if (inputs.length !== ex.blanks.length) init();

  function setInput(idx: number, val: string) {
    setInputs(prev => prev.map((v, i) => i === idx ? val : v));
  }

  function score() {
    let correct = 0;
    for (let i = 0; i < ex.blanks.length; i++) {
      const answer = inputs[i].trim().toLowerCase();
      const expected = ex.blanks[i].toLowerCase();
      if (answer.includes(expected.split(' ')[0]) || expected.includes(answer.split(' ')[0])) correct++;
    }
    return correct / ex.blanks.length;
  }

  function confirm() {
    const s = score();
    setAllScores(prev => [...prev, s]);
    setRevealed(true);
  }

  function next() {
    if (isLast) {
      const allFinal = [...allScores];
      const avg = allFinal.reduce((a, b) => a + b, 0) / allFinal.length;
      const emergencyScore = allScores[2] ?? 0; // E3 emergency transmission
      const handoverScore = allScores[3] ?? 0;  // E4 sector handover (teamwork)

      const evidence: Omit<EvidenceItem, 'mission'>[] = [
        { key: 'communication_quality', delta: avg * 0.9 },
        { key: 'procedural_compliance', delta: avg * 0.85 },
        { key: 'attention_to_detail', delta: avg * 0.8 },
        { key: 'situational_awareness', delta: emergencyScore > 0.6 ? 0.75 : 0.35 },
        { key: 'stress_response', delta: emergencyScore > 0.7 ? 0.7 : 0.35 },
        // Handover completeness is a teamwork signal
        { key: 'systematic_reasoning', delta: handoverScore > 0.7 ? 0.65 : 0.3 },
      ];
      onComplete(evidence);
    } else {
      setExIdx(i => i + 1);
      setInputs([]);
      setRevealed(false);
    }
  }

  const transmissionColor = ex.id === 'e3' ? '#ef4444' : ex.id === 'e4' ? '#a855f7' : '#60a5fa';
  const transmissionBg = ex.id === 'e3' ? '#1a0505' : ex.id === 'e4' ? '#1a0d2a' : '#0f1520';
  const transmissionBorder = ex.id === 'e3' ? '#3a0505' : ex.id === 'e4' ? '#2a1a4a' : '#1e3a5f';

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Progress */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {EXERCISES.map((_, i) => (
          <div key={i} style={{
            width: i === exIdx ? 24 : 8, height: 8, borderRadius: 4,
            background: i < exIdx ? C.green : i === exIdx ? C.crimson : C.border,
            transition: 'all 0.2s',
          }} />
        ))}
        <span style={{ color: C.grey, fontSize: 12, marginLeft: 8 }}>Exercise {exIdx + 1}/{EXERCISES.length} — {ex.title}</span>
      </div>

      {/* ATC transmission */}
      <div style={{ background: transmissionBg, border: `1px solid ${transmissionBorder}`, borderRadius: 12, padding: 16 }}>
        <div style={{ color: transmissionColor, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          {ex.id === 'e4' ? 'Incoming Controller' : 'ATC Transmission'} — {ex.title}
        </div>
        <div style={{ color: C.white, fontSize: 14, lineHeight: 1.65, fontStyle: 'italic' }}>
          "{ex.atcTransmission}"
        </div>
      </div>

      {/* Fill-in form */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ color: C.grey, fontSize: 12, marginBottom: 12 }}>
          Compose your <strong style={{ color: C.white }}>{ex.id === 'e3' ? 'MAYDAY transmission' : ex.id === 'e4' ? 'sector handover' : 'readback'}</strong>{' '}
          as <strong style={{ color: C.white }}>{ex.callsign}</strong>:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ex.blanks.map((blank, i) => (
            <div key={i}>
              <label style={{ color: C.grey, fontSize: 11, display: 'block', marginBottom: 4 }}>{ex.hints[i]}</label>
              <input
                value={inputs[i] ?? ''}
                onChange={e => setInput(i, e.target.value)}
                disabled={revealed}
                placeholder={`Enter ${ex.hints[i].toLowerCase()}…`}
                style={{
                  width: '100%',
                  background: revealed
                    ? inputs[i]?.trim().toLowerCase().includes(blank.toLowerCase().split(' ')[0])
                      ? '#0f1a0f'
                      : '#1a0505'
                    : C.bg,
                  border: `1px solid ${revealed
                    ? inputs[i]?.trim().toLowerCase().includes(blank.toLowerCase().split(' ')[0])
                      ? '#1a3a1a'
                      : '#3a0505'
                    : C.border}`,
                  borderRadius: 8,
                  color: C.white,
                  padding: '8px 12px',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {revealed && (
                <div style={{ color: C.grey, fontSize: 11, marginTop: 2 }}>
                  Expected: <span style={{ color: C.green }}>{blank}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {revealed && (
        <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: 14 }}>
          <div style={{ color: C.green, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>BRIEFING</div>
          <div style={{ color: C.grey, fontSize: 13, lineHeight: 1.6 }}>{ex.explanation}</div>
        </div>
      )}

      {!revealed ? (
        <button
          onClick={confirm}
          disabled={inputs.some(v => !v?.trim())}
          style={{
            background: inputs.some(v => !v?.trim()) ? '#2d1118' : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: inputs.some(v => !v?.trim()) ? C.grey : 'white',
            border: 'none', borderRadius: 12, padding: '12px',
            cursor: inputs.some(v => !v?.trim()) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14,
          }}
        >
          {ex.id === 'e3' ? 'Transmit MAYDAY' : ex.id === 'e4' ? 'Complete Handover' : 'Transmit Readback'}
        </button>
      ) : (
        <button
          onClick={next}
          style={{
            background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: 'white', border: 'none', borderRadius: 12, padding: '12px',
            cursor: 'pointer', fontWeight: 700, fontSize: 14,
          }}
        >
          {isLast ? 'Complete Mission →' : 'Next Exercise →'}
        </button>
      )}
    </div>
  );
}
