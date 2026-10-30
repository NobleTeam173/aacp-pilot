import { useState, useRef, useEffect } from 'react';
import type { EvidenceItem } from '../types';
import { MissionReasoningResponse, type ReasoningQuestion } from './MissionReasoningResponse';
import { ATCBriefing, type WMEvidence } from './ATCBriefing';
import { interpretWMEvidence } from '../wmInterpreter';

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#07090f',
  panel: '#0c1220',
  card: '#101828',
  border: '#1e3148',
  text: '#dde4f0',
  dim: '#5a6980',
  blue: '#3b82f6',
  blueL: '#93c5fd',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  crimson: '#8F0909',
  crimsonD: '#721010',
};

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = 'welcome' | 'setup' | 's1' | 'wm' | 's3' | 's4' | 's5' | 'reflection' | 'done';

interface Aircraft {
  id: string;
  callsign: string;
  x: number; y: number;
  status: string;
  visible: boolean;
  alert?: boolean;
}

// ── RPAS exercises (RPAS path only — unchanged) ───────────────────────────────
interface ScenarioFact { label: string; value: string; }
interface CommunicationExercise {
  id: string; title: string; guide: string;
  scenarioBriefing?: ScenarioFact[];
  atcTransmission: string; callsign: string;
  template: string; blanks: string[]; hints: string[];
  sourceHints: string[]; explanation: string;
}

const RPAS_EXERCISES: CommunicationExercise[] = [
  {
    id: 're1', title: 'Flight Authorization Request',
    guide: 'Before flying your RPAS near a controlled airport in Canada, you must obtain authorization using Nav Canada\'s digital tools or file an RPAS NOTAM. A flight authorization request must include specific details so ATC can assess it. Find each piece of information in the scenario briefing and fill in the request.',
    scenarioBriefing: [
      { label: 'Operator', value: 'TechVision Aerial Inc. (Transport Canada RPAS Pilot Certificate, Advanced)' },
      { label: 'Operation Area', value: '250 m radius, Richmond Road & Baseline Road, Ottawa (CYOW 9 NM northwest)' },
      { label: 'Altitude', value: '60 m AGL maximum' },
      { label: 'Date / Time', value: '2025-08-14, 09:00–12:00 local (1300–1600Z)' },
      { label: 'Aircraft', value: 'DJI Matrice 350 RTK, 9.2 kg MTOW' },
    ],
    atcTransmission: 'Nav Canada RPAS authorization request form: complete the required fields.',
    callsign: 'TechVision Aerial Inc.',
    template: 'RPAS authorization request: [OPERATOR_CERT], operating within [AREA_RADIUS] of [LOCATION], max [ALT] AGL, [DATE_TIME], aircraft [AIRCRAFT_DESC].',
    blanks: ['Advanced certificate', '250 m radius', 'Richmond & Baseline, Ottawa', '60 m', '2025-08-14 1300–1600Z', 'DJI Matrice 350 RTK 9.2 kg'],
    hints: ['Pilot certification level', 'Operation radius', 'Operation location', 'Maximum altitude', 'Date and UTC time window', 'Aircraft type and MTOW'],
    sourceHints: ['Scenario: "Operator" — what certificate level?', 'Scenario: "Operation Area" — what radius?', 'Scenario: "Operation Area" — what intersection?', 'Scenario: "Altitude" — what AGL limit?', 'Scenario: "Date / Time" — convert to UTC (Zulu)', 'Scenario: "Aircraft" — type and MTOW'],
    explanation: 'RPAS authorization requests near controlled airspace must include the pilot\'s certification level, exact location, maximum altitude, operational window (in UTC/Zulu), and aircraft MTOW. Incomplete requests are rejected. MTOW determines whether an Advanced or Basic certificate is required and which rules apply.',
  },
  {
    id: 're2', title: 'Lost-Link Incident Report',
    guide: 'After a lost-link event, you are required to submit an occurrence report to Transport Canada. Accurate, complete reporting is a regulatory requirement and helps improve RPAS safety. Use the scenario briefing to compose the incident notification.',
    scenarioBriefing: [
      { label: 'Operator', value: 'Clearview Surveys Ltd.' },
      { label: 'Date / Location', value: '2025-06-03, Pemberton, BC (CYPB 4 NM south)' },
      { label: 'Aircraft', value: 'DJI Phantom 4 RTK, registration C-XXCL' },
      { label: 'What Happened', value: 'Complete C2 link loss at 1.4 km from operator, duration 42 seconds. Aircraft executed pre-programmed RTH. No damage, no injuries.' },
      { label: 'Probable Cause', value: 'Suspected interference from a temporary cellular relay installed near the launch site' },
    ],
    atcTransmission: 'Compose a Transport Canada RPAS occurrence notification.',
    callsign: 'Clearview Surveys Ltd.',
    template: '[OPERATOR] reports RPAS occurrence: [DATE_LOCATION], aircraft [REG], [INCIDENT_DESC], duration [DURATION], outcome [OUTCOME], probable cause [CAUSE].',
    blanks: ['Clearview Surveys Ltd.', '2025-06-03 Pemberton BC', 'C-XXCL', 'complete C2 link loss at 1.4 km', '42 seconds', 'RTH executed, no damage or injuries', 'suspected cellular interference'],
    hints: ['Operator name', 'Date and location', 'Aircraft registration', 'Incident description', 'Duration', 'Outcome', 'Probable cause'],
    sourceHints: ['Scenario: "Operator"', 'Scenario: "Date / Location"', 'Scenario: "Aircraft" — registration code only', 'Scenario: "What Happened" — brief description of the link loss', 'Scenario: "What Happened" — how long was the link lost?', 'Scenario: "What Happened" — what was the result?', 'Scenario: "Probable Cause"'],
    explanation: 'RPAS operators in Canada are required to report occurrences including: lost link lasting more than a defined threshold, unintended landings, airspace incursions, and aircraft damage. Accurate reporting provides the safety intelligence that improves RPAS regulations over time.',
  },
  {
    id: 're3', title: 'Pre-Flight Airspace Communication',
    guide: 'Before flying near an aerodrome, you may need to contact the aerodrome\'s mandatory frequency (MF) or use UNICOM to advise manned aircraft of your presence. This is not ATC clearance — it is traffic awareness communication. Use the scenario briefing to compose your advisory.',
    scenarioBriefing: [
      { label: 'Aerodrome', value: 'Springbank Airport (CYBW) mandatory frequency 122.8 MHz' },
      { label: 'Your Operation', value: 'RPAS pipeline inspection, 800 m northwest of threshold, 50 m AGL' },
      { label: 'Duration', value: '09:30–11:00 local' },
      { label: 'Aircraft in area', value: 'Cessna training circuit is active' },
    ],
    atcTransmission: 'Compose your RPAS presence advisory on Springbank mandatory frequency.',
    callsign: 'RPAS Operator',
    template: '[AERODROME] traffic, RPAS operations [LOCATION], [ALT] AGL, [TIME_WINDOW], [OPERATOR_ID], [AERODROME] traffic.',
    blanks: ['Springbank', '800 m northwest of runway threshold', '50 m', '09:30 to 11:00 local', 'RPAS operator', 'Springbank'],
    hints: ['Aerodrome name (start)', 'Operation location description', 'Maximum altitude AGL', 'Time window', 'Who you are', 'Aerodrome name (end)'],
    sourceHints: ['Scenario: "Aerodrome" — name only', 'Scenario: "Your Operation" — location description', 'Scenario: "Your Operation" — altitude', 'Scenario: "Duration"', 'Identify yourself generically', 'Standard advisory format ends with the aerodrome name again'],
    explanation: 'On a mandatory frequency or UNICOM, RPAS operators are expected to advise manned aircraft of their presence, location, altitude, and operational window. The advisory follows the same format as a standard traffic advisory: aerodrome name, traffic info, and aerodrome name again.',
  },
  {
    id: 're4', title: 'RPAS Operations Handover',
    guide: 'Your replacement operator is arriving to take over mid-mission. Give them a complete situation awareness transfer. Every answer is in the scenario briefing — no RPAS background needed, just accurate information transfer.',
    scenarioBriefing: [
      { label: 'Current Aircraft Status', value: 'Airborne, 55 m AGL, 620 m northeast of GCS, battery 54%' },
      { label: 'Active Mission', value: 'Linear infrastructure inspection, segment 3 of 5 complete' },
      { label: 'Known Hazard', value: 'Power line crossing 300 m north of current position — marked on flight plan' },
      { label: 'Weather', value: 'Wind 12 km/h southwest, cloud base 800 m, deteriorating — recheck in 30 min' },
      { label: 'Next Action', value: 'Complete segment 4, then RTH to recharge before segment 5' },
    ],
    atcTransmission: 'Incoming operator: "I\'m here to take over. What\'s the situation?"',
    callsign: 'Outgoing RPAS Operator',
    template: 'Aircraft [STATUS]. Mission [MISSION_PROGRESS]. Hazard: [HAZARD]. Weather: [WX]. Next: [NEXT_ACTION].',
    blanks: ['airborne 55 m 620 m northeast battery 54%', 'segment 3 of 5 complete', 'power line 300 m north marked on plan', 'wind 12 km/h SW cloud 800 m deteriorating recheck 30 min', 'complete segment 4 then RTH to recharge'],
    hints: ['Aircraft current status', 'Mission progress', 'Known hazard', 'Weather and trend', 'Next planned action'],
    sourceHints: ['Scenario: "Current Aircraft Status"', 'Scenario: "Active Mission" — what segment are you on?', 'Scenario: "Known Hazard"', 'Scenario: "Weather"', 'Scenario: "Next Action"'],
    explanation: 'RPAS operator handovers must transfer: aircraft status (position, altitude, battery), mission progress, known hazards, current weather and trend, and the next planned action. An incomplete handover creates a safety gap.',
  },
];

const M7_RPAS_QUESTIONS: ReasoningQuestion[] = [
  { id: 'clarity', label: 'Communication Clarity', prompt: 'In the communication exercises you just completed, what made some transmissions harder to compose than others? What did you find yourself paying attention to?', placeholder: 'Describe what you noticed about how information needs to be communicated clearly…', minLength: 60 },
  { id: 'verification', label: 'Handling Uncertainty', prompt: 'If something in a transmission was unclear or you weren\'t sure you heard correctly, what would you do? What\'s your instinct?', placeholder: 'Describe how you would handle uncertainty in a communication exchange…', minLength: 60 },
  { id: 'teamwork', label: 'Team Coordination', prompt: 'These exercises involved passing information between people in time-pressured situations. What did that make you think about how teams need to communicate?', placeholder: 'Reflect on what you noticed about information transfer and coordination…', minLength: 60 },
];

// ── New immersive experience — Reflection questions ───────────────────────────
const M7_QUESTIONS: ReasoningQuestion[] = [
  { id: 'communication', label: 'Communication in Context', prompt: 'What did you notice about how information was exchanged in these scenarios? What made some communications clearer or more difficult than others?', placeholder: 'Reflect on what made the communications effective or challenging…', minLength: 60 },
  { id: 'uncertainty', label: 'Handling Uncertainty', prompt: 'At some points, information seemed unclear, incomplete or conflicting. What was your instinct when that happened? How did you decide whether to ask for clarification?', placeholder: 'Describe how you responded when something was unclear or didn\'t seem right…', minLength: 60 },
  { id: 'priorities', label: 'Setting Priorities', prompt: 'In the later scenarios, several things were happening at the same time. How did you decide what to respond to first or focus on most?', placeholder: 'Reflect on how you approached competing priorities in the situations…', minLength: 60 },
];

// ── Voice utilities ───────────────────────────────────────────────────────────
function speak(text: string, onEnd?: () => void): () => void {
  if (typeof window === 'undefined' || !window.speechSynthesis) { onEnd?.(); return () => {}; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.pitch = 0.88; utt.rate = 0.92;
  if (onEnd) utt.onend = () => onEnd();
  window.speechSynthesis.speak(utt);
  return () => window.speechSynthesis?.cancel();
}

function hasSTT(): boolean {
  return typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

// ── Response analysis ─────────────────────────────────────────────────────────
function wantsClarification(t: string): boolean {
  return t.includes('?') ||
    /confirm|clarif|verif|check|repeat|say again|sure|certain|double|discrepan|conflict|mismatch|different|not correct|incorrect|doesn.t match|doesn.t agree/i.test(t);
}

function notesConflict(t: string): boolean {
  return /east|west|position|showing|display|radar|inconsist|different|conflict|mismatch|opposite|not match/i.test(t);
}

function analyzeS1(response: string): number {
  const t = response.toLowerCase().trim();
  if (t.length < 5) return 0;
  let d = 0.10;
  if (/maple|214/.test(t)) d += 0.25;
  if (/west/.test(t)) d += 0.20;
  if (/receiv|copy|confirm|roger|got it|understand|acknowledg|heard|affirm/.test(t)) d += 0.20;
  return Math.min(0.70, d);
}

function analyzeS3(response: string, didClarify: boolean): number {
  const t = response.toLowerCase().trim();
  if (t.length < 5) return 0.05;
  const conflict = notesConflict(t);
  const clarify = didClarify || wantsClarification(t);
  if (clarify && conflict) return 0.70;
  if (clarify) return 0.55;
  if (conflict) return 0.40;
  return 0.15;
}

function analyzeS4(r1: string, r2: string): number {
  const t1 = r1.toLowerCase(); const t2 = r2.toLowerCase();
  let d = 0;
  if (/northern|305/.test(t1) && t1.trim().length > 5) d += 0.20;
  if (/maple|214/.test(t2) && t2.trim().length > 5) d += 0.20;
  if (/earlier|sooner|update|change|arriv|revised|ahead|ahead of|schedule/.test(t2)) d += 0.20;
  if (t1.trim().length > 5 && t2.trim().length > 5) d = Math.max(d, 0.15);
  return Math.min(0.65, d);
}

function analyzeS5(response: string): { dm: number; al: number } {
  const t = response.toLowerCase().trim();
  if (t.length < 5) return { dm: 0, al: 0.15 };
  let dm = 0; let al = 0.20;
  if (/maple|214|technical|assist|issue|concern/.test(t)) { dm += 0.30; al += 0.10; }
  if (/\?|what|detail|more|nature|type|tell|describe|help|kind of|how can/.test(t)) { dm += 0.25; al += 0.10; }
  if (/northern|305/.test(t)) al += 0.10;
  return { dm: Math.min(0.65, dm), al: Math.min(0.50, al) };
}

// ── Radar display ─────────────────────────────────────────────────────────────
function RadarDisplay({ aircraft }: { aircraft: Aircraft[] }) {
  const [angle, setAngle] = useState(0);
  const frameRef = useRef<number>(0);
  const prevRef = useRef(0);

  useEffect(() => {
    function tick(ts: number) {
      if (ts - prevRef.current > 50) {
        setAngle(a => (a + 3) % 360);
        prevRef.current = ts;
      }
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const cx = 100; const cy = 100; const r = 84;
  const rad = (angle * Math.PI) / 180;
  const sx = cx + r * Math.sin(rad);
  const sy = cy - r * Math.cos(rad);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 220, margin: '0 auto' }}>
      <svg viewBox="0 0 200 200" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Outer frame */}
        <circle cx={cx} cy={cy} r={r + 3} fill="#030a05" stroke="rgba(74,222,128,0.18)" strokeWidth="1" />
        {/* Background */}
        <circle cx={cx} cy={cy} r={r} fill="#030f06" />
        {/* Grid circles */}
        {[0.33, 0.66, 1].map(f => (
          <circle key={f} cx={cx} cy={cy} r={r * f} fill="none"
            stroke="rgba(74,222,128,0.07)" strokeWidth="0.6" />
        ))}
        {/* Grid lines */}
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="rgba(74,222,128,0.06)" strokeWidth="0.5" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="rgba(74,222,128,0.06)" strokeWidth="0.5" />
        {/* Sweep line */}
        <line x1={cx} y1={cy} x2={sx} y2={sy}
          stroke="rgba(74,222,128,0.5)" strokeWidth="1.5" />
        {/* Airport center */}
        <circle cx={cx} cy={cy} r={2.5} fill="#4ade80" opacity={0.95} />
        <text x={cx + 5} y={cy + 4} fill="rgba(74,222,128,0.6)" fontSize="6.5" fontFamily="monospace">APT</text>
        {/* Aircraft blips */}
        {aircraft.filter(a => a.visible).map(a => (
          <g key={a.id}>
            {a.alert && (
              <circle cx={a.x} cy={a.y} r={10} fill="none"
                stroke="rgba(239,68,68,0.6)" strokeWidth="1" />
            )}
            <polygon
              points={`${a.x},${a.y - 5} ${a.x + 4},${a.y} ${a.x},${a.y + 5} ${a.x - 4},${a.y}`}
              fill={a.alert ? '#f59e0b' : '#4ade80'}
            />
            <text x={a.x + 7} y={a.y + 4} fill={a.alert ? '#f59e0b' : '#4ade80'}
              fontSize="6.5" fontFamily="monospace" fontWeight="bold">{a.callsign}</text>
          </g>
        ))}
      </svg>
      {/* Compass */}
      {[
        { lbl: 'N', style: { top: '1%', left: '50%', transform: 'translateX(-50%)' } },
        { lbl: 'S', style: { bottom: '1%', left: '50%', transform: 'translateX(-50%)' } },
        { lbl: 'E', style: { right: '3%', top: '50%', transform: 'translateY(-50%)' } },
        { lbl: 'W', style: { left: '3%', top: '50%', transform: 'translateY(-50%)' } },
      ].map(({ lbl, style }) => (
        <div key={lbl} style={{
          position: 'absolute', ...style,
          color: 'rgba(74,222,128,0.35)', fontSize: 8, fontFamily: 'monospace', lineHeight: 1,
        }}>{lbl}</div>
      ))}
    </div>
  );
}

// ── Response input (PTT + text fallback) ─────────────────────────────────────
function ResponseInput({ onSubmit, context, label = 'Transmit Response' }: {
  onSubmit: (text: string) => void;
  context: string;
  label?: string;
}) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [tooShort, setTooShort] = useState(false);
  const [voiceSupported] = useState(hasSTT);
  const recogRef = useRef<any>(null);

  function startListening() {
    if (!voiceSupported) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recog = new SR();
    recog.lang = 'en'; recog.interimResults = false; recog.maxAlternatives = 1;
    recog.onresult = (e: any) => {
      setTranscript(e.results[0][0].transcript);
      setListening(false);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    recog.start();
    setListening(true);
  }

  function stopListening() {
    recogRef.current?.stop();
    setListening(false);
  }

  const currentText = transcript || text;

  function handleSubmit() {
    if (currentText.trim().length < 5) { setTooShort(true); return; }
    setTooShort(false);
    onSubmit(currentText.trim());
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.4 }}>{context}</div>

      {voiceSupported && (
        <button
          onPointerDown={startListening}
          onPointerUp={stopListening}
          style={{
            background: listening ? '#2a0606' : C.panel,
            border: `2px solid ${listening ? C.red : C.border}`,
            borderRadius: 10, padding: '11px 16px',
            color: listening ? C.red : C.dim,
            cursor: 'pointer', fontWeight: 600, fontSize: 13,
            touchAction: 'none', userSelect: 'none',
            transition: 'all 0.15s',
          }}
        >
          {listening ? '⬤  TRANSMITTING — Release to stop' : '🎙  Hold to Talk'}
        </button>
      )}

      <textarea
        value={transcript || text}
        onChange={e => {
          if (transcript) setTranscript(e.target.value);
          else setText(e.target.value);
        }}
        rows={3}
        placeholder={transcript ? 'Review and edit your response before submitting…' : 'Type your response here…'}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: C.panel, border: `1px solid ${C.border}`,
          borderRadius: 8, color: C.text, padding: '10px 12px',
          fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit',
        }}
      />

      {tooShort && (
        <div style={{ color: C.amber, fontSize: 12 }}>
          Please provide more detail before transmitting.
        </div>
      )}

      <button
        onClick={handleSubmit}
        style={{
          background: currentText.trim().length < 5
            ? '#111825'
            : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          color: currentText.trim().length < 5 ? C.dim : '#fff',
          border: 'none', borderRadius: 10, padding: '12px 16px',
          fontWeight: 700, fontSize: 14,
          cursor: currentText.trim().length < 5 ? 'not-allowed' : 'pointer',
          touchAction: 'manipulation',
        }}
      >
        {label}
      </button>
    </div>
  );
}

// ── Console wrapper (radar + aircraft panel + comms + children) ───────────────
function ATCConsole({
  aircraft, aircraftInfoRows, incomingMsg, pilotCallsign,
  scenarioNum, scenarioLabel, children,
}: {
  aircraft: Aircraft[];
  aircraftInfoRows: { callsign: string; status: string; alert?: boolean }[];
  incomingMsg?: string;
  pilotCallsign?: string;
  scenarioNum: number;
  scenarioLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        background: C.panel, borderBottom: `1px solid ${C.border}`,
        padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: C.blueL, fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1 }}>
          MISSION 07
        </span>
        <div style={{ width: 1, height: 10, background: C.border }} />
        <span style={{ color: C.dim, fontSize: 9 }}>
          SCENARIO {scenarioNum}/5 — {scenarioLabel.toUpperCase()}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} />
          <span style={{ color: C.green, fontSize: 8, fontFamily: 'monospace' }}>COMMS ACTIVE</span>
        </div>
      </div>

      {/* Radar + Aircraft info */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ background: '#030c05', borderRight: `1px solid ${C.border}`, padding: 10 }}>
          <div style={{ color: 'rgba(74,222,128,0.4)', fontSize: 8, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 6 }}>
            AIR TRAFFIC DISPLAY
          </div>
          <RadarDisplay aircraft={aircraft} />
        </div>
        <div style={{ background: C.panel, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ color: C.dim, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1 }}>
            AIRCRAFT INFORMATION
          </div>
          {aircraftInfoRows.map(a => (
            <div key={a.callsign} style={{
              background: a.alert ? '#1a1005' : C.card,
              border: `1px solid ${a.alert ? '#4a2a05' : C.border}`,
              borderRadius: 6, padding: '7px 9px',
            }}>
              <div style={{ color: a.alert ? C.amber : C.blueL, fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>
                {a.callsign}
              </div>
              <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{a.status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Incoming transmission */}
      {incomingMsg && (
        <div style={{
          background: '#090f18', borderBottom: `1px solid ${C.border}`,
          padding: '10px 14px',
        }}>
          <div style={{ color: C.blue, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 5 }}>
            🎧  INCOMING — {pilotCallsign}
          </div>
          <div style={{ color: C.text, fontSize: 13, fontStyle: 'italic', lineHeight: 1.55 }}>
            "{incomingMsg}"
          </div>
        </div>
      )}

      {/* Active scenario content */}
      {children && (
        <div style={{ background: C.bg, padding: 14 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────────
function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <div style={{
      minHeight: 400, background: 'linear-gradient(160deg, #07090f 0%, #0c1628 60%, #07090f 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', gap: 24, textAlign: 'center',
    }}>
      {/* Mission badge */}
      <div style={{
        background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)',
        borderRadius: 8, padding: '5px 14px',
        color: C.blueL, fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, fontWeight: 700,
      }}>
        MISSION 07
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ color: C.text, fontSize: 26, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
          Air Traffic Communication
        </h1>
        <p style={{ color: C.blue, fontSize: 13, margin: 0, fontStyle: 'italic', letterSpacing: 0.5 }}>
          Listen. Interpret. Communicate. Adapt.
        </p>
      </div>

      {/* Tower icon placeholder */}
      <div style={{
        width: 80, height: 80,
        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36,
      }}>
        🗼
      </div>

      {/* Captain ACIA intro */}
      <div style={{
        background: 'rgba(14,24,40,0.8)', border: '1px solid rgba(30,49,72,0.8)',
        borderRadius: 12, padding: '18px 20px', maxWidth: 440,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ color: C.blueL, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
          CAPTAIN ACIA
        </div>
        <p style={{ color: C.text, fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          Welcome to Mission 7.
        </p>
        <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          You're about to experience how communication, attention and decision-making come
          together in an airport environment. You'll receive messages from aircraft, monitor
          changing information and respond to different situations.
        </p>
        <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          You don't need aviation experience or specialized terminology. Listen carefully,
          communicate clearly and ask questions whenever something doesn't make sense.
        </p>
      </div>

      <button
        onClick={onEnter}
        style={{
          background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          color: '#fff', border: 'none', borderRadius: 12, padding: '14px 32px',
          fontWeight: 700, fontSize: 15, cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        Enter Communications Centre →
      </button>
    </div>
  );
}

// ── Setup screen ──────────────────────────────────────────────────────────────
function SetupScreen({ onReady }: { onReady: () => void }) {
  const [audioTested, setAudioTested] = useState(false);
  const [micStatus, setMicStatus] = useState<'idle' | 'granted' | 'denied' | 'unavailable'>('idle');

  function testAudio() {
    speak('Communications centre ready. Maple 214, this is Clearfield Tower. Message received.');
    setAudioTested(true);
  }

  async function testMic() {
    if (!hasSTT()) { setMicStatus('unavailable'); return; }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStatus('granted');
    } catch {
      setMicStatus('denied');
    }
  }

  return (
    <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ color: C.blueL, fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, fontWeight: 700 }}>
        COMMUNICATION SETUP
      </div>

      <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        For the best experience, use headphones or a headset. Voice is optional — you can
        type all your responses if preferred.
      </p>

      {/* Audio check */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
          Step 1 — Audio check
        </div>
        <button
          onClick={testAudio}
          style={{
            background: audioTested ? '#0a1a0a' : C.panel,
            border: `1px solid ${audioTested ? '#1a3a1a' : C.border}`,
            borderRadius: 8, padding: '9px 16px',
            color: audioTested ? C.green : C.text,
            cursor: 'pointer', fontSize: 13, touchAction: 'manipulation',
          }}
        >
          {audioTested ? '✓ Audio working' : 'Play sample pilot message'}
        </button>
        {!audioTested && (
          <p style={{ color: C.dim, fontSize: 11, marginTop: 6, marginBottom: 0 }}>
            If you don't hear anything, pilot transmissions will appear as text only.
          </p>
        )}
      </div>

      {/* Mic check */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
          Step 2 — Microphone (optional)
        </div>
        {micStatus === 'idle' && (
          <button
            onClick={testMic}
            style={{
              background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '9px 16px', color: C.text, cursor: 'pointer', fontSize: 13, touchAction: 'manipulation',
            }}
          >
            Check microphone
          </button>
        )}
        {micStatus === 'granted' && (
          <div style={{ color: C.green, fontSize: 12 }}>✓ Microphone ready — voice mode available</div>
        )}
        {micStatus === 'denied' && (
          <div style={{ color: C.amber, fontSize: 12 }}>Microphone access denied — text mode only. That's fine.</div>
        )}
        {micStatus === 'unavailable' && (
          <div style={{ color: C.dim, fontSize: 12 }}>Voice input not supported in this browser — text mode only. That's fine.</div>
        )}
      </div>

      <button
        onClick={onReady}
        style={{
          background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          color: '#fff', border: 'none', borderRadius: 12, padding: '13px 24px',
          fontWeight: 700, fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        Begin Mission →
      </button>
    </div>
  );
}

// ── Pilot message card ────────────────────────────────────────────────────────
function PilotMessage({ message, callsign, onReady, autoSpeak = true }: {
  message: string; callsign: string; onReady: () => void; autoSpeak?: boolean;
}) {
  const [spoken, setSpoken] = useState(false);

  useEffect(() => {
    if (!autoSpeak) { setSpoken(true); return; }
    const cancel = speak(message, () => setSpoken(true));
    return cancel;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: '#090f18', border: `1px solid ${C.border}`,
        borderRadius: 10, padding: '12px 14px',
      }}>
        <div style={{ color: C.blue, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 6 }}>
          🎧  INCOMING — {callsign}
        </div>
        <div style={{ color: C.text, fontSize: 14, fontStyle: 'italic', lineHeight: 1.55 }}>
          "{message}"
        </div>
        {!spoken && (
          <div style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>Playing pilot audio…</div>
        )}
      </div>

      <button
        onClick={onReady}
        style={{
          background: C.panel, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '11px 16px',
          color: C.text, cursor: 'pointer', fontSize: 13, fontWeight: 600, touchAction: 'manipulation',
        }}
      >
        Message received →
      </button>
    </div>
  );
}

// ── Feedback card ─────────────────────────────────────────────────────────────
function FeedbackCard({ message, onNext, nextLabel = 'Continue →' }: {
  message: string; onNext: () => void; nextLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: '#0a130a', border: '1px solid #1a3a1a',
        borderRadius: 10, padding: '12px 14px',
        color: C.dim, fontSize: 13, lineHeight: 1.6,
      }}>
        {message}
      </div>
      <button
        onClick={onNext}
        style={{
          background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px',
          fontWeight: 700, fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}

// ── Scenario 1: Initial Radio Contact ─────────────────────────────────────────
function Scenario1({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [step, setStep] = useState<'intro' | 'pilot' | 'respond' | 'done'>('intro');

  const aircraft: Aircraft[] = [
    { id: 'maple', callsign: 'MAPLE 214', x: 40, y: 90, status: 'Approaching — West', visible: true },
  ];

  const aircraftInfo = [
    { callsign: 'MAPLE 214', status: 'Approaching from the west' },
  ];

  if (step === 'intro') {
    return (
      <ATCConsole aircraft={aircraft} aircraftInfoRows={aircraftInfo}
        scenarioNum={1} scenarioLabel="Initial Radio Contact">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: C.panel, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{ color: C.blueL, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>
              SITUATION
            </div>
            <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              You've just taken your position at the communications console. The display shows
              one aircraft — <strong style={{ color: C.blueL }}>MAPLE 214</strong> — approaching
              from the west. A transmission is coming in.
            </p>
            <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.5, marginTop: 8, marginBottom: 0 }}>
              You don't need to use formal aviation terminology. Listen to the message, identify
              the key information and respond clearly.
            </p>
          </div>
          <button onClick={() => setStep('pilot')} style={{
            background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
          }}>
            Open channel →
          </button>
        </div>
      </ATCConsole>
    );
  }

  if (step === 'pilot') {
    return (
      <ATCConsole aircraft={aircraft} aircraftInfoRows={aircraftInfo}
        scenarioNum={1} scenarioLabel="Initial Radio Contact">
        <PilotMessage
          callsign="MAPLE 214"
          message="Tower, Maple 214. We're approaching from the west and would like to confirm that you received our message."
          onReady={() => setStep('respond')}
        />
      </ATCConsole>
    );
  }

  if (step === 'respond') {
    return (
      <ATCConsole aircraft={aircraft} aircraftInfoRows={aircraftInfo}
        incomingMsg="Tower, Maple 214. We're approaching from the west and would like to confirm that you received our message."
        pilotCallsign="MAPLE 214"
        scenarioNum={1} scenarioLabel="Initial Radio Contact">
        <ResponseInput
          context="Acknowledge MAPLE 214's message. Include the aircraft name and confirm the key information."
          onSubmit={text => {
            const delta = analyzeS1(text);
            onComplete([{ key: 'communication_quality', delta }]);
          }}
        />
      </ATCConsole>
    );
  }

  return null;
}

// ── Scenario 3: Conflicting Information ───────────────────────────────────────
function Scenario3({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [step, setStep] = useState<'intro' | 'pilot' | 'respond' | 'correction' | 'done'>('intro');
  const [clarifyRequested, setClarifyRequested] = useState(false);
  const responseRef = useRef('');

  const aircraftEast: Aircraft[] = [
    { id: 'maple', callsign: 'MAPLE 214', x: 158, y: 90, status: 'Position: East', visible: true },
  ];
  const aircraftInfoConflict = [
    { callsign: 'MAPLE 214', status: 'Display: East of airport — Pilot reports: West' },
  ];
  const aircraftInfoResolved = [
    { callsign: 'MAPLE 214', status: 'Position confirmed: East of airport' },
  ];

  if (step === 'intro') {
    return (
      <ATCConsole aircraft={aircraftEast} aircraftInfoRows={[{ callsign: 'MAPLE 214', status: 'Position: East of airport' }]}
        scenarioNum={3} scenarioLabel="Conflicting Information">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ color: C.blueL, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>SITUATION</div>
            <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              Your display shows <strong style={{ color: C.blueL }}>MAPLE 214</strong> positioned
              east of the airport. An incoming transmission is coming in from MAPLE 214 with
              information about their position.
            </p>
            <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.5, marginTop: 8, marginBottom: 0 }}>
              Pay attention to what the pilot says and compare it to what your display shows.
            </p>
          </div>
          <button onClick={() => setStep('pilot')} style={{
            background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
          }}>Open channel →</button>
        </div>
      </ATCConsole>
    );
  }

  if (step === 'pilot') {
    return (
      <ATCConsole aircraft={aircraftEast} aircraftInfoRows={aircraftInfoConflict}
        scenarioNum={3} scenarioLabel="Conflicting Information">
        <PilotMessage
          callsign="MAPLE 214"
          message="Tower, Maple 214. We're approximately five miles west of the airport."
          onReady={() => setStep('respond')}
        />
      </ATCConsole>
    );
  }

  if (step === 'respond') {
    return (
      <ATCConsole aircraft={aircraftEast} aircraftInfoRows={aircraftInfoConflict}
        incomingMsg="Tower, Maple 214. We're approximately five miles west of the airport."
        pilotCallsign="MAPLE 214"
        scenarioNum={3} scenarioLabel="Conflicting Information">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            background: '#160f04', border: '1px solid #3a2205',
            borderRadius: 8, padding: '9px 12px',
            color: '#d97706', fontSize: 12, lineHeight: 1.5,
          }}>
            ⚠ Your display shows MAPLE 214 east of the airport. The pilot has reported a different position.
          </div>
          <ResponseInput
            context="Respond to MAPLE 214. You may acknowledge their message, ask for clarification, or address the position information."
            onSubmit={text => {
              responseRef.current = text;
              const asked = wantsClarification(text) || notesConflict(text);
              setClarifyRequested(asked);
              if (asked) {
                setStep('correction');
              } else {
                const delta = analyzeS3(text, false);
                onComplete([{ key: 'situational_awareness', delta }]);
              }
            }}
          />
        </div>
      </ATCConsole>
    );
  }

  if (step === 'correction') {
    const correctionAircraft: Aircraft[] = [
      { id: 'maple', callsign: 'MAPLE 214', x: 158, y: 90, status: 'Position confirmed: East', visible: true },
    ];
    return (
      <ATCConsole aircraft={correctionAircraft} aircraftInfoRows={aircraftInfoResolved}
        scenarioNum={3} scenarioLabel="Conflicting Information">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#090f18', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ color: C.blue, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 6 }}>
              🎧  MAPLE 214 — CORRECTION
            </div>
            <div style={{ color: C.text, fontSize: 14, fontStyle: 'italic', lineHeight: 1.55 }}>
              "Maple 214. Correction — we are east of the airport. Apologies for the confusion."
            </div>
          </div>
          <div style={{ background: '#0a130a', border: '1px solid #1a3a1a', borderRadius: 8, padding: '9px 12px', color: C.dim, fontSize: 12, lineHeight: 1.5 }}>
            Display updated. MAPLE 214 position confirmed as east of the airport.
          </div>
          <FeedbackCard
            message="You identified the discrepancy and requested clarification. MAPLE 214 has now confirmed their correct position."
            onNext={() => {
              const delta = analyzeS3(responseRef.current, true);
              onComplete([{ key: 'situational_awareness', delta }]);
            }}
            nextLabel="Continue to Scenario 4 →"
          />
        </div>
      </ATCConsole>
    );
  }

  return null;
}

// ── Scenario 4: Changing Traffic Situation ────────────────────────────────────
function Scenario4({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [step, setStep] = useState<'intro' | 'pilot1' | 'respond1' | 'pilot2' | 'respond2'>('intro');
  const r1Ref = useRef('');

  const aircraft: Aircraft[] = [
    { id: 'maple', callsign: 'MAPLE 214', x: 155, y: 96, status: 'Approaching', visible: true },
    { id: 'northern', callsign: 'NTH 305', x: 106, y: 145, status: 'Ground — Dep.', visible: true },
  ];
  const aircraftInfo = [
    { callsign: 'MAPLE 214', status: 'Approaching from east' },
    { callsign: 'NORTHERN 305', status: 'Preparing for departure' },
  ];
  const aircraftInfoUpdated = [
    { callsign: 'MAPLE 214', status: 'Arrival: earlier than planned' },
    { callsign: 'NORTHERN 305', status: 'Preparing for departure' },
  ];

  if (step === 'intro') {
    return (
      <ATCConsole aircraft={aircraft} aircraftInfoRows={aircraftInfo}
        scenarioNum={4} scenarioLabel="Changing Traffic Situation">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ color: C.blueL, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>SITUATION</div>
            <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              The traffic picture has changed. Two aircraft are now on your display. You'll be
              receiving communications from both — pay attention to what's new or changing, and
              respond to each one.
            </p>
          </div>
          <button onClick={() => setStep('pilot1')} style={{
            background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
          }}>Open channel →</button>
        </div>
      </ATCConsole>
    );
  }

  if (step === 'pilot1') {
    return (
      <ATCConsole aircraft={aircraft} aircraftInfoRows={aircraftInfo}
        scenarioNum={4} scenarioLabel="Changing Traffic Situation">
        <PilotMessage
          callsign="NORTHERN 305"
          message="Tower, Northern 305. We're preparing to depart and waiting for further information."
          onReady={() => setStep('respond1')}
        />
      </ATCConsole>
    );
  }

  if (step === 'respond1') {
    return (
      <ATCConsole aircraft={aircraft} aircraftInfoRows={aircraftInfo}
        incomingMsg="Tower, Northern 305. We're preparing to depart and waiting for further information."
        pilotCallsign="NORTHERN 305"
        scenarioNum={4} scenarioLabel="Changing Traffic Situation">
        <ResponseInput
          context="Acknowledge NORTHERN 305's message. A second transmission from MAPLE 214 will follow."
          label="Respond to NORTHERN 305"
          onSubmit={text => { r1Ref.current = text; setStep('pilot2'); }}
        />
      </ATCConsole>
    );
  }

  if (step === 'pilot2') {
    return (
      <ATCConsole aircraft={aircraft} aircraftInfoRows={aircraftInfoUpdated}
        scenarioNum={4} scenarioLabel="Changing Traffic Situation">
        <PilotMessage
          callsign="MAPLE 214"
          message="Tower, Maple 214. Our arrival estimate has changed. We now expect to arrive earlier than planned."
          onReady={() => setStep('respond2')}
        />
      </ATCConsole>
    );
  }

  if (step === 'respond2') {
    return (
      <ATCConsole aircraft={aircraft} aircraftInfoRows={aircraftInfoUpdated}
        incomingMsg="Tower, Maple 214. Our arrival estimate has changed. We now expect to arrive earlier than planned."
        pilotCallsign="MAPLE 214"
        scenarioNum={4} scenarioLabel="Changing Traffic Situation">
        <ResponseInput
          context="Respond to MAPLE 214's updated arrival information."
          label="Respond to MAPLE 214"
          onSubmit={text => {
            const delta = analyzeS4(r1Ref.current, text);
            onComplete([{ key: 'multitasking_ability', delta }]);
          }}
        />
      </ATCConsole>
    );
  }

  return null;
}

// ── Scenario 5: Unexpected Operational Event ──────────────────────────────────
function Scenario5({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [step, setStep] = useState<'intro' | 'pilots' | 'northern' | 'respond' | 'ack'>('intro');
  const responseRef = useRef('');

  const aircraftAlert: Aircraft[] = [
    { id: 'maple', callsign: 'MAPLE 214', x: 140, y: 98, visible: true, status: 'Technical Issue', alert: true },
    { id: 'northern', callsign: 'NTH 305', x: 106, y: 145, visible: true, status: 'Ground — Standby' },
  ];
  const aircraftInfo = [
    { callsign: 'MAPLE 214', status: 'Technical issue reported', alert: true },
    { callsign: 'NORTHERN 305', status: 'Ground — standing by' },
  ];

  if (step === 'intro') {
    return (
      <ATCConsole aircraft={aircraftAlert} aircraftInfoRows={aircraftInfo}
        scenarioNum={5} scenarioLabel="Unexpected Operational Event">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ color: C.blueL, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>SITUATION</div>
            <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              Two transmissions are coming in at the same time. Both aircraft are on your display.
              Listen to both messages and decide how to respond.
            </p>
            <p style={{ color: C.dim, fontSize: 12, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
              This is a competency exercise, not an emergency procedures test. Respond clearly,
              ask questions if you need more information.
            </p>
          </div>
          <button onClick={() => setStep('pilots')} style={{
            background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
          }}>Open channel →</button>
        </div>
      </ATCConsole>
    );
  }

  if (step === 'pilots') {
    return (
      <ATCConsole aircraft={aircraftAlert} aircraftInfoRows={aircraftInfo}
        scenarioNum={5} scenarioLabel="Unexpected Operational Event">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PilotMessage
            callsign="MAPLE 214"
            message="Tower, Maple 214. We've experienced a technical issue and need assistance. Our arrival plans may change."
            onReady={() => setStep('northern')}
            autoSpeak
          />
        </div>
      </ATCConsole>
    );
  }

  if (step === 'northern') {
    return (
      <ATCConsole aircraft={aircraftAlert} aircraftInfoRows={aircraftInfo}
        scenarioNum={5} scenarioLabel="Unexpected Operational Event">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* First message shown in header */}
          <div style={{ background: '#160808', border: '1px solid #3a1010', borderRadius: 8, padding: '9px 12px' }}>
            <div style={{ color: C.red, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 4 }}>
              ⚠ MAPLE 214 — TECHNICAL ISSUE
            </div>
            <div style={{ color: '#fca5a5', fontSize: 12, fontStyle: 'italic' }}>
              "We've experienced a technical issue and need assistance. Our arrival plans may change."
            </div>
          </div>
          <PilotMessage
            callsign="NORTHERN 305"
            message="Tower, Northern 305. Still preparing on the ground, no changes on our end."
            onReady={() => setStep('respond')}
            autoSpeak
          />
        </div>
      </ATCConsole>
    );
  }

  if (step === 'respond') {
    return (
      <ATCConsole aircraft={aircraftAlert} aircraftInfoRows={aircraftInfo}
        scenarioNum={5} scenarioLabel="Unexpected Operational Event">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ background: '#160808', border: '1px solid #3a1010', borderRadius: 7, padding: '8px 10px' }}>
              <div style={{ color: C.red, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 3 }}>⚠ MAPLE 214</div>
              <div style={{ color: '#fca5a5', fontSize: 12, fontStyle: 'italic' }}>
                "We've experienced a technical issue and need assistance. Our arrival plans may change."
              </div>
            </div>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px' }}>
              <div style={{ color: C.dim, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 3 }}>NORTHERN 305</div>
              <div style={{ color: C.dim, fontSize: 12, fontStyle: 'italic' }}>
                "Still preparing on the ground, no changes on our end."
              </div>
            </div>
          </div>
          <ResponseInput
            context="Respond to the transmissions you just heard. You can address both aircraft in one response."
            onSubmit={text => {
              responseRef.current = text;
              const { dm, al } = analyzeS5(text);
              if (wantsClarification(text) || text.includes('?')) {
                setStep('ack');
              } else {
                onComplete([
                  { key: 'decision_quality', delta: dm },
                  { key: 'learning_agility', delta: al },
                ]);
              }
            }}
          />
        </div>
      </ATCConsole>
    );
  }

  if (step === 'ack') {
    return (
      <ATCConsole aircraft={aircraftAlert} aircraftInfoRows={aircraftInfo}
        scenarioNum={5} scenarioLabel="Unexpected Operational Event">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#090f18', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ color: C.blue, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 6 }}>
              🎧  MAPLE 214 — RESPONSE
            </div>
            <div style={{ color: C.text, fontSize: 14, fontStyle: 'italic', lineHeight: 1.55 }}>
              "Maple 214. We have an issue with our navigation system — minor, we believe. Monitoring the situation. Will keep you updated as we get more information."
            </div>
          </div>
          <FeedbackCard
            message="You sought additional information from MAPLE 214. That kind of follow-up communication is a key part of managing uncertainty in operational environments."
            onNext={() => {
              const { dm, al } = analyzeS5(responseRef.current);
              onComplete([
                { key: 'decision_quality', delta: Math.min(0.65, dm + 0.10) },
                { key: 'learning_agility', delta: Math.min(0.50, al + 0.05) },
              ]);
            }}
            nextLabel="Continue →"
          />
        </div>
      </ATCConsole>
    );
  }

  return null;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  isRpas?: boolean;
  sessionId?: string;
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

// ── Main export ───────────────────────────────────────────────────────────────
export function ATCCommunication({ isRpas, sessionId, onComplete }: Props) {
  // RPAS path: original fill-in exercise format (unchanged)
  if (isRpas) {
    return <ATCCommunicationCore exercises={RPAS_EXERCISES} questions={M7_RPAS_QUESTIONS} onComplete={onComplete} />;
  }

  return <ATCMission7 sessionId={sessionId} onComplete={onComplete} />;
}

// ── New immersive orchestrator (non-RPAS) ─────────────────────────────────────
function ATCMission7({ sessionId, onComplete }: { sessionId?: string; onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [phase, setPhase] = useState<Phase>('welcome');
  const wmEvidenceRef = useRef<Omit<EvidenceItem, 'mission'>[]>([]);
  const evidenceRef = useRef<Omit<EvidenceItem, 'mission'>[]>([]);
  const pendingRef = useRef<Omit<EvidenceItem, 'mission'>[]>([]);

  function addEvidence(ev: Omit<EvidenceItem, 'mission'>[]) {
    evidenceRef.current = [...evidenceRef.current, ...ev];
  }

  if (phase === 'welcome') {
    return <WelcomeScreen onEnter={() => setPhase('setup')} />;
  }

  if (phase === 'setup') {
    return <SetupScreen onReady={() => setPhase('s1')} />;
  }

  if (phase === 's1') {
    return (
      <Scenario1 onComplete={ev => {
        addEvidence(ev);
        setPhase('wm');
      }} />
    );
  }

  if (phase === 'wm') {
    return (
      <ATCBriefing
        sessionId={sessionId}
        onComplete={(wmEv: WMEvidence) => {
          // ── Preserved exactly from prior ATCCommunication implementation ──
          const submissionId = crypto.randomUUID();
          const token = sessionStorage.getItem('aacp_token') ?? localStorage.getItem('aacp_token');
          if (token) {
            fetch('/acia/wm-evidence', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ submissionId, sessionId, wmEvidence: wmEv }),
            }).catch(() => {});
          }
          const interp = interpretWMEvidence(wmEv);
          try { localStorage.setItem(`acia_wm_interpretation_${sessionId ?? 'local'}`, JSON.stringify(interp)); } catch { /* ignore */ }
          let wmDelta = 0;
          if (interp.state === 'observed') {
            const d = interp.dimensions;
            wmDelta += d.retention === 'accurate' ? 0.25 : d.retention === 'partial' ? 0.12 : 0;
            wmDelta += d.updateTracking === 'accurate' ? 0.25 : d.updateTracking === 'partial' ? 0.10 : 0;
            wmDelta += d.interferenceManagement === 'clean' ? 0.10 : 0;
            wmDelta = Math.min(0.60, wmDelta);
          }
          wmEvidenceRef.current = [{ key: 'working_memory', delta: wmDelta }];
          // ── End preserved block ──
          setPhase('s3');
        }}
      />
    );
  }

  if (phase === 's3') {
    return (
      <Scenario3 onComplete={ev => {
        addEvidence(ev);
        setPhase('s4');
      }} />
    );
  }

  if (phase === 's4') {
    return (
      <Scenario4 onComplete={ev => {
        addEvidence(ev);
        setPhase('s5');
      }} />
    );
  }

  if (phase === 's5') {
    return (
      <Scenario5 onComplete={ev => {
        addEvidence(ev);
        pendingRef.current = [...wmEvidenceRef.current, ...evidenceRef.current, ...ev];
        setPhase('reflection');
      }} />
    );
  }

  if (phase === 'reflection') {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ color: C.blueL, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
            CAPTAIN ACIA
          </div>
          <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            Mission complete. You've experienced how aviation communication environments bring
            together listening, information processing, situational awareness and decision-making.
            Before we close, take a moment to reflect.
          </p>
        </div>
        <MissionReasoningResponse
          questions={M7_QUESTIONS}
          storageKey="acia_m7_reasoning"
          onComplete={() => onComplete(pendingRef.current)}
        />
      </div>
    );
  }

  return null;
}

// ── ATCCommunicationCore — RPAS path (unchanged logic) ────────────────────────
function ATCCommunicationCore({ exercises, questions, onComplete }: {
  exercises: CommunicationExercise[];
  questions: ReasoningQuestion[];
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}) {
  const [exIdx, setExIdx] = useState(0);
  const [inputs, setInputs] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [showSourceHints, setShowSourceHints] = useState(false);
  const [allScores, setAllScores] = useState<number[]>([]);
  const [showReasoning, setShowReasoning] = useState(false);
  const pendingEvidence = useRef<Omit<EvidenceItem, 'mission'>[]>([]);

  const ex = exercises[exIdx];
  const isLast = exIdx === exercises.length - 1;

  function init() { setInputs(new Array(ex.blanks.length).fill('')); }
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
      const evidence: Omit<EvidenceItem, 'mission'>[] = [
        { key: 'communication_quality', delta: avg * 0.9 },
        { key: 'procedural_compliance', delta: avg * 0.85 },
        { key: 'attention_to_detail', delta: avg * 0.8 },
        { key: 'situational_awareness', delta: (allScores[0] ?? 0) > 0.6 ? 0.75 : 0.35 },
        { key: 'systematic_reasoning', delta: (allScores[3] ?? 0) > 0.7 ? 0.65 : 0.3 },
      ];
      pendingEvidence.current = evidence;
      setShowReasoning(true);
    } else {
      setExIdx(i => i + 1);
      setInputs([]);
      setRevealed(false);
      setShowSourceHints(false);
    }
  }

  if (showReasoning) {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: '#0f1520', border: '1px solid #1e3a5f', borderRadius: 12, padding: '10px 16px' }}>
          <div style={{ color: '#93c5fd', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Air Navigation Communication — Reflection
          </div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            You've completed all communication exercises. Reflect on how information moves between people in operational environments.
          </div>
        </div>
        <MissionReasoningResponse
          questions={questions}
          storageKey="acia_m7_reasoning"
          onComplete={() => onComplete(pendingEvidence.current)}
        />
      </div>
    );
  }

  const transmissionColor = ex.id === 're3' ? '#ef4444' : ex.id === 're4' ? '#a855f7' : '#60a5fa';
  const transmissionBg = ex.id === 're3' ? '#1a0505' : ex.id === 're4' ? '#1a0d2a' : '#0f1520';
  const transmissionBorder = ex.id === 're3' ? '#3a0505' : ex.id === 're4' ? '#2a1a4a' : '#1e3a5f';

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {exercises.map((_, i) => (
          <div key={i} style={{
            width: i === exIdx ? 24 : 8, height: 8, borderRadius: 4,
            background: i < exIdx ? C.green : i === exIdx ? C.crimson : C.border,
            transition: 'all 0.2s',
          }} />
        ))}
        <span style={{ color: C.dim, fontSize: 12, marginLeft: 8 }}>
          Exercise {exIdx + 1}/{exercises.length} — {ex.title}
        </span>
      </div>

      <div style={{ background: '#1a1505', border: '1px solid #3d2e05', borderRadius: 10, padding: '10px 14px' }}>
        <div style={{ color: '#fbbf24', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          How to complete this exercise
        </div>
        <div style={{ color: '#e2c77a', fontSize: 13, lineHeight: 1.6 }}>{ex.guide}</div>
      </div>

      {ex.scenarioBriefing && (
        <div style={{ background: '#0f1a2e', border: '1px solid #1e3a5f', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#60a5fa', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Scenario Briefing — your answers come from here
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ex.scenarioBriefing.map(fact => (
              <div key={fact.label} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ color: '#93c5fd', fontWeight: 600, minWidth: 160, flexShrink: 0 }}>{fact.label}:</span>
                <span style={{ color: '#dde4f0' }}>{fact.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: transmissionBg, border: `1px solid ${transmissionBorder}`, borderRadius: 12, padding: 16 }}>
        <div style={{ color: transmissionColor, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          {ex.id === 're4' ? 'Incoming Operator' : 'ATC Transmission'} — {ex.title}
        </div>
        <div style={{ color: '#dde4f0', fontSize: 14, lineHeight: 1.65, fontStyle: 'italic' }}>
          "{ex.atcTransmission}"
        </div>
      </div>

      <div style={{ background: '#0d120d', border: '1px solid #1a2e1a', borderRadius: 10, padding: '10px 14px' }}>
        <div style={{ color: '#4ade80', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Response template — fill in the blanks below
        </div>
        <div style={{ color: '#86efac', fontSize: 12, lineHeight: 1.7, fontFamily: 'monospace' }}>{ex.template}</div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: C.dim, fontSize: 12 }}>
            Compose your <strong style={{ color: C.text }}>{ex.title.toLowerCase()}</strong> as{' '}
            <strong style={{ color: C.text }}>{ex.callsign}</strong>:
          </div>
          {!revealed && (
            <button onClick={() => setShowSourceHints(v => !v)} style={{
              background: 'transparent', border: '1px solid #3d2e05', borderRadius: 6,
              padding: '4px 10px', color: '#fbbf24', fontSize: 11, cursor: 'pointer',
              touchAction: 'manipulation', flexShrink: 0, marginLeft: 12,
            }}>
              {showSourceHints ? 'Hide hints' : 'Where do I find this?'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ex.blanks.map((blank, i) => (
            <div key={i}>
              <label style={{ color: C.dim, fontSize: 11, display: 'block', marginBottom: 3 }}>
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
                    ? inputs[i]?.trim().toLowerCase().includes(blank.toLowerCase().split(' ')[0]) ? '#0f1a0f' : '#1a0505'
                    : C.bg,
                  border: `1px solid ${revealed
                    ? inputs[i]?.trim().toLowerCase().includes(blank.toLowerCase().split(' ')[0]) ? '#1a3a1a' : '#3a0505'
                    : C.border}`,
                  borderRadius: 8, color: C.text, padding: '10px 12px',
                  fontSize: 14, outline: 'none', boxSizing: 'border-box', touchAction: 'manipulation',
                }}
              />
              {revealed && (
                <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>
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
          <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.6 }}>{ex.explanation}</div>
        </div>
      )}

      {!revealed ? (
        <button onClick={confirm} disabled={inputs.some(v => !v?.trim())} style={{
          background: inputs.some(v => !v?.trim()) ? '#2d1118' : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          color: inputs.some(v => !v?.trim()) ? C.dim : 'white',
          border: 'none', borderRadius: 12, padding: '14px',
          cursor: inputs.some(v => !v?.trim()) ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: 14, touchAction: 'manipulation',
        }}>
          Submit Response
        </button>
      ) : (
        <button onClick={next} style={{
          background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          color: 'white', border: 'none', borderRadius: 12, padding: '14px',
          cursor: 'pointer', fontWeight: 700, fontSize: 14, touchAction: 'manipulation',
        }}>
          {isLast ? 'Complete Mission →' : 'Next Exercise →'}
        </button>
      )}
    </div>
  );
}
