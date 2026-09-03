import { useState, useEffect } from 'react';
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
  amber: '#f59e0b',
};

interface Question {
  id: string;
  instrument: string;
  reading: number;
  unit: string;
  normalMin: number;
  normalMax: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  dangerBelow?: number;
}

const QUESTIONS: Question[] = [
  {
    id: 'q1',
    instrument: 'Altimeter',
    reading: 10500,
    unit: 'ft',
    normalMin: 0,
    normalMax: 45000,
    question: 'Context: FL (Flight Level) is expressed in hundreds of feet of pressure altitude — FL110 means 11,000 ft. You are cleared to FL110. Your altimeter reads 10,500 ft. What is your status?',
    options: [
      '500 ft below assigned altitude — continue climbing',
      'At assigned altitude — level off',
      '500 ft above assigned altitude — begin descent',
      'System error — altitude unreliable',
    ],
    correctIndex: 0,
    explanation: 'FL110 = 11,000 ft pressure altitude. At 10,500 ft you are 500 ft below your cleared level and should continue climbing.',
  },
  {
    id: 'q2',
    instrument: 'Oil Pressure Gauge',
    reading: 22,
    unit: 'PSI',
    normalMin: 25,
    normalMax: 90,
    question: 'Engine oil pressure reads 22 PSI. Normal operating range is 25–90 PSI. What action is required?',
    options: [
      'Normal reading — no action required',
      'Slightly low — note in logbook and monitor',
      'Below minimum — execute abnormal procedure checklist, consider engine shutdown',
      'Critical emergency — immediate declaration required before any other action',
    ],
    correctIndex: 2,
    explanation: 'Oil pressure below the minimum operating range requires immediate execution of the abnormal procedure checklist. Engine shutdown may be required to prevent catastrophic bearing failure. This is a timed emergency — do not delay.',
    dangerBelow: 25,
  },
  {
    id: 'q3',
    instrument: 'Left Fuel Tank',
    reading: 1800,
    unit: 'lbs',
    normalMin: 0,
    normalMax: 6000,
    question: 'Left tank: 1,800 lbs. Right tank: 3,400 lbs. Fuel burn rate: 2,200 lbs/hr. You have 2.5 hours to destination. What is the primary concern and correct action?',
    options: [
      'Fuel asymmetry and potential exhaustion before destination — divert to nearest suitable airport',
      'Fuel is sufficient — 5,200 lbs total at 2,200 lbs/hr gives 2.36 hrs, close enough to continue',
      'Asymmetry only — cross-feed to balance tanks, then continue to destination',
      'Declare emergency and return to departure airport immediately',
    ],
    correctIndex: 0,
    explanation: '5,200 lbs at 2,200 lbs/hr = 2.36 hrs endurance. Destination requires 2.5 hrs — insufficient by 14 minutes, not counting reserves. Plus the asymmetry (1,600 lb imbalance) risks structural and handling issues. Diversion to the nearest suitable airport is the correct, conservative call.',
  },
  {
    id: 'q4',
    instrument: 'Hydraulic Sys A',
    reading: 1200,
    unit: 'PSI',
    normalMin: 2700,
    normalMax: 3100,
    question: 'During approach, Hydraulic System A reads 1,200 PSI. System B reads 2,850 PSI. Flight controls are normally powered from System A. System B is the backup. What does this indicate and what is the immediate action?',
    options: [
      'Total hydraulic failure — declare emergency immediately, prepare for loss of all flight controls',
      'System A failure — transfer flight controls to System B, complete the hydraulic abnormal checklist, advise ATC',
      'Brief hydraulic transient — monitor; System A will likely recover as pressure restores',
      'System A is at low but acceptable approach-mode pressure — no action required until landing',
    ],
    correctIndex: 1,
    explanation: 'System A at 1,200 PSI is a clear failure (normal range 2,700–3,100 PSI). System B is normal — flight controls can be transferred. The correct sequence: transfer to System B, complete the abnormal checklist, advise ATC of the abnormal situation, and plan for an expedited landing. Total hydraulic failure would require both systems to fail.',
    dangerBelow: 2700,
  },
];

interface Props {
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

export function InstrumentReading({ onComplete }: Props) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [startTime] = useState(Date.now());

  const q = QUESTIONS[current];
  const isLast = current === QUESTIONS.length - 1;

  function selectAnswer(idx: number) {
    if (revealed) return;
    setSelected(idx);
  }

  function confirm() {
    if (selected === null) return;
    setRevealed(true);
  }

  function next() {
    const newAnswers = [...answers, selected!];
    if (isLast) {
      const correct = newAnswers.filter((a, i) => a === QUESTIONS[i].correctIndex).length;
      const accuracy = correct / QUESTIONS.length;
      const elapsed = (Date.now() - startTime) / 1000;

      // Q2 (oil pressure) and Q4 (hydraulic) are the safety-critical reads
      const oilCorrect = newAnswers[1] === QUESTIONS[1].correctIndex;
      const hydCorrect = newAnswers[3] === QUESTIONS[3].correctIndex;
      const safetyScore = ((oilCorrect ? 1 : 0) + (hydCorrect ? 1 : 0)) / 2;

      const evidence: Omit<EvidenceItem, 'mission'>[] = [
        { key: 'analytical_reasoning', delta: accuracy * 0.9 },
        { key: 'attention_to_detail', delta: accuracy * 0.85 },
        { key: 'situational_awareness', delta: accuracy * 0.8 },
        { key: 'decision_quality', delta: accuracy > 0.7 ? 0.75 : accuracy > 0.4 ? 0.4 : 0.1 },
        { key: 'safety_mindset', delta: safetyScore * 0.9 },
      ];
      if (elapsed < 240) evidence.push({ key: 'systematic_reasoning', delta: 0.55 });
      onComplete(evidence);
    } else {
      setAnswers(newAnswers);
      setCurrent(c => c + 1);
      setSelected(null);
      setRevealed(false);
    }
  }

  function GaugeDisplay({ reading, unit, min, max, label, dangerBelow }: {
    reading: number; unit: string; min: number; max: number; label: string;
    dangerBelow?: number;
  }) {
    const [displayed, setDisplayed] = useState(min);
    useEffect(() => {
      const target = reading;
      let start: number | null = null;
      const duration = 900;
      function animate(ts: number) {
        if (!start) start = ts;
        const p = Math.min(1, (ts - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplayed(min + (target - min) * eased);
        if (p < 1) requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);
    }, [reading, min]);

    const pct = Math.min(1, Math.max(0, (displayed - min) / (max - min)));
    const angle = -140 + pct * 280;
    const rad = (angle * Math.PI) / 180;
    const cx = 80, cy = 80, r = 60;
    const nx = cx + r * Math.sin(rad);
    const ny = cy - r * Math.cos(rad);

    const isDanger = dangerBelow !== undefined && reading < dangerBelow;
    const needleColor = isDanger ? '#ef4444' : '#f59e0b';

    function arcPoint(angleDeg: number, radius: number) {
      const a = angleDeg * Math.PI / 180;
      return { x: cx + radius * Math.sin(a), y: cy - radius * Math.cos(a) };
    }

    const zones = [
      { from: -140, to: -20, color: '#1e3a5f' },
      { from: -20, to: 100, color: '#14532d' },
      { from: 100, to: 140, color: '#7f1d1d' },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ position: 'relative', filter: `drop-shadow(0 0 12px ${isDanger ? '#ef444440' : '#00000060'})` }}>
          <svg width={160} height={120} viewBox="0 0 160 120">
            <circle cx={cx} cy={cy} r={72} fill="#0a0e18" stroke="#1e2d3d" strokeWidth={3} />
            <circle cx={cx} cy={cy} r={68} fill="#0f1520" stroke="#233044" strokeWidth={1} />
            {zones.map((zone, zi) => {
              const steps = 20;
              const span = zone.to - zone.from;
              return Array.from({ length: steps }).map((_, si) => {
                const a1 = (zone.from + (span / steps) * si);
                const a2 = (zone.from + (span / steps) * (si + 0.85));
                const p1 = arcPoint(a1, 58), p2 = arcPoint(a2, 58);
                const p3 = arcPoint(a2, 64), p4 = arcPoint(a1, 64);
                return (
                  <path key={`${zi}-${si}`}
                    d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`}
                    fill={zone.color} opacity={0.7}
                  />
                );
              });
            })}
            {Array.from({ length: 29 }).map((_, i) => {
              const a = (-140 + i * 10) * Math.PI / 180;
              const isMajor = i % 4 === 0;
              const r1 = isMajor ? 50 : 53;
              const x1 = cx + r1 * Math.sin(a), y1 = cy - r1 * Math.cos(a);
              const x2 = cx + 57 * Math.sin(a), y2 = cy - 57 * Math.cos(a);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={isMajor ? '#94a3b8' : '#334155'} strokeWidth={isMajor ? 1.5 : 1} />;
            })}
            <line x1={cx + 1} y1={cy + 1} x2={nx + 1} y2={ny + 1}
              stroke="#000" strokeWidth={3} strokeLinecap="round" opacity={0.4} />
            <line x1={cx} y1={cy} x2={nx} y2={ny}
              stroke={needleColor} strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={6} fill="#1e293b" stroke={needleColor} strokeWidth={2} />
            <circle cx={cx} cy={cy} r={2} fill={needleColor} />
            <rect x={cx - 28} y={cy + 20} width={56} height={20} rx={4} fill="#0a0e18" stroke="#1e2d3d" />
            <text x={cx} y={cy + 34} textAnchor="middle" fill={isDanger ? '#ef4444' : '#f1f5f9'}
              fontSize={12} fontWeight="bold" fontFamily="monospace">{Math.round(displayed).toLocaleString()}</text>
            <text x={cx} y={cy + 50} textAnchor="middle" fill="#64748b" fontSize={9}>{unit}</text>
          </svg>
          {isDanger && (
            <div style={{
              position: 'absolute', top: 4, right: 4,
              width: 10, height: 10, borderRadius: '50%', background: '#ef4444',
              animation: 'gaugePulse 0.8s ease-in-out infinite',
            }} />
          )}
        </div>
        <div style={{ color: isDanger ? '#ef4444' : C.grey, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: isDanger ? 700 : 400 }}>
          {label}
        </div>
        <style>{`@keyframes gaugePulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.3; transform:scale(1.5); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {QUESTIONS.map((_, i) => (
          <div key={i} style={{
            width: i === current ? 24 : 8, height: 8, borderRadius: 4,
            background: i < current ? C.green : i === current ? C.crimson : C.border,
            transition: 'all 0.2s',
          }} />
        ))}
        <span style={{ color: C.grey, fontSize: 12, marginLeft: 8 }}>Instrument {current + 1}/{QUESTIONS.length}</span>
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <GaugeDisplay
            reading={q.reading} unit={q.unit}
            min={q.normalMin} max={q.normalMax} label={q.instrument}
            dangerBelow={q.dangerBelow}
          />
        </div>
        <div style={{ color: C.white, fontSize: 15, lineHeight: 1.65 }}>{q.question}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = i === q.correctIndex;
          let bg = C.bgCard;
          let border = C.border;
          if (revealed) {
            if (isCorrect) { bg = '#0f1a0f'; border = '#1a3a1a'; }
            else if (isSelected && !isCorrect) { bg = '#1a0505'; border = '#3a0505'; }
          } else if (isSelected) {
            bg = '#2d1020'; border = C.crimson;
          }
          return (
            <button
              key={i}
              onClick={() => selectAnswer(i)}
              disabled={revealed}
              style={{
                background: bg, border: `1px solid ${border}`, borderRadius: 12,
                padding: '12px 16px', color: C.white, fontSize: 13, cursor: revealed ? 'default' : 'pointer',
                textAlign: 'left', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 10,
              }}
            >
              <span style={{ color: revealed && isCorrect ? C.green : revealed && isSelected ? C.red : C.grey, flexShrink: 0 }}>
                {revealed ? (isCorrect ? '✓' : isSelected ? '✗' : String.fromCharCode(65 + i)) : String.fromCharCode(65 + i)}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div style={{ background: '#0f1520', border: '1px solid #1e3a5f', borderRadius: 12, padding: 14 }}>
          <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>BRIEFING</div>
          <div style={{ color: C.grey, fontSize: 13, lineHeight: 1.6 }}>{q.explanation}</div>
        </div>
      )}

      {!revealed ? (
        <button
          onClick={confirm}
          disabled={selected === null}
          style={{
            background: selected === null ? '#2d1118' : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: selected === null ? C.grey : 'white',
            border: 'none', borderRadius: 12, padding: '12px',
            cursor: selected === null ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14,
          }}
        >
          Confirm Reading
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
          {isLast ? 'Complete Mission →' : 'Next Instrument →'}
        </button>
      )}
    </div>
  );
}
