import { useEffect, useRef, useState } from 'react';
import { C } from '../../theme';

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionInfo {
  validator_name: string;
  instrument: string;
  instrument_title: string;
  instrument_description: string;
  instrument_opening: string | null;
  is_contextual_guidance: boolean;
  aacp_version: string;
  status: string;
  scenario: { title: string; content: string } | null;
  level2_notice: string | null;
  submitted?: boolean;
}

interface Profile {
  id: string;
  pathway: string;
  name: string;
  age: number;
  location: string;
  education: string;
  work_history: string;
  background_type: string;
  aacp_status: string;
  career_direction: string | null;
  career_direction_narrative: string;
  capability_indicators: string[];
  aacp_does_not_establish: string[];
  realistic_note: string;
}

interface ExperienceData {
  experience_mode: 'GUIDED' | 'STATIC';
  validator_name: string;
  instrument: string;
  provenance?: string;
  blocked_areas?: string[];
  representative_data_label?: string;
  four_pathways?: Array<{ code: string; label: string; description: string }>;
  primary_profile?: Profile;
  all_profiles?: Profile[];
  cohort_summary?: { total: number; by_pathway: Record<string, number>; status_distribution: Record<string, number> };
  captain_acia?: { sandbox_mode: boolean; fictional_participant: string; suggested_prompts: string[]; sandbox_notice: string } | null;
  steps?: string[];
}

interface ChatMsg { role: 'user' | 'captain'; text: string; }
type Phase = 'loading' | 'error' | 'already_submitted' | 'welcome' | 'experience' | 'questions' | 'final_perspective' | 'submitted';

// ── Static cohort data (13 fictional participants) ────────────────────────────
// Represents the full breadth of AACP. Four are "featured" with deep API profiles.
// Journey states use six validator-facing presentation labels (EXPLORING → FOLLOW-UP).
// These labels describe where participants are in a broad sense — they do not expose
// AACP's internal status architecture, workflow sequencing, or transition mechanics.

type JourneyState = 'EXPLORING' | 'DEVELOPING' | 'PREPARING' | 'CONNECTING' | 'TRANSITIONING' | 'FOLLOW-UP';

interface CohortMember {
  name: string;
  pathway: 'ATC' | 'PILOT' | 'AME_AMT' | 'STEM';
  backgroundType: string;
  focusArea: string;
  journeyState: JourneyState;
  stateDescription: string;
  summary: string;
  featured: boolean;
}

const JOURNEY_STATE_DESCRIPTIONS: Record<JourneyState, string> = {
  EXPLORING: 'Exploring aviation and aerospace career possibilities and considering where their interests and capabilities may align.',
  DEVELOPING: 'Building aviation-sector understanding and workforce readiness while investigating potential career directions.',
  PREPARING: 'Has identified a career direction and is preparing for an appropriate next step.',
  CONNECTING: 'Exploring appropriate industry, employment, education or training opportunities.',
  TRANSITIONING: 'Moving toward an external next-step opportunity appropriate to their career direction.',
  'FOLLOW-UP': 'AACP is capturing representative outcome information following the participant\'s transition.',
};

const COHORT_MEMBERS: CohortMember[] = [
  // ── ATC — 3 ──────────────────────────────────────────────────────────────────
  {
    name: 'Marcus Chen',
    pathway: 'ATC',
    backgroundType: 'STEM graduate — cross-industry career explorer',
    focusArea: 'Air Traffic Control',
    journeyState: 'PREPARING',
    stateDescription: 'Career direction established — Air Traffic Control. Building aviation-sector understanding and workforce readiness. ATC selection is an external process; AACP prepares for the transition, not the selection.',
    summary: 'Physics graduate working as a data analyst in telecom. Career direction established as Air Traffic Control through AACP exploration. No prior aviation exposure. Currently building workforce readiness.',
    featured: true,
  },
  {
    name: 'Daria Vasquez',
    pathway: 'ATC',
    backgroundType: 'Recent aviation technology graduate',
    focusArea: 'Air Traffic Control',
    journeyState: 'DEVELOPING',
    stateDescription: 'Career interest in ATC emerging. Building aviation-sector understanding while investigating whether ATC is the right direction to pursue.',
    summary: 'Aviation technology graduate exploring whether Air Traffic Control aligns with her interests and capabilities. Career direction not yet established.',
    featured: false,
  },
  {
    name: 'Aiden Kowalski',
    pathway: 'ATC',
    backgroundType: 'STEM graduate — pathway redirected',
    focusArea: 'Air Traffic Control',
    journeyState: 'EXPLORING',
    stateDescription: 'Initially explored STEM roles in aviation. AACP career exploration indicated ATC as a more aligned direction. Re-engaging to investigate the ATC pathway further.',
    summary: 'STEM graduate who started exploring engineering roles in aviation before AACP exploration indicated stronger alignment with Air Traffic Control. Pathway recently redirected.',
    featured: false,
  },

  // ── PILOT — 3 ────────────────────────────────────────────────────────────────
  {
    name: 'Amara Osei',
    pathway: 'PILOT',
    backgroundType: 'Experienced aviator — cross-credential transition',
    focusArea: 'Pilot — fixed-wing commercial',
    journeyState: 'CONNECTING',
    stateDescription: 'Career direction established — fixed-wing commercial pilot pathway. AACP has identified an appropriate training partner. Admission decisions rest with the receiving organization.',
    summary: 'Commercial helicopter pilot with 12 years and 3,400+ hours seeking transition to fixed-wing commercial aviation. Career direction established. Exploring FTU and approved training partner options.',
    featured: true,
  },
  {
    name: 'Noah Bergstrom',
    pathway: 'PILOT',
    backgroundType: 'Military aviation professional — transitioning to civilian sector',
    focusArea: 'Pilot — fixed-wing commercial',
    journeyState: 'TRANSITIONING',
    stateDescription: 'Career direction established. Referred to a licence conversion pathway. The transition involves regulatory credit recognition managed externally; AACP does not control this process.',
    summary: 'Military aviator moving to civilian commercial aviation. Licence conversion pathway identified. Transition subject to external regulatory and organizational processes.',
    featured: false,
  },
  {
    name: 'Mei-Ling Xu',
    pathway: 'PILOT',
    backgroundType: 'Career explorer — early-stage aviation interest',
    focusArea: 'Pilot pathway',
    journeyState: 'EXPLORING',
    stateDescription: 'Interested in aviation and drawn to the pilot pathway. Career direction not yet established. Training cost, entry routes, and long-term feasibility still under investigation.',
    summary: 'Career explorer with strong interest in aviation but significant uncertainty about the pilot pathway — costs, entry requirements, and personal circumstances still being worked through.',
    featured: false,
  },

  // ── AME & AMT — 4 ────────────────────────────────────────────────────────────
  {
    name: 'Jordan Morrow',
    pathway: 'AME_AMT',
    backgroundType: 'Technical graduate — cross-industry career transitioner',
    focusArea: 'Aircraft Maintenance Engineer (AME)',
    journeyState: 'CONNECTING',
    stateDescription: 'Career direction established — AME pathway. AACP has identified an appropriate training provider. Admission and licensing processes are the responsibility of the receiving institution.',
    summary: 'Mechanical engineering technology graduate from industrial reliability sector. Career direction established as AME. Exploring an approved AME training programme. AACP does not determine admission or licensing.',
    featured: true,
  },
  {
    name: 'Tariq Hassan',
    pathway: 'AME_AMT',
    backgroundType: 'Experienced professional — cross-industry transitioner',
    focusArea: 'Aircraft Maintenance Engineer (AME)',
    journeyState: 'FOLLOW-UP',
    stateDescription: 'Referred to an employer-sponsored AME training pathway and enrolled. AACP is capturing outcome information. Licensing and programme completion are external processes.',
    summary: 'Automotive maintenance professional who completed AACP and was referred to an employer-sponsored AME training pathway. Enrolled. 90-day follow-up underway.',
    featured: false,
  },
  {
    name: 'Sofía Reyes',
    pathway: 'AME_AMT',
    backgroundType: 'Recent graduate — entry-level aviation pathway',
    focusArea: 'Aircraft Maintenance Engineer (AME)',
    journeyState: 'PREPARING',
    stateDescription: 'Career direction established — AME entry pathway. Building aviation-sector understanding and workforce readiness in preparation for an appropriate next step.',
    summary: 'Recent graduate with interest in aircraft maintenance structures and systems. Career direction established. Currently building workforce readiness.',
    featured: false,
  },
  {
    name: "Brendan O'Malley",
    pathway: 'AME_AMT',
    backgroundType: 'Career explorer — pathway redirected from ATC',
    focusArea: 'Aircraft Maintenance Engineer (AME)',
    journeyState: 'EXPLORING',
    stateDescription: 'Initially explored Air Traffic Control. ATC assessment did not progress. Re-engaging with AACP to explore the AME pathway. Career direction not yet re-established.',
    summary: 'Started with ATC as a career interest; ATC exploration did not progress. Re-engaging with AACP to investigate aircraft maintenance as a potential direction.',
    featured: false,
  },

  // ── STEM — 3 ─────────────────────────────────────────────────────────────────
  {
    name: 'Priya Nair',
    pathway: 'STEM',
    backgroundType: 'Experienced STEM professional — aerospace degree, adjacent-sector career',
    focusArea: 'STEM roles in aviation and aerospace',
    journeyState: 'DEVELOPING',
    stateDescription: 'Aerospace engineering credentials with an 8-year gap from the sector. Investigating which aviation or aerospace role type aligns with her current profile and career values. Direction not yet established.',
    summary: 'Aerospace engineering graduate with 8 years in automotive manufacturing. Re-engaging with aviation sector. AACP is helping identify which role types are worth investigating given the sector gap.',
    featured: true,
  },
  {
    name: 'James Okafor',
    pathway: 'STEM',
    backgroundType: 'Career explorer / student — early-stage interest',
    focusArea: 'STEM roles in aviation and aerospace',
    journeyState: 'EXPLORING',
    stateDescription: 'Early-stage exploration of STEM roles in aviation and aerospace. Gathering foundational information about the sector and what entry routes look like.',
    summary: 'Student with interest in aerospace engineering and aviation. At the very beginning of career exploration — gathering sector information before any direction is considered.',
    featured: false,
  },
  {
    name: 'Leila Ahmadi',
    pathway: 'STEM',
    backgroundType: 'Career explorer — insufficient engagement',
    focusArea: 'Aviation / aerospace — direction not yet confirmed',
    journeyState: 'EXPLORING',
    stateDescription: 'Career exploration initiated but insufficient engagement to progress. Aviation and aerospace are of interest but career direction cannot be established at this stage.',
    summary: 'Interest in aviation career expressed but engagement has been insufficient to establish any meaningful direction. AACP cannot yet offer substantive career intelligence.',
    featured: false,
  },
];

// ── Checkpoint definitions ────────────────────────────────────────────────────

const REQUIRED_CHECKPOINTS: Record<string, string[]> = {
  A: ['overview', 'captain', 'featured_journey', 'cohort', 'signal'],
  B: ['overview', 'captain', 'featured_journey', 'cohort'],
  C: ['overview', 'captain', 'featured_journey', 'cohort'],
  D: ['overview', 'captain', 'featured_journey', 'cohort', 'signal'],
  E: ['overview', 'captain', 'featured_journey', 'cohort', 'signal'],
  F: [],
};

const CHECKPOINT_LABELS: Record<string, string> = {
  overview: 'AACP overview reviewed',
  cohort: 'Representative cohort reviewed',
  featured_journey: 'Featured participant journey reviewed',
  captain: 'Captain ACIA experienced',
  signal: 'Signal experience reviewed',
};

// ── Styles ───────────────────────────────────────────────────────────────────

const S = {
  shell: { minHeight: '100vh', background: C.bg, fontFamily: '"Inter", system-ui, sans-serif', color: C.white } as React.CSSProperties,
  header: { background: '#0f172a', borderBottom: `3px solid ${C.crimson}`, padding: '0 2rem', display: 'flex', alignItems: 'center', gap: '1rem', height: 56 } as React.CSSProperties,
  brand: { color: '#fff', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em', userSelect: 'none' as const },
  instrBadge: { background: C.crimson, color: '#fff', fontWeight: 600, fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.05em' },
  container: { maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem' } as React.CSSProperties,
  card: { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '2rem', marginBottom: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' } as React.CSSProperties,
  notice: (color: string, bg: string, border: string) => ({ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '1rem 1.25rem', marginBottom: '1.25rem', color, fontSize: '0.875rem', lineHeight: 1.6 } as React.CSSProperties),
  h1: { fontSize: '1.5rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem', lineHeight: 1.3 } as React.CSSProperties,
  h2: { fontSize: '1.15rem', fontWeight: 600, color: C.white, marginBottom: '0.75rem' } as React.CSSProperties,
  h3: { fontSize: '0.95rem', fontWeight: 600, color: C.white, marginBottom: '0.5rem' } as React.CSSProperties,
  p: { color: C.grey, fontSize: '0.925rem', lineHeight: 1.65, marginBottom: '0.75rem' } as React.CSSProperties,
  label: { display: 'block', fontSize: '0.875rem', fontWeight: 600, color: C.white, marginBottom: '0.5rem' } as React.CSSProperties,
  sub: { fontSize: '0.8rem', color: C.greyD, marginBottom: '0.25rem' } as React.CSSProperties,
  btn: (variant: 'primary' | 'secondary' | 'ghost') => ({
    display: 'inline-block', padding: '0.625rem 1.5rem', borderRadius: 6, fontWeight: 600,
    fontSize: '0.9rem', cursor: 'pointer', border: 'none', outline: 'none',
    background: variant === 'primary' ? C.crimson : variant === 'secondary' ? '#0f172a' : 'transparent',
    color: variant === 'ghost' ? C.grey : '#fff',
    transition: 'opacity 0.15s',
  } as React.CSSProperties),
  divider: { border: 'none', borderTop: `1px solid ${C.borderLight}`, margin: '1.5rem 0' } as React.CSSProperties,
  progress: { display: 'flex', gap: '0.5rem', marginBottom: '2rem' } as React.CSSProperties,
  step: (active: boolean, done: boolean) => ({ flex: 1, height: 4, borderRadius: 2, background: done ? C.crimson : active ? C.crimsonD : C.borderLight, transition: 'background 0.3s' } as React.CSSProperties),
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' } as React.CSSProperties,
  radio: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginBottom: '0.75rem' },
  radioItem: (selected: boolean) => ({
    display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.625rem 0.875rem',
    borderRadius: 6, border: `1px solid ${selected ? C.crimson : C.border}`,
    background: selected ? '#fdf2f2' : C.bgCard, cursor: 'pointer', transition: 'border-color 0.15s',
  } as React.CSSProperties),
  textarea: { width: '100%', minHeight: 90, padding: '0.625rem 0.875rem', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical' as const, color: C.white, background: C.bgCard, outline: 'none', boxSizing: 'border-box' as const, lineHeight: 1.5 } as React.CSSProperties,
  pathwayChip: (pathway: string) => {
    const colors: Record<string, [string, string]> = { ATC: [C.blueBg, C.blue], PILOT: [C.greenBg, C.green], AME_AMT: [C.amberBg, C.amber], STEM: ['#f3f4f6', C.slate] };
    const [bg, fg] = colors[pathway] ?? ['#f3f4f6', C.slate];
    return { background: bg, color: fg, padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, display: 'inline-block', whiteSpace: 'nowrap' as const } as React.CSSProperties;
  },
  tag: (color: string, bg: string) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, color, background: bg } as React.CSSProperties),
  stateTag: (state: JourneyState) => {
    const m: Record<JourneyState, [string, string]> = {
      EXPLORING: [C.grey, C.bgDeep],
      DEVELOPING: [C.blue, C.blueBg],
      PREPARING: [C.amber, C.amberBg],
      CONNECTING: [C.crimson, '#fef2f2'],
      TRANSITIONING: [C.green, C.greenBg],
      'FOLLOW-UP': [C.slate, '#f1f5f9'],
    };
    const [color, bg] = m[state] ?? [C.grey, C.bgDeep];
    return { display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, color, background: bg, whiteSpace: 'nowrap' as const } as React.CSSProperties;
  },
  chatBubble: (role: 'user' | 'captain') => ({
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? C.crimson : C.bgDeep,
    color: role === 'user' ? '#fff' : C.white,
    padding: '0.625rem 0.875rem', borderRadius: 10, maxWidth: '78%', fontSize: '0.875rem', lineHeight: 1.55,
  } as React.CSSProperties),
};

// ── Sub-components ────────────────────────────────────────────────────────────

function DisclosureBanner({ label }: { label: string }) {
  return (
    <div style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.8rem', color: '#92400e' }}>
      <span>⚠</span><span>{label}</span>
    </div>
  );
}

function CohortGrid({ onMemberViewed }: { onMemberViewed?: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { onMemberViewed?.(); }, []);

  const byPathway: Record<string, CohortMember[]> = {};
  for (const m of COHORT_MEMBERS) {
    (byPathway[m.pathway] ??= []).push(m);
  }
  const pathwayOrder: Array<CohortMember['pathway']> = ['ATC', 'PILOT', 'AME_AMT', 'STEM'];
  const pathwayLabel: Record<string, string> = { ATC: 'Air Traffic Control', PILOT: 'Pilot', AME_AMT: 'AME & AMT', STEM: 'STEM Roles in Aviation & Aerospace' };

  return (
    <div>
      {pathwayOrder.map(pw => (
        <div key={pw} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={S.pathwayChip(pw)}>{pw.replace('_', '/')}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: C.white }}>{pathwayLabel[pw]}</span>
            <span style={{ fontSize: '0.75rem', color: C.greyD, marginLeft: 2 }}>{byPathway[pw]?.length ?? 0} participants</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {(byPathway[pw] ?? []).map(m => (
              <div key={m.name} onClick={() => setExpanded(expanded === m.name ? null : m.name)}
                style={{ background: C.bgCard, border: `1px solid ${expanded === m.name ? C.crimson : C.border}`, borderRadius: 8, padding: '0.875rem', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.white }}>{m.name}{m.featured && <span style={{ marginLeft: 6, fontSize: '0.65rem', fontWeight: 600, color: C.crimson, letterSpacing: '0.04em' }}>FEATURED</span>}</div>
                  <span style={S.stateTag(m.journeyState)}>{m.journeyState}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: C.grey, marginBottom: 4 }}>{m.backgroundType}</div>
                <div style={{ fontSize: '0.78rem', color: C.greyD }}>{m.focusArea}</div>

                {expanded === m.name && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${C.borderLight}` }} onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: '0.78rem', color: C.grey, marginBottom: '0.625rem', lineHeight: 1.55 }}>{m.summary}</div>
                    <div style={{ fontSize: '0.78rem', color: C.greyD, lineHeight: 1.55, fontStyle: 'italic' }}>{m.stateDescription}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CohortStatusSummary({ members }: { members: CohortMember[] }) {
  const counts: Partial<Record<JourneyState, number>> = {};
  for (const m of members) counts[m.journeyState] = (counts[m.journeyState] ?? 0) + 1;

  const stateOrder: JourneyState[] = ['EXPLORING', 'DEVELOPING', 'PREPARING', 'CONNECTING', 'TRANSITIONING', 'FOLLOW-UP'];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
      {stateOrder.filter(s => counts[s]).map(s => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: C.bgDeep, borderRadius: 6 }}>
          <span style={S.stateTag(s)}>{s}</span>
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: C.white }}>{counts[s]}</span>
        </div>
      ))}
    </div>
  );
}

function FeaturedProfileCard({ profile, onExpanded }: { profile: Profile; onExpanded: () => void }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    if (!open) onExpanded();
    setOpen(o => !o);
  }

  return (
    <div style={{ ...S.card, marginBottom: '1rem', cursor: 'pointer', borderLeft: `3px solid ${C.crimson}` }} onClick={toggle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: C.white }}>{profile.name}</div>
          <div style={{ fontSize: '0.78rem', color: C.grey, marginTop: 2 }}>{profile.background_type} · {profile.location}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={S.pathwayChip(profile.pathway)}>{profile.pathway.replace('_', '/')}</span>
          <span style={{ fontSize: '0.8rem', color: C.greyD }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: `1px solid ${C.borderLight}` }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: '0.8rem', color: C.grey, marginBottom: '0.875rem' }}>
            <div><strong>Education:</strong> {profile.education}</div>
            <div style={{ marginTop: 4 }}><strong>Background:</strong> {profile.work_history}</div>
            <div style={{ marginTop: 4 }}><strong>AACP Status:</strong> {profile.aacp_status}</div>
          </div>

          {profile.career_direction && (
            <div style={{ ...S.notice(C.grey, C.bgDeep, C.borderLight), marginBottom: '0.875rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: C.white, marginBottom: 4 }}>Career Direction: {profile.career_direction}</div>
              <div style={{ fontSize: '0.8rem', color: C.grey }}>{profile.career_direction_narrative}</div>
            </div>
          )}

          <div style={{ marginBottom: '0.875rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: C.grey, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Capability Indicators</div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {profile.capability_indicators.map((ci, i) => (
                <li key={i} style={{ fontSize: '0.8rem', color: C.grey, marginBottom: 3 }}>{ci}</li>
              ))}
            </ul>
          </div>

          <div style={{ ...S.notice(C.grey, '#fef9f9', C.redBorder) }}>
            <div style={{ fontWeight: 600, fontSize: '0.75rem', color: C.red, marginBottom: 4 }}>AACP Does Not Establish:</div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {profile.aacp_does_not_establish.map((d, i) => (
                <li key={i} style={{ fontSize: '0.78rem', color: C.grey, marginBottom: 2 }}>{d}</li>
              ))}
            </ul>
            {profile.realistic_note && <div style={{ marginTop: 6, fontSize: '0.78rem', fontStyle: 'italic', color: C.grey }}>{profile.realistic_note}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function CaptainCheckpointPanel({
  token, config, isComplete, onComplete,
}: {
  token: string;
  config: NonNullable<ExperienceData['captain_acia']>;
  isComplete: boolean;
  onComplete: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastFailed, setLastFailed] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput('');
    setLastFailed(false);
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const r = await fetch(`/validate/${token}/captain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await r.json() as { reply?: string; error?: string };
      const reply = data.reply?.trim();
      if (reply) {
        setMessages(prev => [...prev, { role: 'captain', text: reply }]);
        onComplete();
      } else {
        setLastFailed(true);
        setMessages(prev => prev.slice(0, -1)); // remove the user message that got no reply
      }
    } catch {
      setLastFailed(true);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
      setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }), 50);
    }
  }

  return (
    <div>
      {/* Guided intro */}
      <div style={{ ...S.card, borderLeft: `3px solid ${C.crimson}`, marginBottom: '1rem' }}>
        <h2 style={S.h2}>Captain ACIA — Guided Checkpoint</h2>
        <p style={S.p}>
          Now experience how Captain ACIA helps participants understand their career and capability intelligence
          and explore meaningful next steps.
        </p>
        <p style={{ ...S.p, marginBottom: 0, fontSize: '0.85rem' }}>
          In the Validator Experience, Captain ACIA is presented through a fictional participant context.
          All interactions remain in the validation sandbox — no participant records, evidence, signals, or
          career outcomes are written.
        </p>
      </div>

      {/* Suggested prompts — prominent */}
      {messages.length === 0 && (
        <div style={{ ...S.card, marginBottom: '1rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.white, marginBottom: '0.75rem' }}>
            Fictional participant: <span style={{ color: C.crimson }}>{config.fictional_participant}</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: C.grey, marginBottom: '0.75rem' }}>
            Select a question to begin, or type your own below:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' }}>
            {config.suggested_prompts.slice(0, 3).map((p, i) => (
              <button key={i} onClick={() => send(p)} style={{
                textAlign: 'left' as const, padding: '0.625rem 0.875rem', borderRadius: 6,
                border: `1px solid ${C.border}`, background: C.bgDeep, color: C.white,
                fontSize: '0.85rem', cursor: 'pointer', lineHeight: 1.5,
              }}>{p}</button>
            ))}
          </div>
        </div>
      )}

      {/* Chat */}
      <div style={{ ...S.card, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.crimson, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>CA</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: C.white }}>Captain ACIA — Validator Experience Mode</div>
            <div style={{ fontSize: '0.72rem', color: C.greyD }}>Sandbox · {config.sandbox_notice}</div>
          </div>
        </div>

        <div ref={chatRef} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 60, maxHeight: 300, overflowY: 'auto', marginBottom: '0.75rem', padding: '0.5rem 0' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={S.chatBubble(m.role)}>{m.text}</div>
            </div>
          ))}
          {loading && <div style={{ color: C.greyD, fontSize: '0.8rem', fontStyle: 'italic' }}>Captain ACIA is responding…</div>}
          {lastFailed && !loading && (
            <div style={{ ...S.notice(C.amber, C.amberBg, C.amberBorder), marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#92400e' }}>Captain ACIA couldn't respond just now. Please try again.</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder="Ask Captain ACIA about this participant…"
            style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: '0.875rem', fontFamily: 'inherit', color: C.white, background: C.bgCard, outline: 'none' }}
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()} style={{ ...S.btn('primary'), padding: '0.5rem 1rem', opacity: (loading || !input.trim()) ? 0.5 : 1 }}>Send</button>
        </div>
      </div>

      {/* Checkpoint completion */}
      {isComplete ? (
        <div style={{ ...S.tag(C.green, C.greenBg), display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.825rem', marginBottom: '1rem' }}>
          ✓ Captain ACIA experience complete — this checkpoint is satisfied
        </div>
      ) : (
        <div style={{ fontSize: '0.8rem', color: C.greyD, marginBottom: '1rem' }}>
          Send a message above to complete this checkpoint.
        </div>
      )}
    </div>
  );
}

function SandboxSignalPanel({ token, instrument, onViewed }: { token: string; instrument: string; onViewed?: () => void }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { onViewed?.(); }, []);

  const cfg = signalConfig(instrument);
  if (!cfg) return null;

  async function sendSignal() {
    setLoading(true);
    try {
      await fetch(`/validate/${token}/sandbox-signal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_type: cfg!.signalType, payload: { context: 'validator_exploration', note: 'Sandbox validation signal — no production record.' } }),
      });
      setSent(true);
    } catch { /* silent */ } finally { setLoading(false); }
  }

  return (
    <>
      <div style={{ ...S.card, borderLeft: `3px solid ${C.amber}`, marginBottom: '1rem' }}>
        <h2 style={S.h2}>{cfg.label} — Guided Checkpoint</h2>
        <p style={S.p}>{cfg.description}</p>
        <p style={{ ...S.p, marginBottom: 0, fontSize: '0.85rem' }}>
          This checkpoint demonstrates how signals flow between AACP and industry or employer partners.
          Submitting a signal here writes only to the validation sandbox — no production records are created or modified.
        </p>
      </div>
      <div style={{ ...S.card, marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.white, marginBottom: '0.75rem' }}>{cfg.label}</div>
        {sent ? (
          <div style={{ ...S.tag(C.green, C.greenBg), fontSize: '0.825rem', padding: '4px 12px' }}>✓ Sandbox signal recorded</div>
        ) : (
          <button onClick={sendSignal} disabled={loading} style={{ ...S.btn('secondary'), fontSize: '0.825rem', padding: '0.4rem 1rem', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Recording…' : cfg.buttonLabel}
          </button>
        )}
      </div>
    </>
  );
}

// Signal config: A,E → IPS; D → ES; B,C,F → null
function signalConfig(instrument: string): { show: boolean; label: string; description: string; signalType: string; buttonLabel: string } | null {
  if (instrument === 'A' || instrument === 'E') {
    return {
      show: true,
      label: 'Industry Professional Signal — Sandbox',
      description: 'This panel demonstrates how an industry professional signal is recorded when an AACP participant is identified for potential placement consideration. Signals submitted here are written only to the validation sandbox — no production records are affected.',
      signalType: 'IPS_INTEREST',
      buttonLabel: 'Submit industry professional interest signal (sandbox)',
    };
  }
  if (instrument === 'D') {
    return {
      show: true,
      label: 'Employer Signal — Sandbox',
      description: 'This panel demonstrates how an employer signal is recorded when a participant is identified as a potential candidate for a placement, interview, or work-experience opportunity. Signals submitted here are written only to the validation sandbox — no production records are affected.',
      signalType: 'ES_INTEREST',
      buttonLabel: 'Submit employer interest signal (sandbox)',
    };
  }
  return null;
}

// ── Question rendering ────────────────────────────────────────────────────────

const SCALE_SUPPORTED = ['SUPPORTED', 'SUPPORTED WITH MODIFICATION', 'NOT SUPPORTED', 'INSUFFICIENT INFORMATION'];
const SCALE_RELEVANCE = ['CRITICAL TO THE WORK', 'HIGHLY RELEVANT TO THE WORK', 'RELEVANT', 'LIMITED RELEVANCE', 'NOT RELEVANT', 'OUTSIDE MY EXPERTISE'];
const COND_TRIGGER = ['SUPPORTED WITH MODIFICATION', 'NOT SUPPORTED'];

interface Question {
  key: string;
  type: string;
  label: string;
  text: string;
  scale?: string[];
  conditional_values?: string[];
  conditional_text?: string;
  optional_text?: string;
  discovery?: boolean;
  final?: boolean;
}

function QuestionBlock({ q, value, condValue, onChange, onCondChange, highlight }: {
  q: Question;
  value: string;
  condValue: string;
  onChange: (v: string) => void;
  onCondChange: (v: string) => void;
  highlight?: boolean;
}) {
  const isCond = (q.conditional_values ?? COND_TRIGGER).includes(value);

  return (
    <div id={`q-${q.key}`} style={{ marginBottom: '1.75rem', scrollMarginTop: '1rem', outline: highlight ? `2px solid ${C.crimson}` : 'none', borderRadius: highlight ? 8 : 0, padding: highlight ? '0.5rem' : 0, transition: 'outline 0.3s' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: C.crimson, letterSpacing: '0.06em', marginBottom: 4, textTransform: 'uppercase' as const }}>{q.label}</div>
          <div style={{ fontSize: '0.9rem', color: C.white, lineHeight: 1.6 }}>{q.text}</div>
        </div>
      </div>

      {(q.type === 'supported_scale' || q.type === 'relevance_scale') && (
        <div style={S.radio}>
          {(q.scale ?? (q.type === 'supported_scale' ? SCALE_SUPPORTED : SCALE_RELEVANCE)).map(opt => (
            <div key={opt} style={S.radioItem(value === opt)} onClick={() => onChange(opt)}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${value === opt ? C.crimson : C.border}`, background: value === opt ? C.crimson : 'transparent', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: '0.875rem', color: C.white }}>{opt}</span>
            </div>
          ))}
        </div>
      )}

      {q.type === 'open_text' && (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder="Your response…" style={S.textarea} />
      )}

      {isCond && q.conditional_text && (
        <div style={{ marginTop: '0.75rem' }}>
          <label style={S.label}>{q.conditional_text}</label>
          <textarea value={condValue} onChange={e => onCondChange(e.target.value)} placeholder="Please describe…" style={S.textarea} />
        </div>
      )}

      {q.optional_text && q.type === 'relevance_scale' && (
        <div style={{ marginTop: '0.75rem' }}>
          <label style={{ ...S.label, fontWeight: 400, color: C.grey, fontSize: '0.825rem' }}>{q.optional_text} (optional)</label>
          <textarea value={condValue} onChange={e => onCondChange(e.target.value)} placeholder="Optional comment…" style={{ ...S.textarea, minHeight: 60 }} />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ValidatorExperience({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [experience, setExperience] = useState<ExperienceData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [level2Ack, setLevel2Ack] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Experience sections & checkpoints
  const [activeSectionId, setActiveSectionId] = useState<string>('overview');
  const [checkpoints, setCheckpoints] = useState<Set<string>>(new Set());

  // Missing-response UX
  const [missingQKeys, setMissingQKeys] = useState<string[]>([]);
  const [highlightQ, setHighlightQ] = useState<string | null>(null);

  const markCheckpoint = (cp: string) => setCheckpoints(prev => new Set([...prev, cp]));

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/validate/${token}`, { headers: { Accept: 'application/json' } });
        if (!r.ok) {
          const d = await r.json() as { error?: string };
          setErrorMsg(d.error ?? 'This invitation is invalid or has expired.');
          setPhase('error');
          return;
        }
        const s = await r.json() as SessionInfo;
        if (s.submitted) { setPhase('already_submitted'); return; }
        setSession(s);
        setPhase('welcome');
      } catch {
        setErrorMsg('Unable to load this validation. Please check your connection and try again.');
        setPhase('error');
      }
    })();
  }, [token]);

  // Auto-mark simple section checkpoints on visit
  useEffect(() => {
    if (phase !== 'experience') return;
    if (activeSectionId === 'overview' || activeSectionId === 'cohort') {
      markCheckpoint(activeSectionId);
    }
    if (activeSectionId === 'signal') {
      markCheckpoint('signal');
    }
  }, [activeSectionId, phase]);

  async function handleStart() {
    if (!session) return;
    try {
      const r = await fetch(`/validate/${token}/experience`, { headers: { Accept: 'application/json' } });
      if (r.ok) setExperience(await r.json() as ExperienceData);
    } catch { /* start anyway */ }
    await fetch(`/validate/${token}/start`, { method: 'POST' }).catch(() => {});
    setPhase('experience');
    setActiveSectionId('overview');
  }

  function handleBeginQuestions() {
    if (!session) return;
    const instrQuestions = INSTRUMENT_QUESTIONS[session.instrument] ?? [];
    setQuestions(instrQuestions);
    setMissingQKeys([]);
    setPhase('questions');
  }

  function handleContinueToFinal() {
    const required = questions.filter(q => !q.final);
    const missing = required.filter(q => !responses[q.key]?.trim());
    if (missing.length > 0) {
      setMissingQKeys(missing.map(q => q.key));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setMissingQKeys([]);
    setPhase('final_perspective');
  }

  function navigateToQuestion(key: string) {
    setMissingQKeys([]);
    setHighlightQ(key);
    setTimeout(() => {
      document.getElementById(`q-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightQ(null), 2500);
    }, 50);
  }

  async function handleSubmit() {
    const finalQs = questions.filter(q => q.final);
    const missingFinal = finalQs.filter(q => !responses[q.key]?.trim());
    if (missingFinal.length > 0) {
      setSubmitError(`${missingFinal.length} required question${missingFinal.length > 1 ? 's' : ''} still need${missingFinal.length === 1 ? 's' : ''} a response.`);
      setMissingQKeys(missingFinal.map(q => q.key));
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    const body: Record<string, unknown> = { responses };
    if (session?.level2_notice) body.level2_acknowledged = level2Ack;
    try {
      const r = await fetch(`/validate/${token}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json() as { submitted?: boolean; error?: string };
      if (r.ok && d.submitted) {
        setPhase('submitted');
      } else if (r.status === 409) {
        setPhase('already_submitted');
      } else {
        setSubmitError(d.error ?? 'Submission failed. Please review your responses.');
      }
    } catch {
      setSubmitError('Unable to submit. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function setResponse(key: string, value: string) {
    setResponses(prev => ({ ...prev, [key]: value }));
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div style={S.shell}>
        <div style={S.header}><span style={S.brand}>AACP™</span></div>
        <div style={{ ...S.container, paddingTop: '4rem', textAlign: 'center' as const }}>
          <div style={{ color: C.grey, fontSize: '0.925rem' }}>Loading validation…</div>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={S.shell}>
        <div style={S.header}><span style={S.brand}>AACP™</span></div>
        <div style={S.container}>
          <div style={{ ...S.card, marginTop: '3rem', textAlign: 'center' as const }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: C.red, marginBottom: '0.75rem' }}>Invitation Not Available</div>
            <p style={S.p}>{errorMsg}</p>
            <p style={{ ...S.p, fontSize: '0.8rem' }}>If you believe this is an error, please contact the person who sent your invitation.</p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'already_submitted') {
    return (
      <div style={S.shell}>
        <div style={S.header}><span style={S.brand}>AACP™</span></div>
        <div style={S.container}>
          <div style={{ ...S.card, marginTop: '3rem', textAlign: 'center' as const }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: C.green, marginBottom: '0.75rem' }}>✓ Validation Already Submitted</div>
            <p style={S.p}>This validation has already been completed. Thank you for your contribution to AACP.</p>
          </div>
        </div>
      </div>
    );
  }

  const instrumentLabel = session?.instrument ? `Instrument ${session.instrument}` : '';
  const isLevel2 = !!session?.level2_notice;
  const isGuided = experience?.experience_mode === 'GUIDED';
  const currentInstrument = session?.instrument ?? experience?.instrument ?? '';
  const hasCapAcia = experience?.captain_acia != null;
  const hasSig = signalConfig(currentInstrument) !== null;
  const sigLabel = hasSig ? (signalConfig(currentInstrument)!.label.split(' — ')[0]) : '';

  const phaseIndex = { welcome: 0, experience: 1, questions: 2, final_perspective: 3, submitted: 4 }[phase] ?? 0;

  // Section definitions for GUIDED — Captain appears early (position 2)
  const expSections: Array<{ id: string; label: string }> = [
    { id: 'overview', label: 'AACP Overview' },
    ...(hasCapAcia ? [{ id: 'captain', label: 'Captain ACIA' }] : []),
    { id: 'featured_journey', label: 'Featured Journeys' },
    { id: 'cohort', label: 'Participant Cohort' },
    ...(hasSig ? [{ id: 'signal', label: sigLabel }] : []),
  ];

  // Checkpoint requirements for "Proceed to Questions"
  const required = REQUIRED_CHECKPOINTS[currentInstrument] ?? [];
  const unmetCheckpoints = required.filter(cp => !checkpoints.has(cp));
  const allCheckpointsMet = unmetCheckpoints.length === 0;

  return (
    <div style={S.shell}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.brand}>AACP™</span>
        {session && <span style={S.instrBadge}>{instrumentLabel}</span>}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8' }}>Validator Experience</span>
      </div>

      <div style={S.container}>
        {/* Progress bar */}
        {phase !== 'submitted' && (
          <div style={S.progress}>
            {['Introduction', experience?.experience_mode === 'STATIC' ? 'Orientation' : 'Explore AACP', 'Questions', 'Final Perspective'].map((label, i) => (
              <div key={label} style={{ flex: 1 }}>
                <div style={S.step(i === phaseIndex, i < phaseIndex)} />
                <div style={{ fontSize: '0.7rem', color: i <= phaseIndex ? C.crimson : C.greyD, marginTop: 4, fontWeight: i === phaseIndex ? 600 : 400 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── WELCOME ── */}
        {phase === 'welcome' && session && (
          <>
            <div style={S.card}>
              <div style={{ marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: C.greyD, letterSpacing: '0.08em', textTransform: 'uppercase' as const, fontWeight: 600 }}>{session.instrument_title}</span>
              </div>
              <h1 style={S.h1}>Welcome, {session.validator_name}</h1>
              <p style={S.p}>{session.instrument_description}</p>
              {session.instrument_opening && (
                <div style={{ ...S.notice(C.grey, C.bgDeep, C.borderLight), fontStyle: 'italic', marginBottom: '1rem' }}>
                  {session.instrument_opening}
                </div>
              )}
              {session.scenario && (
                <div style={{ ...S.notice(C.grey, C.blueBg, C.blueBorder) }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{session.scenario.title}</div>
                  <div style={{ fontSize: '0.85rem' }}>{session.scenario.content}</div>
                </div>
              )}
            </div>

            {isLevel2 && (
              <div style={{ ...S.card, borderLeft: `3px solid ${C.crimson}` }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.crimson, marginBottom: '0.5rem' }}>Level 2 Confidentiality Notice</div>
                <p style={{ ...S.p, marginBottom: '1rem' }}>{session.level2_notice}</p>
                <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', cursor: 'pointer', fontSize: '0.875rem', color: C.white }}>
                  <input type="checkbox" checked={level2Ack} onChange={e => setLevel2Ack(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
                  I have read and understood the Level 2 confidentiality notice and agree to handle all materials accordingly.
                </label>
              </div>
            )}

            <button onClick={handleStart} disabled={isLevel2 && !level2Ack} style={{ ...S.btn('primary'), opacity: (isLevel2 && !level2Ack) ? 0.4 : 1 }}>
              Begin Validation Experience
            </button>
          </>
        )}

        {/* ── EXPERIENCE ── */}
        {phase === 'experience' && experience && (
          <>
            <DisclosureBanner label={experience.representative_data_label ?? 'Representative Data — This view uses fictional data to demonstrate how AACP workforce intelligence is presented. No real participant information is displayed.'} />

            {isGuided ? (
              <>
                {/* Section tabs with checkpoint indicators */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' as const }}>
                  {expSections.map(sec => {
                    const isRequired = required.includes(sec.id);
                    const isDone = checkpoints.has(sec.id);
                    const isActive = activeSectionId === sec.id;
                    return (
                      <button key={sec.id} onClick={() => setActiveSectionId(sec.id)} style={{
                        padding: '0.4rem 0.875rem', borderRadius: 6,
                        border: `1px solid ${isActive ? C.crimson : C.border}`,
                        background: isActive ? '#fdf2f2' : C.bgCard,
                        color: isActive ? C.crimson : C.grey,
                        fontWeight: isActive ? 600 : 400, fontSize: '0.825rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                      }}>
                        {isDone ? (
                          <span style={{ color: C.green, fontSize: '0.7rem', fontWeight: 700 }}>✓</span>
                        ) : isRequired ? (
                          <span style={{ color: C.crimson, fontSize: '0.7rem' }}>○</span>
                        ) : null}
                        {sec.label}
                      </button>
                    );
                  })}
                </div>

                {/* SECTION: AACP Overview */}
                {activeSectionId === 'overview' && (
                  <>
                    <div style={S.card}>
                      <h2 style={S.h2}>AACP Workforce Intelligence — Validator View</h2>
                      <p style={{ ...S.p, marginBottom: '0.75rem' }}>
                        You are viewing a representative demonstration of AACP's workforce intelligence platform.
                        All data is fictional and constructed solely for this validation activity.
                      </p>
                      <p style={{ ...S.p, marginBottom: 0 }}>
                        AACP is a career-exploration and workforce-intelligence programme. It is not a certification body,
                        licensing system, or occupational-competence-determination system.
                      </p>
                    </div>

                    {/* Four pathways */}
                    <div style={S.card}>
                      <h2 style={S.h2}>Four Aviation &amp; Aerospace Pathways</h2>
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.75rem', marginBottom: '1rem' }}>
                        {(experience.four_pathways ?? []).map(p => (
                          <div key={p.code} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.75rem', background: C.bgDeep, borderRadius: 8 }}>
                            <span style={{ ...S.pathwayChip(p.code), flexShrink: 0 }}>{p.code}</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.white, marginBottom: 2 }}>{p.label}</div>
                              <div style={{ fontSize: '0.8rem', color: C.grey }}>{p.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {experience.provenance && (
                        <div style={{ ...S.notice(C.grey, C.bgDeep, C.borderLight), marginBottom: 0, fontSize: '0.8rem' }}>
                          Provenance: <strong>{experience.provenance.replace('_', ' ')}</strong> — This perspective is aligned with the validator's domain authority.
                        </div>
                      )}
                    </div>

                    {/* Cohort summary */}
                    <div style={S.card}>
                      <h2 style={S.h2}>Representative Cohort — Workforce Intelligence Summary</h2>
                      <p style={{ ...S.p, marginBottom: '1rem', fontSize: '0.85rem' }}>
                        The representative cohort comprises {COHORT_MEMBERS.length} fictional participants across all four pathways.
                        The following summary illustrates the range of career-journey states AACP tracks — including non-success states,
                        pathway changes, and participants whose outcomes are not yet known.
                      </p>

                      <div style={{ marginBottom: '1.25rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: C.grey, marginBottom: '0.625rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>By Pathway</div>
                        <div style={{ ...S.grid2 }}>
                          {(['ATC', 'PILOT', 'AME_AMT', 'STEM'] as const).map(pw => {
                            const count = COHORT_MEMBERS.filter(m => m.pathway === pw).length;
                            return (
                              <div key={pw} style={{ padding: '0.625rem 0.875rem', background: C.bgDeep, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={S.pathwayChip(pw)}>{pw.replace('_', '/')}</span>
                                <span style={{ fontWeight: 700, color: C.white }}>{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: C.grey, marginBottom: '0.625rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Journey Status Distribution</div>
                        <CohortStatusSummary members={COHORT_MEMBERS} />
                      </div>
                    </div>
                  </>
                )}

                {/* SECTION: Participant Cohort — all 13 */}
                {activeSectionId === 'cohort' && (
                  <>
                    <div style={S.card}>
                      <h2 style={S.h2}>Representative Participant Cohort — {COHORT_MEMBERS.length} Participants</h2>
                      <p style={{ ...S.p, marginBottom: 0, fontSize: '0.85rem' }}>
                        All {COHORT_MEMBERS.length} fictional participants are shown below across the four pathways. This cohort intentionally
                        represents diverse backgrounds, career stages, and journey states — including participants who are still exploring,
                        who have changed pathways, or whose outcomes are not yet known. Click any participant to see their current next step.
                      </p>
                    </div>
                    <CohortGrid onMemberViewed={() => markCheckpoint('cohort')} />
                  </>
                )}

                {/* SECTION: Featured Journeys */}
                {activeSectionId === 'featured_journey' && (
                  <>
                    <div style={S.card}>
                      <h2 style={S.h2}>Featured Participant Journeys</h2>
                      <p style={{ ...S.p, marginBottom: 0, fontSize: '0.85rem' }}>
                        Four participants are presented as featured journeys demonstrating the depth of intelligence AACP develops.
                        Open a journey to review background, career direction, capability indicators, and what AACP does — and does not — establish.
                        Click any profile to expand it.
                      </p>
                    </div>
                    {(experience.all_profiles ?? (experience.primary_profile ? [experience.primary_profile] : [])).map(p => (
                      <FeaturedProfileCard key={p.id} profile={p} onExpanded={() => markCheckpoint('featured_journey')} />
                    ))}
                  </>
                )}

                {/* SECTION: Captain ACIA — guided checkpoint */}
                {activeSectionId === 'captain' && hasCapAcia && experience.captain_acia && (
                  <CaptainCheckpointPanel
                    token={token}
                    config={experience.captain_acia}
                    isComplete={checkpoints.has('captain')}
                    onComplete={() => markCheckpoint('captain')}
                  />
                )}

                {/* SECTION: Signal */}
                {activeSectionId === 'signal' && hasSig && (
                  <SandboxSignalPanel
                    token={token}
                    instrument={currentInstrument}
                    onViewed={() => markCheckpoint('signal')}
                  />
                )}

                {/* Checkpoint summary + Proceed button */}
                <hr style={S.divider} />

                {required.length > 0 && (
                  <div style={{ ...S.card, marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.white, marginBottom: '0.75rem' }}>
                      Experience Checkpoints
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginBottom: allCheckpointsMet ? 0 : '0.75rem' }}>
                      {required.map(cp => {
                        const done = checkpoints.has(cp);
                        return (
                          <div key={cp} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <span style={{ color: done ? C.green : C.greyD, fontWeight: 600, width: 16, textAlign: 'center' as const }}>
                              {done ? '✓' : '○'}
                            </span>
                            <span style={{ color: done ? C.grey : C.greyD }}>{CHECKPOINT_LABELS[cp]}</span>
                            {!done && (
                              <button onClick={() => setActiveSectionId(cp === 'featured_journey' ? 'featured_journey' : cp)} style={{ ...S.btn('ghost'), fontSize: '0.75rem', padding: '0.15rem 0.5rem', color: C.crimson, marginLeft: 'auto' }}>
                                Go
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {!allCheckpointsMet && (
                      <div style={{ fontSize: '0.78rem', color: C.greyD, marginTop: '0.5rem' }}>
                        Complete the checkpoints above before proceeding to ensure you have experienced the full validation context.
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleBeginQuestions}
                    disabled={!allCheckpointsMet}
                    style={{ ...S.btn('primary'), opacity: allCheckpointsMet ? 1 : 0.4, cursor: allCheckpointsMet ? 'pointer' : 'not-allowed' }}
                  >
                    Proceed to Validation Questions
                  </button>
                </div>
              </>
            ) : (
              /* STATIC experience (Instrument F) */
              <>
                <div style={S.card}>
                  <h2 style={S.h2}>Regulatory and Public-Authority Review — Orientation</h2>
                  {session?.instrument_opening && (
                    <div style={{ ...S.notice(C.grey, C.bgDeep, C.borderLight), fontStyle: 'italic', marginBottom: '1rem' }}>
                      {session.instrument_opening}
                    </div>
                  )}
                  <p style={S.p}>
                    You are being asked to review AACP as a career and workforce intelligence platform — across its aviation and
                    aerospace pathways — from a regulatory and public-authority perspective. Your assessment covers how AACP
                    represents career pathways, what it claims, what boundaries it maintains, and whether the platform is
                    appropriately scoped relative to regulated systems such as licensing, certification, and occupational assessment.
                  </p>
                  <p style={S.p}>
                    AACP spans multiple aviation and aerospace pathways — including Air Traffic Control, Pilot, Aircraft Maintenance
                    (AME/AMT), and STEM roles across aviation and aerospace. The questions that follow invite your perspective on
                    the platform as a whole, with the freedom to draw on any of these pathways as examples where relevant.
                  </p>
                  <p style={{ ...S.p, marginBottom: 0 }}>
                    This is not a request for approval or endorsement of AACP. Your perspective on regulatory boundary language,
                    platform-level claim scope, and public-interest considerations is what is being sought.
                  </p>
                </div>
                <hr style={S.divider} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={handleBeginQuestions} style={S.btn('primary')}>
                    Proceed to Validation Questions
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── QUESTIONS ── */}
        {phase === 'questions' && (
          <>
            <div style={S.card}>
              <h2 style={S.h2}>Validation Questions — Instrument {session?.instrument}</h2>
              <p style={{ ...S.p, marginBottom: 0, fontSize: '0.825rem' }}>
                Please respond to each question based on what you have seen. Your perspective will be used to assess
                and improve AACP's accuracy, credibility, and claim boundaries.
              </p>
            </div>

            {/* Missing-response alert */}
            {missingQKeys.length > 0 && (
              <div style={{ ...S.notice(C.red, C.redBg, C.redBorder), marginBottom: '1.25rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                  {missingQKeys.length} required question{missingQKeys.length > 1 ? 's' : ''} still need{missingQKeys.length === 1 ? 's' : ''} your response.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.375rem' }}>
                  {missingQKeys.map(key => {
                    const q = questions.find(q => q.key === key);
                    return (
                      <div key={key}>
                        <button onClick={() => navigateToQuestion(key)} style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: C.red, fontSize: '0.825rem', fontWeight: 600, padding: 0,
                          textDecoration: 'underline', textUnderlineOffset: '2px',
                        }}>
                          Return to {q?.label ?? key}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {questions.filter(q => !q.final).map(q => (
              <div key={q.key} style={S.card}>
                <QuestionBlock
                  q={q}
                  value={responses[q.key] ?? ''}
                  condValue={responses[q.key + '_change'] ?? ''}
                  onChange={v => setResponse(q.key, v)}
                  onCondChange={v => setResponse(q.key + '_change', v)}
                  highlight={highlightQ === q.key}
                />
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleContinueToFinal} style={S.btn('primary')}>
                Continue to Final Perspective
              </button>
            </div>
          </>
        )}

        {/* ── FINAL PERSPECTIVE ── */}
        {phase === 'final_perspective' && (
          <>
            <div style={{ ...S.card, borderLeft: `3px solid ${C.crimson}` }}>
              <h2 style={S.h2}>Final Perspective</h2>
              <p style={{ ...S.p, marginBottom: 0, fontSize: '0.825rem' }}>
                Having reviewed the AACP platform experience and completed the validation questions, please share your overall perspective.
              </p>
            </div>

            {questions.filter(q => q.final).map(q => (
              <div key={q.key} style={S.card}>
                <QuestionBlock
                  q={q}
                  value={responses[q.key] ?? ''}
                  condValue={responses[q.key + '_change'] ?? ''}
                  onChange={v => setResponse(q.key, v)}
                  onCondChange={v => setResponse(q.key + '_change', v)}
                  highlight={highlightQ === q.key}
                />
              </div>
            ))}

            {/* Level 2 re-acknowledgement */}
            {isLevel2 && (
              <div style={{ ...S.card, borderLeft: `3px solid ${C.crimson}`, marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', cursor: 'pointer', fontSize: '0.875rem', color: C.white }}>
                  <input type="checkbox" checked={level2Ack} onChange={e => setLevel2Ack(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
                  I confirm that I have handled all materials in accordance with the Level 2 confidentiality notice, and that my responses may be used by AACP for programme development and validation purposes.
                </label>
              </div>
            )}

            {/* Missing final questions alert */}
            {missingQKeys.length > 0 && (
              <div style={{ ...S.notice(C.red, C.redBg, C.redBorder), marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                  {missingQKeys.length} required question{missingQKeys.length > 1 ? 's' : ''} still need{missingQKeys.length === 1 ? 's' : ''} a response.
                </div>
                {missingQKeys.map(key => {
                  const q = questions.find(q => q.key === key);
                  return (
                    <div key={key}>
                      <button onClick={() => navigateToQuestion(key)} style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: C.red, fontSize: '0.825rem', fontWeight: 600, padding: 0,
                        textDecoration: 'underline', textUnderlineOffset: '2px',
                      }}>
                        Return to {q?.label ?? key} →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {submitError && !missingQKeys.length && (
              <div style={{ ...S.notice(C.red, C.redBg, C.redBorder), marginBottom: '1rem' }}>{submitError}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => { setMissingQKeys([]); setPhase('questions'); }} style={{ ...S.btn('ghost'), fontSize: '0.875rem' }}>
                Back to Questions
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || (isLevel2 && !level2Ack)}
                style={{ ...S.btn('primary'), opacity: (submitting || (isLevel2 && !level2Ack)) ? 0.5 : 1 }}
              >
                {submitting ? 'Submitting…' : 'Submit Validation'}
              </button>
            </div>
          </>
        )}

        {/* ── SUBMITTED ── */}
        {phase === 'submitted' && (
          <div style={{ ...S.card, marginTop: '3rem', textAlign: 'center' as const, padding: '3rem 2rem' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenBg, border: `2px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '1.5rem', color: C.green }}>✓</div>
            <h1 style={{ ...S.h1, textAlign: 'center' as const, marginBottom: '0.75rem' }}>Thank You for Your Perspective</h1>
            <p style={{ ...S.p, textAlign: 'center' as const, maxWidth: 480, margin: '0 auto 1rem' }}>
              Your contribution supports the continued development and validation of AACP's aviation and aerospace career and workforce intelligence. Your responses have been recorded and will be reviewed by the AACP team.
            </p>
            <div style={{ ...S.notice(C.grey, C.bgDeep, C.borderLight), display: 'inline-block', fontSize: '0.8rem', textAlign: 'center' as const, marginTop: '0.5rem' }}>
              This window may be closed. If you have questions, please contact info@aviationaerospacecompetency.com.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Instrument questions ──────────────────────────────────────────────────────

const INSTRUMENT_QUESTIONS: Record<string, Question[]> = {
  A: [
    { key: 'A1', type: 'supported_scale', label: 'Occupational Reality', text: 'Based on your direct experience, how accurately does this description represent the AME working environment — including the physical conditions, day-to-day demands, and the realities that prospective entrants commonly underestimate?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What would you change?' },
    { key: 'A2', type: 'relevance_scale', label: 'Capability Indicators (Relevance to the Work)', text: 'We have shown you a set of capability descriptions that AACP uses in its career exploration experience. These describe tendencies and approaches — they are not predictive assessments of occupational success. For each indicator shown, how relevant is it to the actual demands of AME work?', scale: SCALE_RELEVANCE, optional_text: 'What, if anything, is missing from this set? What should not be here?' },
    { key: 'A3', type: 'supported_scale', label: 'Pathway Accuracy', text: 'Are the entry pathways into the AME trade shown here — including college programmes, apprenticeships, and other entry routes — complete and accurate as you understand them? Where do prospective entrants most commonly fail to navigate this pathway successfully?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What is inaccurate or missing?' },
    { key: 'A4', type: 'supported_scale', label: 'Workforce Readiness', text: 'Does AACP address the preparation dimensions you would consider meaningful for someone approaching the AME pathway? Does it make clear that these are career-exploration indicators — not assessments of technical training readiness or occupational competence?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What is missing or unnecessary?' },
    { key: 'A5', type: 'supported_scale', label: 'Transition Credibility', text: 'Does AACP\'s approach to connecting participants with next steps — such as employment, training programmes, apprenticeships, or industry experience — represent a credible and useful bridge? What would make it more actionable from your perspective?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What would make this more actionable?' },
    { key: 'A6', type: 'open_text', label: 'After Career Awareness', text: 'How does your organisation currently determine whether people reached through career-awareness activities subsequently progress toward an AME or aviation career — and what outcomes do you currently track?', discovery: true },
    { key: 'A_final1', type: 'open_text', label: 'Final Perspective A-1', text: 'Overall — would you be comfortable with AACP being used with someone who approached your organisation exploring an AME career? What is the single most important change that would increase your confidence in it?', final: true },
    { key: 'A_final2', type: 'open_text', label: 'Final Perspective A-2', text: 'Is there anything AACP should stop claiming, stop doing, or make clearer about what it is and what it is not?', final: true },
  ],
  B: [
    { key: 'B1', type: 'supported_scale', label: 'Claim Boundaries', text: 'Based on what you have seen: are the conclusions AACP draws from this process proportionate to and supported by the information it collects — or does AACP overreach what the information can legitimately establish?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What specifically overreaches, and how should it be reframed?' },
    { key: 'B2', type: 'supported_scale', label: 'Programme Boundary Clarity', text: 'Is it clear — from what you have seen — that AACP is a career-exploration and workforce-intelligence programme, and not a certification, licensing, or occupational-competence-determination system?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What would need to change to make this clearer?' },
    { key: 'B3', type: 'supported_scale', label: 'Career Direction vs. Confirmed Outcome', text: 'Does AACP make clear that identifying a career direction is not the same as securing employment, training admission, or any confirmed outcome?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What blurs this distinction?' },
    { key: 'B4', type: 'supported_scale', label: 'Outcome Measurement', text: 'What outcomes would you expect a programme like AACP to measure, and at what stages of participant progression? Does the model you have seen capture those?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What is missing? What would you add?' },
    { key: 'B5', type: 'open_text', label: 'Post-Programme Tracking', text: 'What follow-up information would be most meaningful to workforce practitioners at 30, 60, and 90 days after a participant has completed an AACP programme?', discovery: true },
    { key: 'B6', type: 'open_text', label: 'From Awareness to Career Pathway', text: 'What outcomes should be measured to determine whether career-awareness activity is genuinely progressing participants toward aviation or aerospace careers — rather than simply generating awareness or interest?', discovery: true },
    { key: 'B_final1', type: 'open_text', label: 'Final Perspective B-1', text: 'From a workforce development perspective — what is AACP\'s strongest claim? What is its weakest or least supported?', final: true },
    { key: 'B_final2', type: 'open_text', label: 'Final Perspective B-2', text: 'What would need to be true — or what evidence would need to exist — before AACP could credibly claim to improve workforce conversion rates?', final: true },
  ],
  C: [
    { key: 'C1', type: 'supported_scale', label: 'Usefulness Beyond a CV', text: 'Looking at this as a recruiter: does the information AACP produces about a participant give you something genuinely useful that you would not get from a CV or résumé alone? What is most useful, and what is least useful or not useful at all?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What would need to change for this to be genuinely decision-useful?' },
    { key: 'C2', type: 'supported_scale', label: 'Transferable Capability Information', text: 'Does the way AACP describes a participant\'s capabilities and tendencies give you a useful picture of how they might approach technically demanding or specialised work — particularly for candidates who do not yet have direct industry experience?', scale: [...SCALE_SUPPORTED, 'OUTSIDE MY EXPERTISE'], conditional_values: COND_TRIGGER, conditional_text: 'What is missing? What would a recruiter actually want to know?' },
    { key: 'C3', type: 'open_text', label: 'When in a Recruitment Process', text: 'At what stage of a hiring process — initial screening, shortlisting, interview preparation, or another stage — would AACP information be most useful to a technical recruiter? At what stage would it be least useful or not useful at all?', discovery: true },
    { key: 'C4', type: 'supported_scale', label: 'Employer Decision Usefulness and Limits', text: 'Does AACP make clear what it cannot establish about a candidate — and what decisions it is and is not appropriate to support? Would a recruiter using this information know where its limits are?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What needs to be clearer?' },
    { key: 'C5', type: 'supported_scale', label: 'Candidate Handoff Information', text: 'If an AACP participant were being considered for an appropriate technical opportunity, what information would you want to know before recommending them? Does AACP provide that information?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What would you need that AACP does not currently provide?' },
    { key: 'C6', type: 'open_text', label: 'What Recruiters Currently Have Access To', text: 'In your experience, what kind of information — beyond a résumé — most helps you understand a candidate\'s potential fit for a technically demanding or specialised role? How does what AACP produces compare to that?', discovery: true },
    { key: 'C_final1', type: 'open_text', label: 'Final Perspective C-1', text: 'If AACP approached you about participating in a talent-pipeline arrangement, what would you need to see before engaging — and what would make AACP a credible partner for technical talent acquisition?', final: true },
    { key: 'C_final2', type: 'open_text', label: 'Final Perspective C-2', text: 'Is there anything AACP should stop claiming or make clearer about what its candidate information can and cannot support in a hiring context?', final: true },
  ],
  D: [
    { key: 'D1', type: 'supported_scale', label: 'Workforce Intelligence Usefulness', text: 'Would this kind of information help your organisation better understand, develop, or access its future aviation workforce? What is most useful, and what is missing or not useful?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What would make this materially more useful?' },
    { key: 'D2', type: 'supported_scale', label: 'Readiness for Your Environment', text: 'Does AACP address the preparation dimensions you would consider meaningful for someone entering your aviation workforce environment — whether in technical, operational, or other roles?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What is missing or unnecessary?' },
    { key: 'D3', type: 'supported_scale', label: 'Decision Usefulness and Limits', text: 'What would you need to know about a participant before considering them for an appropriate employment, industry-experience, or development opportunity? Does AACP make clear what it can and cannot establish about a participant?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What needs to be clearer?' },
    { key: 'D4', type: 'supported_scale', label: 'Employer Handoff', text: 'Does AACP\'s approach to connecting participants with employer or training partners represent a credible bridge — or does it overstate what AACP can guarantee about participant readiness?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What would need to change?' },
    { key: 'D5', type: 'open_text', label: 'What You Currently Have Access To', text: 'How does your organisation currently determine whether people reached through career-awareness or outreach activities subsequently progress into aviation careers — and what outcomes do you currently track?', discovery: true },
    { key: 'D6', type: 'open_text', label: 'Outcomes That Would Be Most Meaningful', text: 'What outcomes would be most meaningful to your organisation for determining whether a career-awareness programme is genuinely progressing people toward your workforce?', discovery: true },
    { key: 'D_final1', type: 'open_text', label: 'Final Perspective D-1', text: 'If AACP approached your organisation about a talent-pipeline partnership, what would you need to see before engaging — and what would make it a credible partner?', final: true },
  ],
  E: [
    { key: 'E1', type: 'supported_scale', label: 'Pre-Entry vs. Training-Developed Distinction', text: 'AACP distinguishes between pre-entry career indicators — things that can be meaningfully understood before formal technical training begins — and the capability that technical training itself develops. Does this distinction make sense in the context of your technical workforce environment?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'How would you describe this boundary differently?' },
    { key: 'E2', type: 'relevance_scale', label: 'Capability Indicators (Relevance to Technical Work)', text: 'Looking at this set of capability indicators: which are meaningfully connected to the demands of technical aviation work? Which would be better understood through technical training or workplace performance — and therefore not what you would expect to see in a pre-entry career programme?', scale: SCALE_RELEVANCE, optional_text: 'What is missing? What should not be here?' },
    { key: 'E3', type: 'supported_scale', label: 'Boundary Clarity', text: 'Does AACP make clear that its indicators are career-exploration descriptions — not assessments of technical training readiness, technical competence, or occupational qualification?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What language or framing would need to change?' },
    { key: 'E4', type: 'supported_scale', label: 'Workforce Readiness for Technical Environments', text: 'Does AACP address the preparation dimensions you would consider relevant for someone approaching a technical aviation career? What is missing, and what is present that should not be?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What would you change?' },
    { key: 'E5', type: 'supported_scale', label: 'Claim Proportionality', text: 'Are the conclusions AACP draws from this process proportionate to what it actually assesses — or does AACP claim more than it has established?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What specifically overreaches?' },
    { key: 'E6', type: 'open_text', label: 'Transition into Technical Programmes', text: 'What would make a pre-entry career programme a genuinely useful input to your organisation\'s technical workforce development — either for identifying prospects or for preparing people for technical training? What would you need to see before referencing any career-intelligence programme in a development or selection context?', discovery: true },
    { key: 'E_final1', type: 'open_text', label: 'Final Perspective E-1', text: 'What kinds of capability or tendency are genuinely useful to understand about a person before technical training begins — and which should only be assessed through training or workplace performance?', final: true },
    { key: 'E_final2', type: 'open_text', label: 'Final Perspective E-2', text: 'What, if anything, should AACP stop claiming or make more explicit about its scope and limits?', final: true },
  ],
  F: [
    { key: 'F1', type: 'supported_scale', label: 'Regulatory Boundary Clarity', text: 'Does AACP make sufficiently clear that it is a career and workforce intelligence platform — and not a licensing authority, certification body, accredited training organisation, or system for determining occupational eligibility or regulatory readiness?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What language or framing should be corrected or clarified?' },
    { key: 'F2', type: 'supported_scale', label: 'Pathway Representation — Scope and Accuracy', text: 'Across the aviation and aerospace pathways AACP represents — including Air Traffic Control, Pilot, Aircraft Maintenance, and STEM roles — does AACP represent the nature of these careers and their associated entry, licensing, or certification requirements in a way that is broadly accurate and appropriately framed for a career-exploration audience?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'Which pathways, if any, contain inaccurate or misleading information? What should change?' },
    { key: 'F3', type: 'supported_scale', label: 'Claim Proportionality and Suitability Boundaries', text: 'Does AACP avoid making unsupported claims about occupational suitability, licensing eligibility, employability, regulatory readiness, or the likelihood of success in regulated aviation roles? Are the conclusions AACP draws proportionate to what it actually assesses?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What specifically overreaches or should be qualified differently?' },
    { key: 'F4', type: 'supported_scale', label: 'Referrals and Next-Step Pathway Representation', text: 'Where AACP directs participants toward next steps — including education and training organisations, ATOs, FTUs, employers, or regulatory bodies — are those referrals represented responsibly and without implying endorsement, guarantee, or regulatory validation?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What should be corrected or qualified in how AACP represents next-step pathways?' },
    { key: 'F5', type: 'open_text', label: 'Public-Interest and Governance Concerns', text: 'From a public-authority or regulatory perspective, are there terminology, representation, governance, or public-interest concerns that Noble should address before deploying AACP more broadly? This may include concerns about how AACP positions itself relative to regulated systems, how pathway information could be misread by participants, or how the programme boundaries are communicated to the public.', discovery: true },
    { key: 'F_final1', type: 'open_text', label: 'Final Perspective F-1', text: 'What, if anything, should AACP clarify, correct, or stop claiming — in terms of its relationship to regulated aviation and aerospace systems, licensing processes, or occupational qualification — before broader public deployment?', final: true },
    { key: 'F_final2', type: 'open_text', label: 'Final Perspective F-2', text: 'From your regulatory or public-authority vantage point, does AACP\'s overall career and workforce intelligence model appear credible and appropriately scoped? What concerns, if any, should Noble prioritise before AACP is presented to a wider aviation and aerospace audience?', final: true },
  ],
};
