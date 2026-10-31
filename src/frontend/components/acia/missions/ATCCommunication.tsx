import { useState, useRef, useEffect } from 'react';
import type { EvidenceItem } from '../types';
import { MissionReasoningResponse, type ReasoningQuestion } from './MissionReasoningResponse';
import { ATCBriefing, type WMEvidence } from './ATCBriefing';
import { interpretWMEvidence } from '../wmInterpreter';

// ── Color palette — aviation workstation ──────────────────────────────────────
const C = {
  bg: '#05080f',
  panel: '#0a1120',
  card: '#0d1626',
  border: '#162340',
  borderL: '#1e3a5f',
  text: '#d8e4f0',
  dim: '#526070',
  dimM: '#7a8fa0',
  blue: '#2563eb',
  blueL: '#60a5fa',
  blueXL: '#bfdbfe',
  green: '#16a34a',
  greenL: '#4ade80',
  amber: '#d97706',
  amberL: '#fbbf24',
  red: '#dc2626',
  action: '#1d4ed8',
  actionH: '#1e40af',
  radarBg: '#020a04',
  radarGreen: 'rgba(74,222,128,',
};

// ── Reduced-motion helper ─────────────────────────────────────────────────────
function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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
  template: string; blanks: string[]; hints: string[]; sourceHints: string[]; explanation: string;
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
    explanation: 'RPAS authorization requests near controlled airspace must include the pilot\'s certification level, exact location, maximum altitude, operational window (in UTC/Zulu), and aircraft MTOW.',
  },
  {
    id: 're2', title: 'Lost-Link Incident Report',
    guide: 'After a lost-link event, you are required to submit an occurrence report to Transport Canada. Use the scenario briefing to compose the incident notification.',
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
    sourceHints: ['Scenario: "Operator"', 'Scenario: "Date / Location"', 'Scenario: "Aircraft" — registration code only', 'Scenario: "What Happened" — brief description', 'Scenario: "What Happened" — how long?', 'Scenario: "What Happened" — result?', 'Scenario: "Probable Cause"'],
    explanation: 'RPAS operators in Canada are required to report occurrences including lost link, unintended landings, airspace incursions, and aircraft damage.',
  },
  {
    id: 're3', title: 'Pre-Flight Airspace Communication',
    guide: 'Before flying near an aerodrome, you may need to contact the mandatory frequency or UNICOM to advise manned aircraft of your presence.',
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
    sourceHints: ['Scenario: "Aerodrome" — name only', 'Scenario: "Your Operation" — location', 'Scenario: "Your Operation" — altitude', 'Scenario: "Duration"', 'Identify yourself generically', 'Standard advisory ends with aerodrome name again'],
    explanation: 'On a mandatory frequency or UNICOM, RPAS operators advise manned aircraft of their presence, location, altitude, and operational window.',
  },
  {
    id: 're4', title: 'RPAS Operations Handover',
    guide: 'Your replacement operator is arriving to take over mid-mission. Give them a complete situation awareness transfer.',
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
    sourceHints: ['Scenario: "Current Aircraft Status"', 'Scenario: "Active Mission"', 'Scenario: "Known Hazard"', 'Scenario: "Weather"', 'Scenario: "Next Action"'],
    explanation: 'RPAS operator handovers must transfer: aircraft status, mission progress, known hazards, weather trend, and next planned action.',
  },
];

const M7_RPAS_QUESTIONS: ReasoningQuestion[] = [
  { id: 'clarity', label: 'Communication Clarity', prompt: 'In the communication exercises you just completed, what made some transmissions harder to compose than others? What did you find yourself paying attention to?', placeholder: 'Describe what you noticed about how information needs to be communicated clearly…', minLength: 60 },
  { id: 'verification', label: 'Handling Uncertainty', prompt: 'If something in a transmission was unclear or you weren\'t sure you heard correctly, what would you do? What\'s your instinct?', placeholder: 'Describe how you would handle uncertainty in a communication exchange…', minLength: 60 },
  { id: 'teamwork', label: 'Team Coordination', prompt: 'These exercises involved passing information between people in time-pressured situations. What did that make you think about how teams need to communicate?', placeholder: 'Reflect on what you noticed about information transfer and coordination…', minLength: 60 },
];

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
  utt.pitch = 0.86; utt.rate = 0.90;
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
  if (/earlier|sooner|update|change|arriv|revised|ahead|schedule/.test(t2)) d += 0.20;
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

// ── New competency analysis functions ─────────────────────────────────────────

// S1: attention to detail — catches east/west discrepancy vs. display
function analyzeS1Detail(response: string): number {
  const t = response.toLowerCase().trim();
  if (t.length < 5) return 0.05;
  let d = 0.05;
  if (/maple|214/.test(t)) d += 0.10;
  // Catches the discrepancy (display shows west, pilot said east)
  const noticesConflict = /east|west|position|show|radar|display|differ|discrepan|conflict|mismatch|not match|opposite|incorrect|that.s not|incorrect/.test(t);
  const probes = /\?|confirm|verif|clarif|check|correct|right|sure|repeat|say again/.test(t);
  if (noticesConflict) d += 0.35;
  if (probes) d += 0.25;
  if (noticesConflict && probes) d += 0.10; // bonus for both
  return Math.min(0.70, d);
}

// S3: composure under pressure — quality of response when two demands arrive simultaneously
function analyzeS3Pressure(response: string): number {
  const t = response.toLowerCase().trim();
  if (t.length < 5) return 0.05;
  let d = 0.05;
  const addressesMaple = /maple|214|position|clarif|confirm|east|west/.test(t);
  const addressesNorthern = /northern|305|fuel|urgent|hold|standby|wait|priority|moment|shortly/.test(t);
  const showsPrioritization = /first|then|after|and|also|once|follow/.test(t);
  if (addressesMaple) d += 0.20;
  if (addressesNorthern) d += 0.20;
  if (addressesMaple && addressesNorthern) d += 0.15; // handled both
  if (showsPrioritization) d += 0.10;
  if (t.length > 30) d += 0.05; // stayed measured, not terse panic
  return Math.min(0.70, d);
}

// S4: teamwork — quality of colleague handover (structured, covers both aircraft)
function analyzeHandover(response: string): number {
  const t = response.toLowerCase().trim();
  if (t.length < 10) return 0.05;
  let d = 0.05;
  if (/maple|214/.test(t)) d += 0.20;
  if (/northern|305|nth/.test(t)) d += 0.20;
  if (/earlier|updated|changed|arrival|depart|fuel|technical|issue/.test(t)) d += 0.15;
  if (/both|and|also/.test(t)) d += 0.10; // covered multiple items
  if (t.length > 40) d += 0.10; // sufficient detail
  return Math.min(0.70, d);
}

// S5 phase 2: adaptability — revises understanding when MAPLE 214 updates their status
function analyzeAdaptability(response: string): number {
  const t = response.toLowerCase().trim();
  if (t.length < 5) return 0.05;
  let d = 0.05;
  // Accepts the update and integrates it
  if (/copy|roger|confirm|receiv|understand|noted|acknowledged/.test(t)) d += 0.15;
  // Asks a specific follow-up question about the updated status
  if (/\?/.test(response)) d += 0.20;
  if (/approach|clear|path|route|still|certain|sure|confirm|safe|proceed|system|navigation|instrument/.test(t)) d += 0.20;
  // Notices the uncertainty and probes it
  if (/think|believe|uncertain|not sure|may|might|possibly/.test(t)) d += 0.15;
  return Math.min(0.65, d);
}

// ── Audio waveform indicator ──────────────────────────────────────────────────
function Waveform({ active }: { active: boolean }) {
  const bars = [3, 5, 8, 6, 9, 7, 4, 8, 5, 3, 7, 9, 6, 4, 8];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 14 }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 2, borderRadius: 1,
          height: active ? h : 3,
          background: active ? C.blueL : C.dim,
          transition: prefersReducedMotion() ? 'none' : `height 0.${(i % 3) + 2}s ease-in-out`,
          animationDelay: `${i * 60}ms`,
        }} />
      ))}
    </div>
  );
}

// ── Radar display ─────────────────────────────────────────────────────────────
function RadarDisplay({ aircraft, selectedId, onSelect }: {
  aircraft: Aircraft[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const [angle, setAngle] = useState(0);
  const frameRef = useRef<number>(0);
  const prevRef = useRef(0);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    function tick(ts: number) {
      if (ts - prevRef.current > 60) {
        setAngle(a => (a + 2) % 360);
        prevRef.current = ts;
      }
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [reduced]);

  const cx = 100; const cy = 100; const r = 84;
  const rad = (angle * Math.PI) / 180;
  const sx = cx + r * Math.sin(rad);
  const sy = cy - r * Math.cos(rad);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 220, margin: '0 auto' }}>
      <svg viewBox="0 0 200 200" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Frame */}
        <circle cx={cx} cy={cy} r={r + 4} fill={C.radarBg} stroke={`${C.radarGreen}0.12)`} strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={r} fill={C.radarBg} />
        {/* Rings */}
        {[0.33, 0.66, 1].map(f => (
          <circle key={f} cx={cx} cy={cy} r={r * f} fill="none" stroke={`${C.radarGreen}0.07)`} strokeWidth="0.7" />
        ))}
        {/* Cross */}
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={`${C.radarGreen}0.06)`} strokeWidth="0.5" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={`${C.radarGreen}0.06)`} strokeWidth="0.5" />
        {/* Sweep */}
        {!reduced && (
          <>
            <defs>
              <radialGradient id="sweepGrad" cx="0%" cy="0%" r="100%">
                <stop offset="0%" stopColor={`${C.radarGreen}0.4)`} />
                <stop offset="100%" stopColor={`${C.radarGreen}0)`} />
              </radialGradient>
            </defs>
            <line x1={cx} y1={cy} x2={sx} y2={sy} stroke={`${C.radarGreen}0.55)`} strokeWidth="1.8" />
          </>
        )}
        {/* Airport */}
        <circle cx={cx} cy={cy} r={3} fill={C.greenL} opacity={0.9} />
        <text x={cx + 6} y={cy + 4} fill={`${C.radarGreen}0.5)`} fontSize="6" fontFamily="monospace">APT</text>
        {/* Aircraft blips */}
        {aircraft.filter(a => a.visible).map(a => {
          const sel = selectedId === a.id;
          const color = a.alert ? C.amberL : C.greenL;
          return (
            <g key={a.id} style={{ cursor: onSelect ? 'pointer' : 'default' }}
              onClick={() => onSelect?.(a.id)}>
              {sel && <circle cx={a.x} cy={a.y} r={12} fill="none" stroke={color} strokeWidth="0.8" opacity={0.5} />}
              {a.alert && <circle cx={a.x} cy={a.y} r={9} fill="none" stroke="rgba(220,38,38,0.6)" strokeWidth="1" />}
              <polygon
                points={`${a.x},${a.y - 5} ${a.x + 4},${a.y + 1} ${a.x},${a.y + 3} ${a.x - 4},${a.y + 1}`}
                fill={color}
                opacity={0.95}
              />
              {sel ? (
                <rect x={a.x + 6} y={a.y - 8} width={a.callsign.length * 5.5 + 8} height={14}
                  fill="rgba(5,8,15,0.85)" rx="2" />
              ) : null}
              <text x={a.x + 10} y={a.y + 2} fill={sel ? color : `${C.radarGreen}0.7)`}
                fontSize="6" fontFamily="monospace" fontWeight={sel ? 'bold' : 'normal'}>
                {a.callsign}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Compass labels */}
      {[
        { lbl: 'N', s: { top: '1%', left: '50%', transform: 'translateX(-50%)' } },
        { lbl: 'S', s: { bottom: '1%', left: '50%', transform: 'translateX(-50%)' } },
        { lbl: 'E', s: { right: '3%', top: '50%', transform: 'translateY(-50%)' } },
        { lbl: 'W', s: { left: '3%', top: '50%', transform: 'translateY(-50%)' } },
      ].map(({ lbl, s }) => (
        <div key={lbl} style={{
          position: 'absolute', ...s,
          color: `${C.radarGreen}0.3)`, fontSize: 7, fontFamily: 'monospace', lineHeight: 1,
        }}>{lbl}</div>
      ))}
    </div>
  );
}

// ── Response input ─────────────────────────────────────────────────────────────
function ResponseInput({ onSubmit, context, label = 'Transmit' }: {
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
    recog.onresult = (e: any) => { setTranscript(e.results[0][0].transcript); setListening(false); };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    recog.start();
    setListening(true);
  }
  function stopListening() { recogRef.current?.stop(); setListening(false); }

  const currentText = transcript || text;

  function handleSubmit() {
    if (currentText.trim().length < 5) { setTooShort(true); return; }
    setTooShort(false);
    onSubmit(currentText.trim());
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color: C.dimM, fontSize: 12, lineHeight: 1.5 }}>{context}</div>

      <div style={{ display: 'flex', gap: 8 }}>
        {voiceSupported && (
          <button
            onPointerDown={startListening}
            onPointerUp={stopListening}
            style={{
              flex: '0 0 auto',
              background: listening ? 'rgba(220,38,38,0.15)' : C.card,
              border: `1px solid ${listening ? C.red : C.border}`,
              borderRadius: 8, padding: '10px 16px',
              color: listening ? C.red : C.dimM,
              cursor: 'pointer', fontWeight: 700, fontSize: 11,
              fontFamily: 'monospace', letterSpacing: 1,
              touchAction: 'none', userSelect: 'none',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 8, lineHeight: 1 }}>
              {listening ? '◉' : '◎'}
            </span>
            PTT
            <Waveform active={listening} />
          </button>
        )}
        <textarea
          value={currentText}
          onChange={e => {
            if (transcript) setTranscript(e.target.value);
            else setText(e.target.value);
          }}
          rows={2}
          placeholder={transcript ? 'Review and edit before transmitting…' : 'Type your response…'}
          style={{
            flex: 1, background: C.panel, border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.text, padding: '10px 12px',
            fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>

      {tooShort && (
        <div style={{ color: C.amberL, fontSize: 11, fontFamily: 'monospace' }}>
          ADD MORE DETAIL BEFORE TRANSMITTING
        </div>
      )}

      <button
        onClick={handleSubmit}
        style={{
          background: currentText.trim().length < 5
            ? C.card
            : `linear-gradient(135deg, ${C.action}, ${C.actionH})`,
          color: currentText.trim().length < 5 ? C.dim : '#fff',
          border: `1px solid ${currentText.trim().length < 5 ? C.border : C.action}`,
          borderRadius: 8, padding: '11px 16px',
          fontWeight: 700, fontSize: 13, letterSpacing: 0.5,
          cursor: currentText.trim().length < 5 ? 'not-allowed' : 'pointer',
          touchAction: 'manipulation', fontFamily: 'monospace',
        }}
      >
        {label.toUpperCase()} TRANSMISSION
      </button>
    </div>
  );
}

// ── ATC Console wrapper ───────────────────────────────────────────────────────
function ATCConsole({
  aircraft, aircraftInfoRows, incomingMsg, pilotCallsign, pilotSpeaking,
  scenarioNum, scenarioLabel, selectedId, onSelectAircraft, children,
}: {
  aircraft: Aircraft[];
  aircraftInfoRows: { callsign: string; status: string; alert?: boolean }[];
  incomingMsg?: string;
  pilotCallsign?: string;
  pilotSpeaking?: boolean;
  scenarioNum: number;
  scenarioLabel: string;
  selectedId?: string;
  onSelectAircraft?: (id: string) => void;
  children?: React.ReactNode;
}) {
  const selected = aircraftInfoRows.find(a => aircraft.find(b => b.id === selectedId)?.callsign === a.callsign);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header bar */}
      <div style={{
        background: C.panel, borderBottom: `1px solid ${C.border}`,
        padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: C.blueXL, fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1.5 }}>
          ACIA
        </span>
        <div style={{ width: 1, height: 10, background: C.border }} />
        <span style={{ color: C.blueL, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>
          MISSION 07
        </span>
        <div style={{ width: 1, height: 10, background: C.border }} />
        <span style={{ color: C.dim, fontSize: 9, fontFamily: 'monospace' }}>
          {String(scenarioNum).padStart(2, '0')}/05 {scenarioLabel.toUpperCase()}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: C.greenL, boxShadow: `0 0 5px ${C.greenL}`,
          }} />
          <span style={{ color: C.greenL, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1 }}>
            COMMS LIVE
          </span>
        </div>
      </div>

      {/* Radar + aircraft info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ background: C.radarBg, borderRight: `1px solid ${C.border}`, padding: 10 }}>
          <div style={{ color: `${C.radarGreen}0.35)`, fontSize: 7, fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 5 }}>
            AIR TRAFFIC DISPLAY
          </div>
          <RadarDisplay aircraft={aircraft} selectedId={selectedId} onSelect={onSelectAircraft} />
          {onSelectAircraft && (
            <div style={{ color: C.dim, fontSize: 9, textAlign: 'center', marginTop: 4, fontFamily: 'monospace' }}>
              SELECT AIRCRAFT FOR DETAILS
            </div>
          )}
        </div>
        <div style={{ background: C.panel, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ color: C.dim, fontSize: 7, fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 2 }}>
            AIRCRAFT STATUS
          </div>
          {aircraftInfoRows.map(a => (
            <div key={a.callsign} style={{
              background: a.alert ? 'rgba(120,53,15,0.2)' : C.card,
              border: `1px solid ${a.alert ? 'rgba(217,119,6,0.4)' : C.border}`,
              borderRadius: 5, padding: '6px 9px',
            }}>
              <div style={{
                color: a.alert ? C.amberL : C.blueL,
                fontSize: 10, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 0.5,
              }}>
                {a.callsign}
              </div>
              <div style={{ color: C.dimM, fontSize: 10, marginTop: 2 }}>{a.status}</div>
            </div>
          ))}
          {/* Selected aircraft detail */}
          {selected && (
            <div style={{
              marginTop: 4, background: 'rgba(37,99,235,0.08)',
              border: `1px solid rgba(37,99,235,0.25)`, borderRadius: 5, padding: '6px 9px',
            }}>
              <div style={{ color: C.blueL, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 3 }}>
                SELECTED
              </div>
              <div style={{ color: C.blueXL, fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>
                {selected.callsign}
              </div>
              <div style={{ color: C.dimM, fontSize: 10, marginTop: 2 }}>{selected.status}</div>
            </div>
          )}
        </div>
      </div>

      {/* Incoming transmission */}
      {incomingMsg && (
        <div style={{
          background: 'rgba(8,14,28,0.9)', borderBottom: `1px solid ${C.border}`,
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: C.blue, boxShadow: `0 0 6px ${C.blue}`,
            }} />
            <span style={{ color: C.blue, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1.5 }}>
              INCOMING — {pilotCallsign}
            </span>
            <Waveform active={!!pilotSpeaking} />
          </div>
          <div style={{ color: C.text, fontSize: 13, fontStyle: 'italic', lineHeight: 1.6 }}>
            "{incomingMsg}"
          </div>
        </div>
      )}

      {/* Scenario content */}
      {children && (
        <div style={{ background: C.bg, padding: 14 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Situation card ────────────────────────────────────────────────────────────
function SituationCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(13,22,38,0.9)', border: `1px solid ${C.borderL}`,
      borderRadius: 8, padding: '12px 14px', marginBottom: 12,
    }}>
      <div style={{ color: C.blueL, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 6 }}>
        SITUATION BRIEF
      </div>
      {children}
    </div>
  );
}

// ── Status notice (amber, no emoji) ──────────────────────────────────────────
function StatusNotice({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(120,53,15,0.12)', border: `1px solid rgba(217,119,6,0.3)`,
      borderRadius: 6, padding: '8px 12px', marginBottom: 10,
      display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <span style={{ color: C.amberL, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, flexShrink: 0, paddingTop: 2 }}>
        STATUS
      </span>
      <div style={{ color: C.amberL, fontSize: 12, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

// ── Alert notice (red, no emoji) ─────────────────────────────────────────────
function AlertNotice({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(127,29,29,0.12)', border: `1px solid rgba(220,38,38,0.3)`,
      borderRadius: 6, padding: '8px 12px', marginBottom: 10,
      display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <span style={{ color: C.red, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, flexShrink: 0, paddingTop: 2 }}>
        ALERT
      </span>
      <div style={{ color: '#fca5a5', fontSize: 12, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

// ── Action button (aviation style) ────────────────────────────────────────────
function ActionBtn({ onClick, children, secondary }: { onClick: () => void; children: React.ReactNode; secondary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: secondary ? C.card : `linear-gradient(135deg, ${C.action}, ${C.actionH})`,
        color: secondary ? C.dimM : '#fff',
        border: `1px solid ${secondary ? C.border : C.action}`,
        borderRadius: 8, padding: '12px 16px',
        fontWeight: 700, fontSize: 12, letterSpacing: 0.5,
        cursor: 'pointer', touchAction: 'manipulation',
        fontFamily: 'monospace', width: '100%',
      }}
    >
      {(children as string).toUpperCase ? (children as string).toUpperCase() : children}
    </button>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────────
function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <div style={{ position: 'relative', minHeight: 480, overflow: 'hidden' }}>
      {/* Full-bleed tower photo */}
      <img
        src="/images/atc-tower-interior.webp"
        alt=""
        aria-hidden
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center top',
        }}
      />
      {/* Gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(5,8,15,0.45) 0%, rgba(5,8,15,0.72) 45%, rgba(5,8,15,0.97) 100%)',
      }} />
      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
        minHeight: 480, padding: '32px 24px 36px', gap: 18, textAlign: 'center',
      }}>
        <div style={{
          background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.35)',
          borderRadius: 6, padding: '4px 14px',
          color: C.blueXL, fontSize: 9, fontFamily: 'monospace', letterSpacing: 2.5, fontWeight: 700,
        }}>
          ACIA — MISSION 07 — AVIATION OPERATIONS
        </div>

        <div>
          <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 700, margin: '0 0 6px', lineHeight: 1.2, textShadow: '0 2px 16px rgba(0,0,0,0.9)' }}>
            Air Traffic Communication
          </h1>
          <p style={{ color: C.blueL, fontSize: 13, margin: 0, fontStyle: 'italic', letterSpacing: 0.5 }}>
            Listen. Interpret. Communicate. Adapt.
          </p>
        </div>

        <div style={{
          background: 'rgba(5,8,15,0.85)', border: `1px solid rgba(22,35,64,0.95)`,
          borderRadius: 10, padding: '16px 20px', maxWidth: 440,
          display: 'flex', flexDirection: 'column', gap: 10,
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ color: C.blueL, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, fontFamily: 'monospace' }}>
            CAPTAIN ACIA
          </div>
          <p style={{ color: C.text, fontSize: 13, lineHeight: 1.65, margin: 0 }}>Welcome to Mission 7.</p>
          <p style={{ color: C.dimM, fontSize: 13, lineHeight: 1.65, margin: 0 }}>
            You're about to experience how communication, attention and decision-making come
            together in an airport environment. You'll receive messages from aircraft, monitor
            changing information and respond to different situations.
          </p>
          <p style={{ color: C.dimM, fontSize: 13, lineHeight: 1.65, margin: 0 }}>
            You don't need aviation experience or specialized terminology. Listen carefully,
            communicate clearly and ask questions whenever something doesn't make sense.
          </p>
        </div>

        <button
          onClick={onEnter}
          style={{
            background: `linear-gradient(135deg, ${C.action}, ${C.actionH})`,
            color: '#fff', border: 'none', borderRadius: 10, padding: '14px 32px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
            letterSpacing: 0.5, fontFamily: 'monospace',
            boxShadow: `0 4px 20px rgba(29,78,216,0.4)`,
          }}
        >
          ENTER COMMUNICATIONS CENTRE
        </button>
      </div>
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
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); setMicStatus('granted'); }
    catch { setMicStatus('denied'); }
  }

  return (
    <div style={{
      background: C.bg, position: 'relative', overflow: 'hidden',
    }}>
      {/* Subtle controller photo as background panel accent */}
      <div style={{ position: 'relative' }}>
        <img src="/images/atc-controller.webp" alt="" aria-hidden
          style={{ width: '100%', height: 140, objectFit: 'cover', objectPosition: 'center 30%', display: 'block' }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(5,8,15,0.3) 0%, rgba(5,8,15,0.96) 100%)',
        }} />
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
          <div style={{ color: C.blueXL, fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, fontWeight: 700 }}>
            COMMUNICATION SETUP
          </div>
          <p style={{ color: C.dimM, fontSize: 13, marginTop: 4, marginBottom: 0, lineHeight: 1.5 }}>
            For the best experience, use headphones or a headset. Voice is optional — you can type all responses.
          </p>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ color: C.dimM, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 8 }}>
            STEP 01 — AUDIO CHECK
          </div>
          <button onClick={testAudio} style={{
            background: audioTested ? 'rgba(22,163,74,0.1)' : C.panel,
            border: `1px solid ${audioTested ? 'rgba(22,163,74,0.4)' : C.border}`,
            borderRadius: 7, padding: '9px 16px',
            color: audioTested ? C.greenL : C.text,
            cursor: 'pointer', fontSize: 13, touchAction: 'manipulation',
            fontFamily: 'monospace', fontWeight: 600, letterSpacing: 0.5,
          }}>
            {audioTested ? 'AUDIO CONFIRMED' : 'PLAY SAMPLE TRANSMISSION'}
          </button>
          {!audioTested && (
            <p style={{ color: C.dim, fontSize: 11, marginTop: 6, marginBottom: 0, fontFamily: 'monospace' }}>
              If audio is unavailable, pilot transmissions will appear as text.
            </p>
          )}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ color: C.dimM, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 8 }}>
            STEP 02 — MICROPHONE (OPTIONAL)
          </div>
          {micStatus === 'idle' && (
            <button onClick={testMic} style={{
              background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7,
              padding: '9px 16px', color: C.text, cursor: 'pointer', fontSize: 13,
              touchAction: 'manipulation', fontFamily: 'monospace', fontWeight: 600,
            }}>
              CHECK MICROPHONE
            </button>
          )}
          {micStatus === 'granted' && <div style={{ color: C.greenL, fontSize: 12, fontFamily: 'monospace' }}>MICROPHONE READY — VOICE MODE AVAILABLE</div>}
          {micStatus === 'denied' && <div style={{ color: C.amberL, fontSize: 12, fontFamily: 'monospace' }}>MICROPHONE DENIED — TEXT MODE ONLY</div>}
          {micStatus === 'unavailable' && <div style={{ color: C.dim, fontSize: 12, fontFamily: 'monospace' }}>VOICE NOT SUPPORTED — TEXT MODE ONLY</div>}
        </div>

        <button onClick={onReady} style={{
          background: `linear-gradient(135deg, ${C.action}, ${C.actionH})`,
          color: '#fff', border: 'none', borderRadius: 8, padding: '13px 24px',
          fontWeight: 700, fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
          fontFamily: 'monospace', letterSpacing: 1,
        }}>
          BEGIN MISSION
        </button>
      </div>
    </div>
  );
}

// ── Pilot message card ────────────────────────────────────────────────────────
function PilotMessage({ message, callsign, onReady, autoSpeak = true }: {
  message: string; callsign: string; onReady: () => void; autoSpeak?: boolean;
}) {
  const [spoken, setSpoken] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!autoSpeak) { setSpoken(true); return; }
    setSpeaking(true);
    const cancel = speak(message, () => { setSpeaking(false); setSpoken(true); });
    return cancel;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: 'rgba(8,14,28,0.9)', border: `1px solid ${C.borderL}`,
        borderRadius: 8, padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
            background: speaking ? C.blue : C.dim,
            boxShadow: speaking ? `0 0 6px ${C.blue}` : 'none',
            transition: 'all 0.3s',
          }} />
          <span style={{ color: C.blue, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1.5 }}>
            INCOMING — {callsign}
          </span>
          <Waveform active={speaking} />
        </div>
        <div style={{ color: C.text, fontSize: 14, fontStyle: 'italic', lineHeight: 1.6 }}>
          "{message}"
        </div>
        {!spoken && (
          <div style={{ color: C.dim, fontSize: 10, marginTop: 6, fontFamily: 'monospace' }}>
            PLAYING TRANSMISSION…
          </div>
        )}
      </div>
      <button onClick={onReady} style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: '11px 16px',
        color: C.dimM, cursor: 'pointer', fontSize: 12, fontWeight: 700,
        touchAction: 'manipulation', fontFamily: 'monospace', letterSpacing: 1,
      }}>
        MESSAGE RECEIVED — CONTINUE
      </button>
    </div>
  );
}

// ── Feedback card ─────────────────────────────────────────────────────────────
function FeedbackCard({ message, onNext, nextLabel = 'CONTINUE' }: {
  message: string; onNext: () => void; nextLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: 'rgba(22,163,74,0.07)', border: `1px solid rgba(22,163,74,0.2)`,
        borderRadius: 8, padding: '12px 14px',
        color: C.dimM, fontSize: 13, lineHeight: 1.6,
      }}>
        {message}
      </div>
      <button onClick={onNext} style={{
        background: `linear-gradient(135deg, ${C.action}, ${C.actionH})`,
        color: '#fff', border: 'none', borderRadius: 8, padding: '12px 16px',
        fontWeight: 700, fontSize: 12, cursor: 'pointer', touchAction: 'manipulation',
        fontFamily: 'monospace', letterSpacing: 1,
      }}>
        {nextLabel}
      </button>
    </div>
  );
}

// ── Scenario 1 — Attention to detail (display vs. pilot position discrepancy) ──
function Scenario1({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [step, setStep] = useState<'intro' | 'pilot' | 'respond'>('intro');
  const [sel, setSel] = useState<string | undefined>(undefined);

  // Display shows MAPLE 214 WEST — pilot will report EAST (discrepancy to catch)
  const aircraft: Aircraft[] = [
    { id: 'maple', callsign: 'MAPLE 214', x: 40, y: 90, status: 'Display: West of airport', visible: true },
  ];
  const info = [{ callsign: 'MAPLE 214', status: 'Display: west of airport' }];

  if (step === 'intro') return (
    <ATCConsole aircraft={aircraft} aircraftInfoRows={info} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={1} scenarioLabel="Initial Radio Contact">
      <SituationCard>
        <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          You've just taken your position at the communications console. Your display shows
          <strong style={{ color: C.blueL }}> MAPLE 214</strong> west of the airport.
          An incoming transmission is arriving.
        </p>
        <p style={{ color: C.dimM, fontSize: 12, lineHeight: 1.5, marginTop: 8, marginBottom: 0 }}>
          Listen carefully to what the pilot reports and compare it to what you see on your display.
        </p>
      </SituationCard>
      <ActionBtn onClick={() => setStep('pilot')}>Open Channel</ActionBtn>
    </ATCConsole>
  );

  if (step === 'pilot') return (
    <ATCConsole aircraft={aircraft} aircraftInfoRows={info} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={1} scenarioLabel="Initial Radio Contact">
      <PilotMessage
        callsign="MAPLE 214"
        // Pilot reports EAST — display shows WEST. Participant must notice.
        message="Tower, Maple 214. We're currently approximately five miles east of the airport. Just checking in and confirming our position."
        onReady={() => setStep('respond')}
      />
    </ATCConsole>
  );

  return (
    <ATCConsole aircraft={aircraft} aircraftInfoRows={info}
      incomingMsg="Tower, Maple 214. We're currently approximately five miles east of the airport. Just checking in and confirming our position."
      pilotCallsign="MAPLE 214" pilotSpeaking={false}
      selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={1} scenarioLabel="Initial Radio Contact">
      <ResponseInput
        context="Respond to MAPLE 214. Your display shows their current position — pay attention to whether what the pilot reported matches what you see."
        onSubmit={text => onComplete([
          { key: 'attention_to_detail', delta: analyzeS1Detail(text) },
          { key: 'communication_quality', delta: analyzeS1(text) },
        ])}
      />
    </ATCConsole>
  );
}

// ── Scenario 3 — SA conflict + stress_response (dual demand) ──────────────────
function Scenario3({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [step, setStep] = useState<'intro' | 'pilot' | 'respond' | 'correction' | 'pressure' | 'respond2'>('intro');
  const [sel, setSel] = useState<string | undefined>(undefined);
  const responseRef = useRef('');
  const clarifyRef = useRef(false);
  const pressureRef = useRef('');

  const aircraftEast: Aircraft[] = [
    { id: 'maple', callsign: 'MAPLE 214', x: 158, y: 90, status: 'Position: East', visible: true },
  ];
  const aircraftBoth: Aircraft[] = [
    { id: 'maple', callsign: 'MAPLE 214', x: 158, y: 90, status: 'Position unresolved', visible: true },
    { id: 'northern', callsign: 'NTH 305', x: 106, y: 145, status: 'Fuel — Urgent', visible: true, alert: true },
  ];
  const infoConflict = [{ callsign: 'MAPLE 214', status: 'Display shows east — pilot reports west' }];
  const infoPressure = [
    { callsign: 'MAPLE 214', status: 'Position unresolved' },
    { callsign: 'NORTHERN 305', status: 'Fuel status — urgent', alert: true },
  ];
  const infoResolved = [{ callsign: 'MAPLE 214', status: 'Position confirmed: East of airport' }];

  if (step === 'intro') return (
    <ATCConsole aircraft={aircraftEast} aircraftInfoRows={[{ callsign: 'MAPLE 214', status: 'Position: East of airport' }]}
      selectedId={sel} onSelectAircraft={setSel} scenarioNum={3} scenarioLabel="Conflicting Information">
      <SituationCard>
        <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Your display shows <strong style={{ color: C.blueL }}>MAPLE 214</strong> positioned east of
          the airport. An incoming transmission is arriving from MAPLE 214 with position information.
        </p>
        <p style={{ color: C.dimM, fontSize: 12, lineHeight: 1.5, marginTop: 8, marginBottom: 0 }}>
          Pay attention to what the pilot reports and compare it to your display.
        </p>
      </SituationCard>
      <ActionBtn onClick={() => setStep('pilot')}>Open Channel</ActionBtn>
    </ATCConsole>
  );

  if (step === 'pilot') return (
    <ATCConsole aircraft={aircraftEast} aircraftInfoRows={infoConflict}
      selectedId={sel} onSelectAircraft={setSel} scenarioNum={3} scenarioLabel="Conflicting Information">
      <PilotMessage
        callsign="MAPLE 214"
        message="Tower, Maple 214. We're approximately five miles west of the airport."
        onReady={() => setStep('respond')}
      />
    </ATCConsole>
  );

  if (step === 'respond') return (
    <ATCConsole aircraft={aircraftEast} aircraftInfoRows={infoConflict}
      incomingMsg="Tower, Maple 214. We're approximately five miles west of the airport."
      pilotCallsign="MAPLE 214" pilotSpeaking={false}
      selectedId={sel} onSelectAircraft={setSel} scenarioNum={3} scenarioLabel="Conflicting Information">
      <ResponseInput
        context="Respond to MAPLE 214. Your display and the pilot's report are not consistent."
        onSubmit={text => {
          responseRef.current = text;
          const asked = wantsClarification(text) || notesConflict(text);
          clarifyRef.current = asked;
          // Whether or not they caught the conflict, NORTHERN 305 now breaks in
          setStep('correction');
        }}
      />
    </ATCConsole>
  );

  // After participant's first response, NORTHERN 305 breaks in with fuel urgency
  if (step === 'correction') {
    const resolved: Aircraft[] = [{ id: 'maple', callsign: 'MAPLE 214', x: 158, y: 90, status: 'Position confirmed: East', visible: true }];
    return (
      <ATCConsole aircraft={resolved} aircraftInfoRows={infoResolved}
        selectedId={sel} onSelectAircraft={setSel} scenarioNum={3} scenarioLabel="Conflicting Information">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'rgba(8,14,28,0.9)', border: `1px solid ${C.borderL}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: C.blue }} />
              <span style={{ color: C.blue, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1.5 }}>MAPLE 214 — CORRECTION</span>
            </div>
            <div style={{ color: C.text, fontSize: 14, fontStyle: 'italic', lineHeight: 1.6 }}>
              "Maple 214. Correction — we are east of the airport. Apologies for the confusion."
            </div>
          </div>
          <FeedbackCard
            message="MAPLE 214 has confirmed their correct position. A new transmission is now arriving."
            onNext={() => setStep('pressure')}
            nextLabel="OPEN CHANNEL"
          />
        </div>
      </ATCConsole>
    );
  }

  // NORTHERN 305 breaks in simultaneously — dual demand scenario
  if (step === 'pressure') return (
    <ATCConsole aircraft={aircraftBoth} aircraftInfoRows={infoPressure}
      selectedId={sel} onSelectAircraft={setSel} scenarioNum={3} scenarioLabel="Conflicting Information">
      <PilotMessage
        callsign="NORTHERN 305"
        message="Tower, Northern 305. We have a fuel status concern. We need to know our departure window soon — this is time-sensitive."
        onReady={() => setStep('respond2')}
      />
    </ATCConsole>
  );

  return (
    <ATCConsole aircraft={aircraftBoth} aircraftInfoRows={infoPressure}
      incomingMsg="Tower, Northern 305. We have a fuel status concern. We need to know our departure window soon — this is time-sensitive."
      pilotCallsign="NORTHERN 305" pilotSpeaking={false}
      selectedId={sel} onSelectAircraft={setSel} scenarioNum={3} scenarioLabel="Conflicting Information">
      <ResponseInput
        context="NORTHERN 305 has a time-sensitive fuel concern. MAPLE 214's position issue was just resolved. Respond to the current situation."
        onSubmit={text => {
          pressureRef.current = text;
          const saDelta = analyzeS3(responseRef.current, clarifyRef.current);
          const stressDelta = analyzeS3Pressure(text);
          onComplete([
            { key: 'situational_awareness', delta: saDelta },
            { key: 'stress_response', delta: stressDelta },
          ]);
        }}
      />
    </ATCConsole>
  );
}

// ── Scenario 4 — MT (two aircraft) + CM teamwork (colleague handover) ─────────
function Scenario4({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [step, setStep] = useState<
    'intro' | 'colleague_leaves' | 'pilot1' | 'respond1' | 'pilot2' | 'respond2' | 'handover'
  >('intro');
  const [sel, setSel] = useState<string | undefined>(undefined);
  const r1Ref = useRef('');
  const r2Ref = useRef('');

  const aircraft: Aircraft[] = [
    { id: 'maple', callsign: 'MAPLE 214', x: 155, y: 96, status: 'Approaching', visible: true },
    { id: 'northern', callsign: 'NTH 305', x: 106, y: 145, status: 'Ground', visible: true },
  ];
  const info = [
    { callsign: 'MAPLE 214', status: 'Approaching from east' },
    { callsign: 'NORTHERN 305', status: 'Preparing for departure' },
  ];
  const infoUpdated = [
    { callsign: 'MAPLE 214', status: 'Arrival: earlier than planned' },
    { callsign: 'NORTHERN 305', status: 'Preparing for departure' },
  ];

  if (step === 'intro') return (
    <ATCConsole aircraft={aircraft} aircraftInfoRows={info} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={4} scenarioLabel="Changing Traffic Situation">
      <SituationCard>
        <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Two aircraft are now on your display. You'll be receiving communications from both —
          pay attention to what's new or changing and respond to each one.
        </p>
      </SituationCard>
      <ActionBtn onClick={() => setStep('colleague_leaves')}>Open Channel</ActionBtn>
    </ATCConsole>
  );

  if (step === 'colleague_leaves') return (
    <ATCConsole aircraft={aircraft} aircraftInfoRows={info} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={4} scenarioLabel="Changing Traffic Situation">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: '#fbbf24' }} />
            <span style={{ color: '#fbbf24', fontSize: 8, fontFamily: 'monospace', letterSpacing: 1.5 }}>
              CONTROLLER — ALEX
            </span>
          </div>
          <div style={{ color: C.text, fontSize: 13, lineHeight: 1.6 }}>
            "Hey, I need to step away for a few minutes — urgent call. Can you hold the desk?
            MAPLE 214 and NORTHERN 305 are both active. I'll be back to take over."
          </div>
        </div>
        <StatusNotice>You're now managing both aircraft solo. Handle incoming transmissions.</StatusNotice>
        <ActionBtn onClick={() => setStep('pilot1')}>Acknowledge and Hold Desk</ActionBtn>
      </div>
    </ATCConsole>
  );

  if (step === 'pilot1') return (
    <ATCConsole aircraft={aircraft} aircraftInfoRows={info} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={4} scenarioLabel="Changing Traffic Situation">
      <PilotMessage
        callsign="NORTHERN 305"
        message="Tower, Northern 305. We're preparing to depart and waiting for further information."
        onReady={() => setStep('respond1')}
      />
    </ATCConsole>
  );

  if (step === 'respond1') return (
    <ATCConsole aircraft={aircraft} aircraftInfoRows={info}
      incomingMsg="Tower, Northern 305. We're preparing to depart and waiting for further information."
      pilotCallsign="NORTHERN 305" pilotSpeaking={false}
      selectedId={sel} onSelectAircraft={setSel} scenarioNum={4} scenarioLabel="Changing Traffic Situation">
      <ResponseInput
        context="Acknowledge NORTHERN 305. A second transmission from MAPLE 214 will follow."
        label="Respond to NORTHERN 305"
        onSubmit={text => { r1Ref.current = text; setStep('pilot2'); }}
      />
    </ATCConsole>
  );

  if (step === 'pilot2') return (
    <ATCConsole aircraft={aircraft} aircraftInfoRows={infoUpdated} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={4} scenarioLabel="Changing Traffic Situation">
      <PilotMessage
        callsign="MAPLE 214"
        message="Tower, Maple 214. Our arrival estimate has changed. We now expect to arrive earlier than planned."
        onReady={() => setStep('respond2')}
      />
    </ATCConsole>
  );

  if (step === 'respond2') return (
    <ATCConsole aircraft={aircraft} aircraftInfoRows={infoUpdated}
      incomingMsg="Tower, Maple 214. Our arrival estimate has changed. We now expect to arrive earlier than planned."
      pilotCallsign="MAPLE 214" pilotSpeaking={false}
      selectedId={sel} onSelectAircraft={setSel} scenarioNum={4} scenarioLabel="Changing Traffic Situation">
      <ResponseInput
        context="Respond to MAPLE 214's updated arrival information."
        label="Respond to MAPLE 214"
        onSubmit={text => { r2Ref.current = text; setStep('handover'); }}
      />
    </ATCConsole>
  );

  // Colleague returns — participant must brief them
  return (
    <ATCConsole aircraft={aircraft} aircraftInfoRows={infoUpdated}
      selectedId={sel} onSelectAircraft={setSel} scenarioNum={4} scenarioLabel="Changing Traffic Situation">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: '#fbbf24' }} />
            <span style={{ color: '#fbbf24', fontSize: 8, fontFamily: 'monospace', letterSpacing: 1.5 }}>
              CONTROLLER — ALEX
            </span>
          </div>
          <div style={{ color: C.text, fontSize: 13, lineHeight: 1.6 }}>
            "Back now — thanks for covering. What's the situation with MAPLE 214 and NORTHERN 305?
            Anything I should know before I take over?"
          </div>
        </div>
        <ResponseInput
          context="Brief your colleague on what happened while they were away. Include any changes or developments they'll need to know about."
          label="Brief your colleague"
          onSubmit={text => onComplete([
            { key: 'multitasking_ability', delta: analyzeS4(r1Ref.current, r2Ref.current) },
            { key: 'communication_quality', delta: analyzeHandover(text) },
          ])}
        />
      </div>
    </ATCConsole>
  );
}

// ── Scenario 5 — DM/AL (dual transmission) + AL adaptability + curiosity ──────
function Scenario5({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [step, setStep] = useState<'intro' | 'maple' | 'northern' | 'respond' | 'ack' | 'update' | 'respond2'>('intro');
  const [sel, setSel] = useState<string | undefined>(undefined);
  const responseRef = useRef('');

  const aircraftAlert: Aircraft[] = [
    { id: 'maple', callsign: 'MAPLE 214', x: 140, y: 98, visible: true, status: 'Technical Issue', alert: true },
    { id: 'northern', callsign: 'NTH 305', x: 106, y: 145, visible: true, status: 'Ground — Standby' },
  ];
  const info = [
    { callsign: 'MAPLE 214', status: 'Technical issue reported', alert: true },
    { callsign: 'NORTHERN 305', status: 'Ground — standing by' },
  ];

  if (step === 'intro') return (
    <ATCConsole aircraft={aircraftAlert} aircraftInfoRows={info} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={5} scenarioLabel="Unexpected Operational Event">
      <SituationCard>
        <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Two transmissions are arriving at the same time. Both aircraft are on your display.
          Listen to both messages and decide how to respond.
        </p>
        <p style={{ color: C.dimM, fontSize: 12, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
          Respond clearly and ask questions if you need more information.
        </p>
      </SituationCard>
      <ActionBtn onClick={() => setStep('maple')}>Open Channel</ActionBtn>
    </ATCConsole>
  );

  if (step === 'maple') return (
    <ATCConsole aircraft={aircraftAlert} aircraftInfoRows={info} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={5} scenarioLabel="Unexpected Operational Event">
      <PilotMessage
        callsign="MAPLE 214"
        message="Tower, Maple 214. We've experienced a technical issue and need assistance. Our arrival plans may change."
        onReady={() => setStep('northern')}
      />
    </ATCConsole>
  );

  if (step === 'northern') return (
    <ATCConsole aircraft={aircraftAlert} aircraftInfoRows={info} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={5} scenarioLabel="Unexpected Operational Event">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: 'rgba(127,29,29,0.1)', border: `1px solid rgba(220,38,38,0.25)`, borderRadius: 7, padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.red, display: 'inline-block' }} />
            <span style={{ color: C.red, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1.5 }}>MAPLE 214 — PRIORITY</span>
          </div>
          <div style={{ color: '#fca5a5', fontSize: 12, fontStyle: 'italic' }}>
            "We've experienced a technical issue and need assistance. Our arrival plans may change."
          </div>
        </div>
        <PilotMessage
          callsign="NORTHERN 305"
          message="Tower, Northern 305. Still preparing on the ground, no changes on our end."
          onReady={() => setStep('respond')}
        />
      </div>
    </ATCConsole>
  );

  if (step === 'respond') return (
    <ATCConsole aircraft={aircraftAlert} aircraftInfoRows={info} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={5} scenarioLabel="Unexpected Operational Event">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 4 }}>
          <div style={{ background: 'rgba(127,29,29,0.1)', border: `1px solid rgba(220,38,38,0.25)`, borderRadius: 6, padding: '7px 10px' }}>
            <div style={{ color: C.red, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 3 }}>MAPLE 214</div>
            <div style={{ color: '#fca5a5', fontSize: 12, fontStyle: 'italic' }}>
              "We've experienced a technical issue and need assistance."
            </div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px' }}>
            <div style={{ color: C.dim, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 3 }}>NORTHERN 305</div>
            <div style={{ color: C.dimM, fontSize: 12, fontStyle: 'italic' }}>
              "Still preparing on the ground, no changes on our end."
            </div>
          </div>
        </div>
        <ResponseInput
          context="Respond to the transmissions you just heard. You can address both aircraft in one response."
          onSubmit={text => {
            responseRef.current = text;
            if (wantsClarification(text) || text.includes('?')) setStep('ack');
            else setStep('update');
          }}
        />
      </div>
    </ATCConsole>
  );

  return (
    <ATCConsole aircraft={aircraftAlert} aircraftInfoRows={info} selectedId={sel} onSelectAircraft={setSel}
      scenarioNum={5} scenarioLabel="Unexpected Operational Event">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'rgba(8,14,28,0.9)', border: `1px solid ${C.borderL}`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: C.blue }} />
            <span style={{ color: C.blue, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1.5 }}>
              MAPLE 214 — RESPONSE
            </span>
          </div>
          <div style={{ color: C.text, fontSize: 14, fontStyle: 'italic', lineHeight: 1.6 }}>
            "Maple 214. We have an issue with our navigation system — minor, we believe. Monitoring the situation. Will keep you updated."
          </div>
        </div>
        <FeedbackCard
          message="You sought additional information from MAPLE 214. That kind of follow-up communication is a key part of managing uncertainty in operational environments."
          onNext={() => setStep('update')}
          nextLabel="CONTINUE"
        />
      </div>
    </ATCConsole>
  );

  // Phase 2: MAPLE 214 updates — issue may be resolved, but uncertain
  const aircraftUpdate: Aircraft[] = [
    { id: 'maple', callsign: 'MAPLE 214', x: 140, y: 98, visible: true, status: 'Status Updating' },
    { id: 'northern', callsign: 'NTH 305', x: 106, y: 145, visible: true, status: 'Ground — Standby' },
  ];
  const infoUpdate = [
    { callsign: 'MAPLE 214', status: 'Technical issue — possibly resolved' },
    { callsign: 'NORTHERN 305', status: 'Ground — standing by' },
  ];

  if (step === 'update') return (
    <ATCConsole aircraft={aircraftUpdate} aircraftInfoRows={infoUpdate}
      selectedId={sel} onSelectAircraft={setSel} scenarioNum={5} scenarioLabel="Unexpected Operational Event">
      <PilotMessage
        callsign="MAPLE 214"
        message="Tower, Maple 214. The technical issue may have cleared — our instruments are reading normally now. We believe we can proceed with our original approach. However, we're not entirely certain the issue is fully resolved."
        onReady={() => setStep('respond2')}
      />
    </ATCConsole>
  );

  if (step === 'respond2') {
    const { dm, al } = analyzeS5(responseRef.current);
    return (
      <ATCConsole aircraft={aircraftUpdate} aircraftInfoRows={infoUpdate}
        incomingMsg="Tower, Maple 214. The technical issue may have cleared. We believe we can proceed, but we're not entirely certain the issue is fully resolved."
        pilotCallsign="MAPLE 214" pilotSpeaking={false}
        selectedId={sel} onSelectAircraft={setSel} scenarioNum={5} scenarioLabel="Unexpected Operational Event">
        <ResponseInput
          context="MAPLE 214 says the issue may be resolved but they are not certain. How do you respond to this update?"
          onSubmit={text => onComplete([
            { key: 'decision_quality', delta: Math.min(0.65, dm + 0.10) },
            { key: 'learning_agility', delta: Math.min(0.50, al + 0.05) },
            { key: 'curiosity', delta: analyzeAdaptability(text) },
          ])}
        />
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

  if (phase === 'welcome') return <WelcomeScreen onEnter={() => setPhase('setup')} />;
  if (phase === 'setup') return <SetupScreen onReady={() => setPhase('s1')} />;

  if (phase === 's1') return (
    <Scenario1 onComplete={ev => { addEvidence(ev); setPhase('wm'); }} />
  );

  if (phase === 'wm') {
    return (
      <ATCBriefing
        sessionId={sessionId}
        onComplete={(wmEv: WMEvidence) => {
          // ── Preserved exactly ──────────────────────────────────────────────
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
          // ── End preserved block ────────────────────────────────────────────
          setPhase('s3');
        }}
      />
    );
  }

  if (phase === 's3') return <Scenario3 onComplete={ev => { addEvidence(ev); setPhase('s4'); }} />;
  if (phase === 's4') return <Scenario4 onComplete={ev => { addEvidence(ev); setPhase('s5'); }} />;

  if (phase === 's5') return (
    <Scenario5 onComplete={ev => {
      addEvidence(ev);
      pendingRef.current = [...wmEvidenceRef.current, ...evidenceRef.current, ...ev];
      setPhase('reflection');
    }} />
  );

  if (phase === 'reflection') {
    return (
      <div style={{ background: C.bg, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative' }}>
          <img src="/images/atc-tower-night.webp" alt="" aria-hidden
            style={{ width: '100%', height: 120, objectFit: 'cover', objectPosition: 'center 40%', display: 'block' }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, rgba(5,8,15,0.4) 0%, rgba(5,8,15,0.95) 100%)',
          }} />
          <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16 }}>
            <div style={{ color: C.blueXL, fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, fontWeight: 700 }}>
              MISSION COMPLETE — REFLECTION
            </div>
            <p style={{ color: C.dimM, fontSize: 12, marginTop: 4, marginBottom: 0, lineHeight: 1.5 }}>
              Before we close, take a moment to reflect on what you experienced.
            </p>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <MissionReasoningResponse
            questions={M7_QUESTIONS}
            storageKey="acia_m7_reasoning"
            onComplete={() => onComplete(pendingRef.current)}
          />
        </div>
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
      pendingEvidence.current = [
        { key: 'communication_quality', delta: avg * 0.9 },
        { key: 'procedural_compliance', delta: avg * 0.85 },
        { key: 'attention_to_detail', delta: avg * 0.8 },
        { key: 'situational_awareness', delta: (allScores[0] ?? 0) > 0.6 ? 0.75 : 0.35 },
        { key: 'systematic_reasoning', delta: (allScores[3] ?? 0) > 0.7 ? 0.65 : 0.3 },
      ];
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
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ color: C.blueL, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Air Navigation Communication — Reflection</div>
          <div style={{ color: C.dimM, fontSize: 13 }}>You've completed all communication exercises. Reflect on how information moves between people in operational environments.</div>
        </div>
        <MissionReasoningResponse questions={questions} storageKey="acia_m7_reasoning" onComplete={() => onComplete(pendingEvidence.current)} />
      </div>
    );
  }

  const txColor = ex.id === 're3' ? C.red : ex.id === 're4' ? '#a855f7' : C.blueL;
  const txBg = ex.id === 're3' ? 'rgba(127,29,29,0.12)' : ex.id === 're4' ? 'rgba(88,28,135,0.12)' : 'rgba(8,14,28,0.9)';
  const txBorder = ex.id === 're3' ? 'rgba(220,38,38,0.25)' : ex.id === 're4' ? 'rgba(168,85,247,0.25)' : C.borderL;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {exercises.map((_, i) => (
          <div key={i} style={{
            width: i === exIdx ? 24 : 8, height: 8, borderRadius: 4,
            background: i < exIdx ? C.green : i === exIdx ? C.action : C.border,
            transition: 'all 0.2s',
          }} />
        ))}
        <span style={{ color: C.dim, fontSize: 11, marginLeft: 8, fontFamily: 'monospace' }}>
          {String(exIdx + 1).padStart(2, '0')}/{exercises.length} — {ex.title.toUpperCase()}
        </span>
      </div>

      <div style={{ background: 'rgba(120,85,10,0.12)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ color: C.amberL, fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 4 }}>
          EXERCISE GUIDE
        </div>
        <div style={{ color: '#e2c77a', fontSize: 13, lineHeight: 1.6 }}>{ex.guide}</div>
      </div>

      {ex.scenarioBriefing && (
        <div style={{ background: 'rgba(8,17,32,0.9)', border: `1px solid ${C.borderL}`, borderRadius: 10, padding: 16 }}>
          <div style={{ color: C.blueL, fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 10 }}>
            SCENARIO BRIEFING
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ex.scenarioBriefing.map(fact => (
              <div key={fact.label} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ color: C.blueXL, fontWeight: 600, minWidth: 160, flexShrink: 0 }}>{fact.label}:</span>
                <span style={{ color: C.text }}>{fact.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: txBg, border: `1px solid ${txBorder}`, borderRadius: 10, padding: 14 }}>
        <div style={{ color: txColor, fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 6 }}>
          {ex.id === 're4' ? 'INCOMING OPERATOR' : 'INCOMING TRANSMISSION'} — {ex.title.toUpperCase()}
        </div>
        <div style={{ color: C.text, fontSize: 14, lineHeight: 1.65, fontStyle: 'italic' }}>
          "{ex.atcTransmission}"
        </div>
      </div>

      <div style={{ background: 'rgba(10,18,12,0.9)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ color: C.greenL, fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 4 }}>
          RESPONSE TEMPLATE
        </div>
        <div style={{ color: '#86efac', fontSize: 12, lineHeight: 1.7, fontFamily: 'monospace' }}>{ex.template}</div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: C.dimM, fontSize: 12 }}>
            Compose as <strong style={{ color: C.text }}>{ex.callsign}</strong>:
          </div>
          {!revealed && (
            <button onClick={() => setShowSourceHints(v => !v)} style={{
              background: 'transparent', border: `1px solid rgba(217,119,6,0.3)`, borderRadius: 6,
              padding: '4px 10px', color: C.amberL, fontSize: 10, cursor: 'pointer',
              touchAction: 'manipulation', flexShrink: 0, marginLeft: 12, fontFamily: 'monospace',
            }}>
              {showSourceHints ? 'HIDE HINTS' : 'WHERE DO I FIND THIS?'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ex.blanks.map((blank, i) => (
            <div key={i}>
              <label style={{ color: C.dim, fontSize: 11, display: 'block', marginBottom: 3, fontFamily: 'monospace' }}>
                {ex.hints[i].toUpperCase()}
              </label>
              {showSourceHints && !revealed && (
                <div style={{ color: C.amberL, fontSize: 11, marginBottom: 4, fontStyle: 'italic' }}>
                  — {ex.sourceHints[i]}
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
                    ? inputs[i]?.trim().toLowerCase().includes(blank.toLowerCase().split(' ')[0]) ? 'rgba(22,163,74,0.1)' : 'rgba(127,29,29,0.1)'
                    : C.bg,
                  border: `1px solid ${revealed
                    ? inputs[i]?.trim().toLowerCase().includes(blank.toLowerCase().split(' ')[0]) ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.3)'
                    : C.border}`,
                  borderRadius: 7, color: C.text, padding: '10px 12px',
                  fontSize: 14, outline: 'none', boxSizing: 'border-box', touchAction: 'manipulation',
                }}
              />
              {revealed && (
                <div style={{ color: C.dim, fontSize: 11, marginTop: 3, fontFamily: 'monospace' }}>
                  EXPECTED: <span style={{ color: C.greenL }}>{blank}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {revealed && (
        <div style={{ background: 'rgba(10,18,12,0.9)', border: `1px solid rgba(22,163,74,0.2)`, borderRadius: 10, padding: 14 }}>
          <div style={{ color: C.greenL, fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 6 }}>BRIEFING</div>
          <div style={{ color: C.dimM, fontSize: 13, lineHeight: 1.6 }}>{ex.explanation}</div>
        </div>
      )}

      {!revealed ? (
        <button onClick={confirm} disabled={inputs.some(v => !v?.trim())} style={{
          background: inputs.some(v => !v?.trim()) ? C.card : `linear-gradient(135deg, ${C.action}, ${C.actionH})`,
          color: inputs.some(v => !v?.trim()) ? C.dim : 'white',
          border: `1px solid ${inputs.some(v => !v?.trim()) ? C.border : C.action}`,
          borderRadius: 10, padding: '13px',
          cursor: inputs.some(v => !v?.trim()) ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: 13, touchAction: 'manipulation', fontFamily: 'monospace', letterSpacing: 1,
        }}>
          SUBMIT RESPONSE
        </button>
      ) : (
        <button onClick={next} style={{
          background: `linear-gradient(135deg, ${C.action}, ${C.actionH})`,
          color: 'white', border: 'none', borderRadius: 10, padding: '13px',
          cursor: 'pointer', fontWeight: 700, fontSize: 13,
          touchAction: 'manipulation', fontFamily: 'monospace', letterSpacing: 1,
        }}>
          {isLast ? 'COMPLETE MISSION' : 'NEXT EXERCISE'}
        </button>
      )}
    </div>
  );
}
