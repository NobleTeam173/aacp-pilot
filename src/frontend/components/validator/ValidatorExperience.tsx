import { useEffect, useState } from 'react';
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
type Phase = 'loading' | 'error' | 'already_submitted' | 'welcome' | 'experience' | 'questions' | 'submitted';

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
  profileChip: (pathway: string) => {
    const colors: Record<string, [string,string]> = { ATC: [C.blueBg, C.blue], PILOT: [C.greenBg, C.green], AME_AMT: [C.amberBg, C.amber], STEM: ['#f3f4f6', C.slate] };
    const [bg, fg] = colors[pathway] ?? ['#f3f4f6', C.slate];
    return { background: bg, color: fg, padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, display: 'inline-block' } as React.CSSProperties;
  },
  tag: (color: string, bg: string) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, color, background: bg } as React.CSSProperties),
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

function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <div style={{ ...S.card, marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: C.white, marginBottom: 2 }}>{profile.name}</div>
          <div style={{ fontSize: '0.8rem', color: C.grey }}>{profile.age} · {profile.location}</div>
        </div>
        <span style={S.profileChip(profile.pathway)}>{profile.pathway.replace('_', '/')}</span>
      </div>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: C.grey }}>
        <div><strong>Education:</strong> {profile.education}</div>
        <div><strong>Background:</strong> {profile.work_history}</div>
        <div><strong>AACP Status:</strong> {profile.aacp_status}</div>
      </div>
      {profile.career_direction && (
        <div style={{ ...S.notice(C.grey, C.bgDeep, C.borderLight), marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: C.white, marginBottom: 4 }}>Career Direction: {profile.career_direction}</div>
          <div style={{ fontSize: '0.825rem', color: C.grey }}>{profile.career_direction_narrative}</div>
        </div>
      )}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ ...S.sub, fontWeight: 600, marginBottom: 6 }}>Capability Indicators (Career Exploration)</div>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          {profile.capability_indicators.map((ci, i) => (
            <li key={i} style={{ fontSize: '0.825rem', color: C.grey, marginBottom: 3 }}>{ci}</li>
          ))}
        </ul>
      </div>
      <div style={{ ...S.notice(C.grey, '#fef9f9', C.redBorder) }}>
        <div style={{ fontWeight: 600, fontSize: '0.78rem', color: C.red, marginBottom: 4 }}>AACP Does Not Establish:</div>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          {profile.aacp_does_not_establish.map((d, i) => (
            <li key={i} style={{ fontSize: '0.8rem', color: C.grey, marginBottom: 2 }}>{d}</li>
          ))}
        </ul>
        {profile.realistic_note && <div style={{ marginTop: 6, fontSize: '0.78rem', fontStyle: 'italic', color: C.grey }}>{profile.realistic_note}</div>}
      </div>
    </div>
  );
}

function CaptainAciaPanel({ token, config }: { token: string; config: NonNullable<ExperienceData['captain_acia']> }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const r = await fetch(`/validate/${token}/captain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await r.json() as { reply?: string; error?: string };
      setMessages(prev => [...prev, { role: 'captain', text: data.reply ?? data.error ?? 'No response.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'captain', text: 'Unable to reach Captain ACIA. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.crimson, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>CA</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: C.white }}>Captain ACIA — Validator Experience Mode</div>
          <div style={{ fontSize: '0.75rem', color: C.greyD }}>Fictional participant: {config.fictional_participant} · Sandbox mode</div>
        </div>
      </div>
      <div style={{ ...S.notice(C.grey, C.bgDeep, C.borderLight), fontSize: '0.78rem' }}>{config.sandbox_notice}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 80, maxHeight: 280, overflowY: 'auto', marginBottom: '0.75rem', padding: '0.5rem 0' }}>
        {messages.length === 0 && (
          <div style={{ color: C.greyD, fontSize: '0.825rem' }}>
            <div style={{ marginBottom: '0.5rem' }}>Suggested questions:</div>
            {config.suggested_prompts.slice(0, 3).map((p, i) => (
              <div key={i} onClick={() => send(p)} style={{ cursor: 'pointer', color: C.crimson, fontSize: '0.8rem', marginBottom: 4, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>{p}</div>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={S.chatBubble(m.role)}>{m.text}</div>
          </div>
        ))}
        {loading && <div style={{ color: C.greyD, fontSize: '0.8rem', fontStyle: 'italic' }}>Captain ACIA is thinking…</div>}
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
  );
}

function SandboxSignalPanel({ token }: { token: string }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendSignal() {
    setLoading(true);
    try {
      await fetch(`/validate/${token}/sandbox-signal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_type: 'IPS_INTEREST', payload: { context: 'validator_exploration', note: 'Potential industry placement signal — sandbox only.' } }),
      });
      setSent(true);
    } catch { /* silent */ } finally { setLoading(false); }
  }

  return (
    <div style={{ ...S.card, borderLeft: `3px solid ${C.amber}` }}>
      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.white, marginBottom: '0.5rem' }}>Industry Placement Signal — Sandbox</div>
      <p style={{ ...S.p, marginBottom: '0.75rem', fontSize: '0.825rem' }}>
        This panel simulates how an industry partner signal would be recorded. Signals submitted here are written only to the validation sandbox — no production records are affected.
      </p>
      {sent ? (
        <div style={{ ...S.tag(C.green, C.greenBg), fontSize: '0.825rem', padding: '4px 12px' }}>✓ Sandbox signal recorded</div>
      ) : (
        <button onClick={sendSignal} disabled={loading} style={{ ...S.btn('secondary'), fontSize: '0.825rem', padding: '0.4rem 1rem', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Recording…' : 'Submit industry interest signal (sandbox)'}
        </button>
      )}
    </div>
  );
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

function QuestionBlock({ q, value, condValue, onChange, onCondChange }: {
  q: Question;
  value: string;
  condValue: string;
  onChange: (v: string) => void;
  onCondChange: (v: string) => void;
}) {
  const isCond = (q.conditional_values ?? COND_TRIGGER).includes(value);

  return (
    <div style={{ marginBottom: '1.75rem' }}>
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
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Your response…"
          style={S.textarea}
        />
      )}

      {/* Conditional follow-up for scale questions */}
      {isCond && q.conditional_text && (
        <div style={{ marginTop: '0.75rem' }}>
          <label style={S.label}>{q.conditional_text}</label>
          <textarea value={condValue} onChange={e => onCondChange(e.target.value)} placeholder="Please describe…" style={S.textarea} />
        </div>
      )}

      {/* Optional text for relevance_scale */}
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
  const [expSection, setExpSection] = useState(0);

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

  async function handleStart() {
    if (!session) return;
    // Fetch experience data
    try {
      const r = await fetch(`/validate/${token}/experience`, { headers: { Accept: 'application/json' } });
      if (r.ok) {
        const exp = await r.json() as ExperienceData;
        setExperience(exp);
      }
    } catch { /* start anyway */ }
    // POST start
    await fetch(`/validate/${token}/start`, { method: 'POST' }).catch(() => {});
    setPhase('experience');
  }

  async function handleBeginQuestions() {
    if (!session) return;
    // Derive questions from instrument
    const instrQuestions = INSTRUMENT_QUESTIONS[session.instrument] ?? [];
    setQuestions(instrQuestions);
    setPhase('questions');
  }

  async function handleSubmit() {
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

  // ── Render ────────────────────────────────────────────────────────────────

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

  const phaseIndex = { welcome: 0, experience: 1, questions: 2, submitted: 3 }[phase] ?? 0;

  // Experience sections for GUIDED
  const expSections = ['Overview', 'Profiles', 'Captain ACIA', 'Industry Signal'];
  const hasCapAcia = experience?.captain_acia != null;

  return (
    <div style={S.shell}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.brand}>AACP™</span>
        {session && <span style={S.instrBadge}>{instrumentLabel}</span>}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8' }}>Validator Experience</span>
      </div>

      <div style={S.container}>
        {/* Progress */}
        {phase !== 'submitted' && (
          <div style={S.progress}>
            {['Welcome', experience?.experience_mode === 'STATIC' ? 'Orientation' : 'Platform Experience', 'Validation'].map((label, i) => (
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
                <span style={{ fontSize: '0.7rem', color: C.greyD, letterSpacing: '0.08em', textTransform: 'uppercase' as const, fontWeight: 600 }}>
                  {session.instrument_title}
                </span>
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

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={handleStart}
                disabled={isLevel2 && !level2Ack}
                style={{ ...S.btn('primary'), opacity: (isLevel2 && !level2Ack) ? 0.4 : 1 }}
              >
                Begin Validation Experience →
              </button>
            </div>
          </>
        )}

        {/* ── EXPERIENCE ── */}
        {phase === 'experience' && experience && (
          <>
            <DisclosureBanner label={experience.representative_data_label ?? 'Representative Data — This view uses fictional data to demonstrate how AACP workforce intelligence is presented. No real participant information is displayed.'} />

            {isGuided ? (
              <>
                {/* Section tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' as const }}>
                  {expSections.filter((_, i) => i < (hasCapAcia ? 4 : 3)).map((sec, i) => (
                    <button key={sec} onClick={() => setExpSection(i)} style={{
                      padding: '0.4rem 0.875rem', borderRadius: 6, border: `1px solid ${expSection === i ? C.crimson : C.border}`,
                      background: expSection === i ? '#fdf2f2' : C.bgCard, color: expSection === i ? C.crimson : C.grey,
                      fontWeight: expSection === i ? 600 : 400, fontSize: '0.825rem', cursor: 'pointer',
                    }}>{sec}</button>
                  ))}
                </div>

                {/* Section: Overview */}
                {expSection === 0 && (
                  <>
                    <div style={S.card}>
                      <h2 style={S.h2}>AACP Workforce Intelligence — Validator View</h2>
                      <p style={{ ...S.p, marginBottom: '0.75rem' }}>
                        You are viewing a representative demonstration of AACP's workforce intelligence platform. All data below is fictional and has been constructed solely for this validation activity.
                      </p>
                      {experience.cohort_summary && (
                        <>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.white, marginBottom: '0.75rem' }}>Cohort Overview ({experience.cohort_summary.total} participants)</div>
                          <div style={{ ...S.grid2, marginBottom: '1rem' }}>
                            {Object.entries(experience.cohort_summary.by_pathway).map(([pathway, count]) => (
                              <div key={pathway} style={{ padding: '0.75rem', background: C.bgDeep, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', color: C.grey }}>{pathway.replace('_', '/')}</span>
                                <span style={{ fontWeight: 700, color: C.white }}>{count}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div style={S.card}>
                      <h2 style={S.h2}>Four Aviation &amp; Aerospace Pathways</h2>
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' }}>
                        {(experience.four_pathways ?? []).map(p => (
                          <div key={p.code} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.75rem', background: C.bgDeep, borderRadius: 8 }}>
                            <span style={{ ...S.profileChip(p.code), flexShrink: 0 }}>{p.code}</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.white, marginBottom: 2 }}>{p.label}</div>
                              <div style={{ fontSize: '0.8rem', color: C.grey }}>{p.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {experience.provenance && (
                        <div style={{ ...S.notice(C.grey, C.bgDeep, C.borderLight), marginTop: '1rem', fontSize: '0.8rem' }}>
                          Provenance: <strong>{experience.provenance.replace('_', ' ')}</strong> — This perspective is aligned with the validator's domain authority.
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Section: Profiles */}
                {expSection === 1 && (
                  <>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.white, marginBottom: '1rem' }}>
                      Representative Participant Profiles
                    </div>
                    {(experience.primary_profile ? [experience.primary_profile, ...(experience.all_profiles ?? []).filter(p => p.id !== experience.primary_profile!.id)] : (experience.all_profiles ?? [])).slice(0, 4).map(p => (
                      <ProfileCard key={p.id} profile={p} />
                    ))}
                  </>
                )}

                {/* Section: Captain ACIA */}
                {expSection === 2 && hasCapAcia && experience.captain_acia && (
                  <CaptainAciaPanel token={token} config={experience.captain_acia} />
                )}
                {expSection === 2 && !hasCapAcia && (
                  <div style={S.card}><p style={S.p}>Captain ACIA is not available for this instrument.</p></div>
                )}

                {/* Section: Industry Signal */}
                {expSection === 3 && <SandboxSignalPanel token={token} />}
              </>
            ) : (
              /* STATIC experience (Instrument F) */
              <div style={S.card}>
                <h2 style={S.h2}>Regulatory Context — Orientation</h2>
                {session?.instrument_opening && (
                  <div style={{ ...S.notice(C.grey, C.bgDeep, C.borderLight), fontStyle: 'italic', marginBottom: '1rem' }}>
                    {session.instrument_opening}
                  </div>
                )}
                <p style={S.p}>
                  You are being asked to review how AACP represents regulated aviation career pathways — specifically the accuracy of regulatory information, terminology, and source references.
                </p>
                <p style={{ ...S.p, marginBottom: 0 }}>
                  This is not a request for approval or endorsement of AACP as a programme. Your technical feedback on pathway accuracy and regulatory boundary language is what is being sought.
                </p>
              </div>
            )}

            <hr style={S.divider} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleBeginQuestions} style={S.btn('primary')}>
                Proceed to Validation Questions →
              </button>
            </div>
          </>
        )}

        {/* ── QUESTIONS ── */}
        {phase === 'questions' && (
          <>
            <div style={S.card}>
              <h2 style={S.h2}>Validation Questions — Instrument {session?.instrument}</h2>
              <p style={{ ...S.p, marginBottom: 0, fontSize: '0.825rem' }}>
                Please respond to each question based on what you have seen. Your perspective will be used to assess and improve AACP's accuracy, credibility, and claim boundaries.
              </p>
            </div>

            {/* Main questions */}
            {questions.filter(q => !q.final).map(q => (
              <div key={q.key} style={S.card}>
                <QuestionBlock
                  q={q}
                  value={responses[q.key] ?? ''}
                  condValue={responses[q.key + '_change'] ?? ''}
                  onChange={v => setResponse(q.key, v)}
                  onCondChange={v => setResponse(q.key + '_change', v)}
                />
              </div>
            ))}

            {/* Final perspective */}
            {questions.filter(q => q.final).length > 0 && (
              <>
                <div style={{ ...S.notice(C.grey, C.bgDeep, C.borderLight), padding: '0.875rem 1.25rem', fontWeight: 600, fontSize: '0.875rem' }}>
                  Final Perspective
                </div>
                {questions.filter(q => q.final).map(q => (
                  <div key={q.key} style={S.card}>
                    <QuestionBlock
                      q={q}
                      value={responses[q.key] ?? ''}
                      condValue={responses[q.key + '_change'] ?? ''}
                      onChange={v => setResponse(q.key, v)}
                      onCondChange={v => setResponse(q.key + '_change', v)}
                    />
                  </div>
                ))}
              </>
            )}

            {/* Level 2 re-acknowledgement */}
            {isLevel2 && (
              <div style={{ ...S.card, borderLeft: `3px solid ${C.crimson}`, marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', cursor: 'pointer', fontSize: '0.875rem', color: C.white }}>
                  <input type="checkbox" checked={level2Ack} onChange={e => setLevel2Ack(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
                  I confirm that I have handled all materials in accordance with the Level 2 confidentiality notice, and that my responses may be used by AACP for programme development and validation purposes.
                </label>
              </div>
            )}

            {submitError && (
              <div style={{ ...S.notice(C.red, C.redBg, C.redBorder), marginBottom: '1rem' }}>{submitError}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleSubmit}
                disabled={submitting || (isLevel2 && !level2Ack)}
                style={{ ...S.btn('primary'), opacity: (submitting || (isLevel2 && !level2Ack)) ? 0.5 : 1 }}
              >
                {submitting ? 'Submitting…' : 'Submit Validation →'}
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
              Your contribution supports the continued development of AACP as a rigorous, evidence-based credential. Your responses have been recorded and will be reviewed by the AACP team.
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

// ── Instrument questions (client-side copy for rendering) ─────────────────────
// Matches the server-side VALIDATION_INSTRUMENTS constants exactly.
// Only keys, types, labels, texts, and scale configurations are used by the frontend.

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
    { key: 'F1', type: 'supported_scale', label: 'Regulatory Pathway Accuracy', text: 'Does AACP accurately represent the regulatory requirements, timeline, and process for obtaining an AME licence in Canada — specifically the information a prospective entrant would need to know when beginning to investigate this pathway?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What is inaccurate or missing?' },
    { key: 'F2', type: 'supported_scale', label: 'Terminology and Boundary', text: 'Does AACP use terminology that appropriately distinguishes between regulated licensing or certification on one hand, and career-awareness or exploration activities on the other?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What terminology should be corrected?' },
    { key: 'F3', type: 'supported_scale', label: 'Authoritative Sources', text: 'Are the sources AACP points participants toward for regulatory pathway information appropriate and accurate? Are there additional authoritative sources, published guidance, or regulatory documents that AACP should reference?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'Please list sources or documents you would recommend.' },
    { key: 'F4', type: 'supported_scale', label: 'Programme Scope Clarity', text: 'From what you have seen, is it clear that AACP is a career-exploration programme — and not a certification body, licensing system, or occupational-competence-determination system?', scale: SCALE_SUPPORTED, conditional_values: COND_TRIGGER, conditional_text: 'What would need to be clarified?' },
    { key: 'F_final1', type: 'open_text', label: 'Final Perspective F-1', text: 'Is there anything AACP should clarify, correct, or stop claiming in how it represents the AME licensing pathway or regulatory process to people who are exploring aviation careers?', final: true },
  ],
};
