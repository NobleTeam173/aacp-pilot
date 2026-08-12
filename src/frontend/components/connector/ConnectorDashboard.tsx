import { useState, useEffect, useCallback } from 'react';

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
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
};

const COMPETENCY_KEYS = ['SR','MR','AP','PS','SO','DM','WM','MT','CM','PR','SA','AL','AK'] as const;
const COMPETENCY_LABELS: Record<string,string> = {
  SR:'Spatial Reasoning', MR:'Mechanical Reasoning', AP:'Attention & Precision',
  PS:'Problem Solving', SO:'Safety Orientation', DM:'Decision Making',
  WM:'Working Memory', MT:'Multitasking & Prioritization', CM:'Communication',
  PR:'Procedural Reasoning', SA:'Situational Awareness', AL:'Adaptive Learning',
  AK:'Aviation Knowledge',
};

type ConnectorTab = 'overview' | 'signals' | 'validation' | 'intelligence';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('aacp_access_token');
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((opts?.headers as Record<string, string>) ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Request failed');
  return data as T;
}

interface Overview {
  employersContributing: number;
  occupationsMapped: number;
  competenciesCaptured: number;
  competenciesValidated: number;
  emergingDetected: number;
  awaitingValidation: number;
  postSecondaryConsuming: number;
  participantEvidence: number;
  curriculumMappings: number;
  lastRefresh: string | null;
}

interface Signal {
  id: string;
  employer_name: string;
  competency: string;
  importance_level: string;
  future_demand: string;
  occupation: string | null;
  region: string | null;
  validation_status: string;
  created_at: string;
  skill: string | null;
  proficiency_expectation: string | null;
  hiring_difficulty: string | null;
  skills_gap: string | null;
  certification_required: string | null;
  workforce_readiness_expectation: string | null;
  emerging_requirement: number;
  source: string | null;
  validation_notes: string | null;
}

interface IntelSignal {
  competency: string;
  label: string;
  demandLevel: string;
  trend: string;
  evidenceLevel: string;
  signalCount: number;
  contributingEmployers: number;
}

function KpiTile({ label, value, accent, size = 'md' }: { label: string; value: string | number; accent?: string; size?: 'lg' | 'md' | 'sm' }) {
  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderTop: accent ? `3px solid ${accent}` : `1px solid ${C.border}`,
      borderRadius: 14,
      padding: size === 'lg' ? '22px 24px' : '16px 20px',
    }}>
      <div style={{ color: accent ?? C.white, fontSize: size === 'lg' ? 38 : size === 'md' ? 30 : 22, fontWeight: 800, fontFamily: 'Fraunces, serif', lineHeight: 1 }}>{value}</div>
      <div style={{ color: C.greyD, fontSize: 11, marginTop: size === 'lg' ? 12 : 8, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600, lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 12 }}>
      {children}
    </div>
  );
}

function ValidationBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; border: string; label: string }> = {
    new:                { color: C.amber, bg: C.amberBg, border: C.amberBorder, label: 'New' },
    under_review:       { color: '#60a5fa', bg: '#0a1428', border: '#1a3060', label: 'Under Review' },
    validated:          { color: C.green, bg: C.greenBg, border: C.greenBorder, label: 'Validated' },
    needs_clarification:{ color: '#f97316', bg: '#1a0d00', border: '#3a1a00', label: 'Needs Clarification' },
    archived:           { color: C.greyD, bg: '#111', border: '#333', label: 'Archived' },
  };
  const s = map[status] ?? { color: C.grey, bg: C.bgCard, border: C.border, label: status };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>{s.label}</span>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Overview>('/connector/overview')
      .then(setOverview)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: C.grey, padding: 32 }}>Loading overview…</div>;
  if (error) return (
    <div style={{ background: '#1a0505', border: '1px solid #3a0505', borderRadius: 12, padding: '20px 24px', margin: '8px 0' }}>
      <div style={{ color: '#fca5a5', fontWeight: 700, marginBottom: 4, fontSize: 14 }}>Unable to load overview</div>
      <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing. Contact support if the problem persists.</div>
    </div>
  );
  if (!overview) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Primary reach KPIs */}
      <div>
        <SectionEyebrow>Platform Reach</SectionEyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          <KpiTile label="Employers Contributing" value={overview.employersContributing} accent={C.crimson} size="lg" />
          <KpiTile label="Participant Evidence Available" value={overview.participantEvidence} accent="#60a5fa" size="lg" />
          <KpiTile label="Post-Secondary Partners" value={overview.postSecondaryConsuming} accent={C.green} size="lg" />
        </div>
      </div>

      {/* Signal health */}
      <div>
        <SectionEyebrow>Signal Health</SectionEyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
          <KpiTile label="Signals Captured" value={overview.competenciesCaptured} />
          <KpiTile label="Validated" value={overview.competenciesValidated} accent={C.green} />
          <KpiTile label="Emerging Detected" value={overview.emergingDetected} accent={C.amber} />
          <KpiTile label="Awaiting Validation" value={overview.awaitingValidation} accent={overview.awaitingValidation > 0 ? C.red : undefined} />
        </div>
      </div>

      {/* Data coverage */}
      <div>
        <SectionEyebrow>Data Coverage</SectionEyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          <KpiTile label="Occupations Mapped" value={overview.occupationsMapped} size="sm" />
          <KpiTile label="Curriculum Mappings" value={overview.curriculumMappings} size="sm" />
          <KpiTile
            label="Last Data Refresh"
            value={overview.lastRefresh ? new Date(overview.lastRefresh).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No data yet'}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

// ── Employer Signals Tab ──────────────────────────────────────────────────────

const BLANK_FORM = {
  employer_name: '', industry_subsector: '', region: '', occupation: '',
  role_title: '', competency: 'SR', skill: '', importance_level: 'medium',
  proficiency_expectation: 'intermediate', hiring_difficulty: '',
  skills_gap: '', emerging_requirement: false, certification_required: '',
  workforce_readiness_expectation: '', future_demand: 'stable',
  source: 'employer_submission',
};

function EmployerSignalsTab() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [compFilter, setCompFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const loadSignals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (compFilter) params.set('competency', compFilter);
      const res = await apiFetch<{ signals: Signal[] }>(`/connector/signals?${params}`);
      setSignals(res.signals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, compFilter]);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employer_name || !form.competency) return;
    setSubmitting(true);
    try {
      await apiFetch('/connector/signals', {
        method: 'POST',
        body: JSON.stringify({ ...form, emerging_requirement: form.emerging_requirement ? 1 : 0 }),
      });
      showToast('Signal created');
      setShowForm(false);
      setForm({ ...BLANK_FORM });
      loadSignals();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', false);
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    background: '#0f0a0b', border: `1px solid ${C.border}`, color: C.white,
    borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' as const,
  };

  const labelStyle = { fontSize: 12, color: C.grey, display: 'block', marginBottom: 4 };

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.ok ? C.greenBg : C.redBg,
          border: `1px solid ${toast.ok ? C.greenBorder : C.redBorder}`,
          color: toast.ok ? C.green : C.red,
          borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 600,
        }}>{toast.ok ? '✓ ' : '✕ '}{toast.msg}</div>
      )}

      {/* Filters + Add button */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="under_review">Under Review</option>
          <option value="validated">Validated</option>
          <option value="needs_clarification">Needs Clarification</option>
          <option value="archived">Archived</option>
        </select>
        <select value={compFilter} onChange={e => setCompFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="">All Competencies</option>
          {COMPETENCY_KEYS.map(k => <option key={k} value={k}>{k} — {COMPETENCY_LABELS[k]}</option>)}
        </select>
        <button
          onClick={() => setShowForm(f => !f)}
          style={{
            marginLeft: 'auto', background: C.crimson, color: C.white, border: 'none',
            borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >{showForm ? 'Cancel' : '+ Add Signal'}</button>
      </div>

      {/* Add Signal form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 24, marginBottom: 24,
        }}>
          <h4 style={{ color: C.white, fontSize: 14, fontWeight: 700, margin: '0 0 20px' }}>New Employer Signal</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {[
              { key: 'employer_name', label: 'Employer Name *', type: 'text' },
              { key: 'industry_subsector', label: 'Industry Subsector', type: 'text' },
              { key: 'region', label: 'Region', type: 'text' },
              { key: 'occupation', label: 'Occupation', type: 'text' },
              { key: 'role_title', label: 'Role Title', type: 'text' },
              { key: 'skill', label: 'Specific Skill', type: 'text' },
              { key: 'certification_required', label: 'Certification Required', type: 'text' },
              { key: 'workforce_readiness_expectation', label: 'Workforce Readiness Expectation', type: 'text' },
            ].map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                <input
                  type={f.type}
                  required={f.key === 'employer_name'}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Competency *</label>
              <select value={form.competency} onChange={e => setForm(p => ({ ...p, competency: e.target.value }))} style={inputStyle}>
                {COMPETENCY_KEYS.map(k => <option key={k} value={k}>{k} — {COMPETENCY_LABELS[k]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Importance Level</label>
              <select value={form.importance_level} onChange={e => setForm(p => ({ ...p, importance_level: e.target.value }))} style={inputStyle}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Proficiency Expectation</label>
              <select value={form.proficiency_expectation} onChange={e => setForm(p => ({ ...p, proficiency_expectation: e.target.value }))} style={inputStyle}>
                <option value="advanced">Advanced</option>
                <option value="intermediate">Intermediate</option>
                <option value="foundational">Foundational</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Hiring Difficulty</label>
              <select value={form.hiring_difficulty} onChange={e => setForm(p => ({ ...p, hiring_difficulty: e.target.value }))} style={inputStyle}>
                <option value="">— Select —</option>
                <option value="very_difficult">Very Difficult</option>
                <option value="difficult">Difficult</option>
                <option value="moderate">Moderate</option>
                <option value="easy">Easy</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Future Demand</label>
              <select value={form.future_demand} onChange={e => setForm(p => ({ ...p, future_demand: e.target.value }))} style={inputStyle}>
                <option value="increasing">Increasing</option>
                <option value="stable">Stable</option>
                <option value="decreasing">Decreasing</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Source</label>
              <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} style={inputStyle}>
                <option value="employer_submission">Employer Submission</option>
                <option value="consultation">Consultation</option>
                <option value="survey">Survey</option>
                <option value="interview">Interview</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Skills Gap (description)</label>
              <textarea
                value={form.skills_gap}
                onChange={e => setForm(p => ({ ...p, skills_gap: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="emerging_req"
                checked={form.emerging_requirement}
                onChange={e => setForm(p => ({ ...p, emerging_requirement: e.target.checked }))}
              />
              <label htmlFor="emerging_req" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>Emerging Requirement</label>
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
            <button
              type="submit"
              disabled={submitting || !form.employer_name}
              style={{
                background: form.employer_name ? C.crimson : C.bgCard,
                color: C.white, border: 'none', borderRadius: 8,
                padding: '9px 20px', fontSize: 13, fontWeight: 700,
                cursor: form.employer_name ? 'pointer' : 'not-allowed',
              }}
            >{submitting ? 'Saving…' : 'Save Signal'}</button>
          </div>
        </form>
      )}

      {/* Signals table */}
      {loading ? (
        <div style={{ color: C.grey, padding: 24 }}>Loading signals…</div>
      ) : error ? (
        <div style={{ background: '#1a0505', border: '1px solid #3a0505', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ color: '#fca5a5', fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Unable to load signals</div>
          <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing.</div>
        </div>
      ) : signals.length === 0 ? (
        <div style={{ color: C.grey, padding: 24, textAlign: 'center' }}>No signals found. Add the first one above.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Employer','Competency','Importance','Future Demand','Occupation','Region','Status','Date'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: C.grey, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.map(s => (
                <>
                  <tr
                    key={s.id}
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                    style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: expanded === s.id ? C.bgCard : 'transparent' }}
                  >
                    <td style={{ padding: '10px 12px', color: C.white, fontWeight: 600 }}>{s.employer_name}</td>
                    <td style={{ padding: '10px 12px', color: C.grey }}><span style={{ fontWeight: 700, color: C.white }}>{s.competency}</span> <span style={{ color: C.greyD }}>— {COMPETENCY_LABELS[s.competency]}</span></td>
                    <td style={{ padding: '10px 12px', color: C.grey, textTransform: 'capitalize' }}>{s.importance_level}</td>
                    <td style={{ padding: '10px 12px', color: C.grey, textTransform: 'capitalize' }}>{s.future_demand}</td>
                    <td style={{ padding: '10px 12px', color: C.grey }}>{s.occupation ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: C.grey }}>{s.region ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}><ValidationBadge status={s.validation_status} /></td>
                    <td style={{ padding: '10px 12px', color: C.greyD, whiteSpace: 'nowrap' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={`${s.id}-exp`} style={{ background: C.bgCard }}>
                      <td colSpan={8} style={{ padding: '12px 24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, fontSize: 12 }}>
                          {[
                            { label: 'Skill', value: s.skill },
                            { label: 'Proficiency Expectation', value: s.proficiency_expectation },
                            { label: 'Hiring Difficulty', value: s.hiring_difficulty },
                            { label: 'Certification Required', value: s.certification_required },
                            { label: 'Workforce Readiness Expectation', value: s.workforce_readiness_expectation },
                            { label: 'Emerging Requirement', value: s.emerging_requirement ? 'Yes' : 'No' },
                            { label: 'Source', value: s.source },
                            { label: 'Validation Notes', value: s.validation_notes },
                          ].map(f => (
                            <div key={f.label}>
                              <div style={{ color: C.greyD, marginBottom: 2 }}>{f.label}</div>
                              <div style={{ color: C.white }}>{f.value ?? '—'}</div>
                            </div>
                          ))}
                          {s.skills_gap && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <div style={{ color: C.greyD, marginBottom: 2 }}>Skills Gap</div>
                              <div style={{ color: C.white }}>{s.skills_gap}</div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Validation Queue Tab ──────────────────────────────────────────────────────

function ValidationQueueTab() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<{ id: string; action: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const [newRes, reviewRes] = await Promise.all([
        apiFetch<{ signals: Signal[] }>('/connector/signals?status=new'),
        apiFetch<{ signals: Signal[] }>('/connector/signals?status=under_review'),
      ]);
      setSignals([...newRes.signals, ...reviewRes.signals].sort((a,b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  async function doAction(id: string, status: string, notes: string) {
    setActionLoading(id);
    try {
      await apiFetch(`/connector/signals/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ validation_status: status, validation_notes: notes || undefined }),
      });
      showToast(`Signal ${status === 'validated' ? 'validated' : status === 'needs_clarification' ? 'sent for clarification' : 'archived'}`);
      setNoteTarget(null);
      setNoteText('');
      loadQueue();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed', false);
    } finally {
      setActionLoading(null);
    }
  }

  const btnStyle = (color: string) => ({
    background: 'none', border: `1px solid ${color}`, color,
    borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
  });

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: C.greenBg, border: `1px solid ${C.greenBorder}`, color: C.green,
          borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 600,
        }}>{toast.msg}</div>
      )}

      {noteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 420 }}>
            <h4 style={{ color: C.white, margin: '0 0 16px', fontSize: 15 }}>
              {noteTarget.action === 'validated' ? 'Validate Signal' : noteTarget.action === 'needs_clarification' ? 'Request Clarification' : 'Archive Signal'}
            </h4>
            <label style={{ fontSize: 12, color: C.grey, display: 'block', marginBottom: 6 }}>Validation notes (optional)</label>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={4}
              style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, color: C.white, borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => { setNoteTarget(null); setNoteText(''); }} style={{ ...btnStyle(C.greyD), border: 'none', padding: '8px 16px' }}>Cancel</button>
              <button
                disabled={!!actionLoading}
                onClick={() => doAction(noteTarget.id, noteTarget.action, noteText)}
                style={{ background: noteTarget.action === 'validated' ? C.green : noteTarget.action === 'needs_clarification' ? C.amber : C.greyD, color: '#000', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >{actionLoading ? '…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: C.grey, padding: 24 }}>Loading queue…</div>
      ) : signals.length === 0 ? (
        <div style={{ color: C.grey, padding: 24, textAlign: 'center' }}>Validation queue is empty.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Employer','Competency','Importance','Status','Date Collected','Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: C.grey, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.map(s => (
                <>
                  <tr
                    key={s.id}
                    style={{ borderBottom: `1px solid ${C.border}`, background: expanded === s.id ? C.bgCard : 'transparent' }}
                  >
                    <td
                      onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                      style={{ padding: '10px 12px', color: C.white, fontWeight: 600, cursor: 'pointer' }}
                    >{s.employer_name}</td>
                    <td style={{ padding: '10px 12px', color: C.grey }}>
                      <span style={{ fontWeight: 700, color: C.white }}>{s.competency}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: C.grey, textTransform: 'capitalize' }}>{s.importance_level}</td>
                    <td style={{ padding: '10px 12px' }}><ValidationBadge status={s.validation_status} /></td>
                    <td style={{ padding: '10px 12px', color: C.greyD, whiteSpace: 'nowrap' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setNoteTarget({ id: s.id, action: 'validated' })} style={btnStyle(C.green)}>Validate</button>
                        <button onClick={() => setNoteTarget({ id: s.id, action: 'needs_clarification' })} style={btnStyle(C.amber)}>Clarify</button>
                        <button onClick={() => setNoteTarget({ id: s.id, action: 'archived' })} style={btnStyle(C.greyD)}>Archive</button>
                      </div>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={`${s.id}-exp`} style={{ background: C.bgCard }}>
                      <td colSpan={6} style={{ padding: '12px 24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, fontSize: 12 }}>
                          {[
                            { label: 'Competency', value: `${s.competency} — ${COMPETENCY_LABELS[s.competency]}` },
                            { label: 'Occupation', value: s.occupation },
                            { label: 'Region', value: s.region },
                            { label: 'Skill', value: s.skill },
                            { label: 'Proficiency Expectation', value: s.proficiency_expectation },
                            { label: 'Hiring Difficulty', value: s.hiring_difficulty },
                            { label: 'Future Demand', value: s.future_demand },
                            { label: 'Certification Required', value: s.certification_required },
                            { label: 'Emerging Requirement', value: s.emerging_requirement ? 'Yes' : 'No' },
                            { label: 'Source', value: s.source },
                          ].map(f => (
                            <div key={f.label}>
                              <div style={{ color: C.greyD, marginBottom: 2 }}>{f.label}</div>
                              <div style={{ color: C.white }}>{f.value ?? '—'}</div>
                            </div>
                          ))}
                          {s.skills_gap && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <div style={{ color: C.greyD, marginBottom: 2 }}>Skills Gap</div>
                              <div style={{ color: C.white }}>{s.skills_gap}</div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Intelligence Tab ──────────────────────────────────────────────────────────

function IntelligenceTab() {
  const [signals, setSignals] = useState<IntelSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ signals: IntelSignal[] }>('/connector/intelligence')
      .then(r => setSignals(r.signals))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const demandColor = (d: string) => d === 'high' ? C.red : d === 'growing' ? C.amber : d === 'moderate' ? '#60a5fa' : C.greyD;
  const trendIcon = (t: string) => t === 'increasing' ? '↑' : t === 'decreasing' ? '↓' : '→';
  const evidenceColor = (e: string) => e === 'strong' ? C.green : e === 'moderate' ? C.amber : e === 'limited' ? '#60a5fa' : C.greyD;

  if (loading) return <div style={{ color: C.grey, padding: 24 }}>Loading intelligence…</div>;
  if (error) return (
    <div style={{ background: '#1a0505', border: '1px solid #3a0505', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ color: '#fca5a5', fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Unable to load intelligence data</div>
      <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing.</div>
    </div>
  );
  if (signals.length === 0) return <div style={{ color: C.grey, padding: 24, textAlign: 'center' }}>No validated signals yet. Validate signals in the queue to see aggregated intelligence.</div>;

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
            {['Competency','Demand Level','Trend','Evidence','Signals','Employers'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 16px', color: C.greyD, fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map((s, i) => (
            <tr key={s.competency} style={{ borderBottom: i < signals.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <td style={{ padding: '12px 16px' }}>
                <span style={{ fontWeight: 700, color: C.white, fontSize: 14 }}>{s.competency}</span>
                <span style={{ color: C.grey, fontSize: 12, marginLeft: 8 }}>{s.label}</span>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <span style={{ color: demandColor(s.demandLevel), fontWeight: 700, textTransform: 'capitalize', fontSize: 12 }}>{s.demandLevel}</span>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <span style={{ color: s.trend === 'increasing' ? C.green : s.trend === 'decreasing' ? C.red : C.greyD, fontSize: 13, fontWeight: 600 }}>
                  {trendIcon(s.trend)} <span style={{ fontSize: 12, fontWeight: 400 }}>{s.trend}</span>
                </span>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <span style={{ color: evidenceColor(s.evidenceLevel), textTransform: 'capitalize', fontSize: 12, fontWeight: 600 }}>{s.evidenceLevel}</span>
              </td>
              <td style={{ padding: '12px 16px', color: C.white, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.signalCount}</td>
              <td style={{ padding: '12px 16px', color: C.greyD, fontVariantNumeric: 'tabular-nums' }}>{s.contributingEmployers}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ── ConnectorDashboard ────────────────────────────────────────────────────────

export function ConnectorDashboard() {
  const [tab, setTab] = useState<ConnectorTab>('overview');

  const TABS: { key: ConnectorTab; label: string }[] = [
    { key: 'overview',    label: 'Overview' },
    { key: 'signals',     label: 'Employer Signals' },
    { key: 'validation',  label: 'Validation Queue' },
    { key: 'intelligence',label: 'Intelligence' },
  ];

  return (
    <div style={{ background: C.bg, minHeight: '100%', fontFamily: 'DM Sans, sans-serif' }}>
    <div style={{ padding: 'clamp(16px, 3vw, 28px)', maxWidth: 1000, marginInline: 'auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 6 }}>
          AACP Connector
        </div>
        <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 6px', fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)', fontWeight: 800 }}>
          Workforce Intelligence Hub
        </h2>
        <p style={{ color: C.greyD, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          Employer signal ingestion, validation, and competency intelligence across the AACP ecosystem.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 28, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 18px', fontSize: 13, fontWeight: 600,
              color: tab === t.key ? C.white : C.greyD,
              borderBottom: `2px solid ${tab === t.key ? C.crimson : 'transparent'}`,
              marginBottom: -1,
              transition: 'color 0.15s, border-color 0.15s',
              letterSpacing: 0.2,
            }}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'overview'    && <OverviewTab />}
      {tab === 'signals'     && <EmployerSignalsTab />}
      {tab === 'validation'  && <ValidationQueueTab />}
      {tab === 'intelligence'&& <IntelligenceTab />}
    </div>
    </div>
  );
}
