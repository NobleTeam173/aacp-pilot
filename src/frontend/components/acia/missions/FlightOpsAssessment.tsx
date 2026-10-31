import { useState, useCallback, useEffect, useRef } from 'react';
import type { EvidenceItem } from '../types';

const C = {
  crimson: '#8F0909',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
  bgDeep: '#130a0c',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyDim: '#64748b',
  amber: '#f59e0b',
  green: '#22c55e',
  blue: '#38bdf8',
  teal: '#2dd4bf',
};

type EvidenceKey = EvidenceItem['key'];
function ev(key: EvidenceKey, delta: number): Omit<EvidenceItem, 'mission'> { return { key, delta }; }

// ── Semantic concept matching ─────────────────────────────────────────────────
// Each concept is a cluster of patterns expressing the same idea.
// A concept is "present" if ANY pattern in its cluster matches.
// This captures meaning regardless of specific wording chosen by the participant.

type ConceptCluster = RegExp[];

function hasConcept(text: string, cluster: ConceptCluster): boolean {
  return cluster.some(p => p.test(text));
}

// Concept clusters used across M6 rubrics
const CONCEPTS = {
  // S1, S3, S5 — the departure time inconsistency between sources
  departureDiscrepancy: [
    /discrepan/i, /depart.{0,12}time/i, /time.{0,12}depart/i,
    /two.{0,15}time/i, /differ.{0,12}time/i, /time.{0,12}differ/i,
    /mismatch/i, /inconsisten/i, /not.{0,8}match/i, /conflict.{0,12}time/i,
    /10.{0,4}30.{0,20}11.{0,4}00/i, /11.{0,4}00.{0,20}10.{0,4}30/i,
    /schedul.{0,20}differ/i, /differ.{0,20}schedul/i,
  ] as ConceptCluster,

  // S1 — the need to act on or resolve an unverified item before proceeding
  actionBeforeProceeding: [
    /before.{0,15}proceed/i, /before.{0,15}depart/i, /before.{0,15}go/i,
    /resolve.{0,15}first/i, /first.{0,15}resolve/i,
    /confirm.{0,15}before/i, /verif/i, /clarif/i,
    /need.{0,12}address/i, /address.{0,12}first/i, /cannot.{0,12}proceed/i,
    /should.{0,12}not.{0,12}proceed/i, /hold.{0,12}depart/i,
  ] as ConceptCluster,

  // S2 — the specific operating criterion being a threshold value
  visibilityCriterion: [
    /\b5\s*km/i, /minimum.{0,20}visib/i, /visib.{0,20}minimum/i,
    /below.{0,15}limit/i, /below.{0,15}requir/i, /requir.{0,15}visib/i,
    /threshold/i, /criterion/i, /criteria/i, /operating.{0,15}limit/i,
    /\b3\s*km.{0,20}below/i, /below.{0,20}\b3\s*km/i,
    /not.{0,10}meet/i, /fail.{0,10}meet/i, /doesn.{0,5}t.{0,10}meet/i,
  ] as ConceptCluster,

  // S2, S5 — revised figure now meets the criterion
  revisedMeetsCriterion: [
    /\b6\s*km/i, /now.{0,15}meet/i, /meet.{0,15}now/i,
    /above.{0,12}minimum/i, /above.{0,12}\b5/i, /satisf/i,
    /within.{0,12}limit/i, /acceptable/i, /revised.{0,15}meet/i,
    /meet.{0,15}revised/i, /updated.{0,15}meet/i, /meet.{0,15}updated/i,
    /now.{0,12}acceptable/i, /sufficient/i,
  ] as ConceptCluster,

  // S3, S5 — the weather update and its evolving state
  weatherUpdate: [
    /weather/i, /visib/i, /condition/i, /forecast/i,
    /3\s*km/i, /6\s*km/i, /kilomet/i, /updated.{0,15}weather/i,
    /weather.{0,15}updat/i, /meteorolog/i,
  ] as ConceptCluster,

  // S3, S5 — distinguishing what has been confirmed from what remains open
  distinguishResolvedFromOpen: [
    /resolv.{0,20}(outstanding|still|pending|open|unresolved)/i,
    /(outstanding|still|pending|open|unresolved).{0,20}resolv/i,
    /confirm.{0,20}(outstanding|still|pending)/i,
    /(outstanding|pending|unresolved).{0,20}confirm/i,
    /one.{0,20}resolv.{0,20}(another|other|but)/i,
    /depart.{0,20}resolv.{0,20}weather/i, /weather.{0,20}still.{0,20}depart/i,
    /while.{0,20}(still|outstanding|pending)/i,
    /however.{0,20}(still|outstanding|weather)/i,
    /although.{0,20}(still|weather|outstanding)/i,
  ] as ConceptCluster,

  // S3, S5 — an item that still requires attention before proceeding
  outstandingRequirement: [
    /outstanding/i, /unresolved/i, /not.{0,10}yet/i, /still.{0,10}need/i,
    /pending/i, /await/i, /remain.{0,10}open/i, /open.{0,10}item/i,
    /not.{0,10}confirm/i, /confirm.{0,10}not/i, /incomplete/i,
    /still.{0,10}require/i, /need.{0,10}confirm/i, /require.{0,10}confirm/i,
    /before.{0,10}mark/i, /before.{0,10}complet/i,
  ] as ConceptCluster,

  // S4 — integrating updated information into a revised view
  integratedNewInfo: [
    /updat.{0,20}(change|affect|now|show)/i,
    /(change|affect|now|show).{0,20}updat/i,
    /new.{0,15}(information|info|update|data)/i,
    /(information|info|update|data).{0,15}change/i,
    /weather.{0,20}still/i, /still.{0,20}weather/i,
    /depart.{0,20}resolv/i, /resolv.{0,20}depart/i,
    /now.{0,15}(only|just|weather|one)/i,
    /remain.{0,15}(weather|one|only)/i,
    /original.{0,15}priorit/i,
  ] as ConceptCluster,
};

// ── Shared UI components ──────────────────────────────────────────────────────

function ACIABubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: C.crimson, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: C.white, flexShrink: 0, marginTop: 2 }}>A</div>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '4px 14px 14px 14px', padding: '9px 14px', color: C.white, fontSize: 13, lineHeight: 1.6, maxWidth: '92%' }}>{text}</div>
    </div>
  );
}

function OptionButton({ label, selected, onClick, disabled }: { label: string; selected: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'block', width: '100%', textAlign: 'left',
      background: selected ? 'rgba(143,9,9,0.2)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${selected ? C.crimson : C.border}`,
      borderRadius: 8, padding: '9px 14px', color: selected ? C.white : C.grey,
      fontSize: 13, cursor: disabled ? 'default' : 'pointer', marginBottom: 7, transition: 'all 0.15s',
    }}>{label}</button>
  );
}

function InfoRow({ label, value, mismatch }: { label: string; value: string; mismatch?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
      <span style={{ fontSize: 12, color: C.grey }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: mismatch ? C.amber : C.white }}>{value}</span>
    </div>
  );
}

function PanelCard({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ background: accent ? `rgba(${hexToRgb(accent)},0.06)` : C.bgCard, border: `1px solid ${accent ?? C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: accent ?? C.greyDim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7 }}>{title}</div>
      {children}
    </div>
  );
}

function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '255,255,255';
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

function FollowUpInput({ question, onSubmit, disabled }: { question: string; onSubmit: (v: string) => void; disabled?: boolean }) {
  const [val, setVal] = useState('');
  return (
    <div style={{ marginTop: 14 }}>
      <ACIABubble text={question} />
      <textarea value={val} onChange={e => setVal(e.target.value)} placeholder="Share your thinking…" disabled={disabled} rows={3} style={{ width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, padding: '10px 14px', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      <button onClick={() => { if (val.trim()) onSubmit(val.trim()); }} disabled={!val.trim() || disabled} style={{ marginTop: 8, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '9px 20px', cursor: val.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: val.trim() ? 1 : 0.5 }}>Continue →</button>
    </div>
  );
}

// ── Cockpit Environment ───────────────────────────────────────────────────────

interface ScreenZone {
  id: string; label: string; icon: string;
  pos: [number, number, number, number]; // [left%, top%, width%, height%]
  color: string;
}

const SCREEN_ZONES: ScreenZone[] = [
  { id: 'checklist', label: 'Checklist',    icon: '☑', pos: [ 2,  6, 18, 54], color: '#38bdf8' },
  { id: 'briefing',  label: 'Briefing',     icon: '✈', pos: [22,  6, 26, 54], color: '#a78bfa' },
  { id: 'aircraft',  label: 'Aircraft Info', icon: '⚙', pos: [50,  6, 26, 54], color: '#f59e0b' },
  { id: 'weather',   label: 'Weather',      icon: '☁', pos: [78,  6, 20, 54], color: '#2dd4bf' },
  { id: 'crew',      label: 'Crew Comms',   icon: '📡', pos: [32, 64, 36, 28], color: '#60a5fa' },
];

// Content rendered inside each cockpit screen when active
type PanelContentMap = Partial<Record<string, React.ReactNode>>;

function PulsingBorder({ color }: { color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let t = 0; let raf: number;
    const tick = () => {
      t += 0.04;
      const o = 0.5 + Math.sin(t) * 0.3;
      if (el) el.style.boxShadow = `0 0 12px 2px ${color}${Math.round(o * 255).toString(16).padStart(2,'0')}, inset 0 0 8px 1px ${color}22`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [color]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0, borderRadius: 4, border: `1.5px solid ${color}`, pointerEvents: 'none' }} />;
}

function CockpitEnvironment({
  availableIds, openId, onOpen, panelContent, reviewedIds,
}: {
  availableIds: string[]; openId: string | null;
  onOpen: (id: string) => void; panelContent: PanelContentMap;
  reviewedIds: Set<string>;
}) {
  const openZone = SCREEN_ZONES.find(z => z.id === openId);

  return (
    <div style={{ position: 'relative', width: '100%', borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
      {/* Cockpit photo */}
      <div style={{ position: 'relative' }}>
        <img
          src="/images/cockpit.webp"
          alt="Flight deck"
          style={{ width: '100%', height: 220, objectFit: 'cover', objectPosition: 'center top', display: 'block', filter: 'brightness(0.68) saturate(1.15)' }}
          draggable={false}
        />

        {/* Screen zone overlays */}
        {SCREEN_ZONES.map(zone => {
          const available = availableIds.includes(zone.id);
          const isOpen = openId === zone.id;
          const reviewed = reviewedIds.has(zone.id);
          const [l, t, w, h] = zone.pos;
          return (
            <div key={zone.id} onClick={() => { if (available) onOpen(zone.id); }} style={{
              position: 'absolute', left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`,
              borderRadius: 5,
              background: isOpen ? `linear-gradient(135deg,${zone.color}30,${zone.color}18)` : available ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.55)',
              border: isOpen ? `2px solid ${zone.color}` : available ? `1.5px solid ${zone.color}80` : '1px solid rgba(255,255,255,0.07)',
              cursor: available ? 'pointer' : 'default',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.18s, border-color 0.18s', overflow: 'hidden',
            }}>
              {available && !isOpen && <PulsingBorder color={zone.color} />}
              {available ? (
                <>
                  <div style={{ fontSize: isOpen ? 13 : 16, marginBottom: 2, color: zone.color, filter: isOpen ? 'none' : 'drop-shadow(0 0 4px currentColor)' }}>{zone.icon}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: isOpen ? zone.color : C.white, textAlign: 'center', letterSpacing: '0.06em', textShadow: '0 1px 3px rgba(0,0,0,0.9)', padding: '0 3px', lineHeight: 1.3 }}>{zone.label}</div>
                  {reviewed && !isOpen && <div style={{ fontSize: 7, color: C.green, marginTop: 2 }}>✓</div>}
                  {!reviewed && !isOpen && <div style={{ fontSize: 7, color: `${zone.color}bb`, marginTop: 2 }}>TAP</div>}
                  {isOpen && <div style={{ fontSize: 7, color: zone.color, marginTop: 2 }}>● OPEN</div>}
                </>
              ) : (
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)', textAlign: 'center', letterSpacing: '0.05em', padding: '0 4px', lineHeight: 1.4 }}>{zone.label}<br/>LOCKED</div>
              )}
            </div>
          );
        })}

        {/* HUD bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', padding: '4px 12px 5px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 9, color: '#60a5fa', fontFamily: 'monospace', letterSpacing: '0.08em' }}>REG 214 · CYYC→CYQL · FL100</div>
          <div style={{ fontSize: 9, color: C.greyDim }}>{availableIds.length} screen{availableIds.length !== 1 ? 's' : ''} active</div>
          <div style={{ fontSize: 9, color: '#2dd4bf', fontFamily: 'monospace' }}>10:30 DEPARTURE</div>
        </div>
      </div>

      {/* Open panel content drawer */}
      {openId && openZone && panelContent[openId] && (
        <div style={{
          borderTop: `2px solid ${openZone.color}`,
          background: `linear-gradient(135deg, rgba(${hexToRgb(openZone.color)},0.07), ${C.bgDeep})`,
          padding: '12px 14px', maxHeight: 260, overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: openZone.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {openZone.icon} {openZone.label}
            </div>
            <button onClick={() => onOpen(openId)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.greyDim, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>Close ✕</button>
          </div>
          {panelContent[openId]}
        </div>
      )}
    </div>
  );
}

// ── Panel content factories (pure data → ReactNode) ───────────────────────────

function ChecklistContent() {
  return (
    <div>
      {['Confirm flight identification', 'Verify departure and destination', 'Review aircraft status', 'Review current weather information', 'Confirm outstanding items addressed'].map((item, i) => (
        <div key={i} style={{ fontSize: 12, color: C.grey, padding: '4px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: C.blue, fontWeight: 700, fontSize: 10 }}>{i + 1}.</span> {item}
        </div>
      ))}
    </div>
  );
}

function BriefingContent() {
  return (
    <>
      <InfoRow label="Flight" value="Regional 214" />
      <InfoRow label="Departure" value="Calgary (CYYC)" />
      <InfoRow label="Destination" value="Lethbridge (CYQL)" />
      <InfoRow label="Scheduled departure" value="10:30 a.m." />
      <InfoRow label="Crew briefing" value="Complete" />
    </>
  );
}

function AircraftContent({ showMismatch }: { showMismatch: boolean }) {
  return (
    <>
      <InfoRow label="Flight" value="Regional 214" />
      <InfoRow label="Departure" value="Calgary (CYYC)" />
      <InfoRow label="Destination" value="Lethbridge (CYQL)" />
      <InfoRow label="Scheduled departure" value="11:00 a.m." mismatch />
      {showMismatch && (
        <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.12)', border: `1px solid ${C.amber}`, borderRadius: 6, fontSize: 11, color: C.amber }}>
          ⚠ Departure time differs from Flight Briefing (10:30 vs 11:00)
        </div>
      )}
    </>
  );
}

function WeatherOriginalContent() {
  return (
    <>
      <InfoRow label="Destination visibility" value="8 km" />
      <InfoRow label="Wind" value="12 km/h" />
      <div style={{ marginTop: 6, fontSize: 11, color: C.green }}>Within operating criteria (min. 5 km)</div>
    </>
  );
}

function WeatherUpdatedContent({ visibility, updated }: { visibility: string; updated: boolean }) {
  const belowMin = parseFloat(visibility) < 5;
  return (
    <>
      <InfoRow label="Destination visibility" value={visibility} mismatch={belowMin} />
      <InfoRow label="Wind" value="15 km/h" />
      {updated && <div style={{ marginTop: 3, fontSize: 10, color: C.greyDim, letterSpacing: '0.06em' }}>REVISED UPDATE</div>}
      <div style={{ marginTop: 6, fontSize: 11, color: belowMin ? C.amber : C.green }}>
        {belowMin ? '⚠ Below 5 km minimum — review required' : '✓ Meets 5 km criterion'}
      </div>
    </>
  );
}

function CrewContent({ notes }: { notes: string }) {
  return (
    <>
      <InfoRow label="Captain" value="Assigned" />
      <InfoRow label="First Officer" value="Assigned" />
      <InfoRow label="Crew briefing" value="Complete" />
      {notes && <div style={{ marginTop: 8, fontSize: 12, color: C.grey }}>{notes}</div>}
    </>
  );
}

// ── Scenario 1: Pre-flight Preparation ───────────────────────────────────────

function Scenario1({
  reviewedIds, openId, onComplete,
}: {
  reviewedIds: Set<string>; openId: string | null;
  onComplete: (ev: Omit<EvidenceItem, 'mission'>[], note: string) => void;
}) {
  const [decision, setDecision] = useState('');
  const [phase, setPhase] = useState<'review' | 'decide' | 'followup' | 'done'>('review');

  const hasBriefing = reviewedIds.has('briefing');
  const hasAircraft = reviewedIds.has('aircraft');
  const canDecide = hasBriefing && hasAircraft;

  useEffect(() => {
    if (phase === 'review' && canDecide && reviewedIds.size >= 2) {
      // auto-surface decision prompt once required panels opened
    }
  }, [reviewedIds, canDecide, phase]);

  function handleFollowUp(val: string) {
    const evidence: Omit<EvidenceItem, 'mission'>[] = [];
    const text = val.toLowerCase();

    // PR: flagging or seeking clarification on a discrepancy before proceeding
    // Both are valid procedural approaches — neither is wrong.
    if (decision === 'flag') evidence.push(ev('procedural_compliance', 0.8));
    if (decision === 'clarify') evidence.push(ev('procedural_compliance', 0.7));
    // skip = active dismissal of an unresolved concern — contra-indicator
    if (decision === 'skip') evidence.push(ev('procedural_compliance', -0.5));
    // complete without flagging = no procedural evidence either way (absence, not negative)

    // AP: did they open both sources AND notice the conflict?
    if (reviewedIds.has('briefing') && reviewedIds.has('aircraft')) {
      if (decision === 'flag' || decision === 'clarify') evidence.push(ev('attention_to_detail', 0.7));
    }

    // SA: did follow-up reasoning show awareness of the discrepancy AND its operational implication?
    const sawDiscrepancy = hasConcept(text, CONCEPTS.departureDiscrepancy);
    const sawImplication = hasConcept(text, CONCEPTS.actionBeforeProceeding);
    if (sawDiscrepancy && sawImplication) evidence.push(ev('situational_awareness', 0.8));
    else if (sawDiscrepancy) evidence.push(ev('situational_awareness', 0.5));

    // CM: did they articulate what still needed verification?
    if (hasConcept(text, CONCEPTS.outstandingRequirement)) evidence.push(ev('communication_quality', 0.5));

    onComplete(evidence, `S1: decision=${decision}; reviewed=${[...reviewedIds].join(',')}; followup="${val.substring(0,80)}"`);
    setPhase('done');
  }

  const panelContent: PanelContentMap = {
    checklist: <ChecklistContent />,
    briefing: <BriefingContent />,
    aircraft: <AircraftContent showMismatch={hasBriefing} />,
    crew: <CrewContent notes="All crew confirmed for Regional 214. Crew briefing recorded complete." />,
  };

  return (
    <div>
      <ACIABubble text="Welcome to Regional Flight 214. Review the flight preparation screens in the cockpit above — tap any glowing screen to open it. Once you've reviewed the key information, you'll be asked to confirm the preparation status." />

      {/* Panel review status */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['checklist', 'briefing', 'aircraft', 'crew'].map(id => {
          const zone = SCREEN_ZONES.find(z => z.id === id)!;
          const done = reviewedIds.has(id);
          const isNow = openId === id;
          return (
            <div key={id} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: done ? 'rgba(34,197,94,0.1)' : isNow ? `rgba(${hexToRgb(zone.color)},0.15)` : 'rgba(255,255,255,0.04)', border: `1px solid ${done ? C.green : isNow ? zone.color : C.border}`, color: done ? C.green : isNow ? zone.color : C.greyDim, fontWeight: 600 }}>
              {done ? '✓' : isNow ? '●' : '○'} {zone.label}
            </div>
          );
        })}
      </div>

      {!canDecide && (
        <div style={{ fontSize: 12, color: C.greyDim, marginBottom: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, border: `1px solid ${C.border}` }}>
          Review the <span style={{ color: '#a78bfa' }}>Flight Briefing</span> and <span style={{ color: '#f59e0b' }}>Aircraft Information</span> screens to proceed.
        </div>
      )}

      {canDecide && phase === 'review' && (
        <div>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 10 }}>Based on your review, what should happen next?</div>
          {[
            { id: 'complete', label: 'Mark preparation complete — all items reviewed' },
            { id: 'flag', label: 'Flag the departure-time discrepancy before marking complete' },
            { id: 'clarify', label: 'Request clarification on the departure time before proceeding' },
            { id: 'skip', label: 'Skip the discrepancy — it will resolve at departure' },
          ].map(o => <OptionButton key={o.id} label={o.label} selected={decision === o.id} onClick={() => setDecision(o.id)} />)}
          <button onClick={() => { if (decision) setPhase('decide'); }} disabled={!decision} style={{ marginTop: 4, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: decision ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: decision ? 1 : 0.4 }}>Confirm →</button>
        </div>
      )}

      {phase === 'decide' && (
        <FollowUpInput question="What information did you consider most important to verify before completing the preparation review?" onSubmit={handleFollowUp} />
      )}

      {phase === 'done' && <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, color: C.green }}>Scenario 1 complete. Proceeding to weather review…</div>}

      {/* Inject panel content into parent via unused return — handled by orchestrator */}
      <div data-panel-content={JSON.stringify(Object.keys(panelContent))} style={{ display: 'none' }} />
    </div>
  );
}

// ── Scenario 2: Changing Weather ──────────────────────────────────────────────

function Scenario2({
  reviewedIds, onComplete,
}: {
  reviewedIds: Set<string>;
  onComplete: (ev: Omit<EvidenceItem, 'mission'>[], note: string) => void;
}) {
  const [phase, setPhase] = useState<'initial' | 'followup1' | 'revised' | 'followup2' | 'done'>('initial');
  const [decision, setDecision] = useState('');
  const [reassess, setReassess] = useState('');
  const [followUp1, setFollowUp1] = useState('');

  const canDecide = reviewedIds.has('weather') || reviewedIds.has('briefing');

  function handleFollowUp2(val: string) {
    const evidence: Omit<EvidenceItem, 'mission'>[] = [];
    const f1 = followUp1.toLowerCase();
    const f2 = val.toLowerCase();

    // DM — initial decision: requesting review when visibility drops below criterion is correct
    // continuing without review is a genuine contra-indicator (ignoring a defined criterion)
    if (decision === 'review') evidence.push(ev('decision_quality', 0.8));
    if (decision === 'continue') evidence.push(ev('decision_quality', -0.5));
    // ignore_wind and skip show failure to apply the criterion — but are less severe than continue
    if (decision === 'ignore_wind' || decision === 'skip') evidence.push(ev('decision_quality', -0.3));

    // SA — initial: did they identify the specific criterion value that was breached?
    if (decision === 'review') evidence.push(ev('situational_awareness', 0.7));

    // AP — follow-up 1: did they reference the criterion threshold that was breached?
    if (hasConcept(f1, CONCEPTS.visibilityCriterion)) evidence.push(ev('attention_to_detail', 0.8));
    else if (hasConcept(f1, CONCEPTS.weatherUpdate)) evidence.push(ev('attention_to_detail', 0.4));

    // DM — reassessment: both continue_updated and still_review are reasonable
    if (reassess === 'continue_updated' || reassess === 'still_review') evidence.push(ev('decision_quality', 0.6));
    if (reassess === 'revert') evidence.push(ev('decision_quality', -0.3));

    // SA — still_review shows awareness that a process step remains open
    if (reassess === 'still_review') evidence.push(ev('situational_awareness', 0.6));

    // AR — follow-up 2: did they explain WHY the revised figure changes the picture?
    if (hasConcept(f2, CONCEPTS.revisedMeetsCriterion)) evidence.push(ev('analytical_reasoning', 0.6));
    if (hasConcept(f2, CONCEPTS.outstandingRequirement)) evidence.push(ev('procedural_compliance', 0.5));

    // SO — requesting review when operating limits are in question
    if (decision === 'review') evidence.push(ev('safety_mindset', 0.7));

    onComplete(evidence, `S2: initial=${decision}; reassess=${reassess}`);
    setPhase('done');
  }

  return (
    <div>
      <ACIABubble text="New weather information has been received for your destination. Open the Weather screen in the cockpit to review the latest conditions, then decide whether the current plan remains appropriate." />

      {!canDecide && (
        <div style={{ fontSize: 12, color: C.greyDim, marginBottom: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, border: `1px solid ${C.border}` }}>
          Open the <span style={{ color: '#2dd4bf' }}>Weather</span> or <span style={{ color: '#a78bfa' }}>Briefing</span> screen to review conditions.
        </div>
      )}

      {canDecide && phase === 'initial' && (
        <div>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 10 }}>The updated destination visibility is <strong style={{ color: C.amber }}>3 km</strong> (minimum criterion: 5 km). What is the appropriate response?</div>
          {[
            { id: 'continue', label: 'A. Continue with the original plan without further review' },
            { id: 'review', label: 'B. Request an operational review — visibility falls below the stated criterion' },
            { id: 'ignore_wind', label: 'C. Ignore the update — the wind change is small' },
            { id: 'skip', label: 'D. Mark the weather review complete without checking criteria' },
          ].map(o => <OptionButton key={o.id} label={o.label} selected={decision === o.id} onClick={() => setDecision(o.id)} />)}
          <button onClick={() => { if (decision) setPhase('followup1'); }} disabled={!decision} style={{ marginTop: 4, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: decision ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: decision ? 1 : 0.4 }}>Confirm →</button>
        </div>
      )}

      {phase === 'followup1' && (
        <FollowUpInput question="Which information influenced your decision, and why?" onSubmit={val => { setFollowUp1(val); setPhase('revised'); }} />
      )}

      {phase === 'revised' && (
        <div>
          <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 7, fontSize: 12, color: C.green, marginBottom: 12 }}>
            ↻ Revised update received — destination visibility now reported as <strong>6 km</strong>.
          </div>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 10 }}>Does this revised information change your recommendation?</div>
          {[
            { id: 'continue_updated', label: 'A. Revised visibility meets the criterion — original plan can proceed' },
            { id: 'still_review', label: 'B. Proceed, but confirm the outstanding operational review is completed first' },
            { id: 'revert', label: 'C. Disregard both updates and return to the original conditions' },
            { id: 'no_change', label: 'D. No change needed — conditions were always acceptable' },
          ].map(o => <OptionButton key={o.id} label={o.label} selected={reassess === o.id} onClick={() => setReassess(o.id)} />)}
          <button onClick={() => { if (reassess) setPhase('followup2'); }} disabled={!reassess} style={{ marginTop: 4, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: reassess ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: reassess ? 1 : 0.4 }}>Confirm →</button>
        </div>
      )}

      {phase === 'followup2' && (
        <FollowUpInput question="Does this new information change your recommendation? Explain your reasoning." onSubmit={handleFollowUp2} />
      )}

      {phase === 'done' && <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, color: C.green }}>Scenario 2 complete. Connecting to crew communication…</div>}
    </div>
  );
}

// ── Scenario 3: Crew Communication ───────────────────────────────────────────

function Scenario3({
  reviewedIds, onComplete,
}: {
  reviewedIds: Set<string>;
  onComplete: (ev: Omit<EvidenceItem, 'mission'>[], note: string) => void;
}) {
  const [phase, setPhase] = useState<'compose' | 'followup' | 'done'>('compose');
  const [message, setMessage] = useState('');

  const canCompose = reviewedIds.has('crew') || reviewedIds.has('briefing');

  function handleFollowUp(val: string) {
    const evidence: Omit<EvidenceItem, 'mission'>[] = [];
    const t = message.toLowerCase();
    const f = val.toLowerCase();

    // CM — accuracy and completeness: three independently observable facts in this message
    const coversDeparture = hasConcept(t, CONCEPTS.departureDiscrepancy);
    const coversWeather   = hasConcept(t, CONCEPTS.weatherUpdate);
    const coversOutstanding = hasConcept(t, CONCEPTS.outstandingRequirement);
    const distinguishesResolvedVsOpen = hasConcept(t, CONCEPTS.distinguishResolvedFromOpen);

    if (coversDeparture) evidence.push(ev('communication_quality', 0.4));
    if (coversWeather)   evidence.push(ev('communication_quality', 0.4));
    // Highest CM signal: distinguishing what is confirmed from what remains open
    if (distinguishesResolvedVsOpen) evidence.push(ev('communication_quality', 0.8));
    else if (coversOutstanding)      evidence.push(ev('communication_quality', 0.5));

    // SA — does the message reflect the full operational picture?
    if (coversDeparture && coversWeather && coversOutstanding) evidence.push(ev('situational_awareness', 0.7));
    else if (coversDeparture && coversWeather)                 evidence.push(ev('situational_awareness', 0.4));

    // Contra-indicator: false reassurance when an outstanding item exists
    if (/all clear|no issue|everything.{0,10}fine|all good|ready to go/i.test(t) && !coversOutstanding)
      evidence.push(ev('communication_quality', -0.6));

    // PR — follow-up: did they identify what still needs verification?
    if (hasConcept(f, CONCEPTS.departureDiscrepancy) && hasConcept(f, CONCEPTS.outstandingRequirement))
      evidence.push(ev('procedural_compliance', 0.6));
    else if (hasConcept(f, CONCEPTS.outstandingRequirement))
      evidence.push(ev('procedural_compliance', 0.4));

    onComplete(evidence, `S3: message="${message.substring(0, 100)}"; followup="${val.substring(0,60)}"`);
    setPhase('done');
  }

  return (
    <div>
      <ACIABubble text="I'm your simulated co-pilot. We've received several updates. Open the Crew Comms screen and the Briefing screen, then compose an operational summary covering what's changed and what still needs confirmation." />

      {!canCompose && (
        <div style={{ fontSize: 12, color: C.greyDim, marginBottom: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, border: `1px solid ${C.border}` }}>
          Open the <span style={{ color: '#60a5fa' }}>Crew Comms</span> or <span style={{ color: '#a78bfa' }}>Briefing</span> screen to review the information.
        </div>
      )}

      {canCompose && phase === 'compose' && (
        <div>
          <div style={{ fontSize: 11, color: C.greyDim, marginBottom: 8, lineHeight: 1.6 }}>
            Known facts: flight preparation reviewed · departure-time discrepancy noted · weather updated 8km → 3km → revised 6km · operational review outstanding
          </div>
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Compose your operational update to the co-pilot…" rows={5} style={{ width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, padding: '10px 14px', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: 4 }} />
          <div style={{ fontSize: 11, color: C.greyDim, marginTop: 4 }}>A concise, accurate message demonstrates strong communication.</div>
          <button onClick={() => { if (message.trim().length >= 20) setPhase('followup'); }} disabled={message.trim().length < 20} style={{ marginTop: 8, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: message.trim().length >= 20 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: message.trim().length >= 20 ? 1 : 0.4 }}>Send update →</button>
        </div>
      )}

      {phase === 'followup' && (
        <div>
          <div style={{ padding: '10px 14px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.grey, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.greyDim, letterSpacing: '0.1em', marginBottom: 5 }}>YOUR MESSAGE</div>
            {message}
          </div>
          <FollowUpInput question="I understand the weather has changed. Is there anything else we still need to verify?" onSubmit={handleFollowUp} />
        </div>
      )}

      {phase === 'done' && <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, color: C.green }}>Scenario 3 complete. Multiple notifications incoming…</div>}
    </div>
  );
}

// ── Scenario 4: Competing Priorities ─────────────────────────────────────────

interface Notification { id: string; priority: string; title: string; body: string }
const NOTIFICATIONS: Notification[] = [
  { id: 'A', priority: 'operational', title: 'Weather Update', body: 'Latest destination weather information requires confirmation.' },
  { id: 'B', priority: 'crew', title: 'Crew Request', body: 'Co-pilot requests clarification about the unresolved departure-time discrepancy.' },
  { id: 'C', priority: 'admin', title: 'Administrative', body: 'Routine administrative message — requires acknowledgment later today.' },
  { id: 'D', priority: 'ops', title: 'Operations', body: 'Operations team requests confirmation that outstanding preparation concerns have been resolved.' },
];
const NOTIF_COLOR: Record<string, string> = { operational: C.amber, crew: C.blue, admin: C.greyDim, ops: C.teal };

function Scenario4({ onComplete }: { onComplete: (ev: Omit<EvidenceItem, 'mission'>[], note: string) => void }) {
  const [order, setOrder] = useState(['A', 'B', 'C', 'D']);
  const [phase, setPhase] = useState<'prioritize' | 'update' | 'done'>('prioritize');
  const [initial, setInitial] = useState<string[]>([]);

  function moveUp(id: string) { setOrder(p => { const i = p.indexOf(id); if (i <= 0) return p; const n = [...p]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n; }); }
  function moveDown(id: string) { setOrder(p => { const i = p.indexOf(id); if (i >= p.length-1) return p; const n = [...p]; [n[i+1],n[i]]=[n[i],n[i+1]]; return n; }); }

  function handleFollowUp(val: string) {
    const evidence: Omit<EvidenceItem, 'mission'>[] = [];
    const f = val.toLowerCase();

    // MT — prioritization structure:
    // Operational items (A=weather, B=crew discrepancy, D=ops confirmation) should precede admin (C)
    // Both A and B are safety-relevant; D is operationally relevant. C is explicitly deferrable.
    const adminRank = order.indexOf('C'); // lower index = higher priority
    const weatherRank = order.indexOf('A');
    const crewRank = order.indexOf('B');
    const opsRank = order.indexOf('D');

    // Deferring admin (C) appropriately
    if (adminRank >= 2) evidence.push(ev('multitasking_ability', 0.7));
    // Placing admin first is a genuine contra-indicator — it's explicitly non-urgent
    if (adminRank === 0) evidence.push(ev('multitasking_ability', -0.5));

    // SA — weather and crew concerns ranked ahead of admin
    if (weatherRank < adminRank) evidence.push(ev('situational_awareness', 0.5));
    if (crewRank < adminRank) evidence.push(ev('situational_awareness', 0.4));

    // DM — overall logic: operational items before admin is the observable indicator
    const operationalBeforeAdmin = [weatherRank, crewRank, opsRank].every(r => r < adminRank);
    if (operationalBeforeAdmin) evidence.push(ev('decision_quality', 0.6));

    // AL — follow-up: did they integrate the new information into a revised view?
    if (hasConcept(f, CONCEPTS.integratedNewInfo)) evidence.push(ev('learning_agility', 0.6));

    // CM — addressed crew request (B) in top half
    if (crewRank <= 1) evidence.push(ev('communication_quality', 0.4));

    onComplete(evidence, `S4: order=[${order.join(',')}]; initial=[${initial.join(',')}]`);
    setPhase('done');
  }

  return (
    <div>
      <ACIABubble text="Several updates require attention. Use the arrows to arrange notifications in priority order — highest priority at the top. You may defer items that do not require immediate action." />

      {(phase === 'prioritize' || phase === 'update') && (
        <div>
          {phase === 'update' && (
            <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 7, fontSize: 12, color: C.white, marginBottom: 12, lineHeight: 1.6 }}>
              <span style={{ color: C.green, fontWeight: 700 }}>Update:</span> The departure-time discrepancy has been corrected and confirmed. The <span style={{ color: C.amber }}>weather review remains outstanding</span>.
            </div>
          )}
          <div style={{ fontSize: 11, color: C.greyDim, marginBottom: 8 }}>Use the arrows to arrange notifications in priority order (top = highest priority)</div>
          {order.map((id, idx) => {
            const n = NOTIFICATIONS.find(x => x.id === id)!;
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, background: C.bgCard, border: `1px solid ${NOTIF_COLOR[n.priority] ?? C.border}`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: NOTIF_COLOR[n.priority], width: 22, textAlign: 'center' }}>{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 2 }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: C.grey }}>{n.body}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button onClick={() => moveUp(id)} disabled={idx === 0} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.grey, cursor: idx === 0 ? 'default' : 'pointer', padding: '2px 6px', fontSize: 11, opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                  <button onClick={() => moveDown(id)} disabled={idx === order.length-1} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.grey, cursor: idx === order.length-1 ? 'default' : 'pointer', padding: '2px 6px', fontSize: 11, opacity: idx === order.length-1 ? 0.3 : 1 }}>▼</button>
                </div>
              </div>
            );
          })}
          {phase === 'prioritize' && (
            <button onClick={() => { setInitial([...order]); setPhase('update'); }} style={{ marginTop: 8, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Confirm priority order →</button>
          )}
          {phase === 'update' && (
            <FollowUpInput question="What information influenced your priorities, and did the new update change your approach?" onSubmit={handleFollowUp} />
          )}
        </div>
      )}

      {phase === 'done' && <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, color: C.green }}>Scenario 4 complete. Preparing final operational decision…</div>}
    </div>
  );
}

// ── Scenario 5: Final Operational Decision ────────────────────────────────────

function Scenario5({
  reviewedIds, onComplete,
}: {
  reviewedIds: Set<string>;
  onComplete: (ev: Omit<EvidenceItem, 'mission'>[], note: string) => void;
}) {
  const [decision, setDecision] = useState('');
  const [phase, setPhase] = useState<'decide' | 'followup' | 'compose' | 'done'>('decide');
  const [followUp, setFollowUp] = useState('');
  const [finalMsg, setFinalMsg] = useState('');

  const canDecide = reviewedIds.has('aircraft') || reviewedIds.has('weather');

  function handleFinal() {
    if (finalMsg.trim().length < 15) return;
    const evidence: Omit<EvidenceItem, 'mission'>[] = [];
    const t = finalMsg.toLowerCase();
    const f = followUp.toLowerCase();

    // DM — final recommendation:
    // confirm_review = correct: weather criterion is met but ops confirmation is outstanding
    // mark_complete = incorrect: ignores an explicitly outstanding procedural requirement
    // ignore_outstanding = explicit dismissal of a defined requirement — contra-indicator
    if (decision === 'confirm_review') evidence.push(ev('decision_quality', 0.9));
    if (decision === 'mark_complete') {
      // No positive DM evidence — completed without addressing outstanding requirement
      // Not a contra-indicator (criterion IS met), just absent evidence
    }
    if (decision === 'ignore_outstanding') evidence.push(ev('decision_quality', -0.5));
    if (decision === 'revert_original') evidence.push(ev('decision_quality', -0.4));

    // PR — follow-up: did they identify what remains outstanding and why it blocks completion?
    if (hasConcept(f, CONCEPTS.outstandingRequirement)) evidence.push(ev('procedural_compliance', 0.8));
    if (hasConcept(f, CONCEPTS.revisedMeetsCriterion)) evidence.push(ev('situational_awareness', 0.6));

    // CM — final message: three independently observable facts
    const msgWeather     = hasConcept(t, CONCEPTS.weatherUpdate);
    const msgDeparture   = hasConcept(t, CONCEPTS.departureDiscrepancy);
    const msgOutstanding = hasConcept(t, CONCEPTS.outstandingRequirement);
    const msgDistinguishes = hasConcept(t, CONCEPTS.distinguishResolvedFromOpen);

    if (msgDistinguishes)                  evidence.push(ev('communication_quality', 0.7));
    else if (msgWeather && msgOutstanding) evidence.push(ev('communication_quality', 0.6));
    else if (msgWeather || msgOutstanding) evidence.push(ev('communication_quality', 0.3));

    // SA — integrating all three threads demonstrates full operational picture
    if (msgWeather && msgDeparture && msgOutstanding) evidence.push(ev('situational_awareness', 0.7));

    // Contra-indicator: false reassurance when an outstanding requirement exists
    if (/all clear|ready to go|no concern|no issue/i.test(t) && !msgOutstanding)
      evidence.push(ev('communication_quality', -0.6));

    // SO — confirming review before declaring complete demonstrates safety-first posture
    if (decision === 'confirm_review') evidence.push(ev('safety_mindset', 0.7));

    onComplete(evidence, `S5: decision=${decision}; msg="${finalMsg.substring(0,100)}"`);
    setPhase('done');
  }

  return (
    <div>
      <ACIABubble text="Regional Flight 214 is in its final preparation phase. Open the Aircraft Info and Weather screens to review the consolidated status, then provide your recommendation." />

      {!canDecide && (
        <div style={{ fontSize: 12, color: C.greyDim, marginBottom: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, border: `1px solid ${C.border}` }}>
          Open the <span style={{ color: '#f59e0b' }}>Aircraft Info</span> or <span style={{ color: '#2dd4bf' }}>Weather</span> screen to review the consolidated status.
        </div>
      )}

      {canDecide && (
        <div style={{ padding: '10px 14px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, fontSize: 12, lineHeight: 1.8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.greyDim, letterSpacing: '0.1em', marginBottom: 6 }}>CONSOLIDATED STATUS — REGIONAL 214</div>
          <div style={{ color: C.green }}>✓ Departure-time discrepancy: Resolved</div>
          <div style={{ color: C.white }}>  Latest destination visibility: 6 km</div>
          <div style={{ color: C.grey }}>  Weather criterion: min. 5 km (meets criterion)</div>
          <div style={{ color: C.amber }}>⚠ Outstanding: ops confirmation of weather review not yet recorded</div>
        </div>
      )}

      {canDecide && phase === 'decide' && (
        <div>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 10 }}>Can the preparation process be marked complete?</div>
          {[
            { id: 'mark_complete', label: 'A. Mark preparation complete — latest visibility meets the stated criterion' },
            { id: 'confirm_review', label: 'B. Confirm the outstanding weather review before marking preparation complete' },
            { id: 'ignore_outstanding', label: 'C. Ignore the outstanding confirmation — the departure time has been corrected' },
            { id: 'revert_original', label: 'D. Return to the original weather information and disregard subsequent updates' },
          ].map(o => <OptionButton key={o.id} label={o.label} selected={decision === o.id} onClick={() => setDecision(o.id)} />)}
          <button onClick={() => { if (decision) setPhase('followup'); }} disabled={!decision} style={{ marginTop: 4, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: decision ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: decision ? 1 : 0.4 }}>Confirm →</button>
        </div>
      )}

      {phase === 'followup' && (
        <FollowUpInput question="What information supports your recommendation, and what remains to be confirmed?" onSubmit={val => { setFollowUp(val); setPhase('compose'); }} />
      )}

      {phase === 'compose' && (
        <div>
          <ACIABubble text="Please send a concise operational update to your co-pilot covering the current situation and any outstanding requirement." />
          <textarea value={finalMsg} onChange={e => setFinalMsg(e.target.value)} placeholder="Compose your final operational message…" rows={4} style={{ width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, padding: '10px 14px', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: 4 }} />
          <button onClick={handleFinal} disabled={finalMsg.trim().length < 15} style={{ marginTop: 8, background: C.crimson, color: C.white, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: finalMsg.trim().length >= 15 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: finalMsg.trim().length >= 15 ? 1 : 0.4 }}>Send final message →</button>
        </div>
      )}

      {phase === 'done' && <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, color: C.green }}>Mission complete. Regional Flight 214 preparation reviewed.</div>}
    </div>
  );
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

interface Props {
  isRpas?: boolean;
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[], chatHistory?: never[]) => void;
}

const SCENARIO_LABELS = ['Pre-flight Prep', 'Changing Weather', 'Crew Comms', 'Priorities', 'Final Decision'];

const SCENARIO_PANEL_IDS: string[][] = [
  ['checklist', 'briefing', 'aircraft', 'crew'],
  ['weather', 'briefing'],
  ['briefing', 'weather', 'aircraft', 'crew'],
  ['briefing', 'weather', 'aircraft', 'crew'],
  ['aircraft', 'weather'],
];

export function FlightOpsAssessment({ onComplete }: Props) {
  const [scenario, setScenario] = useState(0);
  // Tag each evidence item with its source scenario for diversity-aware aggregation
  const [allEvidence, setAllEvidence] = useState<Array<Omit<EvidenceItem, 'mission'> & { _sc: number }>>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  // Track which panels opened per scenario
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const activePanelIds = scenario < SCENARIO_PANEL_IDS.length ? SCENARIO_PANEL_IDS[scenario] : [];

  useEffect(() => {
    setOpenId(null);
    setReviewedIds(new Set());
  }, [scenario]);

  function handleOpen(id: string) {
    setOpenId(prev => prev === id ? null : id);
    setReviewedIds(prev => { const s = new Set(prev); s.add(id); return s; });
  }

  const handleScenarioComplete = useCallback((scIdx: number, evItems: Omit<EvidenceItem, 'mission'>[], _note: string) => {
    setAllEvidence(prev => {
      const tagged = evItems.map(e => ({ ...e, _sc: scIdx }));
      const merged = [...prev, ...tagged];

      if (scIdx === 4) {
        // Group by evidence key, preserving source scenario per item
        const grouped: Record<string, Array<{ delta: number; sc: number }>> = {};
        for (const item of merged) {
          if (!grouped[item.key]) grouped[item.key] = [];
          grouped[item.key].push({ delta: item.delta, sc: item._sc });
        }

        const deduped = Object.entries(grouped).map(([key, items]) => {
          const positives = items.filter(i => i.delta > 0);
          const negatives = items.filter(i => i.delta < 0);

          // Count how many DISTINCT scenarios contributed positive observations
          // (only items with delta >= 0.4 count as meaningful — weak signals don't earn diversity credit)
          const distinctPositiveScenarios = new Set(
            positives.filter(i => i.delta >= 0.4).map(i => i.sc)
          ).size;

          let delta: number;
          if (negatives.length === 0 && positives.length > 0) {
            // All positive: average the observations
            const avg = positives.reduce((a, b) => a + b.delta, 0) / positives.length;
            // Consistency bonus ONLY when observations span 2+ independent scenarios
            // and at least 2 of those are meaningful (≥0.4) — prevents inflation from
            // weak repeated signals within a single scenario
            const consistencyBonus = distinctPositiveScenarios >= 3 ? 0.1
              : distinctPositiveScenarios >= 2 ? 0.05
              : 0;
            delta = Math.min(avg + consistencyBonus, 1.0);
          } else if (positives.length === 0) {
            // All negative: average, don't compound
            delta = Math.max(negatives.reduce((a, b) => a + b.delta, 0) / negatives.length, -1.0);
          } else {
            // Mixed: conservative net — contradictory signals reduce confidence
            const net = items.reduce((a, b) => a + b.delta, 0);
            delta = Math.max(-0.8, Math.min(net, 0.8));
          }

          return { key: key as EvidenceKey, delta };
        });

        onComplete(deduped);
      }
      return merged;
    });
    setScenario(scIdx + 1);
  }, [onComplete]);

  // Build panel content map for current scenario + scenario index
  function getPanelContent(): PanelContentMap {
    const s2weatherPhase = scenario === 1;
    switch (scenario) {
      case 0: return {
        checklist: <ChecklistContent />,
        briefing: <BriefingContent />,
        aircraft: <AircraftContent showMismatch={reviewedIds.has('briefing')} />,
        crew: <CrewContent notes="All crew confirmed for Regional 214. Crew briefing recorded complete." />,
      };
      case 1: return {
        briefing: <BriefingContent />,
        weather: (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.greyDim, marginBottom: 8, letterSpacing: '0.08em' }}>ORIGINAL CONDITIONS</div>
            <WeatherOriginalContent />
            <div style={{ marginTop: 12, fontSize: 10, fontWeight: 700, color: C.amber, marginBottom: 8, letterSpacing: '0.08em' }}>UPDATED CONDITIONS</div>
            <WeatherUpdatedContent visibility="3 km" updated={false} />
          </>
        ),
      };
      case 2: return {
        briefing: <BriefingContent />,
        aircraft: <AircraftContent showMismatch />,
        weather: (
          <>
            <WeatherUpdatedContent visibility="6 km" updated />
            <div style={{ marginTop: 10, fontSize: 11, color: C.amber }}>⚠ Operational review of weather: outstanding</div>
          </>
        ),
        crew: <CrewContent notes="Co-pilot requests an update on the operational status before departure." />,
      };
      case 3: return {
        briefing: <BriefingContent />,
        aircraft: <AircraftContent showMismatch={false} />,
        weather: <WeatherUpdatedContent visibility="6 km" updated />,
        crew: <CrewContent notes="Crew is ready. Awaiting confirmation of weather review completion." />,
      };
      case 4: return {
        aircraft: <AircraftContent showMismatch={false} />,
        weather: (
          <>
            <WeatherUpdatedContent visibility="6 km" updated />
            <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(245,158,11,0.1)', border: `1px solid ${C.amber}`, borderRadius: 6, fontSize: 11, color: C.amber }}>
              ⚠ Ops confirmation of weather review: NOT YET RECORDED
            </div>
          </>
        ),
      };
      default: return {};
    }
  }

  const panelContent = getPanelContent();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div style={{ background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: '10px 10px 0 0', padding: '9px 14px' }}>
        <div style={{ fontSize: 10, color: C.greyDim, letterSpacing: '0.12em', fontWeight: 700 }}>REGIONAL 214 · CALGARY → LETHBRIDGE · 10:30 A.M.</div>
        <div style={{ fontSize: 12, color: C.white, marginTop: 2, fontWeight: 600 }}>
          {scenario < 5 ? `Scenario ${scenario + 1} of 5 — ${SCENARIO_LABELS[scenario]}` : 'Mission Complete'}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 3, padding: '4px 14px 5px', background: C.bgDeep, borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
        {SCENARIO_LABELS.map((label, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{ height: 3, borderRadius: 2, background: i < scenario ? C.green : i === scenario ? C.crimson : C.border, transition: 'background 0.3s' }} />
            <div style={{ fontSize: 8, color: i < scenario ? C.green : i === scenario ? C.white : C.greyDim, marginTop: 2, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Interactive cockpit */}
      {scenario < 5 && (
        <CockpitEnvironment
          availableIds={activePanelIds}
          openId={openId}
          onOpen={handleOpen}
          panelContent={panelContent}
          reviewedIds={reviewedIds}
        />
      )}

      {/* Scenario interaction panel */}
      <div style={{ border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 10px 10px', background: C.bg, overflowY: 'auto', maxHeight: 460, padding: '14px 14px 10px' }}>
        {scenario === 0 && <Scenario1 reviewedIds={reviewedIds} openId={openId} onComplete={(e, n) => handleScenarioComplete(0, e, n)} />}
        {scenario === 1 && <Scenario2 reviewedIds={reviewedIds} onComplete={(e, n) => handleScenarioComplete(1, e, n)} />}
        {scenario === 2 && <Scenario3 reviewedIds={reviewedIds} onComplete={(e, n) => handleScenarioComplete(2, e, n)} />}
        {scenario === 3 && <Scenario4 onComplete={(e, n) => handleScenarioComplete(3, e, n)} />}
        {scenario === 4 && <Scenario5 reviewedIds={reviewedIds} onComplete={(e, n) => handleScenarioComplete(4, e, n)} />}
        {scenario >= 5 && (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: C.green, fontWeight: 700, marginBottom: 8 }}>Mission 6 Complete</div>
            <div style={{ fontSize: 12, color: C.grey }}>Your operational assessment has been recorded. Proceeding to Mission 7.</div>
          </div>
        )}
      </div>
    </div>
  );
}
