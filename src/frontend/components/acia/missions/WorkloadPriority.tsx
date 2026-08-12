import { useState } from 'react';
import type { EvidenceItem } from '../types';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
};

interface Task {
  id: string;
  label: string;
  description: string;
  urgency: 'immediate' | 'soon' | 'defer';
  priority: number;
}

// Round 1 — Cockpit priorities (during cruise)
const COCKPIT_TASKS: Task[] = [
  { id: 'stall_warn', label: 'Stall Warning Triggered', description: 'Master warning active, stick shaker firing', urgency: 'immediate', priority: 1 },
  { id: 'tcas_ra', label: 'TCAS Resolution Advisory', description: 'TCAS: "CLIMB CLIMB CLIMB"', urgency: 'immediate', priority: 2 },
  { id: 'fuel_imbal', label: 'Fuel Imbalance Alert', description: 'Left–right fuel imbalance exceeding 500 lbs', urgency: 'soon', priority: 3 },
  { id: 'atc_freq', label: 'ATC Frequency Change Request', description: 'Toronto Centre: "Contact Montreal 132.7"', urgency: 'soon', priority: 4 },
  { id: 'wx_update', label: 'Destination Weather Update', description: 'Dispatch: updated METAR for destination airport', urgency: 'soon', priority: 5 },
  { id: 'atis', label: 'Obtain Destination ATIS', description: 'Approach ATIS not yet received for destination', urgency: 'soon', priority: 6 },
  { id: 'pax_call', label: 'Flight Attendant Call Light', description: 'FA: "Passenger requesting water"', urgency: 'defer', priority: 7 },
  { id: 'logbook', label: 'Complete Departure Logbook Entry', description: 'Previous sector\'s technical log entry still pending', urgency: 'defer', priority: 8 },
];

// Round 2 — Maintenance priorities (overnight shift)
const MAINTENANCE_TASKS: Task[] = [
  { id: 'oil_leak', label: 'Engine Oil Leak — Left Engine', description: 'Post-flight: oil residue on lower cowling, possible seal failure', urgency: 'immediate', priority: 1 },
  { id: 'pitot_cover', label: 'Pitot Covers Left Installed', description: 'Night crew left pitot covers on — aircraft scheduled in 4 hrs', urgency: 'immediate', priority: 2 },
  { id: 'ad_due', label: 'Airworthiness Directive Due', description: 'AD 2024-18-02: due within 10 flight hours — aircraft at 7 hrs on type', urgency: 'soon', priority: 3 },
  { id: 'lht_dim', label: 'Landing Light Dim (Squawk)', description: 'Captain noted reduced brightness on left landing light — assess MEL applicability', urgency: 'soon', priority: 4 },
  { id: 'fuel_order', label: 'Fuel Order for 06:00 Departure', description: 'Next crew departure 06:00 — must coordinate with ground ops before fuelling shift ends', urgency: 'soon', priority: 5 },
  { id: 'log_entry', label: 'Complete Maintenance Release Entry', description: 'Previous maintenance release requires logbook documentation', urgency: 'soon', priority: 6 },
  { id: 'mel_doc', label: 'MEL Item Documentation — Comm 2', description: 'Secondary comm already deferred per MEL — update records only', urgency: 'defer', priority: 7 },
  { id: 'wash', label: 'Scheduled Exterior Wash', description: 'Routine aircraft wash — cosmetic only, no airworthiness impact', urgency: 'defer', priority: 8 },
];

const COCKPIT_ORDER = [...COCKPIT_TASKS].sort((a, b) => a.priority - b.priority).map(t => t.id);
const MAINTENANCE_ORDER = [...MAINTENANCE_TASKS].sort((a, b) => a.priority - b.priority).map(t => t.id);

interface Round {
  tasks: Task[];
  correctOrder: string[];
  label: string;
  context: string;
}

const ROUNDS: Round[] = [
  {
    tasks: COCKPIT_TASKS,
    correctOrder: COCKPIT_ORDER,
    label: 'Cockpit — Cruise Phase',
    context: 'You are the pilot flying during cruise. Eight demands arrive simultaneously. Drag to rank them from most urgent (top) to least urgent (bottom).',
  },
  {
    tasks: MAINTENANCE_TASKS,
    correctOrder: MAINTENANCE_ORDER,
    label: 'Maintenance — Overnight Shift',
    context: 'You are the duty AME on overnight maintenance. Eight items need your attention before the morning departure. Rank them by priority.',
  },
];

interface Props {
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

export function WorkloadPriority({ onComplete }: Props) {
  const [round, setRound] = useState(0);
  const [items, setItems] = useState(() => [...ROUNDS[0].tasks].sort(() => Math.random() - 0.5));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [startTime] = useState(Date.now());
  const [round1Score, setRound1Score] = useState<{ normalised: number; top3Correct: number } | null>(null);

  const currentRound = ROUNDS[round];

  function handleDragStart(id: string) { setDragging(id); }
  function handleDragEnd() { setDragging(null); setDragOver(null); }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    setDragOver(id);
  }

  function handleDrop(targetId: string) {
    if (!dragging || dragging === targetId) return;
    setItems(prev => {
      const list = [...prev];
      const fromIdx = list.findIndex(t => t.id === dragging);
      const toIdx = list.findIndex(t => t.id === targetId);
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return list;
    });
    setDragging(null);
    setDragOver(null);
  }

  function computeScore(userOrder: string[], correctOrder: string[]) {
    const top3Correct = userOrder.slice(0, 3).filter(id => correctOrder.slice(0, 3).includes(id)).length;
    let positionScore = 0;
    for (let i = 0; i < userOrder.length; i++) {
      const correctPos = correctOrder.indexOf(userOrder[i]);
      const diff = Math.abs(i - correctPos);
      positionScore += Math.max(0, 1 - diff * 0.15);
    }
    return { normalised: positionScore / userOrder.length, top3Correct };
  }

  function submitRound() {
    setSubmitted(true);
    const userOrder = items.map(t => t.id);
    const { normalised, top3Correct } = computeScore(userOrder, currentRound.correctOrder);

    if (round === 0) {
      setRound1Score({ normalised, top3Correct });
    } else {
      // Both rounds done — compute combined evidence
      const elapsed = (Date.now() - startTime) / 1000;
      const r1 = round1Score!;
      const r2 = { normalised, top3Correct };
      const combinedNorm = (r1.normalised + r2.normalised) / 2;
      const combinedTop3 = (r1.top3Correct + r2.top3Correct) / 2;

      const evidence: Omit<EvidenceItem, 'mission'>[] = [
        { key: 'multitasking_ability', delta: combinedNorm * 0.9 },
        { key: 'situational_awareness', delta: combinedTop3 >= 2 ? 0.85 : combinedTop3 >= 1 ? 0.5 : 0.2 },
        { key: 'decision_quality', delta: combinedNorm * 0.75 },
        { key: 'stress_response', delta: elapsed < 210 ? 0.75 : 0.45 },
        { key: 'safety_mindset', delta: combinedTop3 >= 2.5 ? 0.9 : combinedTop3 >= 1 ? 0.6 : 0.2 },
        { key: 'systematic_reasoning', delta: r2.normalised > 0.65 ? 0.7 : 0.35 }, // maintenance round tests AME reasoning
      ];

      setTimeout(() => onComplete(evidence), 3200);
    }
  }

  function startNextRound() {
    setRound(1);
    setItems([...ROUNDS[1].tasks].sort(() => Math.random() - 0.5));
    setSubmitted(false);
    setDragging(null);
    setDragOver(null);
  }

  const correctOrder = currentRound.correctOrder;
  const urgencyColor = (u: string) =>
    u === 'immediate' ? C.red : u === 'soon' ? C.amber : '#8a9ab0';

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Round indicator */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {ROUNDS.map((r, i) => (
          <div key={i} style={{
            width: i === round ? 28 : 8, height: 8, borderRadius: 4,
            background: i < round ? C.green : i === round ? C.crimson : C.border,
            transition: 'all 0.2s',
          }} />
        ))}
        <span style={{ color: C.grey, fontSize: 12, marginLeft: 8 }}>
          Round {round + 1}/{ROUNDS.length} — {currentRound.label}
        </span>
      </div>

      <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: 14 }}>
        <div style={{ color: '#86efac', fontSize: 13, lineHeight: 1.5 }}>
          {currentRound.context}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((task, idx) => {
          const correctIdx = correctOrder.indexOf(task.id);
          const diff = submitted ? Math.abs(idx - correctIdx) : null;
          const posColor = diff === null ? C.border : diff === 0 ? C.green : diff <= 1 ? C.amber : C.red;

          return (
            <div
              key={task.id}
              draggable={!submitted}
              onDragStart={() => handleDragStart(task.id)}
              onDragEnd={handleDragEnd}
              onDragOver={e => handleDragOver(e, task.id)}
              onDrop={() => handleDrop(task.id)}
              style={{
                background: dragging === task.id ? '#2d1020' : dragOver === task.id ? '#1f1015' : C.bgCard,
                border: `1px solid ${posColor}`,
                borderRadius: 12,
                padding: '12px 16px',
                cursor: submitted ? 'default' : 'grab',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'border-color 0.2s',
                opacity: dragging === task.id ? 0.6 : 1,
              }}
            >
              <span style={{ color: C.grey, fontSize: 11, minWidth: 20, textAlign: 'center', fontWeight: 700 }}>
                {idx + 1}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{task.label}</div>
                <div style={{ color: C.grey, fontSize: 11 }}>{task.description}</div>
              </div>
              <span style={{
                background: urgencyColor(task.urgency) + '22',
                color: urgencyColor(task.urgency),
                fontSize: 10, fontWeight: 700, padding: '2px 8px',
                borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {task.urgency}
              </span>
              {submitted && (
                <span style={{ color: posColor, fontSize: 12, minWidth: 20, textAlign: 'right' }}>
                  {diff === 0 ? '✓' : `±${diff}`}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {submitted ? (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ color: C.grey, fontSize: 12, marginBottom: 8 }}>Optimal priority order for this context:</div>
          {correctOrder.map((id, i) => {
            const t = currentRound.tasks.find(t => t.id === id)!;
            return (
              <div key={id} style={{ color: C.grey, fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: C.crimson }}>{i + 1}.</span> {t.label}
              </div>
            );
          })}
          {round < ROUNDS.length - 1 ? (
            <button
              onClick={startNextRound}
              style={{
                marginTop: 14,
                background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
                color: 'white', border: 'none', borderRadius: 10, padding: '11px 20px',
                cursor: 'pointer', fontWeight: 700, fontSize: 13, width: '100%',
              }}
            >
              Next Round — Maintenance Priorities →
            </button>
          ) : (
            <div style={{ color: C.grey, fontSize: 12, marginTop: 10 }}>Advancing to next mission…</div>
          )}
        </div>
      ) : (
        <button
          onClick={submitRound}
          style={{
            background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: 'white', border: 'none', borderRadius: 12, padding: '13px',
            cursor: 'pointer', fontWeight: 700, fontSize: 14,
          }}
        >
          Submit Priority Order →
        </button>
      )}
    </div>
  );
}
