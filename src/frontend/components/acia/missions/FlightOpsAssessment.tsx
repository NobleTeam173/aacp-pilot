import { useState, useCallback } from 'react';
import type { EvidenceItem } from '../types';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
  bgDeep: '#130a0c',
  border: '#3d1020',
  borderLight: '#5a1828',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyDim: '#64748b',
  amber: '#f59e0b',
  green: '#22c55e',
  blue: '#38bdf8',
  teal: '#2dd4bf',
};

// ── Evidence helpers ──────────────────────────────────────────────────────────

type EvidenceKey = EvidenceItem['key'];

function ev(key: EvidenceKey, delta: number): Omit<EvidenceItem, 'mission'> {
  return { key, delta };
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function PanelCard({ title, children, highlight }: { title: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? 'rgba(56,189,248,0.06)' : C.bgCard,
      border: `1px solid ${highlight ? C.blue : C.border}`,
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 12,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: highlight ? C.blue : C.greyDim, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mismatch }: { label: string; value: string; mismatch?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: C.grey }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: mismatch ? C.amber : C.white }}>{value}</span>
    </div>
  );
}

function ACIABubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-start' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.crimson, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: C.white, flexShrink: 0, marginTop: 2 }}>A</div>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '4px 14px 14px 14px', padding: '10px 14px', color: C.white, fontSize: 13, lineHeight: 1.6, maxWidth: '90%' }}>{text}</div>
    </div>
  );
}

function OptionButton({ label, selected, onClick, disabled }: { label: string; selected: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: selected ? 'rgba(143,9,9,0.2)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? C.crimson : C.border}`,
        borderRadius: 8, padding: '10px 14px', color: selected ? C.white : C.grey,
        fontSize: 13, cursor: disabled ? 'default' : 'pointer', marginBottom: 8,
        transition: 'all 0.15s',
      }}
    >{label}</button>
  );
}

function FollowUpInput({ question, onSubmit, disabled }: { question: string; onSubmit: (v: string) => void; disabled?: boolean }) {
  const [val, setVal] = useState('');
  return (
    <div style={{ marginTop: 16 }}>
      <ACIABubble text={question} />
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="Share your thinking…"
        disabled={disabled}
        rows={3}
        style={{
          width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 8,
          color: C.white, padding: '10px 14px', fontSize: 13, resize: 'none', outline: 'none',
          fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      <button
        onClick={() => { if (val.trim()) onSubmit(val.trim()); }}
        disabled={!val.trim() || disabled}
        style={{
          marginTop: 8, background: C.crimson, color: C.white, border: 'none', borderRadius: 8,
          padding: '9px 20px', cursor: val.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13,
          opacity: val.trim() ? 1 : 0.5,
        }}
      >Continue →</button>
    </div>
  );
}

// ── SCENARIO 1: Pre-flight Preparation ───────────────────────────────────────

interface S1State { reviewed: Set<string>; decision: string; followUp: string; submitted: boolean }

function Scenario1({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[], notes: string) => void }) {
  const [state, setState] = useState<S1State>({ reviewed: new Set(), decision: '', followUp: '', submitted: false });
  const [phase, setPhase] = useState<'review' | 'decide' | 'followup' | 'done'>('review');

  const panels = [
    { id: 'checklist', label: 'Flight Checklist' },
    { id: 'briefing', label: 'Flight Briefing' },
    { id: 'aircraft', label: 'Aircraft Information' },
    { id: 'crew', label: 'Crew Information' },
  ];

  function toggleReview(id: string) {
    setState(s => ({ ...s, reviewed: new Set([...s.reviewed, id]) }));
  }

  function handleDecide() {
    if (!state.reviewed.has('briefing') || !state.reviewed.has('aircraft')) return;
    setPhase('decide');
  }

  function handleOption(opt: string) {
    setState(s => ({ ...s, decision: opt }));
  }

  function handleDecideSubmit() {
    if (!state.decision) return;
    setPhase('followup');
  }

  function handleFollowUp(val: string) {
    setState(s => ({ ...s, followUp: val, submitted: true }));

    const evidence: Omit<EvidenceItem, 'mission'>[] = [];
    const identified = state.decision === 'flag';
    const reviewedBoth = state.reviewed.has('briefing') && state.reviewed.has('aircraft');
    const checklist = state.reviewed.has('checklist');
    const refusedCompletion = state.decision === 'flag' || state.decision === 'clarify';
    const mentionedDiscrepancy = val.toLowerCase().includes('time') || val.toLowerCase().includes('discrepancy') || val.toLowerCase().includes('departure') || val.toLowerCase().includes('differ') || val.toLowerCase().includes('conflict');

    if (checklist) evidence.push(ev('procedural_compliance', 0.6));
    if (reviewedBoth) evidence.push(ev('attention_to_detail', 0.5));
    if (identified) evidence.push(ev('attention_to_detail', 0.7));
    if (refusedCompletion) evidence.push(ev('procedural_compliance', 0.7));
    if (mentionedDiscrepancy) evidence.push(ev('situational_awareness', 0.7));
    if (state.decision === 'complete') evidence.push(ev('procedural_compliance', -0.4));

    onComplete(evidence, `S1: decision=${state.decision}; reviewed=${[...state.reviewed].join(',')}; followup="${val.substring(0, 80)}"`);
    setPhase('done');
  }

  return (
    <div>
      <ACIABubble text="Welcome to Regional Flight 214. Your first task is to review the flight preparation information and confirm that the required items are ready. Use the checklist and the information panels. You may review each panel more than once." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {panels.map(p => (
          <button
            key={p.id}
            onClick={() => toggleReview(p.id)}
            style={{
              background: state.reviewed.has(p.id) ? 'rgba(34,197,94,0.1)' : C.bgCard,
              border: `1px solid ${state.reviewed.has(p.id) ? C.green : C.border}`,
              borderRadius: 8, padding: '10px 12px', color: C.white, fontSize: 12,
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 10, color: state.reviewed.has(p.id) ? C.green : C.greyDim, marginBottom: 4, fontWeight: 700 }}>
              {state.reviewed.has(p.id) ? '✓ Reviewed' : 'Tap to review'}
            </div>
            {p.label}
          </button>
        ))}
      </div>

      {state.reviewed.has('checklist') && (
        <PanelCard title="Flight Preparation Checklist">
          {['Confirm flight identification', 'Verify departure and destination', 'Review aircraft status', 'Review current weather information', 'Confirm outstanding items addressed'].map((item, i) => (
            <div key={i} style={{ fontSize: 12, color: C.grey, padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>{i + 1}. {item}</div>
          ))}
        </PanelCard>
      )}

      {state.reviewed.has('briefing') && (
        <PanelCard title="Flight Briefing">
          <InfoRow label="Flight" value="Regional 214" />
          <InfoRow label="Departure" value="Calgary" />
          <InfoRow label="Destination" value="Lethbridge" />
          <InfoRow label="Scheduled departure" value="10:30 a.m." />
        </PanelCard>
      )}

      {state.reviewed.has('aircraft') && (
        <PanelCard title="Aircraft Information Panel" highlight>
          <InfoRow label="Flight" value="Regional 214" />
          <InfoRow label="Departure" value="Calgary" />
          <InfoRow label="Destination" value="Lethbridge" />
          <InfoRow label="Scheduled departure" value="11:00 a.m." mismatch />
          {state.reviewed.has('briefing') && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.1)', border: `1px solid ${C.amber}`, borderRadius: 6, fontSize: 11, color: C.amber }}>
              Departure time differs from flight briefing (10:30 a.m. vs 11:00 a.m.)
            </div>
          )}
        </PanelCard>
      )}

      {state.reviewed.has('crew') && (
        <PanelCard title="Crew Information">
          <InfoRow label="Captain" value="Assigned" />
          <InfoRow label="First Officer" value="Assigned" />
          <InfoRow label="Crew briefing" value="Complete" />
        </PanelCard>
      )}

      {phase === 'review' && (
        <button
          onClick={handleDecide}
          disabled={!state.reviewed.has('briefing') || !state.reviewed.has('aircraft')}
          style={{
            marginTop: 8, background: C.crimson, color: C.white, border: 'none', borderRadius: 8,
            padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            opacity: (state.reviewed.has('briefing') && state.reviewed.has('aircraft')) ? 1 : 0.4,
          }}
        >Review complete — proceed to decision →</button>
      )}

      {phase === 'decide' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 12 }}>Based on your review, what should happen next?</div>
          {[
            { id: 'complete', label: 'Mark preparation complete — all items reviewed' },
            { id: 'flag', label: 'Flag the departure-time discrepancy before marking complete' },
            { id: 'clarify', label: 'Request clarification on the departure time before proceeding' },
            { id: 'skip', label: 'Skip the discrepancy — it will be resolved at departure' },
          ].map(o => (
            <OptionButton key={o.id} label={o.label} selected={state.decision === o.id} onClick={() => handleOption(o.id)} />
          ))}
          <button
            onClick={handleDecideSubmit}
            disabled={!state.decision}
            style={{ marginTop: 4, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: state.decision ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: state.decision ? 1 : 0.4 }}
          >Confirm →</button>
        </div>
      )}

      {phase === 'followup' && (
        <FollowUpInput
          question="What information did you consider most important to verify before completing the preparation review?"
          onSubmit={handleFollowUp}
        />
      )}

      {phase === 'done' && (
        <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, color: C.green }}>
          Scenario 1 complete. Proceeding to weather review…
        </div>
      )}
    </div>
  );
}

// ── SCENARIO 2: Changing Weather Conditions ───────────────────────────────────

interface S2State { decision: string; followUp1: string; reassessDecision: string; followUp2: string }

function Scenario2({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[], notes: string) => void }) {
  const [phase, setPhase] = useState<'initial' | 'followup1' | 'revised' | 'followup2' | 'done'>('initial');
  const [state, setState] = useState<S2State>({ decision: '', followUp1: '', reassessDecision: '', followUp2: '' });

  function handleInitialDecision(opt: string) { setState(s => ({ ...s, decision: opt })); }
  function handleInitialSubmit() { if (state.decision) setPhase('followup1'); }
  function handleFollowUp1(val: string) { setState(s => ({ ...s, followUp1: val })); setPhase('revised'); }
  function handleReassess(opt: string) { setState(s => ({ ...s, reassessDecision: opt })); }
  function handleReassessSubmit() { if (state.reassessDecision) setPhase('followup2'); }

  function handleFollowUp2(val: string) {
    setState(s => ({ ...s, followUp2: val }));

    const evidence: Omit<EvidenceItem, 'mission'>[] = [];
    const correctInitial = state.decision === 'review';
    const mentionedCriteria = state.followUp1.toLowerCase().includes('5') || state.followUp1.toLowerCase().includes('visib') || state.followUp1.toLowerCase().includes('criteria') || state.followUp1.toLowerCase().includes('3 km');
    const correctReassess = state.reassessDecision === 'continue_updated' || state.reassessDecision === 'still_review';
    const unresolvedConcern = state.reassessDecision === 'still_review';
    const changedWithReason = val.toLowerCase().includes('6') || val.toLowerCase().includes('above') || val.toLowerCase().includes('meets') || val.toLowerCase().includes('updated');

    if (correctInitial) { evidence.push(ev('decision_quality', 0.8)); evidence.push(ev('situational_awareness', 0.7)); }
    if (!correctInitial) evidence.push(ev('decision_quality', -0.3));
    if (mentionedCriteria) evidence.push(ev('attention_to_detail', 0.7));
    if (correctReassess) evidence.push(ev('decision_quality', 0.6));
    if (unresolvedConcern) evidence.push(ev('situational_awareness', 0.6));
    if (changedWithReason) evidence.push(ev('analytical_reasoning', 0.5));

    onComplete(evidence, `S2: initial=${state.decision}; reassess=${state.reassessDecision}`);
    setPhase('done');
  }

  return (
    <div>
      <ACIABubble text="New weather information has been received for the destination. Review the original briefing and the updated conditions before deciding whether the current plan remains appropriate." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <PanelCard title="Original destination conditions">
          <InfoRow label="Visibility" value="8 km" />
          <InfoRow label="Wind" value="12 km/h" />
          <div style={{ fontSize: 11, color: C.green, marginTop: 6 }}>Within operating criteria</div>
        </PanelCard>
        <PanelCard title="Updated destination conditions" highlight>
          <InfoRow label="Visibility" value="3 km" mismatch />
          <InfoRow label="Wind" value="15 km/h" />
          <div style={{ fontSize: 11, color: C.amber, marginTop: 6 }}>Updated</div>
        </PanelCard>
      </div>

      <PanelCard title="Scenario operating criteria">
        <div style={{ fontSize: 12, color: C.grey, lineHeight: 1.7 }}>
          Visibility of <span style={{ color: C.white, fontWeight: 600 }}>5 km or greater</span> meets the stated criterion.<br />
          Visibility below 5 km requires the plan to be reviewed.<br />
          An unresolved weather concern requires clarification before proceeding.
        </div>
      </PanelCard>

      {(phase === 'initial') && (
        <div>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 10 }}>What is the appropriate response to the updated conditions?</div>
          {[
            { id: 'continue', label: 'A. Continue with the original plan without further review' },
            { id: 'review', label: 'B. Request an operational review — updated visibility falls below the stated criterion' },
            { id: 'ignore_wind', label: 'C. Ignore the update — the wind change is small' },
            { id: 'skip', label: 'D. Mark the weather review complete without checking the criteria' },
          ].map(o => <OptionButton key={o.id} label={o.label} selected={state.decision === o.id} onClick={() => handleInitialDecision(o.id)} />)}
          <button onClick={handleInitialSubmit} disabled={!state.decision} style={{ marginTop: 4, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: state.decision ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: state.decision ? 1 : 0.4 }}>Confirm →</button>
        </div>
      )}

      {phase === 'followup1' && (
        <FollowUpInput question="Which information influenced your decision, and why?" onSubmit={handleFollowUp1} />
      )}

      {phase === 'revised' && (
        <div>
          <PanelCard title="Updated conditions — revised" highlight>
            <InfoRow label="Destination visibility" value="6 km" />
            <div style={{ fontSize: 11, color: C.green, marginTop: 6 }}>Revised update received</div>
          </PanelCard>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 10 }}>Does this new information change your recommendation?</div>
          {[
            { id: 'continue_updated', label: 'A. The revised visibility now meets the criterion — the original plan can proceed' },
            { id: 'still_review', label: 'B. Proceed, but confirm the outstanding operational review is completed before departure' },
            { id: 'revert', label: 'C. Disregard both updates and return to the original conditions' },
            { id: 'no_change', label: 'D. No change needed — conditions were always acceptable' },
          ].map(o => <OptionButton key={o.id} label={o.label} selected={state.reassessDecision === o.id} onClick={() => handleReassess(o.id)} />)}
          <button onClick={handleReassessSubmit} disabled={!state.reassessDecision} style={{ marginTop: 4, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: state.reassessDecision ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: state.reassessDecision ? 1 : 0.4 }}>Confirm →</button>
        </div>
      )}

      {phase === 'followup2' && (
        <FollowUpInput question="Does this new information change your recommendation? Explain your reasoning." onSubmit={handleFollowUp2} />
      )}

      {phase === 'done' && (
        <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, color: C.green }}>
          Scenario 2 complete. Connecting to crew communication…
        </div>
      )}
    </div>
  );
}

// ── SCENARIO 3: Crew Communication ───────────────────────────────────────────

function Scenario3({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[], notes: string) => void }) {
  const [phase, setPhase] = useState<'compose' | 'followup' | 'done'>('compose');
  const [message, setMessage] = useState('');
  const [followUp, setFollowUp] = useState('');

  function handleMessageSubmit() {
    if (message.trim().length < 20) return;
    setPhase('followup');
  }

  function handleFollowUp(val: string) {
    setFollowUp(val);

    const evidence: Omit<EvidenceItem, 'mission'>[] = [];
    const text = message.toLowerCase();
    const fup = val.toLowerCase();

    const mentionedDeparture = text.includes('departure') || text.includes('time') || text.includes('10:30') || text.includes('11:00') || text.includes('discrepancy');
    const mentionedWeather = text.includes('weather') || text.includes('visibility') || text.includes('3 km') || text.includes('6 km');
    const distinguishesResolved = (text.includes('resolved') || text.includes('confirmed') || text.includes('corrected')) && (text.includes('outstanding') || text.includes('unresolved') || text.includes('still') || text.includes('confirm'));
    const accurate = !text.includes('all clear') && !text.includes('no issues') && !text.includes('everything is fine');
    const mentionedDiscrepancyInFollowup = fup.includes('departure') || fup.includes('time') || fup.includes('discrepancy');
    const conciseButComplete = message.length > 30 && message.length < 800;

    if (mentionedDeparture) evidence.push(ev('situational_awareness', 0.6));
    if (mentionedWeather) evidence.push(ev('communication_quality', 0.6));
    if (distinguishesResolved) evidence.push(ev('communication_quality', 0.8));
    if (accurate) evidence.push(ev('procedural_compliance', 0.5));
    if (mentionedDiscrepancyInFollowup) evidence.push(ev('procedural_compliance', 0.6));
    if (conciseButComplete) evidence.push(ev('communication_quality', 0.4));
    if (!mentionedDeparture && !mentionedWeather) evidence.push(ev('communication_quality', -0.3));

    onComplete(evidence, `S3: message="${message.substring(0, 100)}"; followup="${val.substring(0, 60)}"`);
    setPhase('done');
  }

  return (
    <div>
      <ACIABubble text="I'm your simulated co-pilot. We've received several updates during preparation. Please summarize the current operational situation — including anything that has changed and anything we still need to confirm." />

      {phase === 'compose' && (
        <div>
          <PanelCard title="Information available for review">
            <div style={{ fontSize: 12, color: C.grey, lineHeight: 1.8 }}>
              • Flight preparation review: complete<br />
              • Departure-time discrepancy: <span style={{ color: C.amber }}>noted — verification required</span><br />
              • Original destination weather: 8 km visibility (within criteria)<br />
              • Updated destination weather: 3 km → revised to 6 km<br />
              • Operational review status: <span style={{ color: C.amber }}>outstanding</span>
            </div>
          </PanelCard>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Compose your operational update to the co-pilot…"
            rows={5}
            style={{ width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, padding: '10px 14px', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: 8 }}
          />
          <div style={{ fontSize: 11, color: C.greyDim, marginTop: 4 }}>Focus on accuracy and relevance. A concise, accurate message demonstrates strong communication.</div>
          <button onClick={handleMessageSubmit} disabled={message.trim().length < 20} style={{ marginTop: 8, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: message.trim().length >= 20 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: message.trim().length >= 20 ? 1 : 0.4 }}>Send update →</button>
        </div>
      )}

      {phase === 'followup' && (
        <div>
          <div style={{ padding: '10px 14px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.grey, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.greyDim, letterSpacing: '0.1em', marginBottom: 6 }}>YOUR MESSAGE</div>
            {message}
          </div>
          <FollowUpInput
            question="I understand the weather has changed. Is there anything else we still need to verify?"
            onSubmit={handleFollowUp}
          />
        </div>
      )}

      {phase === 'done' && (
        <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, color: C.green }}>
          Scenario 3 complete. Multiple notifications incoming…
        </div>
      )}
    </div>
  );
}

// ── SCENARIO 4: Competing Operational Priorities ──────────────────────────────

interface Notification { id: string; priority: 'operational' | 'crew' | 'admin' | 'ops'; title: string; body: string }

const NOTIFICATIONS: Notification[] = [
  { id: 'A', priority: 'operational', title: 'Weather Update', body: 'Latest destination weather information requires confirmation.' },
  { id: 'B', priority: 'crew', title: 'Crew Request', body: 'Co-pilot requests clarification about the unresolved departure-time discrepancy.' },
  { id: 'C', priority: 'admin', title: 'Administrative', body: 'Routine administrative message — requires acknowledgment later today.' },
  { id: 'D', priority: 'ops', title: 'Operations', body: 'Operations team requests confirmation that outstanding preparation concerns have been resolved.' },
];

function Scenario4({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[], notes: string) => void }) {
  const [order, setOrder] = useState<string[]>(['A', 'B', 'C', 'D']);
  const [phase, setPhase] = useState<'prioritize' | 'update' | 'followup' | 'done'>('prioritize');
  const [followUp, setFollowUp] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [initialOrder, setInitialOrder] = useState<string[]>([]);

  function moveUp(id: string) {
    setOrder(prev => {
      const i = prev.indexOf(id);
      if (i <= 0) return prev;
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function moveDown(id: string) {
    setOrder(prev => {
      const i = prev.indexOf(id);
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i + 1], next[i]] = [next[i], next[i + 1]];
      return next;
    });
  }

  function handleSubmitPriority() {
    setInitialOrder([...order]);
    setPhase('update');
  }

  function handleFollowUp(val: string) {
    setFollowUp(val);

    const evidence: Omit<EvidenceItem, 'mission'>[] = [];
    const firstTwo = order.slice(0, 2);
    const adminLast = order[order.length - 1] === 'C' || order[order.length - 2] === 'C';
    const weatherHighPriority = firstTwo.includes('A');
    const crewAddressed = order.indexOf('B') <= 2;
    const adminNotFirst = order[0] !== 'C';
    const mentionedUpdate = val.toLowerCase().includes('update') || val.toLowerCase().includes('weather') || val.toLowerCase().includes('departure') || val.toLowerCase().includes('changed');

    if (adminLast) evidence.push(ev('multitasking_ability', 0.7));
    if (weatherHighPriority) evidence.push(ev('situational_awareness', 0.6));
    if (crewAddressed) evidence.push(ev('communication_quality', 0.5));
    if (adminNotFirst) evidence.push(ev('decision_quality', 0.5));
    if (mentionedUpdate) evidence.push(ev('learning_agility', 0.5));
    if (!adminLast) evidence.push(ev('multitasking_ability', -0.2));

    onComplete(evidence, `S4: order=[${order.join(',')}]; initial=[${initialOrder.join(',')}]`);
    setPhase('done');
  }

  const priorityColor: Record<string, string> = { operational: C.amber, crew: C.blue, admin: C.greyDim, ops: C.teal };

  return (
    <div>
      <ACIABubble text="Several updates now require attention. Review the notifications and decide what should be addressed first. You may defer items that do not require immediate action." />

      {(phase === 'prioritize' || phase === 'update') && (
        <div>
          {phase === 'update' && (
            <PanelCard title="Operations Update" highlight>
              <div style={{ fontSize: 12, color: C.white, lineHeight: 1.6 }}>
                The departure-time discrepancy has been <span style={{ color: C.green }}>corrected and confirmed</span>. The <span style={{ color: C.amber }}>weather review remains outstanding</span>.
              </div>
            </PanelCard>
          )}

          <div style={{ fontSize: 11, color: C.greyDim, marginBottom: 8 }}>Use the arrows to arrange notifications in priority order (top = highest priority)</div>

          {order.map((id, idx) => {
            const n = NOTIFICATIONS.find(x => x.id === id)!;
            return (
              <div
                key={id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                  background: C.bgCard, border: `1px solid ${priorityColor[n.priority] ?? C.border}`,
                  borderRadius: 8, padding: '10px 12px',
                  opacity: dragging === id ? 0.5 : 1,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, color: priorityColor[n.priority], width: 20, textAlign: 'center' }}>{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 2 }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: C.grey }}>{n.body}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button onClick={() => moveUp(id)} disabled={idx === 0} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.grey, cursor: idx === 0 ? 'default' : 'pointer', padding: '2px 6px', fontSize: 11, opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                  <button onClick={() => moveDown(id)} disabled={idx === order.length - 1} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.grey, cursor: idx === order.length - 1 ? 'default' : 'pointer', padding: '2px 6px', fontSize: 11, opacity: idx === order.length - 1 ? 0.3 : 1 }}>▼</button>
                </div>
              </div>
            );
          })}

          {phase === 'prioritize' && (
            <button onClick={handleSubmitPriority} style={{ marginTop: 8, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Confirm priority order →</button>
          )}

          {phase === 'update' && (
            <FollowUpInput
              question="What information influenced your priorities, and did the new update change your approach?"
              onSubmit={handleFollowUp}
            />
          )}
        </div>
      )}

      {phase === 'done' && (
        <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, color: C.green }}>
          Scenario 4 complete. Preparing final operational decision…
        </div>
      )}
    </div>
  );
}

// ── SCENARIO 5: Final Operational Decision ────────────────────────────────────

function Scenario5({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[], notes: string) => void }) {
  const [decision, setDecision] = useState('');
  const [phase, setPhase] = useState<'decide' | 'followup' | 'compose' | 'done'>('decide');
  const [followUp, setFollowUp] = useState('');
  const [finalMessage, setFinalMessage] = useState('');

  function handleDecideSubmit() { if (decision) setPhase('followup'); }

  function handleFollowUp(val: string) {
    setFollowUp(val);
    setPhase('compose');
  }

  function handleFinalMessage() {
    if (finalMessage.trim().length < 15) return;

    const evidence: Omit<EvidenceItem, 'mission'>[] = [];
    const text = finalMessage.toLowerCase();
    const fup = followUp.toLowerCase();

    const correctDecision = decision === 'confirm_review';
    const identified6km = fup.includes('6') || fup.includes('visib') || fup.includes('meets') || fup.includes('above');
    const identifiedOutstanding = fup.includes('outstanding') || fup.includes('confirm') || fup.includes('review') || fup.includes('not yet');
    const messageAccurate = text.includes('weather') || text.includes('visib') || text.includes('confirm') || text.includes('outstanding');
    const messageNotMisleading = !text.includes('all clear') && !text.includes('ready to go') && !text.includes('no concerns');
    const integratesAll = (text.includes('departure') || text.includes('time')) && (text.includes('weather') || text.includes('visib'));

    if (correctDecision) evidence.push(ev('decision_quality', 0.9));
    if (!correctDecision) evidence.push(ev('decision_quality', -0.4));
    if (identified6km) evidence.push(ev('situational_awareness', 0.6));
    if (identifiedOutstanding) evidence.push(ev('procedural_compliance', 0.7));
    if (messageAccurate) evidence.push(ev('communication_quality', 0.7));
    if (messageNotMisleading) evidence.push(ev('communication_quality', 0.4));
    if (integratesAll) evidence.push(ev('situational_awareness', 0.6));

    onComplete(evidence, `S5: decision=${decision}; message="${finalMessage.substring(0, 100)}"`);
    setPhase('done');
  }

  return (
    <div>
      <ACIABubble text="Regional Flight 214 is in its final preparation phase. Review the consolidated status and provide your recommendation." />

      <PanelCard title="Consolidated operations display — Regional 214">
        <InfoRow label="Departure-time discrepancy" value="Resolved ✓" />
        <InfoRow label="Latest destination visibility" value="6 km" />
        <InfoRow label="Weather criterion" value="Minimum 5 km (fictional assessment rules)" />
        <InfoRow label="Outstanding requirement" value="Ops confirmation of weather review not yet recorded" mismatch />
      </PanelCard>

      {phase === 'decide' && (
        <div>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 10 }}>Can the preparation process be marked complete?</div>
          {[
            { id: 'mark_complete', label: 'A. Mark preparation complete — latest visibility meets the stated criterion' },
            { id: 'confirm_review', label: 'B. Confirm the outstanding weather review before marking preparation complete' },
            { id: 'ignore_outstanding', label: 'C. Ignore the outstanding confirmation — the departure time has been corrected' },
            { id: 'revert_original', label: 'D. Return to the original weather information and disregard subsequent updates' },
          ].map(o => <OptionButton key={o.id} label={o.label} selected={decision === o.id} onClick={() => setDecision(o.id)} />)}
          <button onClick={handleDecideSubmit} disabled={!decision} style={{ marginTop: 4, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: decision ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: decision ? 1 : 0.4 }}>Confirm →</button>
        </div>
      )}

      {phase === 'followup' && (
        <FollowUpInput
          question="What information supports your recommendation, and what remains to be confirmed?"
          onSubmit={handleFollowUp}
        />
      )}

      {phase === 'compose' && (
        <div>
          <ACIABubble text="Please send a concise operational update to your co-pilot covering the current situation and any outstanding requirement." />
          <textarea
            value={finalMessage}
            onChange={e => setFinalMessage(e.target.value)}
            placeholder="Compose your final operational message…"
            rows={4}
            style={{ width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, padding: '10px 14px', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: 4 }}
          />
          <button onClick={handleFinalMessage} disabled={finalMessage.trim().length < 15} style={{ marginTop: 8, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: finalMessage.trim().length >= 15 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: finalMessage.trim().length >= 15 ? 1 : 0.4 }}>Send final message →</button>
        </div>
      )}

      {phase === 'done' && (
        <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, color: C.green }}>
          Mission complete. Regional Flight 214 preparation reviewed.
        </div>
      )}
    </div>
  );
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

interface Props {
  isRpas?: boolean;
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[], chatHistory?: never[]) => void;
}

const SCENARIO_LABELS = [
  'Pre-flight Preparation',
  'Changing Weather',
  'Crew Communication',
  'Competing Priorities',
  'Final Decision',
];

export function FlightOpsAssessment({ isRpas, onComplete }: Props) {
  const [scenario, setScenario] = useState(0);
  const [allEvidence, setAllEvidence] = useState<Omit<EvidenceItem, 'mission'>[]>([]);
  const [notes, setNotes] = useState<string[]>([]);

  const handleScenarioComplete = useCallback((scIdx: number, ev: Omit<EvidenceItem, 'mission'>[], note: string) => {
    setAllEvidence(prev => {
      const merged = [...prev, ...ev];
      if (scIdx === 4) {
        // All 5 scenarios done — deduplicate by key, average deltas
        const grouped: Record<string, number[]> = {};
        for (const item of merged) {
          if (!grouped[item.key]) grouped[item.key] = [];
          grouped[item.key].push(item.delta);
        }
        const deduped = Object.entries(grouped).map(([key, vals]) => ({
          key: key as EvidenceKey,
          delta: vals.reduce((a, b) => a + b, 0) / vals.length,
        }));
        onComplete(deduped);
      }
      return merged;
    });
    setNotes(prev => [...prev, note]);
    setScenario(scIdx + 1);
  }, [onComplete]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Cockpit header */}
      <div style={{ background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: C.greyDim, letterSpacing: '0.1em', fontWeight: 700 }}>REGIONAL 214 · CALGARY → LETHBRIDGE · 10:30 A.M.</div>
            <div style={{ fontSize: 13, color: C.white, marginTop: 2, fontWeight: 600 }}>Mission 6 — Pilot & Flight Operations</div>
          </div>
          <div style={{ fontSize: 10, color: C.greyDim, textAlign: 'right' }}>
            ACIA Career Intelligence Platform
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4 }}>
          {SCENARIO_LABELS.map((label, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 3, borderRadius: 2, background: i < scenario ? C.green : i === scenario ? C.crimson : C.border, transition: 'background 0.3s', marginBottom: 3 }} />
              <div style={{ fontSize: 9, color: i < scenario ? C.green : i === scenario ? C.white : C.greyDim, display: 'none' }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.grey, marginTop: 4 }}>
          {scenario < 5 ? `Scenario ${scenario + 1} of 5 — ${SCENARIO_LABELS[scenario]}` : 'Assessment complete'}
        </div>
      </div>

      {/* Scenario panels */}
      <div style={{ overflowY: 'auto', maxHeight: 480, paddingRight: 2 }}>
        {scenario === 0 && <Scenario1 onComplete={(ev, note) => handleScenarioComplete(0, ev, note)} />}
        {scenario === 1 && <Scenario2 onComplete={(ev, note) => handleScenarioComplete(1, ev, note)} />}
        {scenario === 2 && <Scenario3 onComplete={(ev, note) => handleScenarioComplete(2, ev, note)} />}
        {scenario === 3 && <Scenario4 onComplete={(ev, note) => handleScenarioComplete(3, ev, note)} />}
        {scenario === 4 && <Scenario5 onComplete={(ev, note) => handleScenarioComplete(4, ev, note)} />}
        {scenario >= 5 && (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: C.green, fontWeight: 700, marginBottom: 8 }}>Mission 6 Complete</div>
            <div style={{ fontSize: 12, color: C.grey }}>Your operational assessment has been recorded. Proceeding to Mission 7.</div>
          </div>
        )}
      </div>
    </div>
  );
}
