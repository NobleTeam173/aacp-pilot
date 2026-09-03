﻿import { useState, useEffect, useCallback } from 'react';
import { C } from '../../theme';

const COMPETENCY_KEYS = ['SR','MR','AP','PS','SO','DM','WM','MT','CM','PR','SA','AL','AK'] as const;
const COMPETENCY_LABELS: Record<string,string> = {
  SR:'Spatial Reasoning', MR:'Mechanical Reasoning', AP:'Attention & Precision',
  PS:'Problem Solving', SO:'Safety Orientation', DM:'Decision Making',
  WM:'Working Memory', MT:'Multitasking & Prioritization', CM:'Communication',
  PR:'Procedural Reasoning', SA:'Situational Awareness', AL:'Adaptive Learning',
  AK:'Aviation Knowledge',
};

type ConnectorTab = 'overview' | 'signals' | 'validation' | 'intelligence' | 'contributors' | 'ips_submit';

function decodeGarbled(text: string | null | undefined): string {
  if (!text) return text ?? '';
  return text
    .replace(/â€"/g, '—')  // â€" → —
    .replace(/â€™/g, '’')  // â€™ → ’
    .replace(/â€œ/g, '“')  // â€œ → "
    .replace(/â€/g, '”')  // â€ → "
    .replace(/â€¦/g, '…')  // â€¦ → …
    .replace(/â€¢/g, '•')  // â€¢ → •
    .replace(/Â·/g, '·');        // Â· → ·
}

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
  signal_source_type: string;
  contributor_id: string | null;
}

interface IntelSignal {
  competency: string;
  label: string;
  demandLevel: string;
  trend: string;
  evidenceLevel: string;
  signalCount: number;
  contributingOrganizations: number;
  contributingEmployers?: number; // legacy compat
}

interface IPSIntelSignal {
  competency: string;
  label: string;
  demandLevel: string;
  trend: string;
  evidenceLevel: string;
  signalCount: number;
  contributingPractitioners: number;
}

interface IntelResponse {
  employerIntelligence: { signals: IntelSignal[]; totalValidatedSignals: number; _sourceNote?: string };
  industryProfessionalIntelligence: { signals: IPSIntelSignal[]; totalValidatedSignals: number; _sourceNote?: string };
  lastUpdated: string | null;
}

interface Contributor {
  id: string;
  user_id: string;
  occupation: string | null;
  industry_subsector: string | null;
  years_experience: number | null;
  licences_credentials: string | null;
  affiliation_org_name: string | null;
  professional_role_title: string | null;
  contributor_status: string;
  verified_at: string | null;
  created_at: string;
}

function KpiTile({ label, value, accent, size = 'md', onClick }: { label: string; value: string | number; accent?: string; size?: 'lg' | 'md' | 'sm'; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderTop: accent ? `3px solid ${accent}` : `1px solid ${C.border}`,
        borderRadius: 14,
        padding: size === 'lg' ? '22px 24px' : '16px 20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: onClick ? 'border-color 0.15s, background 0.15s' : undefined,
      }}
      onMouseEnter={onClick ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = accent ?? C.border; } : undefined}
      onMouseLeave={onClick ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; } : undefined}
    >
      <div style={{ color: accent ?? C.white, fontSize: size === 'lg' ? 38 : size === 'md' ? 30 : 22, fontWeight: 800, fontFamily: 'Fraunces, serif', lineHeight: 1 }}>{value}</div>
      <div style={{ color: C.greyD, fontSize: 11, marginTop: size === 'lg' ? 12 : 8, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600, lineHeight: 1.4 }}>
        {label}{onClick && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>↗</span>}
      </div>
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
    under_review:       { color: C.blue, bg: C.blueBg, border: C.blueBorder, label: 'Under Review' },
    validated:          { color: C.green, bg: C.greenBg, border: C.greenBorder, label: 'Validated' },
    needs_clarification:{ color: '#f97316', bg: C.amberBg, border: C.amberBorder, label: 'Needs Clarification' },
    archived:           { color: C.greyD, bg: C.bgDeep, border: C.border, label: 'Archived' },
  };
  const s = map[status] ?? { color: C.grey, bg: C.bgCard, border: C.border, label: status };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>{s.label}</span>
  );
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  const isIPS = sourceType === 'industry_professional';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
      color: isIPS ? '#7c3aed' : C.blue,
      background: isIPS ? '#ede9fe22' : C.blueBg,
      border: `1px solid ${isIPS ? '#7c3aed44' : C.blueBorder}`,
      letterSpacing: '0.04em', whiteSpace: 'nowrap' as const,
    }}>{isIPS ? 'Industry Professional' : 'Employer'}</span>
  );
}

// ── Participant Evidence Supply modal ──────────────────────────────────────────

interface EvidenceParticipant {
  participantId: string;
  name: string;
  email: string;
  evidenceSources: string[];
  competenciesEvidenced: string[];
  evidenceCount: number;
  sourceCount: number;
  latestEvidenceAt: string;
  aciaStatus: string;
  aciaStage: string | null;
  programStatus: string;
}

function ParticipantEvidenceModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<EvidenceParticipant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ participants: EvidenceParticipant[]; total: number }>('/connector/participant-evidence')
      .then(r => setRows(r.participants))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-CA') : '—';
  const aciaColor = (s: string) => s === 'completed' ? C.green : C.greyD;
  const progLabel = (s: string) => s === 'not_enrolled' ? '—' : s.replace(/_/g, ' ');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, width: '100%', maxWidth: 980, padding: 28, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: C.greyD, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: C.blue, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>Evidence Supply</div>
          <div style={{ color: C.white, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Participant Evidence Available</div>
          <div style={{ color: C.greyD, fontSize: 12 }}>
            Participants with at least one valid persisted competency evidence record in <code style={{ color: C.grey }}>competency_evidence</code> where <code style={{ color: C.grey }}>invalidated_at IS NULL</code>. Counts ACIA, coach, mentor, program, employer, and all other approved sources.
          </div>
        </div>

        {loading ? (
          <div style={{ color: C.grey, padding: '32px 0' }}>Loading evidence supply…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: C.greyD, padding: '32px 0', textAlign: 'center' }}>No persisted evidence records found. Evidence is written when participants complete ACIA or receive coach/mentor observations.</div>
        ) : (
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Participant', 'Evidence Sources', 'Competencies Evidenced', '#', 'Latest Evidence', 'ACIA Status', 'Program Status'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: C.greyD, fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.participantId} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 10px', overflow: 'hidden' }}>
                      <div style={{ color: C.white, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.participantId.slice(0, 12) + '…'}</div>
                      <div style={{ color: C.greyD, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email || 'no email on record'}</div>
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {p.evidenceSources.map(s => (
                          <span key={s} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 6px', fontSize: 10, color: C.grey, whiteSpace: 'nowrap' }}>{s}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {p.competenciesEvidenced.map(c => (
                          <span key={c} style={{ background: '#0a1020', border: `1px solid ${C.blueBorder ?? C.border}`, borderRadius: 4, padding: '1px 5px', fontSize: 10, color: C.blue, fontWeight: 700 }}>{c}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 10px', color: C.white, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{p.evidenceCount}</td>
                    <td style={{ padding: '10px 10px', color: C.greyD, whiteSpace: 'nowrap', fontSize: 11 }}>{fmtDate(p.latestEvidenceAt)}</td>
                    <td style={{ padding: '10px 10px' }}>
                      <span style={{ color: aciaColor(p.aciaStatus), fontWeight: 600, fontSize: 11, textTransform: 'capitalize' }}>
                        {p.aciaStatus === 'completed' ? `✓ ${p.aciaStage ?? 'baseline'}` : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 10px', color: C.greyD, fontSize: 11, textTransform: 'capitalize' }}>{progLabel(p.programStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, color: C.greyD, fontSize: 11 }}>
              {rows.length} participant{rows.length !== 1 ? 's' : ''} with qualifying evidence
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

  useEffect(() => {
    apiFetch<Overview>('/connector/overview')
      .then(setOverview)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: C.grey, padding: 32 }}>Loading overview…</div>;
  if (error) return (
    <div style={{ background: C.redBg, border: '1px solid #3a0505', borderRadius: 12, padding: '20px 24px', margin: '8px 0' }}>
      <div style={{ color: C.red, fontWeight: 700, marginBottom: 4, fontSize: 14 }}>Unable to load overview</div>
      <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing. Contact support if the problem persists.</div>
    </div>
  );
  if (!overview) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {showEvidenceModal && <ParticipantEvidenceModal onClose={() => setShowEvidenceModal(false)} />}

      {/* Primary reach KPIs */}
      <div>
        <SectionEyebrow>Platform Reach</SectionEyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          <KpiTile label="Employers Contributing" value={overview.employersContributing} accent={C.crimson} size="lg" />
          <KpiTile label="Participant Evidence Available" value={overview.participantEvidence} accent={C.blue} size="lg" onClick={() => setShowEvidenceModal(true)} />
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

// â"€â"€ Employer Signals Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
  const [sourceFilter, setSourceFilter] = useState('employer');
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
      if (sourceFilter) params.set('sourceType', sourceFilter);
      const res = await apiFetch<{ signals: Signal[] }>(`/connector/signals?${params}`);
      setSignals(res.signals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, compFilter, sourceFilter]);

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
    background: C.bg, border: `1px solid ${C.border}`, color: C.white,
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
        }}>{toast.ok ? '✓ ' : 'âœ• '}{toast.msg}</div>
      )}

      {/* Filters + Add button */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="">All Sources</option>
          <option value="employer">Employer</option>
          <option value="industry_professional">Industry Professional</option>
        </select>
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
        <div style={{ background: C.redBg, border: '1px solid #3a0505', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ color: C.red, fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Unable to load signals</div>
          <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing.</div>
        </div>
      ) : signals.length === 0 ? (
        <div style={{ color: C.grey, padding: 24, textAlign: 'center' }}>No signals found. Add the first one above.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Source','Employer / Contributor','Competency','Importance','Future Demand','Occupation','Status','Date'].map(h => (
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
                    <td style={{ padding: '10px 12px' }}><SourceBadge sourceType={s.signal_source_type ?? 'employer'} /></td>
                    <td style={{ padding: '10px 12px', color: C.white, fontWeight: 600 }}>{s.employer_name}</td>
                    <td style={{ padding: '10px 12px', color: C.grey }}><span style={{ fontWeight: 700, color: C.white }}>{s.competency}</span> <span style={{ color: C.greyD }}>— {COMPETENCY_LABELS[s.competency]}</span></td>
                    <td style={{ padding: '10px 12px', color: C.grey, textTransform: 'capitalize' }}>{s.importance_level}</td>
                    <td style={{ padding: '10px 12px', color: C.grey, textTransform: 'capitalize' }}>{s.future_demand}</td>
                    <td style={{ padding: '10px 12px', color: C.grey }}>{s.occupation ?? '—'}</td>
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
                            { label: 'Validation Notes', value: decodeGarbled(s.validation_notes) },
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

// â"€â"€ Validation Queue Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

// â"€â"€ Intelligence Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function IntelSignalTable({ signals, countLabel }: { signals: (IntelSignal | IPSIntelSignal)[]; countLabel: string }) {
  const demandColor = (d: string) => d === 'high' ? C.red : d === 'growing' ? C.amber : d === 'moderate' ? C.blue : C.greyD;
  const trendIcon = (t: string) => t === 'increasing' ? '↑' : t === 'decreasing' ? '↓' : '→';
  const evidenceColor = (e: string) => e === 'strong' ? C.green : e === 'moderate' ? C.amber : e === 'limited' ? C.blue : C.greyD;
  if (signals.length === 0) return (
    <div style={{ color: C.greyD, padding: '20px 16px', textAlign: 'center', fontSize: 13 }}>No validated signals yet.</div>
  );
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
            {['Competency', 'Demand Level', 'Trend', 'Evidence', 'Signals', countLabel].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 16px', color: C.greyD, fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map((s, i) => {
            const count = (s as IntelSignal).contributingOrganizations ?? (s as IntelSignal).contributingEmployers ?? (s as IPSIntelSignal).contributingPractitioners ?? 0;
            return (
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
                <td style={{ padding: '12px 16px', color: C.greyD, fontVariantNumeric: 'tabular-nums' }}>{count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IntelligenceTab() {
  const [data, setData] = useState<IntelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<IntelResponse>('/connector/intelligence')
      .then(r => setData(r))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: C.grey, padding: 24 }}>Loading intelligence…</div>;
  if (error) return (
    <div style={{ background: C.redBg, border: '1px solid #3a0505', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ color: C.red, fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Unable to load intelligence data</div>
      <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing.</div>
    </div>
  );
  if (!data) return null;

  const empSignals = data.employerIntelligence?.signals ?? [];
  const ipsSignals = data.industryProfessionalIntelligence?.signals ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {data.lastUpdated && (
        <div style={{ color: C.greyD, fontSize: 11, textAlign: 'right' }}>
          Last updated: {new Date(data.lastUpdated).toLocaleString()}
        </div>
      )}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <SourceBadge sourceType="employer" />
          <span style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>Employer Intelligence</span>
          <span style={{ color: C.greyD, fontSize: 12, marginLeft: 'auto' }}>
            {data.employerIntelligence?.totalValidatedSignals ?? empSignals.length} validated signals
          </span>
        </div>
        <IntelSignalTable signals={empSignals} countLabel="Organizations" />
      </div>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <SourceBadge sourceType="industry_professional" />
          <span style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>Practitioner Intelligence</span>
          <span style={{ color: C.greyD, fontSize: 12, marginLeft: 'auto' }}>
            {data.industryProfessionalIntelligence?.totalValidatedSignals ?? ipsSignals.length} validated signals
          </span>
        </div>
        <IntelSignalTable signals={ipsSignals} countLabel="Practitioners" />
        <div style={{ padding: '10px 16px', borderTop: ipsSignals.length > 0 ? `1px solid ${C.border}` : undefined }}>
          <div style={{ color: C.greyD, fontSize: 11, fontStyle: 'italic' }}>
            Practitioner intelligence is attributed and preserved separately. No convergence score or consensus is calculated.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Contributors Tab ──────────────────────────────────────────────────────────

function ContributorsTab() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    user_id: '', occupation: '', industry_subsector: '',
    years_experience: '', licences_credentials: '', affiliation_org_name: '',
    professional_role_title: '',
  });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    apiFetch<{ contributors: Contributor[] }>('/admin/ips/contributors')
      .then(r => setContributors(r.contributors ?? []))
      .catch(() => setError('Failed to load contributors.'))
      .finally(() => setLoading(false));
  }, []);

  const refresh = () => {
    setLoading(true);
    apiFetch<{ contributors: Contributor[] }>('/admin/ips/contributors')
      .then(r => setContributors(r.contributors ?? []))
      .catch(() => setError('Failed to reload.'))
      .finally(() => setLoading(false));
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await apiFetch<unknown>(`/admin/ips/contributors/${id}`, { method: 'PUT', body: JSON.stringify({ contributor_status: status }) });
      showToast(`Contributor ${status}.`);
      refresh();
    } catch { showToast('Action failed.'); }
  };

  const handleCreate = async () => {
    if (!form.user_id.trim()) { showToast('User ID is required.'); return; }
    setCreating(true);
    try {
      await apiFetch<unknown>('/admin/ips/contributors', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          years_experience: form.years_experience ? parseInt(form.years_experience, 10) : null,
        }),
      });
      showToast('Contributor created.');
      setShowCreate(false);
      setForm({ user_id: '', occupation: '', industry_subsector: '', years_experience: '', licences_credentials: '', affiliation_org_name: '', professional_role_title: '' });
      refresh();
    } catch { showToast('Create failed.'); }
    finally { setCreating(false); }
  };

  const statusColor = (s: string) => s === 'verified' ? C.green : s === 'suspended' ? '#f59e0b' : s === 'rejected' ? C.crimson : C.greyD;

  const inp = (label: string, key: keyof typeof form) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ color: C.grey, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>{label}</label>
      <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.white, fontSize: 13, padding: '7px 10px' }} />
    </div>
  );

  return (
    <div>
      {toast && <div style={{ background: C.green, color: '#000', padding: '8px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{toast}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3 style={{ color: C.white, margin: 0, fontSize: 15, fontWeight: 700 }}>Industry Professional Contributors</h3>
        <button onClick={() => setShowCreate(s => !s)}
          style={{ background: C.crimson, border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {showCreate ? 'Cancel' : '+ New Contributor'}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h4 style={{ color: C.white, margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Create Contributor</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            {inp('User ID *', 'user_id')}
            {inp('Occupation', 'occupation')}
            {inp('Industry Subsector', 'industry_subsector')}
            {inp('Years Experience', 'years_experience')}
            {inp('Licences / Credentials', 'licences_credentials')}
            {inp('Affiliation / Org', 'affiliation_org_name')}
            {inp('Professional Role Title', 'professional_role_title')}
          </div>
          <button onClick={handleCreate} disabled={creating}
            style={{ background: C.crimson, border: 'none', borderRadius: 8, color: '#fff', padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: C.grey }}>Loading contributors…</p>
      ) : error ? (
        <p style={{ color: C.crimson }}>{error}</p>
      ) : contributors.length === 0 ? (
        <p style={{ color: C.grey, fontSize: 13 }}>No contributors found.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['User ID', 'Occupation', 'Industry', 'Org', 'Status', 'Verified At', 'Actions'].map(h => (
                  <th key={h} style={{ color: C.grey, fontWeight: 600, fontSize: 11, letterSpacing: 0.5, padding: '8px 10px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contributors.map(c => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ color: C.greyD, padding: '10px 10px', fontFamily: 'monospace', fontSize: 11 }}>{c.user_id.slice(0, 12)}…</td>
                  <td style={{ color: C.white, padding: '10px 10px' }}>{c.occupation ?? '—'}</td>
                  <td style={{ color: C.greyD, padding: '10px 10px' }}>{c.industry_subsector ?? '—'}</td>
                  <td style={{ color: C.greyD, padding: '10px 10px' }}>{c.affiliation_org_name ?? '—'}</td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(c.contributor_status), background: statusColor(c.contributor_status) + '22', padding: '2px 8px', borderRadius: 5, border: `1px solid ${statusColor(c.contributor_status)}44` }}>
                      {c.contributor_status}
                    </span>
                  </td>
                  <td style={{ color: C.greyD, padding: '10px 10px', fontSize: 11 }}>{c.verified_at ? new Date(c.verified_at).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '10px 10px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.contributor_status !== 'verified' && (
                        <button onClick={() => updateStatus(c.id, 'verified')}
                          style={{ fontSize: 11, background: C.green + '22', border: `1px solid ${C.green}44`, color: C.green, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}>Verify</button>
                      )}
                      {c.contributor_status !== 'rejected' && (
                        <button onClick={() => updateStatus(c.id, 'rejected')}
                          style={{ fontSize: 11, background: C.crimson + '22', border: `1px solid ${C.crimson}44`, color: C.crimson, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}>Reject</button>
                      )}
                      {c.contributor_status !== 'suspended' && (
                        <button onClick={() => updateStatus(c.id, 'suspended')}
                          style={{ fontSize: 11, background: '#f59e0b22', border: '1px solid #f59e0b44', color: '#f59e0b', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}>Suspend</button>
                      )}
                    </div>
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

// ── IPS Submit Tab ────────────────────────────────────────────────────────────

interface IPSSignal {
  id: string;
  occupation: string;
  industry_subsector: string;
  region: string;
  competency: string;
  skill: string;
  importance_level: string;
  proficiency_expectation: string;
  skills_gap: string | null;
  emerging_requirement: string | null;
  future_demand: string | null;
  signal_source_type: string;
  validation_status: string;
  created_at: string;
}

function IPSSubmitTab() {
  const [signals, setSignals] = useState<IPSSignal[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({
    occupation: '', industry_subsector: '', region: '',
    competency: COMPETENCY_KEYS[0] as string, skill: '',
    importance_level: 'high', proficiency_expectation: '',
    skills_gap: '', emerging_requirement: '', future_demand: '',
  });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const loadSignals = () => {
    setLoadingSignals(true);
    apiFetch<{ signals: IPSSignal[] }>('/industry-professional/signals')
      .then(r => setSignals(r.signals ?? []))
      .catch(() => setSignals([]))
      .finally(() => setLoadingSignals(false));
  };

  useEffect(() => { loadSignals(); }, []);

  const handleSubmit = async () => {
    const required = ['occupation', 'industry_subsector', 'region', 'competency', 'skill', 'importance_level', 'proficiency_expectation'] as const;
    for (const f of required) {
      if (!form[f].trim()) { showToast(`${f.replace(/_/g, ' ')} is required.`); return; }
    }
    setSubmitting(true);
    try {
      await apiFetch<unknown>('/industry-professional/signals', {
        method: 'POST',
        body: JSON.stringify({
          occupation: form.occupation,
          industry_subsector: form.industry_subsector,
          region: form.region,
          competency: form.competency,
          skill: form.skill,
          importance_level: form.importance_level,
          proficiency_expectation: form.proficiency_expectation,
          skills_gap: form.skills_gap || null,
          emerging_requirement: form.emerging_requirement || null,
          future_demand: form.future_demand || null,
        }),
      });
      showToast('Signal submitted successfully.');
      setForm({ occupation: '', industry_subsector: '', region: '', competency: COMPETENCY_KEYS[0], skill: '', importance_level: 'high', proficiency_expectation: '', skills_gap: '', emerging_requirement: '', future_demand: '' });
      loadSignals();
    } catch (e: any) {
      showToast(e?.message ?? 'Submission failed.');
    } finally { setSubmitting(false); }
  };

  const selStyle: React.CSSProperties = { background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.white, fontSize: 13, padding: '7px 10px', width: '100%' };
  const inpStyle: React.CSSProperties = { ...selStyle };

  const field = (label: string, key: keyof typeof form, type: 'input' | 'select' | 'textarea' = 'input', options?: string[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ color: C.grey, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>{label}</label>
      {type === 'select' ? (
        <select value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={selStyle}>
          {options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          rows={2} style={{ ...inpStyle, resize: 'vertical' }} />
      ) : (
        <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inpStyle} />
      )}
    </div>
  );

  const validationColor = (s: string) => s === 'validated' ? C.green : s === 'rejected' ? C.crimson : C.greyD;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }}>
      {/* Submission form */}
      <div>
        <h3 style={{ color: C.white, margin: '0 0 18px', fontSize: 15, fontWeight: 700 }}>Submit IPS Signal</h3>
        {toast && <div style={{ background: C.green, color: '#000', padding: '8px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>{toast}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {field('Occupation *', 'occupation')}
          {field('Industry Subsector *', 'industry_subsector')}
          {field('Region *', 'region')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: C.grey, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>Competency *</label>
            <select value={form.competency} onChange={e => setForm(f => ({ ...f, competency: e.target.value }))} style={selStyle}>
              {COMPETENCY_KEYS.map(k => <option key={k} value={k}>{COMPETENCY_LABELS[k]}</option>)}
            </select>
          </div>
          {field('Skill *', 'skill')}
          {field('Importance Level *', 'importance_level', 'select', ['critical', 'high', 'medium', 'low'])}
          {field('Proficiency Expectation *', 'proficiency_expectation', 'textarea')}
          {field('Skills Gap (optional)', 'skills_gap', 'textarea')}
          {field('Emerging Requirement (optional)', 'emerging_requirement', 'textarea')}
          {field('Future Demand (optional)', 'future_demand', 'textarea')}
          <button onClick={handleSubmit} disabled={submitting}
            style={{ background: C.crimson, border: 'none', borderRadius: 8, color: '#fff', padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, marginTop: 4 }}>
            {submitting ? 'Submitting…' : 'Submit Signal'}
          </button>
          <p style={{ color: C.grey, fontSize: 11, margin: 0, lineHeight: 1.5 }}>
            Signal source type, contributor ID, and validation status are server-controlled and not configurable here.
          </p>
        </div>
      </div>

      {/* Own signals list */}
      <div>
        <h3 style={{ color: C.white, margin: '0 0 18px', fontSize: 15, fontWeight: 700 }}>My Submitted Signals</h3>
        {loadingSignals ? (
          <p style={{ color: C.grey, fontSize: 13 }}>Loading…</p>
        ) : signals.length === 0 ? (
          <p style={{ color: C.grey, fontSize: 13 }}>No signals submitted yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {signals.map(s => (
              <div key={s.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: C.white, fontWeight: 700, fontSize: 13 }}>{COMPETENCY_LABELS[s.competency] ?? s.competency}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: validationColor(s.validation_status), background: validationColor(s.validation_status) + '22', padding: '2px 8px', borderRadius: 5, border: `1px solid ${validationColor(s.validation_status)}44` }}>
                    {s.validation_status}
                  </span>
                </div>
                <div style={{ color: C.greyD, fontSize: 12 }}>{s.skill}</div>
                <div style={{ color: C.grey, fontSize: 11, marginTop: 4 }}>{s.occupation} · {s.industry_subsector} · {s.region}</div>
                <div style={{ color: C.grey, fontSize: 10, marginTop: 4 }}>{new Date(s.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ConnectorDashboard ────────────────────────────────────────────────────────

export function ConnectorDashboard() {
  const [tab, setTab] = useState<ConnectorTab>('overview');
  const [isContributor, setIsContributor] = useState<boolean | null>(null);

  const role = localStorage.getItem('aacp_role') ?? '';
  const isAdmin = role === 'admin' || role === 'super_admin';

  useEffect(() => {
    // Probe contributor eligibility via backend — backend is authoritative.
    apiFetch<unknown>('/industry-professional/signals')
      .then(() => setIsContributor(true))
      .catch(() => setIsContributor(false));
  }, []);

  const ALL_TABS: { key: ConnectorTab; label: string; visible: boolean }[] = [
    { key: 'overview',     label: 'Overview',          visible: true },
    { key: 'signals',      label: 'Employer Signals',  visible: true },
    { key: 'validation',   label: 'Validation Queue',  visible: true },
    { key: 'intelligence', label: 'Intelligence',      visible: true },
    { key: 'contributors', label: 'Contributors',      visible: isAdmin },
    { key: 'ips_submit',   label: 'IPS Signals',       visible: isContributor === true },
  ];
  const TABS = ALL_TABS.filter(t => t.visible);

  return (
    <div style={{ background: C.bg, minHeight: '100%', fontFamily: 'DM Sans, sans-serif' }}>
    <div style={{ padding: 'clamp(16px, 3vw, 28px)', maxWidth: 1000, marginInline: 'auto' }}>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', gap: 18 }}>
        <svg width="48" height="48" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, marginTop: 2, opacity: 0.9 }}>
          <circle cx="32" cy="32" r="28" stroke="#8F0909" strokeWidth="3" fill="none"/>
          <ellipse cx="32" cy="32" rx="13" ry="28" stroke="#8F0909" strokeWidth="2" fill="none" opacity="0.6"/>
          <line x1="4" y1="32" x2="60" y2="32" stroke="#8F0909" strokeWidth="2" opacity="0.6"/>
          <path d="M10 20 Q32 24 54 20M10 44 Q32 40 54 44" stroke="#8F0909" strokeWidth="1.5" fill="none" opacity="0.5"/>
          <circle cx="32" cy="32" r="4" fill="#8F0909" opacity="0.8"/>
        </svg>
        <div>
          <div style={{ color: C.grey, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 6 }}>
            AACP Connector
          </div>
          <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 6px', fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)', fontWeight: 800 }}>
            Workforce Intelligence Hub
          </h2>
          <p style={{ color: C.grey, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Employer signal ingestion, validation, and competency intelligence across the AACP ecosystem.
          </p>
        </div>
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

      {tab === 'overview'     && <OverviewTab />}
      {tab === 'signals'      && <EmployerSignalsTab />}
      {tab === 'validation'   && <ValidationQueueTab />}
      {tab === 'intelligence' && <IntelligenceTab />}
      {tab === 'contributors' && <ContributorsTab />}
      {tab === 'ips_submit'   && <IPSSubmitTab />}
    </div>
    </div>
  );
}


