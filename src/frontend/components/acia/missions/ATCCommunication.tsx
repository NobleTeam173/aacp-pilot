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

interface ScenarioFact {
  label: string;
  value: string;
}

interface CommunicationExercise {
  id: string;
  title: string;
  guide: string; // plain-English instruction for first-timers
  scenarioBriefing?: ScenarioFact[];
  atcTransmission: string;
  callsign: string;
  template: string;
  blanks: string[];
  hints: string[];          // field labels
  sourceHints: string[];    // WHERE to find the answer (shown before submission)
  explanation: string;
}

const EXERCISES: CommunicationExercise[] = [
  {
    id: 'e1',
    title: 'Clearance Readback',
    guide: 'ATC just gave you a clearance. A readback means you repeat the key details back to confirm you heard correctly. Find each piece of information in the ATC transmission above and copy it into the matching field.',
    atcTransmission: 'Air Canada 421, cleared to Vancouver International via DOVER3 departure, flight planned route. Climb and maintain FL280. Squawk 3471.',
    callsign: 'Air Canada 421',
    template: 'Cleared to [DEST] via [DEP], flight planned route, climb maintain [ALT], squawk [CODE], Air Canada 421.',
    blanks: ['Vancouver International', 'DOVER3 departure', 'FL280', '3471'],
    hints: ['Destination airport', 'Departure procedure', 'Assigned altitude', 'Squawk (transponder) code'],
    sourceHints: [
      'ATC said "cleared to ___" — what\'s the airport?',
      'ATC said "via ___ departure" — what\'s the procedure name?',
      'ATC said "climb and maintain ___" — what level?',
      'ATC said "squawk ___" — what four-digit code?',
    ],
    explanation: 'Correct readbacks must include all four elements: destination, departure procedure, cleared altitude, and squawk code — in order. In ICAO standard, the aircraft callsign goes at the END of the readback, confirming who is transmitting. Omitting any element is a partial readback and requires correction from ATC.',
  },
  {
    id: 'e2',
    title: 'Position Report',
    guide: 'ATC is asking you where you are. A position report gives your callsign, the fix (waypoint) you\'re passing, your altitude, and your next waypoint. All four pieces of information are in the ATC message or the scenario briefing above.',
    scenarioBriefing: [
      { label: 'Your flight', value: 'WestJet 576, en route Calgary → Toronto' },
      { label: 'Next reporting fix', value: 'OLENA waypoint (after BUMPO)' },
    ],
    atcTransmission: 'WestJet 576, report passing BUMPO at FL350.',
    callsign: 'WestJet 576',
    template: '[CALLSIGN], passing [FIX] at [ALT], estimating [NEXT_FIX].',
    blanks: ['WestJet 576', 'BUMPO', 'FL350', 'OLENA'],
    hints: ['Your callsign', 'Reporting fix (waypoint you\'re passing)', 'Current altitude', 'Next fix after this one'],
    sourceHints: [
      'ATC addressed you by your callsign — what is it?',
      'ATC asked you to "report passing ___" — which fix?',
      'ATC said "at ___" — what altitude?',
      'Your next fix is in the scenario briefing above.',
    ],
    explanation: 'Position reports confirm: callsign, fix being reported, current altitude, and the next reporting point. This gives ATC the information needed to maintain an accurate traffic picture and plan separation between aircraft.',
  },
  {
    id: 'e3',
    title: 'Emergency Transmission',
    guide: 'This is a simulated emergency. You don\'t need aviation experience — everything you need to say is in the scenario briefing above. Match each field label to the corresponding fact in the briefing.',
    scenarioBriefing: [
      { label: 'Aircraft', value: 'Golf Quebec Golf (Cessna 172, single-engine)' },
      { label: 'ATC Facility', value: 'Toronto Centre' },
      { label: 'Persons on Board', value: '4 (including pilot)' },
      { label: 'Fuel Remaining', value: '2 hours' },
      { label: 'Situation', value: 'Engine failure — rough running, partial power loss. You are unable to maintain altitude.' },
      { label: 'Departure Airport', value: 'Toronto / Lester B. Pearson (CYYZ)' },
    ],
    atcTransmission: 'Using the scenario information provided above, compose a MAYDAY call.',
    callsign: 'Golf Quebec Golf',
    template: 'MAYDAY MAYDAY MAYDAY, [ATC_UNIT], [CALLSIGN], [EMERGENCY_TYPE], [SOULS_ON_BOARD] POB, [FUEL_REMAINING] fuel remaining, [INTENTIONS].',
    blanks: ['Toronto Centre', 'Golf Quebec Golf', 'Engine failure', '4', '2 hours', 'Requesting immediate return to Toronto'],
    hints: ['ATC facility to contact', 'Your aircraft callsign', 'Nature of emergency', 'Number of people on board', 'Fuel remaining', 'Your immediate intentions'],
    sourceHints: [
      'Scenario: "ATC Facility"',
      'Scenario: "Aircraft" (callsign only)',
      'Scenario: "Situation" (brief phrase)',
      'Scenario: "Persons on Board" (number only)',
      'Scenario: "Fuel Remaining"',
      'What do you need ATC to help you do? (your words)',
    ],
    explanation: 'MAYDAY must be spoken three times. The full call includes: ATC unit, callsign, nature of emergency, souls on board, fuel remaining, and intentions — in that order. This gives ATC everything they need to coordinate emergency services. Missing any element forces a follow-up exchange that costs time.',
  },
  {
    id: 'e4',
    title: 'Sector Handover',
    guide: 'You\'re handing control of your airspace to an incoming controller. They know nothing yet — give them a complete picture. Every answer comes from the scenario briefing above.',
    scenarioBriefing: [
      { label: 'Your Role', value: 'Outgoing controller, Sector 3' },
      { label: 'Traffic Count', value: '4 aircraft in sector' },
      { label: 'Highest Traffic', value: 'WJA822 at FL390 — no special requirements' },
      { label: 'Special Condition', value: 'WJA630 inbound, squawking 7700 — medical priority declared' },
      { label: 'Next Coordination', value: 'Handoff to Montreal Centre in 8 minutes' },
      { label: 'Sector Weather', value: 'Clear in sector' },
    ],
    atcTransmission: 'Incoming controller: "I\'m ready to accept Sector 3. Give me the picture."',
    callsign: 'Sector 3 — Outgoing Controller',
    template: 'Sector 3, [TRAFFIC_COUNT] aircraft. [SIGNIFICANT_TRAFFIC]. Special: [SPECIAL_CONDITION]. Next coordination: [NEXT_EVENT]. Weather: [WX_STATUS].',
    blanks: ['4', 'WJA822 at FL390, highest traffic', 'WJA630 inbound with medical priority', 'handoff to Montreal Centre in 8 minutes', 'clear in sector'],
    hints: ['Total aircraft count', 'Most significant aircraft', 'Special condition or emergency', 'Next coordination event', 'Sector weather'],
    sourceHints: [
      'Scenario: "Traffic Count" (number only)',
      'Scenario: "Highest Traffic"',
      'Scenario: "Special Condition" (brief summary)',
      'Scenario: "Next Coordination"',
      'Scenario: "Sector Weather"',
    ],
    explanation: 'Sector handovers must be complete — the incoming controller has zero context. A full handover covers: traffic count, significant aircraft, active emergencies, the next coordination event, and sector weather. An incomplete handover creates a gap and is a safety failure.',
  },
];

interface Props {
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

export function ATCCommunication({ onComplete }: Props) {
  const [exIdx, setExIdx] = useState(0);
  const [inputs, setInputs] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [showSourceHints, setShowSourceHints] = useState(false);
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
      const emergencyScore = allScores[2] ?? 0;
      const handoverScore = allScores[3] ?? 0;

      const evidence: Omit<EvidenceItem, 'mission'>[] = [
        { key: 'communication_quality', delta: avg * 0.9 },
        { key: 'procedural_compliance', delta: avg * 0.85 },
        { key: 'attention_to_detail', delta: avg * 0.8 },
        { key: 'situational_awareness', delta: emergencyScore > 0.6 ? 0.75 : 0.35 },
        { key: 'stress_response', delta: emergencyScore > 0.7 ? 0.7 : 0.35 },
        { key: 'systematic_reasoning', delta: handoverScore > 0.7 ? 0.65 : 0.3 },
      ];
      onComplete(evidence);
    } else {
      setExIdx(i => i + 1);
      setInputs([]);
      setRevealed(false);
      setShowSourceHints(false);
    }
  }

  const transmissionColor = ex.id === 'e3' ? '#ef4444' : ex.id === 'e4' ? '#a855f7' : '#60a5fa';
  const transmissionBg = ex.id === 'e3' ? '#1a0505' : ex.id === 'e4' ? '#1a0d2a' : '#0f1520';
  const transmissionBorder = ex.id === 'e3' ? '#3a0505' : ex.id === 'e4' ? '#2a1a4a' : '#1e3a5f';

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {EXERCISES.map((_, i) => (
          <div key={i} style={{
            width: i === exIdx ? 24 : 8, height: 8, borderRadius: 4,
            background: i < exIdx ? C.green : i === exIdx ? C.crimson : C.border,
            transition: 'all 0.2s',
          }} />
        ))}
        <span style={{ color: C.grey, fontSize: 12, marginLeft: 8 }}>
          Exercise {exIdx + 1}/{EXERCISES.length} — {ex.title}
        </span>
      </div>

      {/* First-timer guide */}
      <div style={{
        background: '#1a1505', border: '1px solid #3d2e05',
        borderRadius: 10, padding: '10px 14px',
      }}>
        <div style={{ color: '#fbbf24', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          How to complete this exercise
        </div>
        <div style={{ color: '#e2c77a', fontSize: 13, lineHeight: 1.6 }}>{ex.guide}</div>
      </div>

      {/* Scenario briefing */}
      {ex.scenarioBriefing && (
        <div style={{ background: '#0f1a2e', border: '1px solid #1e3a5f', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#60a5fa', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Scenario Briefing — your answers come from here
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ex.scenarioBriefing.map(fact => (
              <div key={fact.label} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ color: '#93c5fd', fontWeight: 600, minWidth: 160, flexShrink: 0 }}>{fact.label}:</span>
                <span style={{ color: C.white }}>{fact.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ATC transmission */}
      <div style={{ background: transmissionBg, border: `1px solid ${transmissionBorder}`, borderRadius: 12, padding: 16 }}>
        <div style={{ color: transmissionColor, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          {ex.id === 'e4' ? 'Incoming Controller' : 'ATC Transmission'} — {ex.title}
        </div>
        <div style={{ color: C.white, fontSize: 14, lineHeight: 1.65, fontStyle: 'italic' }}>
          "{ex.atcTransmission}"
        </div>
      </div>

      {/* Response template */}
      <div style={{ background: '#0d120d', border: '1px solid #1a2e1a', borderRadius: 10, padding: '10px 14px' }}>
        <div style={{ color: '#4ade80', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Response template — fill in the blanks below
        </div>
        <div style={{ color: '#86efac', fontSize: 12, lineHeight: 1.7, fontFamily: 'monospace' }}>{ex.template}</div>
      </div>

      {/* Fill-in form */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: C.grey, fontSize: 12 }}>
            Compose your <strong style={{ color: C.white }}>
              {ex.id === 'e3' ? 'MAYDAY transmission' : ex.id === 'e4' ? 'sector handover' : 'readback'}
            </strong> as <strong style={{ color: C.white }}>{ex.callsign}</strong>:
          </div>
          {!revealed && (
            <button
              onClick={() => setShowSourceHints(v => !v)}
              style={{
                background: 'transparent', border: '1px solid #3d2e05',
                borderRadius: 6, padding: '4px 10px',
                color: '#fbbf24', fontSize: 11, cursor: 'pointer',
                touchAction: 'manipulation', flexShrink: 0, marginLeft: 12,
              }}
            >
              {showSourceHints ? 'Hide hints' : 'Where do I find this?'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ex.blanks.map((blank, i) => (
            <div key={i}>
              <label style={{ color: C.grey, fontSize: 11, display: 'block', marginBottom: 3 }}>
                {ex.hints[i]}
              </label>
              {showSourceHints && !revealed && (
                <div style={{ color: '#fbbf24', fontSize: 11, marginBottom: 4, fontStyle: 'italic' }}>
                  → {ex.sourceHints[i]}
                </div>
              )}
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
                  padding: '10px 12px',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                  touchAction: 'manipulation',
                }}
              />
              {revealed && (
                <div style={{ color: C.grey, fontSize: 11, marginTop: 3 }}>
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
            border: 'none', borderRadius: 12, padding: '14px',
            cursor: inputs.some(v => !v?.trim()) ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: 14, touchAction: 'manipulation',
          }}
        >
          {ex.id === 'e3' ? 'Transmit MAYDAY' : ex.id === 'e4' ? 'Complete Handover' : 'Transmit Readback'}
        </button>
      ) : (
        <button
          onClick={next}
          style={{
            background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: 'white', border: 'none', borderRadius: 12, padding: '14px',
            cursor: 'pointer', fontWeight: 700, fontSize: 14, touchAction: 'manipulation',
          }}
        >
          {isLast ? 'Complete Mission →' : 'Next Exercise →'}
        </button>
      )}
    </div>
  );
}
