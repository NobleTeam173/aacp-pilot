import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { request } from '../../services/apiClient';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bgCard: '#1a0d10',
  bg: '#0f0a0b',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyD: '#8a9ab0',
  green: '#22c55e',
  greenBg: '#0f1a0f',
  greenBorder: '#1a3a1a',
  amber: '#f59e0b',
  amberBg: '#1a1400',
  amberBorder: '#3a2a00',
  red: '#ef4444',
  redBg: '#1a0505',
  redBorder: '#3a0505',
  blue: '#60a5fa',
  blueBg: '#0a1020',
  blueBorder: '#1a2a4a',
};

const COMPETENCY_KEYS = ['SR','MR','AP','PS','SO','DM','WM','MT','CM','PR','SA','AL','AK'] as const;
const COMPETENCY_LABELS: Record<string,string> = {
  SR:'Spatial Reasoning', MR:'Mechanical Reasoning', AP:'Attention & Precision',
  PS:'Problem Solving', SO:'Safety Orientation', DM:'Decision Making',
  WM:'Working Memory', MT:'Multitasking & Prioritization', CM:'Communication',
  PR:'Procedural Reasoning', SA:'Situational Awareness', AL:'Adaptive Learning',
  AK:'Aviation Knowledge',
};

const PATHWAY_LABELS: Record<string, string> = {
  pilot: 'Pilot', ame: 'AME', amt: 'Aircraft Maintenance Technician',
  atc: 'Air Traffic Control', aerospace: 'Aerospace Engineering',
};

const FIT_STYLE: Record<string, { color: string; label: string }> = {
  strong:   { color: C.green, label: 'Strong Alignment' },
  good:     { color: '#86efac', label: 'Good Alignment' },
  possible: { color: C.grey,  label: 'Possible' },
};

type EmpTab = 'overview' | 'requirements' | 'submissions' | 'pipeline' | 'sector';

// ── Shared helpers ────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('aacp_access_token');
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((opts?.headers as Record<string,string>) ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Request failed');
  return data as T;
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: ok ? C.greenBg : C.redBg,
      border: `1px solid ${ok ? C.greenBorder : C.redBorder}`,
      color: ok ? C.green : C.red,
      borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 600,
    }}>{ok ? 'Confirmed  ' : 'Error  '}{msg}</div>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '10px 18px', fontSize: 13, fontWeight: 700,
    color: active ? '#0f172a' : '#64748b',
    borderBottom: `2px solid ${active ? C.crimson : 'transparent'}`,
    marginBottom: -1, transition: 'color 0.15s, border-color 0.15s',
    whiteSpace: 'nowrap' as const,
    letterSpacing: 0.2,
  };
}

const statusBadgeStyle = (status: string): React.CSSProperties => {
  const map: Record<string, { color: string; bg: string; border: string }> = {
    validated:            { color: C.green, bg: C.greenBg, border: C.greenBorder },
    new:                  { color: C.blue,  bg: C.blueBg,  border: C.blueBorder  },
    under_review:         { color: C.amber, bg: C.amberBg, border: C.amberBorder },
    needs_clarification:  { color: C.amber, bg: C.amberBg, border: C.amberBorder },
    archived:             { color: C.grey,  bg: '#111',    border: '#333'         },
  };
  const s = map[status] ?? map.new;
  return { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
    color: s.color, background: s.bg, border: `1px solid ${s.border}`, display: 'inline-block' };
};

const statusLabel = (s: string) => ({
  validated: 'Validated', new: 'Awaiting Review', under_review: 'Under Review',
  needs_clarification: 'Clarification Required', archived: 'Archived',
}[s] ?? s);

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Alignment {
  pathwayId: string; label: string; fit: 'strong' | 'good' | 'possible'; highlights: string[];
}
interface Completer {
  userId: string; name: string; email: string; cohort: string;
  programCompletedAt: string; topPathway: string | null;
  pathwayAlignments: Alignment[]; validatedCompetencies: string[]; aciaCompleted: boolean;
}
interface PipelineData {
  completers: Completer[]; totalCompleters: number; pathwayBreakdown: Record<string, number>;
}
interface EmpSignal {
  id: string; occupation: string | null; role_title: string | null; competency: string;
  skill: string | null; importance_level: string; future_demand: string;
  emerging_requirement: number; validation_status: string; created_at: string;
}
interface SectorSignal {
  competency: string; label: string; demandLevel: string; trend: string;
  evidenceLevel: string; signalCount: number; contributingEmployers: number;
}

// ── Operations Overview Tab ───────────────────────────────────────────────────

function OverviewTab({ onNavigate }: { onNavigate: (tab: EmpTab) => void }) {
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [signals, setSignals] = useState<EmpSignal[]>([]);
  const [sector, setSector] = useState<SectorSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      request<PipelineData>('/dashboard/employer').catch(() => null),
      apiFetch<{ signals: EmpSignal[] }>('/employer/signals').catch(() => ({ signals: [] })),
      apiFetch<{ signals: SectorSignal[] }>('/connector/intelligence').catch(() => ({ signals: [] })),
    ]).then(([p, s, i]) => {
      setPipeline(p);
      setSignals(s.signals);
      setSector(i.signals.slice(0, 5));
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: C.grey, padding: 40, textAlign: 'center' }}>Loading overview…</div>;

  const validated = signals.filter(s => s.validation_status === 'validated').length;
  const pending   = signals.filter(s => s.validation_status === 'new').length;
  const emerging  = signals.filter(s => s.emerging_requirement === 1).length;

  const demandColor = (d: string) => d === 'high' ? C.red : d === 'growing' ? C.amber : d === 'moderate' ? C.blue : C.grey;

  return (
    <div>
      {/* Primary KPIs */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 12 }}>
          Your Signal Activity
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
          {[
            { label: 'Signals Submitted', value: signals.length, accent: undefined },
            { label: 'Validated',          value: validated,       accent: validated > 0 ? C.green : undefined },
            { label: 'Awaiting Review',    value: pending,         accent: pending > 0 ? C.amber : undefined },
            { label: 'Emerging Flagged',   value: emerging,        accent: emerging > 0 ? C.red : undefined },
            { label: 'Talent Pipeline',     value: pipeline?.totalCompleters ?? 0, accent: undefined },
          ].map(m => (
            <div key={m.label} style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderTop: m.accent ? `3px solid ${m.accent}` : `1px solid ${C.border}`,
              borderRadius: 14,
              padding: '18px 20px',
            }}>
              <div style={{ color: m.accent ?? C.white, fontSize: 30, fontWeight: 800, fontFamily: 'Fraunces, serif', lineHeight: 1 }}>{m.value}</div>
              <div style={{ color: C.greyD, fontSize: 11, marginTop: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sector intelligence preview */}
      {sector.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ color: C.white, fontSize: 14, fontWeight: 700, margin: 0, letterSpacing: 0.2 }}>
              Sector Intelligence — Top Competency Demand
            </h3>
            <button onClick={() => onNavigate('sector')} style={{ background: 'none', border: 'none', color: C.crimson, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              View sector overview
            </button>
          </div>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {sector.map((s, i) => (
              <div key={s.competency} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 18px',
                borderBottom: i < sector.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <div>
                  <span style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>{s.competency}</span>
                  <span style={{ color: C.grey, fontSize: 12, marginLeft: 10 }}>{s.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <span style={{ color: demandColor(s.demandLevel), fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>{s.demandLevel}</span>
                  <span style={{ color: s.trend === 'increasing' ? C.green : s.trend === 'decreasing' ? C.red : C.grey, fontSize: 12 }}>
                    {s.trend === 'increasing' ? '&#8593;' : s.trend === 'decreasing' ? '&#8595;' : '&#8594;'} {s.trend}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p style={{ color: C.grey, fontSize: 11, margin: '8px 0 0', fontStyle: 'italic' }}>
            Aggregated from validated employer signals across AACP partner organisations. No individual employer is identified.
          </p>
        </div>
      )}

      {/* Navigation links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {([
          { title: 'Submit Workforce Signal', desc: 'Contribute workforce intelligence signals', tab: 'requirements' },
          { title: 'My Signals', desc: `${signals.length} signal${signals.length !== 1 ? 's' : ''} submitted`, tab: 'submissions' },
          { title: 'Talent Pipeline', desc: `${pipeline?.totalCompleters ?? 0} AACP programme completers`, tab: 'pipeline' },
          { title: 'Industry Intelligence', desc: 'Aggregated aviation and aerospace intelligence', tab: 'sector' },
        ] as { title: string; desc: string; tab: EmpTab }[]).map(a => (
          <button
            key={a.tab}
            onClick={() => onNavigate(a.tab)}
            style={{
              background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
              padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 0.15s', fontFamily: 'DM Sans, sans-serif',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.crimson; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
          >
            <div style={{ color: C.white, fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{a.title}</div>
            <div style={{ color: C.grey, fontSize: 12 }}>{a.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Operational Requirements Tab ─────────────────────────────────────────────

const BLANK_SIGNAL = {
  employer_name: '',
  industry_subsector: '',
  region: '',
  occupation: '',
  role_title: '',
  competency: 'SR' as string,
  skill: '',
  importance_level: 'medium',
  proficiency_expectation: 'intermediate',
  hiring_difficulty: '',
  skills_gap: '',
  emerging_requirement: false,
  certification_required: '',
  workforce_readiness_expectation: '',
  future_demand: 'stable',
};

function OperationalRequirementsTab() {
  const savedName = localStorage.getItem('aacp_employer_name') ?? '';
  const [form, setForm] = useState({ ...BLANK_SIGNAL, employer_name: savedName });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [recentCount, setRecentCount] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ signals: EmpSignal[] }>('/employer/signals')
      .then(r => setRecentCount(r.signals.length))
      .catch(() => {});
  }, []);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  }

  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employer_name || !form.competency) return;
    if (form.employer_name) localStorage.setItem('aacp_employer_name', form.employer_name);
    setSubmitting(true);
    try {
      await apiFetch('/employer/signals', {
        method: 'POST',
        body: JSON.stringify({ ...form, emerging_requirement: form.emerging_requirement ? 1 : 0 }),
      });
      showToast('Signal submitted. AACP will review and validate before incorporating into sector intelligence.');
      setForm(p => ({ ...BLANK_SIGNAL, employer_name: p.employer_name }));
      setRecentCount(n => (n ?? 0) + 1);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Submission failed', false);
    } finally {
      setSubmitting(false);
    }
  }

  const inp: React.CSSProperties = {
    background: C.bg, border: `1px solid ${C.border}`, color: C.white,
    borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = { fontSize: 12, color: C.grey, display: 'block', marginBottom: 4, fontWeight: 600, letterSpacing: 0.2 };

  return (
    <div>
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 22px', marginBottom: 24 }}>
        <div style={{ color: C.white, fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
          Workforce Intelligence Contribution
        </div>
        <p style={{ color: C.grey, fontSize: 13, margin: '0 0 6px', lineHeight: 1.55 }}>
          Submit structured signals describing your organisation's competency requirements. AACP translates validated signals
          into post-secondary curriculum and participant development intelligence.
        </p>
        <p style={{ color: C.grey, fontSize: 12, margin: 0, fontStyle: 'italic' }}>
          Submissions are reviewed by AACP before contributing to aggregated sector intelligence. Your organisation is not
          individually identified in published intelligence.
        </p>
        {recentCount !== null && recentCount > 0 && (
          <div style={{ marginTop: 12, color: C.blue, fontSize: 12, fontWeight: 600 }}>
            {recentCount} signal{recentCount !== 1 ? 's' : ''} submitted from your organisation
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

        <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <legend style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, padding: '0 8px' }}>
            Organisation
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginTop: 10 }}>
            <div>
              <label style={lbl}>Organisation Name *</label>
              <input required value={form.employer_name} onChange={e => set('employer_name', e.target.value)}
                style={inp} placeholder="e.g. WestJet Airlines" />
            </div>
            <div>
              <label style={lbl}>Aviation Sector</label>
              <select value={form.industry_subsector} onChange={e => set('industry_subsector', e.target.value)} style={inp}>
                <option value="">Select sector…</option>
                <option>Commercial Aviation</option>
                <option>General Aviation</option>
                <option>Aircraft Maintenance</option>
                <option>Air Traffic Management</option>
                <option>Aerospace Manufacturing</option>
                <option>Defence Aviation</option>
                <option>UAV Operations</option>
                <option>Airport Operations</option>
                <option>Aviation Education and Training</option>
                <option>Space and Launch</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Region</label>
              <select value={form.region} onChange={e => set('region', e.target.value)} style={inp}>
                <option value="">Select region…</option>
                <option>British Columbia</option>
                <option>Alberta</option>
                <option>Saskatchewan</option>
                <option>Manitoba</option>
                <option>Ontario</option>
                <option>Quebec</option>
                <option>Atlantic Canada</option>
                <option>Northern Canada</option>
                <option>National</option>
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <legend style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, padding: '0 8px' }}>
            Occupation and Role
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginTop: 10 }}>
            <div>
              <label style={lbl}>Occupation</label>
              <select value={form.occupation} onChange={e => set('occupation', e.target.value)} style={inp}>
                <option value="">Select occupation…</option>
                <option>Commercial Pilot</option>
                <option>Aircraft Maintenance Engineer (AME)</option>
                <option>Aircraft Maintenance Technician (AMT)</option>
                <option>Air Traffic Controller</option>
                <option>Flight Dispatcher</option>
                <option>Aerospace Engineer</option>
                <option>Avionics Technician</option>
                <option>UAV Operator</option>
                <option>Airport Operations Officer</option>
                <option>Flight Instructor</option>
                <option>Cabin Crew</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Role Title</label>
              <input value={form.role_title} onChange={e => set('role_title', e.target.value)}
                style={inp} placeholder="e.g. Senior AME — Line Maintenance" />
            </div>
            <div>
              <label style={lbl}>Personnel Availability</label>
              <select value={form.hiring_difficulty} onChange={e => set('hiring_difficulty', e.target.value)} style={inp}>
                <option value="">Select…</option>
                <option value="critical_shortage">Critical Shortage</option>
                <option value="moderate_shortage">Moderate Shortage</option>
                <option value="some_difficulty">Some Difficulty</option>
                <option value="adequate_supply">Adequate Supply</option>
                <option value="surplus">Surplus</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Readiness Expectation on Hire</label>
              <select value={form.workforce_readiness_expectation} onChange={e => set('workforce_readiness_expectation', e.target.value)} style={inp}>
                <option value="">Select…</option>
                <option value="entry_ready">Entry Ready</option>
                <option value="some_experience_required">Some Experience Required</option>
                <option value="significant_experience_required">Significant Experience Required</option>
                <option value="internal_training_provided">Internal Training Provided</option>
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <legend style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, padding: '0 8px' }}>
            Competency Signal
          </legend>
          <p style={{ color: C.grey, fontSize: 12, margin: '8px 0 16px', lineHeight: 1.5 }}>
            Submit one signal per competency. Submit multiple forms to cover all relevant competencies for this occupation.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={lbl}>AACP Competency *</label>
              <select required value={form.competency} onChange={e => set('competency', e.target.value)} style={inp}>
                {COMPETENCY_KEYS.map(k => (
                  <option key={k} value={k}>{k} — {COMPETENCY_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Specific Skill or Capability</label>
              <input value={form.skill} onChange={e => set('skill', e.target.value)}
                style={inp} placeholder="e.g. Digital Systems Troubleshooting" />
            </div>
            <div>
              <label style={lbl}>Operational Importance</label>
              <select value={form.importance_level} onChange={e => set('importance_level', e.target.value)} style={inp}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Required Proficiency Level</label>
              <select value={form.proficiency_expectation} onChange={e => set('proficiency_expectation', e.target.value)} style={inp}>
                <option value="expert">Expert</option>
                <option value="advanced">Advanced</option>
                <option value="intermediate">Intermediate</option>
                <option value="foundational">Foundational</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Future Requirement Trend</label>
              <select value={form.future_demand} onChange={e => set('future_demand', e.target.value)} style={inp}>
                <option value="increasing">Increasing</option>
                <option value="stable">Stable</option>
                <option value="decreasing">Decreasing</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Licensing or Certification Required</label>
              <input value={form.certification_required} onChange={e => set('certification_required', e.target.value)}
                style={inp} placeholder="e.g. Transport Canada AME Licence M1" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Competency Gap Description</label>
              <textarea value={form.skills_gap} onChange={e => set('skills_gap', e.target.value)}
                rows={2} style={{ ...inp, resize: 'vertical' }}
                placeholder="Describe the gap you observe in available personnel for this competency…" />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="emerging_req" checked={form.emerging_requirement}
                onChange={e => set('emerging_requirement', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: C.crimson, cursor: 'pointer' }} />
              <label htmlFor="emerging_req" style={{ ...lbl, marginBottom: 0, cursor: 'pointer', fontWeight: 400 }}>
                Flag as emerging requirement — this competency is increasing in importance and may not yet be widely available in the candidate pool
              </label>
            </div>
          </div>
        </fieldset>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit"
            disabled={submitting || !form.employer_name || !form.competency}
            style={{
              background: (form.employer_name && form.competency) ? C.crimson : '#2a1218',
              color: C.white, border: 'none', borderRadius: 10,
              padding: '11px 30px', fontSize: 14, fontWeight: 700,
              cursor: (form.employer_name && form.competency) ? 'pointer' : 'not-allowed',
              letterSpacing: 0.3,
            }}
          >{submitting ? 'Submitting…' : 'Submit Signal'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Signal Submissions Tab ────────────────────────────────────────────────────

function SignalSubmissionsTab() {
  const [signals, setSignals] = useState<EmpSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ signals: EmpSignal[] }>('/employer/signals')
      .then(r => setSignals(r.signals))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: C.grey, padding: 24 }}>Loading submissions…</div>;
  if (error)   return <div style={{ color: C.red, padding: 24 }}>{error}</div>;

  const counts = {
    validated: signals.filter(s => s.validation_status === 'validated').length,
    pending:   signals.filter(s => s.validation_status === 'new').length,
    review:    signals.filter(s => ['under_review','needs_clarification'].includes(s.validation_status)).length,
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Submitted', value: signals.length,  color: C.white },
          { label: 'Validated',       value: counts.validated, color: C.green },
          { label: 'Awaiting Review', value: counts.pending,   color: C.blue  },
          { label: 'Under Review',    value: counts.review,    color: C.amber },
        ].map(c => (
          <div key={c.label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 20px', textAlign: 'center' }}>
            <div style={{ color: c.color, fontSize: 24, fontWeight: 800, fontFamily: 'Fraunces, serif' }}>{c.value}</div>
            <div style={{ color: C.grey, fontSize: 11, marginTop: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {signals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16 }}>
          <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 10px' }}>No Signals Submitted</h3>
          <p style={{ color: C.grey, fontSize: 13, margin: 0 }}>
            Use the Submit Workforce Signal tab to submit your first workforce intelligence signal.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Competency','Occupation','Role Title','Importance','Trend','Emerging','Status','Submitted'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 14px', color: C.grey, fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.map(s => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontWeight: 700, color: C.white }}>{s.competency}</span>
                    <span style={{ color: C.grey, fontSize: 11, display: 'block' }}>{COMPETENCY_LABELS[s.competency] ?? s.competency}</span>
                    {s.skill && <span style={{ color: C.grey, fontSize: 11, display: 'block' }}>{s.skill}</span>}
                  </td>
                  <td style={{ padding: '11px 14px', color: C.grey }}>{s.occupation ?? '—'}</td>
                  <td style={{ padding: '11px 14px', color: C.grey }}>{s.role_title ?? '—'}</td>
                  <td style={{ padding: '11px 14px', color: C.white, textTransform: 'capitalize' }}>{s.importance_level}</td>
                  <td style={{ padding: '11px 14px', color: C.grey, textTransform: 'capitalize' }}>{s.future_demand}</td>
                  <td style={{ padding: '11px 14px' }}>
                    {s.emerging_requirement === 1
                      ? <span style={{ color: C.red, fontWeight: 700, fontSize: 12 }}>Yes</span>
                      : <span style={{ color: C.grey, fontSize: 12 }}>No</span>}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={statusBadgeStyle(s.validation_status)}>{statusLabel(s.validation_status)}</span>
                  </td>
                  <td style={{ padding: '11px 14px', color: C.grey, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {s.created_at ? new Date(s.created_at).toLocaleDateString('en-CA') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: C.grey, fontSize: 11, fontStyle: 'italic', marginTop: 16 }}>
        Validated signals contribute to aggregated AACP sector intelligence. Your organisation is not individually identified in published reports.
      </p>
    </div>
  );
}

// ── Sector Overview Tab (employer-facing, aggregated only) ────────────────────

function SectorOverviewTab() {
  const [signals, setSignals] = useState<SectorSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ signals: SectorSignal[] }>('/connector/intelligence')
      .then(r => setSignals(r.signals))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const demandColor = (d: string) => d === 'high' ? C.red : d === 'growing' ? C.amber : d === 'moderate' ? C.blue : C.grey;
  const evidenceColor = (e: string) => e === 'strong' ? C.green : e === 'moderate' ? C.amber : e === 'limited' ? C.blue : C.grey;

  const highDemand  = signals.filter(s => s.demandLevel === 'high');
  const growing     = signals.filter(s => s.demandLevel === 'growing');
  const increasing  = signals.filter(s => s.trend === 'increasing');

  return (
    <div>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 20px', marginBottom: 22 }}>
        <div style={{ color: C.white, fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
          Aviation and Aerospace Sector Intelligence
        </div>
        <p style={{ color: C.grey, fontSize: 13, margin: '0 0 4px', lineHeight: 1.55 }}>
          Derived from validated employer submissions across AACP partner organisations. All data is aggregated.
          Individual organisations are not identified.
        </p>
        <p style={{ color: C.grey, fontSize: 12, margin: 0, fontStyle: 'italic' }}>
          Detailed programme alignment and competency gap analysis is available in the Post-Secondary Intelligence module for registered institutions.
        </p>
      </div>

      {loading ? (
        <div style={{ color: C.grey, padding: 24 }}>Loading sector intelligence…</div>
      ) : error ? (
        <div style={{ color: C.red, padding: 24 }}>{error}</div>
      ) : signals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16 }}>
          <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 10px' }}>Insufficient Evidence</h3>
          <p style={{ color: C.grey, fontSize: 13, margin: 0 }}>
            Aggregated sector intelligence becomes available once sufficient validated signals have been contributed by multiple organisations.
            Use Submit Workforce Signal to submit your workforce intelligence.
          </p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Competencies with Data',  value: signals.length,      color: C.white },
              { label: 'High Demand',              value: highDemand.length,   color: highDemand.length > 0 ? C.red : C.grey },
              { label: 'Growing Demand',           value: growing.length,      color: growing.length > 0 ? C.amber : C.grey },
              { label: 'Increasing Trend',         value: increasing.length,   color: increasing.length > 0 ? C.green : C.grey },
            ].map(m => (
              <div key={m.label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ color: m.color, fontSize: 26, fontWeight: 800, fontFamily: 'Fraunces, serif', lineHeight: 1 }}>{m.value}</div>
                <div style={{ color: C.grey, fontSize: 11, marginTop: 7, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Competency table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Competency','Demand Level','Trend','Evidence Level','Signals','Employers'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '9px 14px', color: C.grey, fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signals.map(s => (
                  <tr key={s.competency} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontWeight: 700, color: C.white }}>{s.competency}</span>
                      <span style={{ color: C.grey, fontSize: 11, display: 'block' }}>{s.label}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ color: demandColor(s.demandLevel), fontWeight: 700, textTransform: 'capitalize' }}>{s.demandLevel}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: s.trend === 'increasing' ? C.green : s.trend === 'decreasing' ? C.red : C.grey, textTransform: 'capitalize' }}>
                      {s.trend}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ color: evidenceColor(s.evidenceLevel), textTransform: 'capitalize' }}>{s.evidenceLevel}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: C.white, fontWeight: 700 }}>{s.signalCount}</td>
                    <td style={{ padding: '11px 14px', color: C.white, fontWeight: 700 }}>{s.contributingEmployers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Crew Pipeline Tab (existing functionality preserved) ──────────────────────

function pipelineChipStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? C.crimson : C.bgCard,
    color: active ? C.white : C.grey,
    border: `1px solid ${active ? C.crimsonD : C.border}`,
    borderRadius: 20, padding: '6px 16px', fontSize: 13,
    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: active ? 700 : 400,
  };
}

function ParticipantCard({ completer, onSelect }: { completer: Completer; onSelect: () => void }) {
  const topAlignment = completer.pathwayAlignments[0];
  const fitStyle = topAlignment ? FIT_STYLE[topAlignment.fit] : null;
  return (
    <button onClick={onSelect} style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16,
      padding: 20, cursor: 'pointer', textAlign: 'left', width: '100%',
      fontFamily: 'DM Sans, sans-serif', transition: 'border-color 0.15s, transform 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = C.crimson; e.currentTarget.style.transform = 'translateY(-2px)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'none'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.white, fontSize: 16, fontWeight: 700, flexShrink: 0,
        }}>{completer.name.charAt(0).toUpperCase()}</div>
        <div>
          <div style={{ color: C.white, fontSize: 15, fontWeight: 600 }}>{completer.name}</div>
          <div style={{ color: C.grey, fontSize: 12 }}>
            Completed {new Date(completer.programCompletedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
      {completer.topPathway && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: '#2d0f1a', borderRadius: 10, padding: '8px 12px' }}>
          <div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{PATHWAY_LABELS[completer.topPathway] ?? completer.topPathway}</div>
            {fitStyle && <div style={{ color: fitStyle.color, fontSize: 11 }}>{fitStyle.label}</div>}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {completer.validatedCompetencies.slice(0, 3).map((comp, i) => (
          <span key={i} style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, color: '#86efac', fontSize: 10, padding: '2px 8px', borderRadius: 4 }}>
            {comp}
          </span>
        ))}
        {completer.validatedCompetencies.length > 3 && (
          <span style={{ color: C.grey, fontSize: 11, alignSelf: 'center' }}>+{completer.validatedCompetencies.length - 3} more</span>
        )}
      </div>
      <div style={{ color: C.crimson, fontSize: 12, fontWeight: 700, marginTop: 14, letterSpacing: 0.2 }}>View profile</div>
    </button>
  );
}

function ParticipantDetail({ completer, onClose }: { completer: Completer; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#12080d', border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, fontSize: 20, fontWeight: 700 }}>
              {completer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: 0, fontSize: '1.2rem' }}>{completer.name}</h2>
              <div style={{ color: C.grey, fontSize: 13, marginTop: 2 }}>{completer.email}</div>
              <div style={{ color: C.grey, fontSize: 12, marginTop: 2 }}>
                Cohort: {completer.cohort} · Completed {new Date(completer.programCompletedAt).toLocaleDateString('en-CA')}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.grey, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>
            Close
          </button>
        </div>
        {completer.aciaCompleted && completer.topPathway && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Career Intelligence Profile — ACIA
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {completer.pathwayAlignments.slice(0, 3).map((a, i) => {
                const fs = FIT_STYLE[a.fit];
                return (
                  <div key={i} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: C.white, fontSize: 14, fontWeight: i === 0 ? 700 : 400 }}>{a.label}</span>
                        <span style={{ background: fs.color + '22', color: fs.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{fs.label}</span>
                      </div>
                      <div style={{ color: C.grey, fontSize: 12, marginTop: 3 }}>{a.highlights.slice(0, 2).join(' · ')}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Programme-Validated Competencies
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completer.validatedCompetencies.map((comp, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: '10px 14px' }}>
                <span style={{ color: C.green, fontSize: 14, flexShrink: 0, fontWeight: 700 }}>+</span>
                <span style={{ color: C.white, fontSize: 13 }}>{comp}</span>
              </div>
            ))}
          </div>
        </div>
        {!completer.aciaCompleted && (
          <div style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 10, padding: '12px 14px', color: C.amber, fontSize: 13 }}>
            This participant has not yet completed the ACIA career intelligence assessment.
          </div>
        )}
      </div>
    </div>
  );
}

function CrewPipelineTab() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Completer | null>(null);
  const [filterPathway, setFilterPathway] = useState<string>('all');

  useEffect(() => {
    request<PipelineData>('/dashboard/employer')
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: C.grey, padding: 40, textAlign: 'center' }}>Loading crew pipeline…</div>;
  if (error)   return <div style={{ color: C.red, padding: 24 }}>{error}</div>;

  const completers = data?.completers ?? [];
  const filtered = filterPathway === 'all' ? completers : completers.filter(c => c.topPathway === filterPathway);
  const pathways = Object.keys(data?.pathwayBreakdown ?? {});

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1a0d10, #2d0f1a)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '22px 28px', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 6px', fontSize: '1.3rem' }}>
            AACP Programme Graduates
          </h2>
          <p style={{ color: C.grey, margin: 0, fontSize: 13 }}>
            Participants who completed the Aviation and Aerospace Competency Programme
          </p>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          {[
            { label: 'Programme Completers', value: data?.totalCompleters ?? 0 },
            { label: 'ACIA Assessed',        value: completers.filter(c => c.aciaCompleted).length },
            { label: 'Pathways',             value: pathways.length },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ color: C.white, fontSize: 30, fontWeight: 800, fontFamily: 'Fraunces, serif' }}>{value}</div>
              <div style={{ color: C.grey, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {pathways.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <button onClick={() => setFilterPathway('all')} style={pipelineChipStyle(filterPathway === 'all')}>
            All Pathways ({data?.totalCompleters ?? 0})
          </button>
          {pathways.map(p => (
            <button key={p} onClick={() => setFilterPathway(p)} style={pipelineChipStyle(filterPathway === p)}>
              {PATHWAY_LABELS[p] ?? p} ({data?.pathwayBreakdown[p]})
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16 }}>
          <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 10px' }}>No Programme Completers</h3>
          <p style={{ color: C.grey, fontSize: 13, lineHeight: 1.6, maxWidth: 420, marginInline: 'auto', margin: 0 }}>
            Participants will appear here once they complete the full AACP programme.
            Completers with ACIA profiles will show their career pathway alignment and validated competencies.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(c => (
            <ParticipantCard key={c.userId} completer={c} onSelect={() => setSelected(c)} />
          ))}
        </div>
      )}

      {selected && <ParticipantDetail completer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

const TABS: { key: EmpTab; label: string }[] = [
  { key: 'overview',      label: 'Overview'                  },
  { key: 'requirements',  label: 'Submit Workforce Signal'   },
  { key: 'submissions',   label: 'My Signals'                },
  { key: 'pipeline',      label: 'Talent Pipeline'           },
  { key: 'sector',        label: 'Industry Intelligence'     },
];

export function EmployerDashboard() {
  const [tab, setTab] = useState<EmpTab>('overview');

  return (
    <DashboardLayout title="Employer Workforce Intelligence">
      <div style={{ marginBottom: 22 }}>
        <p style={{ color: '#475569', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          Turn workforce requirements, competency signals, and talent evidence into actionable aviation workforce intelligence.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', marginBottom: 28, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabBtn(tab === t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview'     && <OverviewTab onNavigate={setTab} />}
      {tab === 'requirements' && <OperationalRequirementsTab />}
      {tab === 'submissions'  && <SignalSubmissionsTab />}
      {tab === 'pipeline'     && <CrewPipelineTab />}
      {tab === 'sector'       && <SectorOverviewTab />}
    </DashboardLayout>
  );
}
