import { useState, useEffect, useCallback } from 'react';
import { C } from '../../theme';

const COMPETENCY_KEYS = ['SR','MR','AP','PS','SO','DM','WM','MT','CM','PR','SA','AL','AK'] as const;
const COMPETENCY_LABELS: Record<string,string> = {
  SR:'Spatial Reasoning', MR:'Mechanical Reasoning', AP:'Attention & Precision',
  PS:'Problem Solving', SO:'Safety Orientation', DM:'Decision Making',
  WM:'Working Memory', MT:'Multitasking & Prioritization', CM:'Communication',
  PR:'Procedural Reasoning', SA:'Situational Awareness', AL:'Adaptive Learning',
  AK:'Aviation Knowledge',
};

type PSTab = 'overview' | 'signals' | 'emerging' | 'curriculum' | 'gap';

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

// â”€â”€ Overview Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function OverviewTab({ onNavigate }: { onNavigate: (tab: PSTab) => void }) {
  const [intel, setIntel] = useState<{ signals: IntelSignal[] } | null>(null);
  const [emerging, setEmerging] = useState<{ emergingSkills: EmergingSkill[] } | null>(null);
  const [mappings, setMappings] = useState<{ mappings: CurriculumMapping[] } | null>(null);
  const [gaps, setGaps] = useState<{ gaps: GapRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<{ employerIntelligence: { signals: IntelSignal[] } }>('/connector/intelligence').catch(() => ({ employerIntelligence: { signals: [] } })),
      apiFetch<{ emergingSkills: EmergingSkill[] }>('/connector/emerging-skills').catch(() => ({ emergingSkills: [] })),
      apiFetch<{ mappings: CurriculumMapping[] }>('/postsecondary/curriculum-mappings').catch(() => ({ mappings: [] })),
      apiFetch<{ gaps: GapRow[] }>('/connector/gap').catch(() => ({ gaps: [] })),
    ]).then(([i, e, m, g]) => {
      setIntel(i as any); setEmerging(e); setMappings(m); setGaps(g);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: C.grey, padding: 40, textAlign: 'center' }}>Loading overview…</div>;

  const signals    = (intel as any)?.employerIntelligence?.signals ?? [];
  const skills     = emerging?.emergingSkills ?? [];
  const maps       = mappings?.mappings ?? [];
  const gapRows    = gaps?.gaps ?? [];

  const highDemand     = signals.filter(s => s.demandLevel === 'high' || s.demandLevel === 'growing');
  const emergingActive = skills.filter(s => s.status === 'emerging' || s.status === 'growing');
  const strongAlign    = maps.filter(m => m.alignment_level === 'strong' || m.alignment_level === 'moderate');
  const gapWarnings    = gapRows.filter(g =>
    (g.employerDemand === 'High' || g.employerDemand === 'Growing') &&
    (g.curriculumCoverage === 'Limited' || g.curriculumCoverage === 'No Data') &&
    g.employerDemandCount > 0
  );

  const demandColor = (d: string) => d === 'high' ? C.red : d === 'growing' ? C.amber : d === 'moderate' ? C.blue : C.grey;
  const demandBg    = (d: string) => d === 'high' ? C.redBg : d === 'growing' ? C.amberBg : d === 'moderate' ? C.blueBg : C.bgDeep;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* KPI strip — numbers only, semantic color only when status is meaningful */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {[
          { label: 'Validated Signals',    value: signals.length,        sub: 'Employer-sourced data',       valueColor: signals.length > 0 ? C.blue : C.greyD },
          { label: 'High/Growing Demand',  value: highDemand.length,     sub: 'Competencies in demand',      valueColor: highDemand.length > 0 ? C.amber : C.greyD },
          { label: 'Emerging Competencies',value: emergingActive.length, sub: 'Flagged as increasing',       valueColor: emergingActive.length > 0 ? C.red : C.greyD },
          { label: 'Programme Mappings',   value: maps.length,           sub: 'Your curriculum links',       valueColor: maps.length > 0 ? C.green : C.greyD },
          { label: 'Potential Gaps',       value: gapWarnings.length,    sub: 'High demand, low coverage',   valueColor: gapWarnings.length > 0 ? C.red : C.greyD },
        ].map(s => (
          <div key={s.label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
            <div style={{ color: s.valueColor, fontSize: 30, fontWeight: 800, fontFamily: 'Fraunces, serif', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ color: C.white, fontSize: 12, fontWeight: 700, marginTop: 10, marginBottom: 3 }}>{s.label}</div>
            <div style={{ color: C.greyD, fontSize: 11 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Main intel grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>

        {/* Top demand */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>Top Industry Demand</div>
            <button onClick={() => onNavigate('signals')} style={{ background: 'none', border: 'none', color: C.crimson, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>View all →</button>
          </div>
          {signals.length === 0 ? (
            <div style={{ color: C.greyD, fontSize: 13, padding: '24px', textAlign: 'center' }}>Insufficient evidence</div>
          ) : (
            <div>
              {signals.slice(0, 5).map((s, i) => (
                <div key={s.competency} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '11px 20px', borderBottom: i < Math.min(signals.length, 5) - 1 ? `1px solid ${C.borderLight}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: demandBg(s.demandLevel), border: `1px solid ${demandColor(s.demandLevel)}33`, borderRadius: 6, padding: '2px 7px' }}>
                      <span style={{ color: demandColor(s.demandLevel), fontSize: 10, fontWeight: 800 }}>{s.competency}</span>
                    </div>
                    <span style={{ color: C.grey, fontSize: 12 }}>{s.label}</span>
                  </div>
                  <span style={{ color: demandColor(s.demandLevel), fontWeight: 700, fontSize: 12, textTransform: 'capitalize' }}>{s.demandLevel}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Emerging competencies */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>Emerging Competencies</div>
            <button onClick={() => onNavigate('emerging')} style={{ background: 'none', border: 'none', color: C.crimson, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>View all →</button>
          </div>
          {emergingActive.length === 0 ? (
            <div style={{ color: C.greyD, fontSize: 13, padding: '24px', textAlign: 'center' }}>Insufficient evidence</div>
          ) : (
            <div>
              {emergingActive.slice(0, 5).map((s, i) => (
                <div key={s.competency} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '11px 20px', borderBottom: i < Math.min(emergingActive.length, 5) - 1 ? `1px solid ${C.borderLight}` : 'none',
                }}>
                  <div>
                    <span style={{ fontWeight: 700, color: C.white, fontSize: 13 }}>{s.competency}</span>
                    <span style={{ color: C.grey, fontSize: 11, marginLeft: 8 }}>{s.label}</span>
                  </div>
                  <span style={{ color: s.status === 'emerging' ? C.red : C.amber, fontWeight: 700, fontSize: 11, textTransform: 'capitalize',
                    background: s.status === 'emerging' ? C.redBg : C.amberBg,
                    border: `1px solid ${s.status === 'emerging' ? C.redBorder : C.amberBorder}`,
                    borderRadius: 20, padding: '2px 8px' }}>{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Potential gaps */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>Potential Programme Gaps</div>
            <button onClick={() => onNavigate('gap')} style={{ background: 'none', border: 'none', color: C.crimson, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>View all →</button>
          </div>
          {gapWarnings.length === 0 ? (
            <div style={{ color: C.greyD, fontSize: 13, padding: '24px', textAlign: 'center' }}>
              {gapRows.length === 0 ? 'Insufficient evidence' : 'No critical gaps identified'}
            </div>
          ) : (
            <div>
              {gapWarnings.slice(0, 5).map((g, i) => (
                <div key={g.competency} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '11px 20px', borderBottom: i < Math.min(gapWarnings.length, 5) - 1 ? `1px solid ${C.borderLight}` : 'none',
                }}>
                  <div>
                    <span style={{ fontWeight: 700, color: C.white, fontSize: 13 }}>{g.competency}</span>
                    <span style={{ color: C.grey, fontSize: 11, marginLeft: 8 }}>{g.label}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: C.amber, fontSize: 11, fontWeight: 700 }}>Demand: {g.employerDemand}</div>
                    <div style={{ color: C.greyD, fontSize: 10 }}>Coverage: {g.curriculumCoverage}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Programme alignment */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>Programme Alignment</div>
            <button onClick={() => onNavigate('curriculum')} style={{ background: 'none', border: 'none', color: C.crimson, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Manage →</button>
          </div>
          {maps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ color: C.grey, fontSize: 13, marginBottom: 12 }}>No mappings yet</div>
              <button
                onClick={() => onNavigate('curriculum')}
                style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >Map your first programme</button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 28, marginBottom: 14 }}>
                <div>
                  <div style={{ color: C.white, fontSize: 28, fontWeight: 800, fontFamily: 'Fraunces, serif', lineHeight: 1 }}>{maps.length}</div>
                  <div style={{ color: C.greyD, fontSize: 11, marginTop: 4 }}>Total Mappings</div>
                </div>
                <div>
                  <div style={{ color: C.green, fontSize: 28, fontWeight: 800, fontFamily: 'Fraunces, serif', lineHeight: 1 }}>{strongAlign.length}</div>
                  <div style={{ color: C.greyD, fontSize: 11, marginTop: 4 }}>Strong / Moderate</div>
                </div>
              </div>
              <div style={{ color: C.grey, fontSize: 12, fontStyle: 'italic', lineHeight: 1.5 }}>
                {[...new Set(maps.map(m => m.program_name))].length} programme{[...new Set(maps.map(m => m.program_name))].length !== 1 ? 's' : ''} mapped
                across {[...new Set(maps.map(m => m.aacp_competency))].length} competenc{[...new Set(maps.map(m => m.aacp_competency))].length !== 1 ? 'ies' : 'y'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{ background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 20px' }}>
        <p style={{ color: C.greyD, fontSize: 12, margin: 0, fontStyle: 'italic', lineHeight: 1.6 }}>
          Intelligence to inform curriculum decisions. Academic, regulatory, and accreditation decisions remain the responsibility of the institution.
          Reflects validated employer submissions, updated as new signals are received.
        </p>
      </div>
    </div>
  );
}

// â”€â”€ Competency Signals Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      const res = await apiFetch<{ employerIntelligence?: { signals: IntelSignal[] } }>(`/connector/intelligence?${params}`);
      setSignals(res.employerIntelligence?.signals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [occupation, region, subsector]);

  useEffect(() => { load(); }, [load]);

  const demandColor = (d: string) => d === 'high' ? C.red : d === 'growing' ? C.amber : d === 'moderate' ? '#60a5fa' : C.grey;
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
        <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ color: '#fca5a5', fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Unable to load competency signals</div>
          <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing.</div>
        </div>
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

// â”€â”€ Emerging Skills Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  if (loading) return <div style={{ color: C.grey, padding: 24 }}>Loading emerging signals…</div>;
  if (error) return (
    <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ color: '#fca5a5', fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Unable to load emerging requirements</div>
      <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing.</div>
    </div>
  );
  if (skills.length === 0) return <div style={{ color: C.grey, padding: 24, textAlign: 'center' }}>No emerging requirement signals available yet.</div>;

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

// â”€â”€ Curriculum Alignment Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
              { key: 'program_name',     label: 'Programme Name *',   type: 'text' },
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
        <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ color: '#fca5a5', fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Unable to load programme mappings</div>
          <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing.</div>
        </div>
      ) : mappings.length === 0 ? (
        <div style={{ color: C.grey, padding: 24, textAlign: 'center' }}>No curriculum mappings yet. Add the first one above.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Program','Course','Competency','Skill','Alignment','Date'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: C.greyD, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
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

// â”€â”€ Competency Gap Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  if (error) return (
    <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ color: '#fca5a5', fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Unable to load gap analysis</div>
      <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing.</div>
    </div>
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <p style={{ color: C.grey, fontSize: 12, marginBottom: 16 }}>
        This analysis compares employer demand, your curriculum coverage, and AACP participant evidence across all 13 competencies.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Competency','Employer Demand','Curriculum Coverage','Participant Evidence'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: C.greyD, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
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

// â”€â”€ IndustryIntelligence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function IndustryIntelligence() {
  const [tab, setTab] = useState<PSTab>('overview');

  const TABS: { key: PSTab; label: string }[] = [
    { key: 'overview',   label: 'Intelligence Overview'  },
    { key: 'signals',    label: 'Competency Signals'     },
    { key: 'emerging',   label: 'Emerging Requirements'  },
    { key: 'curriculum', label: 'Programme Alignment'    },
    { key: 'gap',        label: 'Gap Analysis'           },
  ];

  return (
    <div style={{ background: C.bg, minHeight: '100%', fontFamily: 'DM Sans, sans-serif' }}>
    <div style={{ padding: 'clamp(16px, 3vw, 28px)', maxWidth: 1000, marginInline: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: C.grey, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 6 }}>
          Post-Secondary Intelligence
        </div>
        <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 8px', fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)', fontWeight: 700 }}>
          Workforce Intelligence Hub
        </h2>
        <p style={{ color: C.grey, fontSize: 13, margin: '0 0 6px' }}>
          Connect what you teach with what industry needs. Powered by the AACP Connector.
        </p>
        <p style={{ color: C.grey, fontSize: 11, margin: 0, fontStyle: 'italic' }}>
          Intelligence to inform curriculum decisions. Academic, regulatory, and accreditation decisions remain the responsibility of the institution.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, margin: '0 0 28px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
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

      {tab === 'overview'   && <OverviewTab onNavigate={setTab} />}
      {tab === 'signals'    && <CompetencySignalsTab />}
      {tab === 'emerging'   && <EmergingSkillsTab />}
      {tab === 'curriculum' && <CurriculumAlignmentTab />}
      {tab === 'gap'        && <CompetencyGapTab />}
    </div>
    </div>
  );
}

