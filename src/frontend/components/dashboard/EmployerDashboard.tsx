import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { request } from '../../services/apiClient';
import { C } from '../../theme';

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
  good:     { color: C.green, label: 'Good Alignment' },
  possible: { color: C.grey,  label: 'Possible' },
};

type EmpTab = 'overview' | 'requirements' | 'submissions' | 'pipeline' | 'sector';

// â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    }}>{msg}</div>
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
    archived:             { color: C.grey,  bg: C.bgDeep,    border: C.border         },
  };
  const s = map[status] ?? map.new;
  return { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
    color: s.color, background: s.bg, border: `1px solid ${s.border}`, display: 'inline-block' };
};

const statusLabel = (s: string) => ({
  validated: 'Validated', new: 'Awaiting Review', under_review: 'Under Review',
  needs_clarification: 'Clarification Required', archived: 'Archived',
}[s] ?? s);

// â”€â”€ Interfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Operations Overview Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  const demandColor  = (d: string) => d === 'high' ? C.red : d === 'growing' ? C.amber : d === 'moderate' ? C.blue : C.grey;
  const demandDotBg  = (d: string) => d === 'high' ? C.redBg : d === 'growing' ? C.amberBg : d === 'moderate' ? C.blueBg : C.bgDeep;
  const trendArrow   = (t: string) => t === 'increasing' ? '↑' : t === 'decreasing' ? '↓' : '→';
  const trendColor   = (t: string) => t === 'increasing' ? C.green : t === 'decreasing' ? C.red : C.grey;

  const pipelineStages = [
    { label: 'Submitted',   value: signals.length,      desc: 'Signals sent to AACP',         color: C.slate },
    { label: 'Validated',   value: validated,           desc: 'Accepted by AACP analysts',    color: validated > 0 ? C.green : C.greyD },
    { label: 'In Sector',   value: sector.length,       desc: 'Contributing to intelligence', color: sector.length > 0 ? C.blue : C.greyD },
    { label: 'Talent Pool', value: pipeline?.totalCompleters ?? 0, desc: 'AACP programme completers', color: C.slate },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Intelligence pipeline */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 18 }}>
          Your Intelligence Pipeline
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          {pipelineStages.map((stage, i) => (
            <div key={stage.label} style={{ display: 'flex', alignItems: 'stretch' }}>
              <div style={{ flex: 1, textAlign: i === 0 ? 'left' : i === pipelineStages.length - 1 ? 'right' : 'center', padding: '0 8px' }}>
                <div style={{ color: stage.color, fontSize: 34, fontWeight: 800, fontFamily: 'Fraunces, serif', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {stage.value}
                </div>
                <div style={{ color: C.white, fontSize: 12, fontWeight: 700, marginTop: 8, marginBottom: 3 }}>{stage.label}</div>
                <div style={{ color: C.greyD, fontSize: 11, lineHeight: 1.4 }}>{stage.desc}</div>
              </div>
              {i < pipelineStages.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 28, color: C.border, fontSize: 18, flexShrink: 0 }}>→</div>
              )}
            </div>
          ))}
        </div>
        {pending > 0 && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 10 }}>
            <span style={{ color: C.amber, fontSize: 12, fontWeight: 600 }}>{pending} signal{pending !== 1 ? 's' : ''} awaiting AACP validation</span>
          </div>
        )}
        {emerging > 0 && (
          <div style={{ marginTop: pending > 0 ? 8 : 16, padding: '10px 14px', background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10 }}>
            <span style={{ color: C.red, fontSize: 12, fontWeight: 600 }}>{emerging} signal{emerging !== 1 ? 's' : ''} flagged as emerging requirement</span>
          </div>
        )}
      </div>

      {/* Sector intelligence */}
      {sector.length > 0 && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 4 }}>Sector Intelligence</div>
              <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>Top Competency Demand</div>
            </div>
            <button onClick={() => onNavigate('sector')} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.crimson, fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 8, padding: '6px 14px' }}>
              View all →
            </button>
          </div>
          <div>
            {sector.map((s, i) => (
              <div key={s.competency} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '13px 22px',
                borderBottom: i < sector.length - 1 ? `1px solid ${C.borderLight}` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ background: demandDotBg(s.demandLevel), border: `1px solid ${demandColor(s.demandLevel)}33`, borderRadius: 8, padding: '3px 8px', minWidth: 32, textAlign: 'center' }}>
                    <span style={{ color: demandColor(s.demandLevel), fontSize: 10, fontWeight: 800, letterSpacing: 0.5 }}>{s.competency}</span>
                  </div>
                  <span style={{ color: C.grey, fontSize: 13 }}>{s.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  <span style={{ color: demandColor(s.demandLevel), fontWeight: 700, fontSize: 12, textTransform: 'capitalize' }}>{s.demandLevel}</span>
                  <span style={{ color: trendColor(s.trend), fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: 'right' }}>
                    {trendArrow(s.trend)} {s.trend}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 22px', background: C.bgDeep, borderTop: `1px solid ${C.border}` }}>
            <p style={{ color: C.greyD, fontSize: 11, margin: 0, fontStyle: 'italic' }}>
              Aggregated from validated employer signals. No individual employer is identified.
            </p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {([
          { title: 'Submit Workforce Signal', desc: 'Contribute workforce intelligence signals', tab: 'requirements' },
          { title: 'My Signals', desc: `${signals.length} signal${signals.length !== 1 ? 's' : ''} submitted`, tab: 'submissions' },
          { title: 'Talent Pipeline', desc: `${pipeline?.totalCompleters ?? 0} AACP programme completers`, tab: 'pipeline' },
          { title: 'Industry Intelligence', desc: 'Aggregated aviation sector data', tab: 'sector' },
        ] as { title: string; desc: string; tab: EmpTab }[]).map(a => (
          <button
            key={a.tab}
            onClick={() => onNavigate(a.tab)}
            style={{
              background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
              padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
              transition: 'box-shadow 0.15s, border-color 0.15s', fontFamily: 'DM Sans, sans-serif',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.crimson; e.currentTarget.style.boxShadow = `0 0 0 3px ${C.crimson}12`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ color: C.white, fontWeight: 700, fontSize: 14, marginBottom: 5 }}>{a.title}</div>
            <div style={{ color: C.grey, fontSize: 12 }}>{a.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// â”€â”€ Operational Requirements Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    borderRadius: 8, padding: '9px 13px', fontSize: 13, width: '100%', boxSizing: 'border-box',
    outline: 'none', transition: 'border-color 0.15s',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, color: C.greyD, display: 'block', marginBottom: 6,
    fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
  };

  const stepCard: React.CSSProperties = {
    background: C.bgCard, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: '22px 24px',
  };

  const stepHeader = (n: string, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: C.crimson, color: '#fff',
        fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</div>
      <div style={{ color: C.white, fontWeight: 700, fontSize: 14, letterSpacing: 0.1 }}>{title}</div>
    </div>
  );

  const canSubmit = !!(form.employer_name && form.competency);

  return (
    <div>
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
      <style>{`
        .sig-inp:focus { border-color: ${C.crimson} !important; box-shadow: 0 0 0 2px ${C.crimson}22; }
        .sig-inp::placeholder { color: #94a3b8; }
      `}</style>

      {/* Header banner */}
      <div style={{
        background: `linear-gradient(135deg, #F6F7F9 0%, #FEF2F2 60%, #F6F7F9 100%)`,
        border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.crimson}`, borderRadius: 16,
        padding: '22px 26px', marginBottom: 28, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${C.crimson}55, transparent)` }} />
        <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 8 }}>
          Workforce Intelligence Contribution
        </div>
        <p style={{ color: C.white, fontSize: 14, fontWeight: 600, margin: '0 0 8px', lineHeight: 1.5 }}>
          Share what you're seeing in your workforce.
        </p>
        <p style={{ color: C.grey, fontSize: 13, margin: '0 0 6px', lineHeight: 1.6, maxWidth: 620 }}>
          AACP validates and translates employer signals into aggregated aviation workforce intelligence — used to align training, curriculum, and talent development with real industry needs.
        </p>
        <p style={{ color: C.grey, fontSize: 11, margin: 0, fontStyle: 'italic' }}>
          Submissions are reviewed by AACP before contributing to sector intelligence. Your organisation is not individually identified in any published output.
        </p>
        {recentCount !== null && recentCount > 0 && (
          <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8,
            background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: 8, padding: '5px 12px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.blue, flexShrink: 0 }} />
            <span style={{ color: C.blue, fontSize: 12, fontWeight: 600 }}>
              {recentCount} signal{recentCount !== 1 ? 's' : ''} submitted from your organisation
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Step 1 — Organisation */}
        <div style={stepCard}>
          {stepHeader('01', 'Organisation')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={lbl}>Organisation Name *</label>
              <input required className="sig-inp" value={form.employer_name} onChange={e => set('employer_name', e.target.value)}
                style={inp} placeholder="e.g. WestJet Airlines" />
            </div>
            <div>
              <label style={lbl}>Aviation Sector</label>
              <select className="sig-inp" value={form.industry_subsector} onChange={e => set('industry_subsector', e.target.value)} style={inp}>
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
              <select className="sig-inp" value={form.region} onChange={e => set('region', e.target.value)} style={inp}>
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
        </div>

        {/* Connector line */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 2, height: 16, background: C.border }} />
        </div>

        {/* Step 2 — Occupation and Role */}
        <div style={stepCard}>
          {stepHeader('02', 'Occupation and Role')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={lbl}>Occupation</label>
              <select className="sig-inp" value={form.occupation} onChange={e => set('occupation', e.target.value)} style={inp}>
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
              <input className="sig-inp" value={form.role_title} onChange={e => set('role_title', e.target.value)}
                style={inp} placeholder="e.g. Senior AME — Line Maintenance" />
            </div>
            <div>
              <label style={lbl}>Personnel Availability</label>
              <select className="sig-inp" value={form.hiring_difficulty} onChange={e => set('hiring_difficulty', e.target.value)} style={inp}>
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
              <select className="sig-inp" value={form.workforce_readiness_expectation} onChange={e => set('workforce_readiness_expectation', e.target.value)} style={inp}>
                <option value="">Select…</option>
                <option value="entry_ready">Entry Ready</option>
                <option value="some_experience_required">Some Experience Required</option>
                <option value="significant_experience_required">Significant Experience Required</option>
                <option value="internal_training_provided">Internal Training Provided</option>
              </select>
            </div>
          </div>
        </div>

        {/* Connector line */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 2, height: 16, background: C.border }} />
        </div>

        {/* Step 3 — Competency Signal */}
        <div style={stepCard}>
          {stepHeader('03', 'Competency Signal')}
          <p style={{ color: C.grey, fontSize: 12, margin: '-8px 0 18px', lineHeight: 1.6 }}>
            Submit one signal per competency. Submit multiple forms to cover all relevant competencies for this occupation.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={lbl}>AACP Competency *</label>
              <select required className="sig-inp" value={form.competency} onChange={e => set('competency', e.target.value)} style={inp}>
                {COMPETENCY_KEYS.map(k => (
                  <option key={k} value={k}>{k} — {COMPETENCY_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Specific Skill or Capability</label>
              <input className="sig-inp" value={form.skill} onChange={e => set('skill', e.target.value)}
                style={inp} placeholder="e.g. Digital Systems Troubleshooting" />
            </div>
            <div>
              <label style={lbl}>Operational Importance</label>
              <select className="sig-inp" value={form.importance_level} onChange={e => set('importance_level', e.target.value)} style={inp}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Required Proficiency Level</label>
              <select className="sig-inp" value={form.proficiency_expectation} onChange={e => set('proficiency_expectation', e.target.value)} style={inp}>
                <option value="expert">Expert</option>
                <option value="advanced">Advanced</option>
                <option value="intermediate">Intermediate</option>
                <option value="foundational">Foundational</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Future Requirement Trend</label>
              <select className="sig-inp" value={form.future_demand} onChange={e => set('future_demand', e.target.value)} style={inp}>
                <option value="increasing">↑ Increasing</option>
                <option value="stable">→ Stable</option>
                <option value="decreasing">↓ Decreasing</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Licensing or Certification Required</label>
              <input className="sig-inp" value={form.certification_required} onChange={e => set('certification_required', e.target.value)}
                style={inp} placeholder="e.g. Transport Canada AME Licence M1" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Competency Gap Description</label>
              <textarea className="sig-inp" value={form.skills_gap} onChange={e => set('skills_gap', e.target.value)}
                rows={2} style={{ ...inp, resize: 'vertical' }}
                placeholder="Describe the gap you observe in available personnel for this competency…" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                background: form.emerging_requirement ? C.blueBg : 'transparent',
                border: `1px solid ${form.emerging_requirement ? C.blueBorder : C.border}`,
                borderRadius: 10, padding: '12px 16px', transition: 'background 0.15s, border-color 0.15s',
              }}>
                <input type="checkbox" id="emerging_req" checked={form.emerging_requirement}
                  onChange={e => set('emerging_requirement', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: C.crimson, cursor: 'pointer', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ color: form.emerging_requirement ? C.blue : C.grey, fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
                    Flag as Emerging Requirement
                  </div>
                  <div style={{ color: C.grey, fontSize: 12, lineHeight: 1.5 }}>
                    This competency is increasing in importance and may not yet be widely available in the candidate pool
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Connector line */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 2, height: 16, background: canSubmit ? C.crimson : C.border, transition: 'background 0.3s' }} />
        </div>

        {/* Submit step */}
        <div style={{
          ...stepCard,
          borderColor: canSubmit ? `${C.crimson}55` : C.border,
          transition: 'border-color 0.3s',
        }}>
          {stepHeader('04', 'Submit Signal')}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <p style={{ color: C.grey, fontSize: 12, margin: 0, lineHeight: 1.6, maxWidth: 480 }}>
              Your submission is confidential. AACP will review and validate this signal before it contributes to aggregated sector workforce intelligence.
            </p>
            <button type="submit"
              disabled={submitting || !canSubmit}
              style={{
                background: canSubmit ? C.crimson : C.bgCard,
                color: canSubmit ? '#fff' : C.greyD,
                border: `1px solid ${canSubmit ? C.crimson : C.border}`,
                borderRadius: 10, padding: '12px 32px', fontSize: 14, fontWeight: 700,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                letterSpacing: 0.3, transition: 'background 0.2s, color 0.2s',
                boxShadow: canSubmit ? `0 4px 20px ${C.crimson}44` : 'none',
                whiteSpace: 'nowrap',
              }}
            >{submitting ? 'Submitting…' : 'Submit Signal →'}</button>
          </div>
        </div>

      </form>
    </div>
  );
}

// â”€â”€ Signal Submissions Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  const STAGES = [
    { key: 'new',        label: 'Submitted',     desc: 'Signal received by AACP' },
    { key: 'review',     label: 'Under Review',  desc: 'AACP is validating your signal' },
    { key: 'validated',  label: 'Validated',     desc: 'Signal accepted and verified' },
    { key: 'intel',      label: 'Contributing',  desc: 'Signal feeds sector intelligence' },
  ];

  const getStage = (status: string) => {
    if (status === 'validated') return 3;
    if (status === 'under_review' || status === 'needs_clarification') return 1;
    return 0;
  };

  const trendIcon = (t: string) => t === 'increasing' ? '↑' : t === 'decreasing' ? '↓' : '→';
  const trendColor = (t: string) => t === 'increasing' ? C.green : t === 'decreasing' ? C.red : C.grey;
  const importanceColor = (i: string) => i === 'critical' ? C.red : i === 'high' ? C.amber : C.grey;

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Signals Submitted', value: signals.length,   color: C.white,  accent: C.border     },
          { label: 'Validated',         value: counts.validated,  color: C.green,  accent: C.greenBorder },
          { label: 'Awaiting Review',   value: counts.pending,    color: C.blue,   accent: C.blueBorder  },
          { label: 'Under Review',      value: counts.review,     color: C.amber,  accent: C.amberBorder },
        ].map(c => (
          <div key={c.label} style={{
            background: C.bgCard, border: `1px solid ${C.border}`,
            borderTop: `3px solid ${c.accent}`, borderRadius: 12, padding: '16px 18px',
          }}>
            <div style={{ color: c.color, fontSize: 28, fontWeight: 800, fontFamily: 'Fraunces, serif', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
            <div style={{ color: C.greyD, fontSize: 10, marginTop: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {signals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16 }}>
          <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 10px', fontSize: 18 }}>No Signals Submitted Yet</h3>
          <p style={{ color: C.grey, fontSize: 13, margin: 0, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
            Use the Submit Workforce Signal tab to begin contributing to AACP aviation workforce intelligence.
          </p>
        </div>
      ) : (
        <>
          {/* Signal cards with progression tracker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {signals.map(s => {
              const stage = getStage(s.validation_status);
              return (
                <div key={s.id} style={{
                  background: C.bgCard, border: `1px solid ${C.border}`,
                  borderLeft: stage === 3 ? `3px solid ${C.green}` : stage === 1 ? `3px solid ${C.amber}` : `3px solid ${C.border}`,
                  borderRadius: 12, padding: '18px 22px',
                }}>
                  {/* Signal header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>{s.competency}</span>
                        <span style={{ color: C.grey, fontSize: 12 }}>—</span>
                        <span style={{ color: C.grey, fontSize: 12 }}>{COMPETENCY_LABELS[s.competency] ?? s.competency}</span>
                        {s.emerging_requirement === 1 && (
                          <span style={{ background: C.redBg, border: `1px solid ${C.red}55`, color: C.red, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4 }}>
                            Emerging
                          </span>
                        )}
                      </div>
                      <div style={{ color: C.grey, fontSize: 12, marginTop: 4 }}>
                        {[s.occupation, s.role_title].filter(Boolean).join(' · ') || 'No occupation specified'}
                        {s.skill && <span style={{ color: C.greyD }}> · {s.skill}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{
                        background: importanceColor(s.importance_level) + '22',
                        border: `1px solid ${importanceColor(s.importance_level)}55`,
                        color: importanceColor(s.importance_level), fontSize: 10, fontWeight: 700,
                        letterSpacing: 1, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4,
                      }}>{s.importance_level}</span>
                      <span style={{ color: trendColor(s.future_demand), fontSize: 13, fontWeight: 700 }}>
                        {trendIcon(s.future_demand)} {s.future_demand}
                      </span>
                    </div>
                  </div>

                  {/* Progression tracker */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {STAGES.map((st, i) => {
                      const active = i === stage;
                      const done = i < stage || (stage === 3 && i <= 3);
                      return (
                        <React.Fragment key={st.key}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                              background: done ? C.green : active ? C.crimson : C.bgDeep,
                              border: `2px solid ${done ? C.green : active ? C.crimson : C.border}`,
                              color: (done || active) ? '#fff' : C.grey,
                              transition: 'all 0.2s',
                            }}>
                              {done && !active ? '✓' : i + 1}
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: done ? C.green : active ? C.crimson : C.grey, whiteSpace: 'nowrap' }}>{st.label}</div>
                          </div>
                          {i < STAGES.length - 1 && (
                            <div style={{ flex: 1, height: 2, margin: '0 4px', marginBottom: 14, background: i < stage ? C.green : C.border, transition: 'background 0.3s' }} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Validated callout */}
                  {stage >= 2 && (
                    <div style={{ marginTop: 12, background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: C.green, fontSize: 14 }}>✓</span>
                      <span style={{ color: C.green, fontSize: 12, fontWeight: 600 }}>
                        This signal is contributing to AACP aviation workforce intelligence.
                      </span>
                    </div>
                  )}

                  <div style={{ color: C.grey, fontSize: 11, marginTop: 10, textAlign: 'right' }}>
                    Submitted {s.created_at ? new Date(s.created_at).toLocaleDateString('en-CA') : '—'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compact table for quick reference */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
              All Signals — Quick Reference
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Competency', 'Occupation', 'Importance', 'Trend', 'Status', 'Submitted'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 14px', color: C.greyD, fontWeight: 700, whiteSpace: 'nowrap', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {signals.map(s => (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontWeight: 700, color: C.white }}>{s.competency}</span>
                        {s.skill && <span style={{ color: C.grey, fontSize: 11, display: 'block' }}>{s.skill}</span>}
                      </td>
                      <td style={{ padding: '10px 14px', color: C.grey }}>{s.occupation ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ color: importanceColor(s.importance_level), fontWeight: 600, textTransform: 'capitalize' }}>{s.importance_level}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ color: trendColor(s.future_demand) }}>{trendIcon(s.future_demand)} {s.future_demand}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={statusBadgeStyle(s.validation_status)}>{statusLabel(s.validation_status)}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: C.grey, whiteSpace: 'nowrap' }}>
                        {s.created_at ? new Date(s.created_at).toLocaleDateString('en-CA') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p style={{ color: C.grey, fontSize: 11, fontStyle: 'italic', marginTop: 16 }}>
        Validated signals contribute to aggregated AACP sector intelligence. Your organisation is not individually identified in published reports.
      </p>
    </div>
  );
}

// â”€â”€ Sector Overview Tab (employer-facing, aggregated only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '32px 28px' }}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 15, marginBottom: 10 }}>No validated signals yet</div>
          <p style={{ color: C.grey, fontSize: 13, margin: '0 0 14px', lineHeight: 1.6 }}>
            Sector intelligence is built from employer signals that have been reviewed and validated by AACP staff.
            If you have submitted signals, they will appear here once an AACP analyst approves them — typically within 2–5 business days.
          </p>
          <p style={{ color: C.grey, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
            Check <strong style={{ color: C.greyD }}>My Signals</strong> to see the current review status of your submissions.
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

// â”€â”€ Crew Pipeline Tab (existing functionality preserved) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0,
        }}>{completer.name.charAt(0).toUpperCase()}</div>
        <div>
          <div style={{ color: C.white, fontSize: 15, fontWeight: 600 }}>{completer.name}</div>
          <div style={{ color: C.grey, fontSize: 12 }}>
            Completed {new Date(completer.programCompletedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
      {completer.topPathway && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: '8px 12px' }}>
          <div>
            <div style={{ color: C.crimson, fontSize: 13, fontWeight: 600 }}>{PATHWAY_LABELS[completer.topPathway] ?? completer.topPathway}</div>
            {fitStyle && <div style={{ color: fitStyle.color, fontSize: 11 }}>{fitStyle.label}</div>}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {completer.validatedCompetencies.slice(0, 3).map((comp, i) => (
          <span key={i} style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, color: C.green, fontSize: 10, padding: '2px 8px', borderRadius: 4 }}>
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
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700 }}>
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

// ── Talent Pipeline Intelligence Tab ─────────────────────────────────────────

const TP_OPP_LABELS: Record<string, string> = {
  not_looking: 'Not Looking', open: 'Open to Opportunities',
  actively_exploring: 'Actively Exploring', advancement: 'Seeking Advancement',
};
const TP_MOBILITY_LABELS: Record<string, string> = {
  local: 'Local', regional: 'Regional', national: 'National', international: 'International',
};

interface TalentProfile {
  userId: string; name: string; occupation: string | null; yearsExperience: string | null;
  aviationSubsector: string | null; location: string | null; licencesCertifications: string | null;
  careerGoals: string | null; opportunityStatus: string; geographicMobility: string;
  pathwayType: string | null; competencyStrengths: string[]; careerAlignment: string | null;
  developmentAreas: string | null; recommendedPathways: string | null;
  connectionId: string | null; connectionStatus: string | null;
}

interface TalentPipelineData {
  talent: TalentProfile[];
  summary: { total: number; openToOpportunities: number; aciaCompleted: number; bySubsector: Record<string, number> };
}

function TalentPipelineTab() {
  const [data, setData] = useState<TalentPipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<TalentProfile | null>(null);
  const [interestNote, setInterestNote] = useState('');
  const [sendingInterest, setSendingInterest] = useState(false);
  const [interestSent, setInterestSent] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState({ occupation: '', subsector: '', opportunityStatus: '', pathway: '' });

  function loadData() {
    const params = new URLSearchParams();
    if (filters.occupation) params.set('occupation', filters.occupation);
    if (filters.subsector) params.set('subsector', filters.subsector);
    if (filters.opportunityStatus) params.set('opportunityStatus', filters.opportunityStatus);
    if (filters.pathway) params.set('pathway', filters.pathway);
    const qs = params.toString() ? `?${params.toString()}` : '';
    setLoading(true);
    apiFetch<{ participants: TalentProfile[]; total: number; summary: { discoverable: number; openToOpportunities: number; aciaCompleted: number; bySubsector: Record<string, number> } }>(`/employer/talent-pipeline${qs}`)
      .then(d => setData({ talent: d.participants ?? [], summary: { total: d.summary?.discoverable ?? 0, openToOpportunities: d.summary?.openToOpportunities ?? 0, aciaCompleted: d.summary?.aciaCompleted ?? 0, bySubsector: d.summary?.bySubsector ?? {} } }))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  async function handleExpressInterest(profile: TalentProfile) {
    setSendingInterest(true);
    try {
      await request('/employer/talent-connections', { method: 'POST', body: { participantUserId: profile.userId, note: interestNote || undefined } });
      setInterestSent(prev => ({ ...prev, [profile.userId]: true }));
      setInterestNote('');
      setSelected(null);
    } catch (e: any) {
      setError(e.message);
    } finally { setSendingInterest(false); }
  }

  const inp: React.CSSProperties = { background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, borderRadius: 8, padding: '8px 12px', fontSize: 12, width: '100%', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { display: 'block', color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 };

  const summaryStats = data?.summary ?? { total: 0, openToOpportunities: 0, aciaCompleted: 0, bySubsector: {} };
  const talent = data?.talent ?? [];

  return (
    <div>
      {/* Intelligence Summary */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.crimson}`, borderRadius: 16, padding: '22px 28px', marginBottom: 22 }}>
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 4px', fontSize: '1.2rem' }}>AACP Talent Pipeline Intelligence</h2>
          <p style={{ color: C.grey, margin: 0, fontSize: 12, lineHeight: 1.6, maxWidth: 600 }}>
            Verified aviation professionals who have opted in to be discoverable. Profiles reflect ACIA competency evidence and self-reported professional backgrounds.
            All credentials are self-reported until independently verified. This is not a job board — connecting requires the participant's acceptance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Discoverable Talent', value: summaryStats.total, accent: C.crimson },
            { label: 'Open to Opportunities', value: summaryStats.openToOpportunities, accent: C.green },
            { label: 'ACIA Completed', value: summaryStats.aciaCompleted, accent: C.blue },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{ background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 20px', minWidth: 140, flex: '0 0 auto' }}>
              <div style={{ color: accent, fontSize: 28, fontWeight: 800, fontFamily: 'Fraunces, serif', fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : value}</div>
              <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
            </div>
          ))}
          {Object.entries(summaryStats.bySubsector).slice(0, 3).map(([sub, count]) => (
            <div key={sub} style={{ background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 20px', minWidth: 140, flex: '0 0 auto' }}>
              <div style={{ color: C.white, fontSize: 22, fontWeight: 800, fontFamily: 'Fraunces, serif', fontVariantNumeric: 'tabular-nums' }}>{count}</div>
              <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>Occupation</label><input style={inp} value={filters.occupation} onChange={e => setFilters(f => ({ ...f, occupation: e.target.value }))} placeholder="e.g. Pilot, AME" /></div>
          <div><label style={lbl}>Subsector</label>
            <select style={inp} value={filters.subsector} onChange={e => setFilters(f => ({ ...f, subsector: e.target.value }))}>
              <option value="">All Subsectors</option>
              {['Commercial Aviation', 'General Aviation', 'AME / Aircraft Maintenance', 'Air Traffic Control', 'Aerospace Engineering', 'Airport Operations', 'Aviation Safety', 'Flight Training', 'Unmanned Aviation / Drones'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Opportunity Status</label>
            <select style={inp} value={filters.opportunityStatus} onChange={e => setFilters(f => ({ ...f, opportunityStatus: e.target.value }))}>
              <option value="">Any Status</option>
              {Object.entries(TP_OPP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Pathway</label>
            <select style={inp} value={filters.pathway} onChange={e => setFilters(f => ({ ...f, pathway: e.target.value }))}>
              <option value="">Any Pathway</option>
              <option value="professional">Current Aviation Professional</option>
              <option value="standard">Standard</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={loadData} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Apply Filters</button>
          </div>
        </div>
      </div>

      {error && <div style={{ color: C.red, padding: '12px 16px', background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ color: C.grey, padding: 40, textAlign: 'center' }}>Loading talent pipeline…</div>
      ) : talent.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16 }}>
          <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 10px' }}>No Talent Profiles Found</h3>
          <p style={{ color: C.grey, fontSize: 13, lineHeight: 1.6, maxWidth: 420, marginInline: 'auto', margin: 0 }}>
            No participants currently match your filters and have opted into the AACP Talent Network. Profiles appear only when professionals explicitly choose to be discoverable.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {talent.map(t => {
            const alreadySent = interestSent[t.userId] || t.connectionStatus === 'interest_sent' || t.connectionStatus === 'connection_accepted';
            const oppColor = t.opportunityStatus === 'actively_exploring' ? C.green : t.opportunityStatus === 'open' ? C.blue : C.greyD;
            return (
              <div key={t.userId} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>{t.occupation ?? 'Aviation Professional'}</div>
                    <div style={{ color: C.grey, fontSize: 12, marginTop: 2 }}>{[t.yearsExperience ? `${t.yearsExperience} exp` : null, t.aviationSubsector, t.location].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span style={{ color: oppColor, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.8 }}>{TP_OPP_LABELS[t.opportunityStatus] ?? t.opportunityStatus}</span>
                </div>
                {t.licencesCertifications && <div style={{ color: C.grey, fontSize: 11 }}><span style={{ color: C.greyD, fontWeight: 700 }}>Licences: </span>{t.licencesCertifications}</div>}
                {t.competencyStrengths.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {t.competencyStrengths.slice(0, 4).map(s => (
                      <span key={s} style={{ background: C.bgDeep, border: `1px solid ${C.border}`, color: C.grey, borderRadius: 6, padding: '3px 9px', fontSize: 10, fontWeight: 600 }}>{s}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button onClick={() => { setSelected(t); setInterestNote(''); }} style={{ flex: 1, background: C.bgDeep, border: `1px solid ${C.border}`, color: C.grey, borderRadius: 8, padding: '7px', fontSize: 12, cursor: 'pointer' }}>View Profile</button>
                  {!alreadySent && (
                    <button onClick={() => { setSelected(t); setInterestNote(''); }} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Express Interest</button>
                  )}
                  {alreadySent && (
                    <span style={{ display: 'flex', alignItems: 'center', color: C.green, fontSize: 11, fontWeight: 700, gap: 4 }}>
                      {t.connectionStatus === 'connection_accepted' ? 'Connected' : 'Interest Sent'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Profile modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setSelected(null)}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, width: '100%', maxWidth: 580, maxHeight: '85vh', overflowY: 'auto', padding: '28px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Talent Profile</div>
                <h3 style={{ color: C.white, margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 700 }}>{selected.occupation ?? 'Aviation Professional'}</h3>
                <div style={{ color: C.grey, fontSize: 12 }}>{[selected.yearsExperience, selected.aviationSubsector, selected.location].filter(Boolean).join(' · ')}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.greyD, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* QUALIFICATIONS */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>Qualifications</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {selected.licencesCertifications && <div><div style={{ color: C.greyD, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Licences / Certifications</div><div style={{ color: C.grey, fontSize: 12 }}>{selected.licencesCertifications}</div></div>}
                {selected.geographicMobility && <div><div style={{ color: C.greyD, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Geographic Mobility</div><div style={{ color: C.grey, fontSize: 12 }}>{TP_MOBILITY_LABELS[selected.geographicMobility] ?? selected.geographicMobility}</div></div>}
              </div>
              <p style={{ color: C.greyD, fontSize: 10, marginTop: 8, fontStyle: 'italic' }}>All credentials are self-reported and have not been independently verified by AACP.</p>
            </div>

            {/* COMPETENCY EVIDENCE */}
            {selected.competencyStrengths.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>Competency Evidence</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {selected.competencyStrengths.map(s => <span key={s} style={{ background: C.bgDeep, border: `1px solid ${C.border}`, color: C.grey, borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 600 }}>{s}</span>)}
                </div>
                <p style={{ color: C.greyD, fontSize: 10, fontStyle: 'italic', margin: 0 }}>Competency evidence is derived from ACIA assessment. Raw assessment responses are not shared.</p>
              </div>
            )}

            {/* CAREER ALIGNMENT */}
            {(selected.careerAlignment || selected.developmentAreas || selected.recommendedPathways) && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>Career Alignment</div>
                {selected.careerAlignment && <div style={{ marginBottom: 8 }}><div style={{ color: C.greyD, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Career Alignment Summary</div><div style={{ color: C.grey, fontSize: 12, lineHeight: 1.6 }}>{selected.careerAlignment}</div></div>}
                {selected.developmentAreas && <div style={{ marginBottom: 8 }}><div style={{ color: C.greyD, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Development Areas</div><div style={{ color: C.grey, fontSize: 12, lineHeight: 1.6 }}>{selected.developmentAreas}</div></div>}
                {selected.recommendedPathways && <div><div style={{ color: C.greyD, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Recommended Pathways</div><div style={{ color: C.grey, fontSize: 12, lineHeight: 1.6 }}>{selected.recommendedPathways}</div></div>}
              </div>
            )}

            {/* OPPORTUNITY PREFERENCES */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>Opportunity Preferences</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><div style={{ color: C.greyD, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Status</div><div style={{ color: C.grey, fontSize: 12 }}>{TP_OPP_LABELS[selected.opportunityStatus] ?? selected.opportunityStatus}</div></div>
                <div><div style={{ color: C.greyD, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Mobility</div><div style={{ color: C.grey, fontSize: 12 }}>{TP_MOBILITY_LABELS[selected.geographicMobility] ?? selected.geographicMobility}</div></div>
                {selected.careerGoals && <div style={{ gridColumn: '1 / -1' }}><div style={{ color: C.greyD, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Career Goals</div><div style={{ color: C.grey, fontSize: 12, lineHeight: 1.6 }}>{selected.careerGoals}</div></div>}
              </div>
            </div>

            {/* Express Interest */}
            {!(interestSent[selected.userId] || selected.connectionStatus === 'interest_sent' || selected.connectionStatus === 'connection_accepted') && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
                <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Express Interest</div>
                <p style={{ color: C.grey, fontSize: 12, margin: '0 0 12px', lineHeight: 1.6 }}>Your interest will be sent to the participant. They choose whether to accept or decline — contact details are only shared upon acceptance.</p>
                <textarea style={{ ...inp, minHeight: 72, resize: 'vertical', marginBottom: 12 }} value={interestNote} onChange={e => setInterestNote(e.target.value)} placeholder="Optional: introduce your organisation and why you'd like to connect…" />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => handleExpressInterest(selected)} disabled={sendingInterest} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: sendingInterest ? 0.7 : 1 }}>
                    {sendingInterest ? 'Sending…' : 'Send Expression of Interest'}
                  </button>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.grey, borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>Close</button>
                </div>
              </div>
            )}
            {(interestSent[selected.userId] || selected.connectionStatus === 'interest_sent') && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18, color: C.green, fontSize: 13, fontWeight: 700 }}>Interest sent. The participant will be notified.</div>
            )}
            {selected.connectionStatus === 'connection_accepted' && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18, color: C.green, fontSize: 13, fontWeight: 700 }}>Connected — this participant accepted your expression of interest.</div>
            )}
          </div>
        </div>
      )}
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
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.crimson}`, borderRadius: 16, padding: '22px 28px', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
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

// â”€â”€ Root â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      {tab === 'pipeline'     && <TalentPipelineTab />}
      {tab === 'sector'       && <SectorOverviewTab />}
    </DashboardLayout>
  );
}


