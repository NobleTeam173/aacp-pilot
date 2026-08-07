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
};

interface TreeNode {
  id: string;
  question: string;
  hint?: string;
  options: { label: string; nextId: string | null; isCorrect?: boolean }[];
}

interface Outcome {
  id: string;
  title: string;
  explanation: string;
  optimal: boolean;
  safetyFail?: boolean;
}

// AME scenario: fuel quantity anomaly on C-GACP (Cessna 340A)
const TREE: TreeNode[] = [
  {
    id: 'root',
    question: 'Aircraft C-GACP (Cessna 340A) returned from a 3-hr charter. The crew logged: "Fuel quantity gauges gave false-high readings on both tanks for approximately 10 minutes during cruise, then corrected spontaneously. Fuel load was verified correct at departure." ACARS data is available. What is your first diagnostic step?',
    hint: 'Establish the facts before touching anything on the aircraft.',
    options: [
      { label: 'Review ACARS data and fuel system BITE codes, then interview the crew in detail about conditions at the time of anomaly', nextId: 'interview', isCorrect: true },
      { label: 'Replace both fuel quantity transducers — intermittent gauge anomalies are a known failure mode on this type', nextId: 'replace_early' },
      { label: 'Log the fault as "transient anomaly — monitor" and clear the crew squawk. If it recurs, investigate further', nextId: 'log_transient' },
      { label: 'Run a full fuel system BITE test on the ground and check for stored fault codes', nextId: 'ground_test' },
    ],
  },
  {
    id: 'interview',
    question: 'ACARS confirms a 0.3V transient on the main DC bus precisely at the time of the gauge anomaly. The co-pilot mentions the cabin galley coffee maker was plugged into the aircraft power outlet at that moment — first time on this aircraft type. What is your working hypothesis?',
    hint: 'You have two data points that align in time: bus voltage drop and galley load.',
    options: [
      { label: 'Electrical interference from the galley circuit is affecting the fuel quantity sensing circuit through a shared ground path', nextId: 'electrical_test', isCorrect: true },
      { label: 'The ACARS transient is coincidence — fuel quantity systems are separately shielded. Proceed to check transducer wiring directly', nextId: 'transducer_check' },
      { label: 'The crew is likely confusing the sequence of events. Discount the galley as a cause and focus on the transducers', nextId: 'discount' },
    ],
  },
  {
    id: 'electrical_test',
    question: 'You trace the fuel quantity circuit. Continuity testing reveals that both fuel qty transmitters share a ground return bus with the cabin electrical load bus. Under 12A galley draw, you measure a 0.4V ground differential — consistent with the ACARS anomaly window. The fix: separate the ground buses and run a functional check. The chief inspector says: "That\'s a 4-hour job. We have a 06:00 charter in 5 hours — just note it as a deferred item." What do you do?',
    options: [
      { label: 'Defer it — fuel quantity gauges are not primary navigation instruments; the aircraft can fly with a known intermittent indication', nextId: 'defer_outcome' },
      { label: 'Complete the ground bus separation and functional check before the aircraft is released for charter — then document the root cause', nextId: 'outcome_optimal', isCorrect: true },
      { label: 'Apply a placard and operational restriction prohibiting cabin power use, then release the aircraft under that restriction', nextId: 'interim_outcome' },
      { label: 'Refuse to release the aircraft and immediately escalate to Transport Canada', nextId: 'escalate_outcome' },
    ],
  },
  {
    id: 'transducer_check',
    question: 'You check both fuel quantity transducers — wiring connections are secure, resistance values are within spec, no corrosion found. The anomaly cannot be replicated on the ground by the transducers alone. The ACARS DC bus transient is still unexplained. What is your next step?',
    options: [
      { label: 'Return to the electrical interference hypothesis — trace the ground bus for a shared path with the cabin load circuit', nextId: 'electrical_test', isCorrect: true },
      { label: 'Release the aircraft — transducers check out and the anomaly was transient. NFF closes the squawk', nextId: 'nff_outcome' },
    ],
  },
  {
    id: 'ground_test',
    question: 'The fuel system BITE test shows no stored fault codes. Both fuel quantity gauges read correctly and stably on the ground. This is consistent with an intermittent airborne-only condition triggered by an in-flight load. What is your next step?',
    options: [
      { label: 'Interview the crew and review ACARS data to identify the load conditions at the time of anomaly', nextId: 'interview', isCorrect: true },
      { label: 'BITE shows no fault — the system is serviceable. Release the aircraft and log as NFF (No Fault Found)', nextId: 'nff_outcome' },
    ],
  },

  // Terminal nodes (outcome markers)
  { id: 'replace_early', question: '', options: [], hint: 'outcome:replace_early' },
  { id: 'log_transient', question: '', options: [], hint: 'outcome:log_transient' },
  { id: 'discount', question: '', options: [], hint: 'outcome:discount' },
  { id: 'defer_outcome', question: '', options: [], hint: 'outcome:defer_outcome' },
  { id: 'outcome_optimal', question: '', options: [], hint: 'outcome:outcome_optimal' },
  { id: 'interim_outcome', question: '', options: [], hint: 'outcome:interim_outcome' },
  { id: 'escalate_outcome', question: '', options: [], hint: 'outcome:escalate_outcome' },
  { id: 'nff_outcome', question: '', options: [], hint: 'outcome:nff_outcome' },
];

const OUTCOMES: Record<string, Outcome> = {
  replace_early: {
    id: 'replace_early',
    title: 'Component Replacement Without Root Cause',
    explanation: 'Replacing parts before establishing a root cause is inefficient and potentially unsafe. If the correct component is not replaced, the fault persists and the aircraft returns to service with an unresolved safety-critical issue. AME diagnostic practice requires establishing root cause before any corrective action.',
    optimal: false,
  },
  log_transient: {
    id: 'log_transient',
    title: 'Safety-Critical Defect Deferred Without Investigation',
    explanation: 'Fuel quantity indication is safety-critical in a twin-engine piston aircraft — fuel management depends on accurate readings, especially in IFR operations. An unexplained anomaly on a safety-critical system must be investigated before the aircraft is returned to service. Logging "monitor" without investigation is a safety mindset failure.',
    optimal: false,
    safetyFail: true,
  },
  discount: {
    id: 'discount',
    title: 'Valid Evidence Discarded',
    explanation: 'Dismissing crew observations and corroborating ACARS data removes valid diagnostic information. Maintenance engineers build their root cause analysis on all available data — crew interview, instrument data, and maintenance records together. Discounting any one source risks missing the actual cause.',
    optimal: false,
  },
  defer_outcome: {
    id: 'defer_outcome',
    title: 'Inappropriate Deferral of Safety-Critical Fault',
    explanation: 'Fuel quantity indication cannot be deferred without a proper MEL item and operational restriction in the approved MEL. More importantly, this is a diagnosed fault with a known root cause — a 4-hour repair before a revenue flight is the correct call. Deferring a known safety-critical fault to meet a schedule is a serious professional and regulatory error.',
    optimal: false,
    safetyFail: true,
  },
  outcome_optimal: {
    id: 'outcome_optimal',
    title: 'Root Cause Identified and Corrected',
    explanation: 'Excellent. You identified the root cause (ground bus shared path causing voltage-induced gauge errors), completed the repair, ran a functional check, and documented everything. The aircraft goes into service with a verified-correct fuel quantity system and a complete audit trail. This is the correct outcome — systematic, safe, and professional.',
    optimal: true,
  },
  interim_outcome: {
    id: 'interim_outcome',
    title: 'Operational Restriction — Partial Mitigation Only',
    explanation: 'Applying a placard and operational restriction shows good safety instinct, but it treats the symptom rather than the root cause. The correct approach is to fix the ground bus isolation and document the root cause. A restriction alone does not resolve the fault and may be missed by a future crew.',
    optimal: false,
  },
  escalate_outcome: {
    id: 'escalate_outcome',
    title: 'Premature External Escalation',
    explanation: 'Escalating directly to Transport Canada before exhausting internal resolution is premature when there is an identified fix and the organization has not yet refused to authorize it. TC escalation is appropriate when an organization refuses to address an immediate safety threat. The correct first action is to complete the available repair.',
    optimal: false,
  },
  nff_outcome: {
    id: 'nff_outcome',
    title: 'No Fault Found — Incorrect Release',
    explanation: 'A "no fault found" BITE result for an intermittent airborne anomaly does not constitute clearance for dispatch. The anomaly has not been explained and the condition that produced it (in-flight galley load) cannot be replicated on the ground. Releasing on NFF without investigation leaves a safety-critical system with an unresolved fault.',
    optimal: false,
    safetyFail: true,
  },
};

interface Props {
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

export function SystemDiagnosis({ onComplete }: Props) {
  const [history, setHistory] = useState<string[]>(['root']);
  const [done, setDone] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const currentId = history[history.length - 1];
  const currentNode = TREE.find(n => n.id === currentId)!;
  const outcomeKey = currentNode?.hint?.startsWith('outcome:') ? currentNode.hint.replace('outcome:', '') : null;

  function choose(optionIndex: number) {
    const opt = currentNode.options[optionIndex];
    const nextNode = TREE.find(n => n.id === opt.nextId);

    if (!opt.nextId || nextNode?.hint?.startsWith('outcome:')) {
      const targetId = opt.nextId ?? currentId;
      const targetNode = TREE.find(n => n.id === targetId);
      const key = targetNode?.hint?.replace('outcome:', '') ?? targetId;
      const out = OUTCOMES[key] ?? OUTCOMES['nff_outcome'];
      setOutcome(out);
      setHistory(prev => [...prev, targetId]);
      setDone(true);

      const depth = history.length; // how many decision nodes reached
      const wentThroughInterview = history.includes('interview');
      const recovered = history.includes('transducer_check') && history.includes('electrical_test');
      const safetyFailed = out.safetyFail === true;

      const evidence: Omit<EvidenceItem, 'mission'>[] = [
        { key: 'systematic_reasoning', delta: depth >= 4 ? 0.85 : depth >= 3 ? 0.55 : 0.2 },
        { key: 'decision_quality', delta: out.optimal ? 0.9 : safetyFailed ? -0.1 : 0.35 },
        { key: 'safety_mindset', delta: safetyFailed ? -0.2 : out.optimal ? 0.9 : 0.45 },
        { key: 'procedural_compliance', delta: out.optimal ? 0.85 : out.id === 'interim_outcome' ? 0.45 : 0.15 },
        { key: 'situational_awareness', delta: wentThroughInterview ? 0.75 : 0.3 },
        { key: 'learning_agility', delta: recovered ? 0.85 : depth >= 3 ? 0.55 : 0.3 },
        { key: 'analytical_reasoning', delta: depth >= 3 ? 0.7 : 0.35 },
      ];

      setTimeout(() => onComplete(evidence), 2800);
    } else {
      setHistory(prev => [...prev, opt.nextId!]);
    }
  }

  if (done && outcome) {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          background: outcome.optimal ? '#0f1a0f' : outcome.safetyFail ? '#1a0505' : '#1a1000',
          border: `1px solid ${outcome.optimal ? '#1a3a1a' : outcome.safetyFail ? '#3a0505' : '#3a2a00'}`,
          borderRadius: 16,
          padding: 20,
        }}>
          <div style={{
            color: outcome.optimal ? C.green : outcome.safetyFail ? '#ef4444' : C.amber,
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
          }}>
            {outcome.optimal ? '✓ Optimal Outcome' : outcome.safetyFail ? '⚠ Safety-Critical Error' : 'Learning Opportunity'}
          </div>
          <div style={{ color: C.white, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{outcome.title}</div>
          <div style={{ color: C.grey, fontSize: 14, lineHeight: 1.65 }}>{outcome.explanation}</div>
        </div>

        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ color: C.grey, fontSize: 12, marginBottom: 8 }}>
            Your diagnostic path — {history.filter(h => !TREE.find(n => n.id === h)?.hint?.startsWith('outcome:')).length} decision nodes reached
          </div>
          {history
            .filter(h => !TREE.find(n => n.id === h)?.hint?.startsWith('outcome:'))
            .map((h, i) => {
              const node = TREE.find(n => n.id === h);
              return (
                <div key={i} style={{ color: C.grey, fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: C.crimson }}>Step {i + 1}:</span>{' '}
                  {node?.question?.slice(0, 70)}…
                </div>
              );
            })}
        </div>

        <div style={{ color: C.grey, fontSize: 13, textAlign: 'center' }}>Advancing to next mission…</div>
      </div>
    );
  }

  // Active mission state
  const stepNum = history.filter(h => !TREE.find(n => n.id === h)?.hint?.startsWith('outcome:')).length;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`@keyframes warnFlash { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      {/* Maintenance status header */}
      <div style={{
        background: '#050a0a',
        border: '1px solid #0f2a2a',
        borderRadius: 12,
        padding: '12px 16px',
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
          MEL / SQUAWK LOG
        </div>
        {[
          { label: 'FUEL QTY ANOM', active: true, color: '#f59e0b' },
          { label: 'ACARS: DC BUS -0.3V', active: true, color: '#f59e0b' },
          { label: 'ENG 1 OIL', active: false, color: '#6b7280' },
          { label: 'ALL OTHER SYS', active: false, color: '#6b7280' },
          { label: 'C-GACP AOG', active: true, color: '#ef4444', flash: true },
        ].map(({ label, active, color, flash }) => (
          <div key={label} style={{
            background: active ? color + '22' : '#0f1520',
            border: `1px solid ${active ? color : '#1e293b'}`,
            borderRadius: 6,
            padding: '4px 8px',
            color: active ? color : '#374151',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            fontFamily: 'monospace',
            animation: flash ? 'warnFlash 1.2s ease-in-out infinite' : 'none',
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Step progress */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {[1, 2, 3, 4].map(s => (
          <div key={s} style={{
            width: s <= stepNum ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: s < stepNum ? C.green : s === stepNum ? C.crimson : C.border,
            transition: 'all 0.25s',
          }} />
        ))}
        <span style={{ color: C.grey, fontSize: 12, marginLeft: 8 }}>
          Fault Investigation — Step {stepNum}
        </span>
      </div>

      {/* Question card */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ color: '#6B7074', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          AME Diagnostic — C-GACP Cessna 340A
        </div>
        <div style={{ color: C.white, fontSize: 15, lineHeight: 1.65, marginBottom: currentNode.hint && !currentNode.hint.startsWith('outcome:') ? 12 : 0 }}>
          {currentNode.question}
        </div>
        {currentNode.hint && !currentNode.hint.startsWith('outcome:') && (
          <div style={{
            color: C.grey, fontSize: 13, fontStyle: 'italic',
            borderLeft: `2px solid ${C.border}`, paddingLeft: 12, marginTop: 8,
          }}>
            {currentNode.hint}
          </div>
        )}
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {currentNode.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => choose(i)}
            style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: '13px 16px',
              color: C.white,
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
              lineHeight: 1.55,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = C.crimson)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
          >
            {String.fromCharCode(65 + i)}. {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
