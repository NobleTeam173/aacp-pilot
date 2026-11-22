import { useState, useEffect, useCallback } from 'react';

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyD: '#6b7280',
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

type PSTab = 'signals' | 'emerging' | 'curriculum' | 'gap';

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

interface IntelSignal {
  competency: string;
  label: string;
  demandLevel: string;
  trend: string;
  evidenceLevel: string;
  signalCount: number;
  contributingEmployers: number;
  occupations: string[];
  regions: string[];
}

interface EmergingSkill {
  competency: string;
  label: string;
  status: string;
  signalCount: number;
  contributingEmployers: number;
  latestSignal: string | null;
}

interface CurriculumMapping {
  id: string;
  institution_name: string;
  program_name: string;
  course_name: string | null;
  learning_outcome: string | null;
  skill: string | null;
  aacp_competency: string;
  alignment_level: string;
  notes: string | null;
  created_at: string;
}

interface GapRow {
  competency: string;
  label: string;
  employerDemand: string;
  employerDemandCount: number;
  curriculumCoverage: string;
  curriculumCount: number;
  participantEvidence: string;
  participantCount: number;
}

// ── Competency Signals Tab ────────────────────────────────────────────────────

function CompetencySignalsTab() {
  const [signals, setSignals] = useState<IntelSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [occupation, setOccupation] = useState('');
  const [region, setRegion] = useState('');
  const [subsector, setSubsector] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (occupation) params.set('occupation', occupation);
      if (region) params.set('region', region);
      if (subsector) params.set('subsector', subsector);
      const res = await apiFetch<{ signals: IntelSignal[] }>(`/connector/intelligence?${params}`);
      setSignals(res.signals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [occupation, region, subsector]);

  useEffect(() => { load(); }, [load]);

  const demandColor = (d: string) => d === 'high' ? C.red : d === 'growing' ? C.amber : d === 'moderate' ? '#60a5fa' : C.greyD;
  const trendIcon = (t: string) => t === 'increasing' ? '↑' : t === 'decreasing' ? '↓' : '→';
  const evidenceColor = (e: string) => e === 'strong' ? C.green : e === 'moderate' ? C.amber : e === 'limited' ? '#60a5fa' : C.greyD;

  const inputStyle = {
    background: C.bgCard, border: `1px solid ${C.border}`, color: C.white,
    borderRadius: 8, padding: '7px 12px', fontSize: 13,
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input placeholder="Filter by occupation…" value={occupation} onChange={e => setOccupation(e.target.value)} style={inputStyle} />
        <input placeholder="Filter by region…" value={region} onChange={e => setRegion(e.target.value)} style={inputStyle} />
        <input placeholder="Filter by industry subsector…" value={subsector} onChange={e => setSubsector(e.target.value)} style={inputStyle} />
      </div>

      {loading ? (
        <div style={{ color: C.grey, padding: 24 }}>Loading competency signals…</div>
      ) : error ? (
        <div style={{ color: C.red, padding: 24 }}>{error}</div>
      ) : signals.length === 0 ? (
        <div style={{ color: C.grey, padding: 24, textAlign: 'center' }}>No validated competency signals available yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Competency','Demand Level','Trend','Evidence Level','Employers Contributing','Last Updated'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: C.grey, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.map(s => (
                <tr key={s.competency} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontWeight: 700, color: C.white }}>{s.competency}</span>
                    <span style={{ color: C.grey, fontSize: 12, display: 'block' }}>{s.label}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: demandColor(s.demandLevel), fontWeight: 700, textTransform: 'capitalize' }}>{s.demandLevel}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: s.trend === 'increasing' ? C.green : s.trend === 'decreasing' ? C.red : C.grey }}>
                      {trendIcon(s.trend)} {s.trend}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: evidenceColor(s.evidenceLevel), textTransform: 'capitalize' }}>{s.evidenceLevel}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: C.white, fontWeight: 600 }}>{s.contributingEmployers}</td>
                  <td style={{ padding: '10px 12px', color: C.greyD, fontSize: 12 }}>
                    {s.regions.length > 0 ? s.regions.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Emerging Skills Tab ───────────────────────────────────────────────────────

function EmergingSkillsTab() {
  const [skills, setSkills] = useState<EmergingSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ emergingSkills: EmergingSkill[] }>('/connector/emerging-skills')
      .then(r => setSkills(r.emergingSkills))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const statusStyle = (status: string): React.CSSProperties => {
    const map: Record<string, { color: string; bg: string; border: string }> = {
      emerging:             { color: C.red,   bg: C.redBg,   border: C.redBorder },
      growing:              { color: C.amber, bg: C.amberBg, border: C.amberBorder },
      stable:               { color: C.green, bg: C.greenBg, border: C.greenBorder },
      insufficient_evidence:{ color: C.greyD, bg: '#111',    border: '#333' },
    };
    const s = map[status] ?? map.insufficient_evidence;
    return { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, color: s.color, background: s.bg, border: `1px solid ${s.border}`, display: 'inline-block' };
  };

  const statusLabel = (s: string) => s === 'insufficient_evidence' ? 'Insufficient Evidence' : s.charAt(0).toUpperCase() + s.slice(1);

  if (loading) return <div style={{ color: C.grey, padding: 24 }}>Loading emerging skills…</div>;
  if (error) return <div style={{ color: C.red, padding: 24 }}>{error}</div>;
  if (skills.length === 0) return <div style={{ color: C.grey, padding: 24, textAlign: 'center' }}>No emerging skill signals available yet.</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
      {skills.map(s => (
        <div key={s.competency} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 800, color: C.white, fontSize: 20, fontFamily: 'Fraunces, serif' }}>{s.competency}</div>
              <div style={{ color: C.grey, fontSize: 12, marginTop: 2 }}>{s.label}</div>
            </div>
            <span style={statusStyle(s.status)}>{statusLabel(s.status)}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <div>
              <div style={{ color: C.greyD }}>Signals</div>
              <div style={{ color: C.white, fontWeight: 700 }}>{s.signalCount}</div>
            </div>
            <div>
              <div style={{ color: C.greyD }}>Employers</div>
              <div style={{ color: C.white, fontWeight: 700 }}>{s.contributingEmployers}</div>
            </div>
            {s.latestSignal && (
              <div>
                <div style={{ color: C.greyD }}>Latest</div>
                <div style={{ color: C.white }}>{new Date(s.latestSignal).toLocaleDateString()}</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Curriculum Alignment Tab ──────────────────────────────────────────────────

const BLANK_MAPPING = {
  institution_name: '',
  program_name: '',
  course_name: '',
  learning_outcome: '',
  skill: '',
  aacp_competency: 'SR',
  alignment_level: 'insufficient_evidence',
  notes: '',
};

function CurriculumAlignmentTab() {
  const [mappings, setMappings] = useState<CurriculumMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK_MAPPING, institution_name: localStorage.getItem('aacp_institution_name') ?? '' });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ mappings: CurriculumMapping[] }>('/postsecondary/curriculum-mappings');
      setMappings(res.mappings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.program_name || !form.institution_name || !form.aacp_competency) return;
    if (form.institution_name) localStorage.setItem('aacp_institution_name', form.institution_name);
    setSubmitting(true);
    try {
      await apiFetch('/postsecondary/curriculum-mappings', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      showToast('Mapping added');
      setShowForm(false);
      setForm({ ...BLANK_MAPPING, institution_name: form.institution_name });
      loadMappings();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', false);
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    background: C.bg, border: `1px solid ${C.border}`, color: C.white,
    borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' as const,
  };
  const labelStyle = { fontSize: 12, color: C.grey, display: 'block', marginBottom: 4 };

  const alignLabel = (a: string) => ({
    strong: 'Strong', moderate: 'Moderate', developing: 'Developing',
    gap: 'Gap', insufficient_evidence: 'Insufficient Evidence',
  }[a] ?? a);

  const alignColor = (a: string) => a === 'strong' ? C.green : a === 'moderate' ? C.amber : a === 'developing' ? '#60a5fa' : a === 'gap' ? C.red : C.greyD;

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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={() => setShowForm(f => !f)}
          style={{
            background: C.crimson, color: C.white, border: 'none',
            borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >{showForm ? 'Cancel' : '+ Add Mapping'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h4 style={{ color: C.white, fontSize: 14, fontWeight: 700, margin: '0 0 20px' }}>New Curriculum Mapping</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {[
              { key: 'institution_name', label: 'Institution Name *', type: 'text' },
              { key: 'program_name',     label: 'Program Name *',     type: 'text' },
              { key: 'course_name',      label: 'Course Name',        type: 'text' },
              { key: 'skill',            label: 'Specific Skill',     type: 'text' },
            ].map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                <input
                  type={f.type}
                  required={f.key === 'institution_name' || f.key === 'program_name'}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
            <div>
              <label style={labelStyle}>AACP Competency *</label>
              <select value={form.aacp_competency} onChange={e => setForm(p => ({ ...p, aacp_competency: e.target.value }))} style={inputStyle}>
                {COMPETENCY_KEYS.map(k => <option key={k} value={k}>{k} — {COMPETENCY_LABELS[k]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Alignment Level</label>
              <select value={form.alignment_level} onChange={e => setForm(p => ({ ...p, alignment_level: e.target.value }))} style={inputStyle}>
                <option value="strong">Strong</option>
                <option value="moderate">Moderate</option>
                <option value="developing">Developing</option>
                <option value="gap">Gap</option>
                <option value="insufficient_evidence">Insufficient Evidence</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Learning Outcome</label>
              <input type="text" value={form.learning_outcome} onChange={e => setForm(p => ({ ...p, learning_outcome: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <button
              type="submit"
              disabled={submitting || !form.program_name || !form.institution_name}
              style={{
                background: (form.program_name && form.institution_name) ? C.crimson : C.bgCard,
                color: C.white, border: 'none', borderRadius: 8,
                padding: '9px 20px', fontSize: 13, fontWeight: 700,
                cursor: (form.program_name && form.institution_name) ? 'pointer' : 'not-allowed',
              }}
            >{submitting ? 'Saving…' : 'Save Mapping'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ color: C.grey, padding: 24 }}>Loading mappings…</div>
      ) : error ? (
        <div style={{ color: C.red, padding: 24 }}>{error}</div>
      ) : mappings.length === 0 ? (
        <div style={{ color: C.grey, padding: 24, textAlign: 'center' }}>No curriculum mappings yet. Add the first one above.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Program','Course','Competency','Skill','Alignment','Date'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: C.grey, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 12px', color: C.white, fontWeight: 600 }}>{m.program_name}</td>
                  <td style={{ padding: '10px 12px', color: C.grey }}>{m.course_name ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontWeight: 700, color: C.white }}>{m.aacp_competency}</span>
                    <span style={{ color: C.greyD, fontSize: 12, marginLeft: 6 }}>{COMPETENCY_LABELS[m.aacp_competency]}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: C.grey }}>{m.skill ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: alignColor(m.alignment_level), fontWeight: 700 }}>{alignLabel(m.alignment_level)}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: C.greyD, fontSize: 12 }}>
                    {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Competency Gap Tab ────────────────────────────────────────────────────────

function CompetencyGapTab() {
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ gaps: GapRow[] }>('/connector/gap')
      .then(r => setGaps(r.gaps))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function cellColor(val: string): string {
    if (['High','Strong'].includes(val)) return C.green;
    if (['Growing','Moderate'].includes(val)) return C.amber;
    if (['Developing','Limited'].includes(val)) return '#60a5fa';
    if (['Low','No Data'].includes(val)) return C.greyD;
    return C.grey;
  }

  if (loading) return <div style={{ color: C.grey, padding: 24 }}>Loading gap analysis…</div>;
  if (error) return <div style={{ color: C.red, padding: 24 }}>{error}</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <p style={{ color: C.grey, fontSize: 12, marginBottom: 16 }}>
        This analysis compares employer demand, your curriculum coverage, and AACP participant evidence across all 13 competencies.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Competency','Employer Demand','Curriculum Coverage','Participant Evidence'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: C.grey, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gaps.map(g => (
            <tr key={g.competency} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ fontWeight: 700, color: C.white }}>{g.competency}</span>
                <span style={{ color: C.grey, fontSize: 12, display: 'block' }}>{g.label}</span>
              </td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ fontWeight: 700, color: cellColor(g.employerDemand) }}>{g.employerDemand}</span>
                {g.employerDemandCount > 0 && <span style={{ color: C.greyD, fontSize: 11, marginLeft: 6 }}>({g.employerDemandCount} signals)</span>}
              </td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ fontWeight: 700, color: cellColor(g.curriculumCoverage) }}>{g.curriculumCoverage}</span>
                {g.curriculumCount > 0 && <span style={{ color: C.greyD, fontSize: 11, marginLeft: 6 }}>({g.curriculumCount} mappings)</span>}
              </td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ fontWeight: 700, color: cellColor(g.participantEvidence) }}>{g.participantEvidence}</span>
                {g.participantCount > 0 && <span style={{ color: C.greyD, fontSize: 11, marginLeft: 6 }}>({g.participantCount} participants)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── IndustryIntelligence ──────────────────────────────────────────────────────

export function IndustryIntelligence() {
  const [tab, setTab] = useState<PSTab>('signals');

  const TABS: { key: PSTab; label: string }[] = [
    { key: 'signals',    label: 'Competency Signals' },
    { key: 'emerging',   label: 'Emerging Skills' },
    { key: 'curriculum', label: 'Curriculum Alignment' },
    { key: 'gap',        label: 'Competency Gap' },
  ];

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 28px)', fontFamily: 'DM Sans, sans-serif', maxWidth: 1000, marginInline: 'auto' }}>
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 6px', fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)', fontWeight: 700 }}>
          Industry Intelligence
        </h2>
        <p style={{ color: C.grey, fontSize: 13, margin: '0 0 4px' }}>
          Connect what you teach with what industry needs.
        </p>
        <p style={{ color: C.greyD, fontSize: 12, margin: '0 0 16px' }}>
          Powered by the AACP Connector — Translating employer competency signals into actionable curriculum and workforce intelligence.
        </p>
        <p style={{ color: C.greyD, fontSize: 11, margin: 0, fontStyle: 'italic' }}>
          AACP provides workforce intelligence to inform curriculum decisions. Academic, regulatory, and accreditation decisions remain the responsibility of the institution.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, margin: '20px 0 28px', borderBottom: `1px solid ${C.border}`, paddingBottom: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 16px', fontSize: 13, fontWeight: 700,
              color: tab === t.key ? C.white : C.greyD,
              borderBottom: `2px solid ${tab === t.key ? C.crimson : 'transparent'}`,
              marginBottom: -1,
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'signals'    && <CompetencySignalsTab />}
      {tab === 'emerging'   && <EmergingSkillsTab />}
      {tab === 'curriculum' && <CurriculumAlignmentTab />}
      {tab === 'gap'        && <CompetencyGapTab />}
    </div>
  );
}
