import { useState, useEffect } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { request } from '../../services/apiClient';

// ── Light BI palette ──────────────────────────────────────────────────────────
const L = {
  bg:           '#f8fafc',
  card:         '#ffffff',
  cardAlt:      '#f8fafc',
  border:       '#e2e8f0',
  borderMid:    '#cbd5e1',
  text:         '#0f172a',
  textMid:      '#334155',
  textMuted:    '#64748b',
  textLight:    '#94a3b8',
  crimson:      '#8F0909',
  crimsonMid:   '#b91c1c',
  crimsonLight: '#fff1f1',
  crimsonBorder:'#fecaca',
  steel:        '#6b7074',
  green:        '#16a34a',
  greenLight:   '#f0fdf4',
  greenBorder:  '#bbf7d0',
  amber:        '#b45309',
  amberLight:   '#fffbeb',
  amberBorder:  '#fde68a',
  blue:         '#1d4ed8',
  blueLight:    '#eff6ff',
  blueBorder:   '#bfdbfe',
};

const COMPETENCY_KEYS = ['SR','MR','AP','PS','SO','DM','WM','MT','CM','PR','SA','AL','AK'] as const;
const COMPETENCY_LABELS: Record<string, string> = {
  SR:'Spatial Reasoning',        MR:'Mechanical Reasoning',    AP:'Attention & Precision',
  PS:'Problem Solving',          SO:'Safety Orientation',      DM:'Decision Making',
  WM:'Working Memory',           MT:'Multitasking & Prioritization', CM:'Communication',
  PR:'Procedural Reasoning',     SA:'Situational Awareness',   AL:'Adaptive Learning',
  AK:'Aviation Knowledge',
};

const PATHWAY_LABELS: Record<string, string> = {
  pilot:'Pilot', ame:'AME', amt:'Aircraft Maintenance Technician',
  atc:'Air Traffic Control', aerospace:'Aerospace Engineering',
};

const FIT_STYLE: Record<string, { color: string; label: string }> = {
  strong:   { color: L.green,  label: 'Strong Alignment' },
  good:     { color: '#22c55e', label: 'Good Alignment'  },
  possible: { color: L.textMuted, label: 'Possible'      },
};

type EmpTab = 'overview' | 'signal' | 'signals' | 'pipeline' | 'industry';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: ok ? L.greenLight : L.crimsonLight,
      border: `1px solid ${ok ? L.greenBorder : L.crimsonBorder}`,
      color: ok ? L.green : L.crimson,
      borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    }}>{ok ? '✓  ' : '✕  '}{msg}</div>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '10px 18px', fontSize: 13, fontWeight: 600,
    color: active ? L.text : L.textMuted,
    borderBottom: `2px solid ${active ? L.crimson : 'transparent'}`,
    marginBottom: -1, transition: 'color 0.15s, border-color 0.15s',
    whiteSpace: 'nowrap' as const, letterSpacing: 0.2,
  };
}

function Eyebrow({ label }: { label: string }) {
  return (
    <div style={{ color: L.steel, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 6 }}>
      {label}
    </div>
  );
}

function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
      <div>
        <Eyebrow label={eyebrow} />
        <h3 style={{ color: L.text, fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>{title}</h3>
      </div>
      {action}
    </div>
  );
}

function InsuffBadge({ label = 'Insufficient Evidence' }: { label?: string }) {
  return (
    <span style={{ color: L.textLight, fontSize: 12, fontStyle: 'italic' }}>{label}</span>
  );
}

const statusBadgeStyle = (status: string): React.CSSProperties => {
  const map: Record<string, { color: string; bg: string; border: string }> = {
    validated:           { color: L.green,   bg: L.greenLight,  border: L.greenBorder   },
    new:                 { color: L.blue,    bg: L.blueLight,   border: L.blueBorder    },
    under_review:        { color: L.amber,   bg: L.amberLight,  border: L.amberBorder   },
    needs_clarification: { color: L.amber,   bg: L.amberLight,  border: L.amberBorder   },
    archived:            { color: L.textMuted, bg: '#f1f5f9',   border: L.border        },
  };
  const s = map[status] ?? map.new;
  return { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
    color: s.color, background: s.bg, border: `1px solid ${s.border}`, display: 'inline-block' };
};

const statusLabel = (s: string) => ({
  validated:'Validated', new:'Awaiting Review', under_review:'Under Review',
  needs_clarification:'Clarification Required', archived:'Archived',
}[s] ?? s);

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Alignment { pathwayId: string; label: string; fit: 'strong'|'good'|'possible'; highlights: string[]; }
interface Completer {
  userId: string; name: string; email: string; cohort: string;
  programCompletedAt: string; topPathway: string | null;
  pathwayAlignments: Alignment[]; validatedCompetencies: string[]; aciaCompleted: boolean;
}
interface PipelineData { completers: Completer[]; totalCompleters: number; pathwayBreakdown: Record<string, number>; }
interface EmpSignal {
  id: string; occupation: string | null; role_title: string | null; competency: string;
  skill: string | null; importance_level: string; future_demand: string; skills_gap: string | null;
  emerging_requirement: number; validation_status: string; created_at: string;
}
interface SectorSignal {
  competency: string; label: string; demandLevel: string; trend: string;
  evidenceLevel: string; signalCount: number; contributingEmployers: number;
}

// ── Gap status helper ─────────────────────────────────────────────────────────

function gapStatus(s: EmpSignal): { label: string; color: string; bg: string; border: string } {
  if (s.validation_status === 'validated') {
    if (s.importance_level === 'critical' && s.skills_gap) return { label: 'Critical Gap', color: L.crimson, bg: L.crimsonLight, border: L.crimsonBorder };
    if (['critical','high'].includes(s.importance_level) && s.skills_gap) return { label: 'Development Needed', color: L.amber, bg: L.amberLight, border: L.amberBorder };
    return { label: 'Aligned', color: L.green, bg: L.greenLight, border: L.greenBorder };
  }
  if (s.emerging_requirement === 1) return { label: 'Emerging Requirement', color: L.blue, bg: L.blueLight, border: L.blueBorder };
  return { label: 'Awaiting Validation', color: L.textMuted, bg: '#f1f5f9', border: L.border };
}

// ── Intelligence feed generator ───────────────────────────────────────────────

function buildIntelFeed(signals: EmpSignal[], sector: SectorSignal[]): string[] {
  const items: string[] = [];
  const validated = signals.filter(s => s.validation_status === 'validated');
  const emerging  = signals.filter(s => s.emerging_requirement === 1);

  if (validated.length === 0 && sector.length === 0) return [];

  // Org-level insights from validated signals
  const critComp = validated.filter(s => ['critical','high'].includes(s.importance_level));
  if (critComp.length > 0) {
    const top = critComp[0];
    const label = COMPETENCY_LABELS[top.competency] ?? top.competency;
    items.push(`Your organisation identifies ${label} as ${top.importance_level} importance${top.occupation ? ` for ${top.occupation} roles` : ''}.`);
  }
  if (emerging.length > 0) {
    const e = emerging[0];
    const label = COMPETENCY_LABELS[e.competency] ?? e.competency;
    items.push(`${label} is flagged as an emerging requirement — likely underrepresented in the current candidate pool.`);
  }
  const increasing = validated.filter(s => s.future_demand === 'increasing');
  if (increasing.length > 0) {
    const label = COMPETENCY_LABELS[increasing[0].competency] ?? increasing[0].competency;
    items.push(`Future demand for ${label} is trending upward based on your organisation's validated signals.`);
  }

  // Sector-level insights
  const sectorIncreasing = sector.filter(s => s.trend === 'increasing' && s.evidenceLevel !== 'limited');
  if (sectorIncreasing.length > 0) {
    const s = sectorIncreasing[0];
    items.push(`Sector-wide: ${s.label} demand is increasing across ${s.contributingEmployers} contributing organisation${s.contributingEmployers !== 1 ? 's' : ''}.`);
  }

  return items.slice(0, 4);
}

// ── Executive Intelligence Overview ──────────────────────────────────────────

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
      setPipeline(p); setSignals(s.signals); setSector(i.signals);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '40px 0' }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ height: 80, background: L.card, border: `1px solid ${L.border}`, borderRadius: 12, opacity: 0.6 }} />
        ))}
      </div>
    );
  }

  // Derived KPIs
  const priorityOccupations = [...new Set(signals.filter(s => s.occupation).map(s => s.occupation!))];
  const criticalNeeds = signals.filter(s => ['critical','high'].includes(s.importance_level));
  const emergingCount = signals.filter(s => s.emerging_requirement === 1).length;
  const validatedSignals = signals.filter(s => s.validation_status === 'validated');

  // Workforce priorities — group by occupation
  const byOccupation: Record<string, EmpSignal[]> = {};
  signals.forEach(s => {
    const key = s.occupation ?? 'General';
    if (!byOccupation[key]) byOccupation[key] = [];
    byOccupation[key].push(s);
  });

  // Competency data — map of competency → highest importance signal
  const compMap: Record<string, EmpSignal> = {};
  signals.forEach(s => {
    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
    const cur = compMap[s.competency];
    if (!cur || (rank[s.importance_level as keyof typeof rank] ?? 0) > (rank[cur.importance_level as keyof typeof rank] ?? 0)) {
      compMap[s.competency] = s;
    }
  });

  const demandColor = (d: string) => d === 'high' ? L.crimson : d === 'growing' ? L.amber : d === 'moderate' ? L.blue : L.textMuted;
  const trendIcon = (t: string) => t === 'increasing' ? '↑' : t === 'decreasing' ? '↓' : '→';

  const feed = buildIntelFeed(signals, sector);

  const importanceCell = (level: string | undefined) => {
    if (!level) return { bg: '#f1f5f9', color: L.textLight, label: '—' };
    return {
      critical: { bg: '#8F090922', color: L.crimson,   label: 'Critical' },
      high:     { bg: '#fecaca44', color: L.crimsonMid, label: 'High'    },
      medium:   { bg: '#fde68a44', color: L.amber,     label: 'Medium'  },
      low:      { bg: '#bbf7d044', color: L.green,     label: 'Low'     },
    }[level] ?? { bg: '#f1f5f9', color: L.textLight, label: '—' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── KPI Strip ── */}
      <div>
        <Eyebrow label="Workforce Intelligence Summary" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {[
            {
              label: 'Priority Occupations',
              value: priorityOccupations.length > 0 ? priorityOccupations.length : null,
              accent: L.crimson, sub: 'Occupations with active workforce signals',
            },
            {
              label: 'Critical Competency Needs',
              value: criticalNeeds.length > 0 ? criticalNeeds.length : null,
              accent: criticalNeeds.length > 0 ? L.crimsonMid : undefined, sub: 'High or critical importance',
            },
            {
              label: 'Workforce Signals',
              value: signals.length > 0 ? signals.length : null,
              accent: signals.length > 0 ? L.blue : undefined, sub: `${validatedSignals.length} validated`,
            },
            {
              label: 'Emerging Skills',
              value: emergingCount > 0 ? emergingCount : null,
              accent: emergingCount > 0 ? L.amber : undefined, sub: 'Flagged as increasing',
            },
          ].map(k => (
            <div key={k.label} style={{
              background: L.card, border: `1px solid ${L.border}`,
              borderTop: k.accent ? `3px solid ${k.accent}` : `3px solid ${L.border}`,
              borderRadius: 12, padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              {k.value !== null
                ? <div style={{ color: k.accent ?? L.text, fontSize: 36, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                : <div style={{ color: L.textLight, fontSize: 13, fontStyle: 'italic', paddingTop: 4 }}>Insufficient Evidence</div>
              }
              <div style={{ color: L.textMuted, fontSize: 11, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>{k.label}</div>
              <div style={{ color: L.textLight, fontSize: 11, marginTop: 3 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Workforce Priorities ── */}
      <div>
        <SectionHeader
          eyebrow="Derived from submitted signals"
          title="Workforce Priorities"
          action={
            <button onClick={() => onNavigate('signal')} style={{ background: L.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3 }}>
              + Submit Signal
            </button>
          }
        />
        {Object.keys(byOccupation).length === 0 ? (
          <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ color: L.textMuted, fontSize: 14, marginBottom: 6 }}>No workforce signals submitted yet</div>
            <div style={{ color: L.textLight, fontSize: 12 }}>Submit your first signal to establish your workforce intelligence profile.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(byOccupation).map(([occupation, occSignals]) => {
              const critSigs = occSignals.filter(s => ['critical','high'].includes(s.importance_level));
              const emgSigs  = occSignals.filter(s => s.emerging_requirement === 1);
              const gapSigs  = occSignals.filter(s => s.skills_gap);
              const hiringDifficulty = occSignals.find(s => (s as any).hiring_difficulty)?.occupation ?? null;
              const demandRank = { critical: 3, high: 2, medium: 1, low: 0 };
              const topImportance = occSignals.reduce((best, s) =>
                (demandRank[s.importance_level as keyof typeof demandRank] ?? -1) > (demandRank[best?.importance_level as keyof typeof demandRank] ?? -1) ? s : best
              , occSignals[0]);
              const demandLabel = topImportance ? { critical: 'Critical', high: 'High', medium: 'Moderate', low: 'Low' }[topImportance.importance_level] ?? 'Unknown' : '—';
              const demandCol   = topImportance ? { critical: L.crimson, high: L.crimsonMid, medium: L.amber, low: L.textMuted }[topImportance.importance_level] ?? L.textMuted : L.textMuted;

              return (
                <div key={occupation} style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: L.text, marginBottom: 6 }}>{occupation}</div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 10, color: L.steel, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Workforce Need</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: demandCol, marginTop: 2 }}>{demandLabel}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: L.steel, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Signals</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: L.text, marginTop: 2 }}>{occSignals.length}</div>
                        </div>
                        {emgSigs.length > 0 && (
                          <div>
                            <div style={{ fontSize: 10, color: L.steel, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Emerging</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: L.blue, marginTop: 2 }}>{emgSigs.length}</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                      {critSigs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: L.steel, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Priority Competencies</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {critSigs.slice(0, 4).map(s => (
                              <span key={s.id} style={{ fontSize: 11, fontWeight: 600, color: L.crimson, background: L.crimsonLight, border: `1px solid ${L.crimsonBorder}`, borderRadius: 5, padding: '2px 8px' }}>
                                {COMPETENCY_LABELS[s.competency] ?? s.competency}
                              </span>
                            ))}
                            {critSigs.length > 4 && <span style={{ fontSize: 11, color: L.textMuted }}>+{critSigs.length - 4} more</span>}
                          </div>
                        </div>
                      )}
                      {gapSigs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: L.steel, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Skills Gaps Noted</div>
                          <div style={{ fontSize: 12, color: L.textMid, lineHeight: 1.4 }}>{gapSigs[0].skills_gap?.slice(0, 80)}{(gapSigs[0].skills_gap?.length ?? 0) > 80 ? '…' : ''}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Competency Intelligence Heatmap ── */}
      <div>
        <SectionHeader eyebrow="Your requirements across 13 AACP competencies" title="Competency Intelligence" />
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          {/* Legend */}
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${L.border}`, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: L.textMuted, fontWeight: 600 }}>Importance:</span>
            {[['critical','Critical',L.crimson],['high','High',L.crimsonMid],['medium','Medium',L.amber],['low','Low',L.green]].map(([k,lbl,col]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: (col as string) + '44', border: `1px solid ${col}` }} />
                <span style={{ fontSize: 11, color: L.textMuted }}>{lbl}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f1f5f9', border: `1px solid ${L.border}` }} />
              <span style={{ fontSize: 11, color: L.textMuted }}>No data</span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${L.border}`, background: L.cardAlt }}>
                  {['Competency','Importance','Future Demand','Emerging','Evidence','Skill / Detail'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: L.steel, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPETENCY_KEYS.map((key, i) => {
                  const sig = compMap[key];
                  const cell = importanceCell(sig?.importance_level);
                  return (
                    <tr key={key} style={{ borderBottom: i < COMPETENCY_KEYS.length - 1 ? `1px solid ${L.border}` : 'none', background: sig ? L.card : L.cardAlt }}>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontWeight: 700, color: L.text }}>{key}</span>
                        <span style={{ color: L.textMuted, fontSize: 11, display: 'block' }}>{COMPETENCY_LABELS[key]}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {sig
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: cell.bg, color: cell.color, border: `1px solid ${cell.color}44`, textTransform: 'capitalize' }}>{cell.label}</span>
                          : <InsuffBadge label="No data" />
                        }
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {sig ? (
                          <span style={{ color: sig.future_demand === 'increasing' ? L.green : sig.future_demand === 'decreasing' ? L.crimson : L.textMuted, fontWeight: 600, fontSize: 12 }}>
                            {trendIcon(sig.future_demand)} {sig.future_demand}
                          </span>
                        ) : <InsuffBadge label="—" />}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                        {sig?.emerging_requirement === 1
                          ? <span style={{ color: L.blue, fontWeight: 700, fontSize: 12 }}>Yes</span>
                          : <span style={{ color: L.textLight, fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {sig
                          ? <span style={statusBadgeStyle(sig.validation_status)}>{statusLabel(sig.validation_status)}</span>
                          : <InsuffBadge label="—" />}
                      </td>
                      <td style={{ padding: '11px 14px', color: L.textMid, fontSize: 12, maxWidth: 200 }}>
                        {sig?.skill ?? <InsuffBadge label="—" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Workforce Gap Intelligence ── */}
      <div>
        <SectionHeader eyebrow="Required vs observed capability" title="Workforce Gap Intelligence" />
        {signals.length === 0 ? (
          <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center' }}>
            <InsuffBadge label="Submit workforce signals to generate gap intelligence." />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {signals.map(s => {
              const gap = gapStatus(s);
              return (
                <div key={s.id} style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: L.text, fontSize: 13 }}>{COMPETENCY_LABELS[s.competency] ?? s.competency}</div>
                      {s.occupation && <div style={{ color: L.textMuted, fontSize: 11, marginTop: 2 }}>{s.occupation}</div>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: gap.color, background: gap.bg, border: `1px solid ${gap.border}`, whiteSpace: 'nowrap', marginLeft: 8 }}>
                      {gap.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 10, color: L.steel, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Required</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: L.textMid, textTransform: 'capitalize', marginTop: 2 }}>{s.importance_level}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: L.steel, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Trend</div>
                      <div style={{ fontSize: 12, color: s.future_demand === 'increasing' ? L.green : s.future_demand === 'decreasing' ? L.crimson : L.textMuted, marginTop: 2 }}>
                        {trendIcon(s.future_demand)} {s.future_demand}
                      </div>
                    </div>
                  </div>
                  {s.skills_gap && (
                    <div style={{ marginTop: 10, fontSize: 11, color: L.textMuted, lineHeight: 1.5, borderTop: `1px solid ${L.border}`, paddingTop: 8 }}>
                      {s.skills_gap.slice(0, 100)}{s.skills_gap.length > 100 ? '…' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Intelligence Feed ── */}
      <div>
        <SectionHeader
          eyebrow="Powered by AACP Workforce Intelligence"
          title="Latest Workforce Intelligence"
          action={
            <button onClick={() => onNavigate('industry')} style={{ background: 'none', border: 'none', color: L.crimson, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Industry overview →
            </button>
          }
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {feed.length > 0 ? feed.map((item, i) => (
            <div key={i} style={{ background: L.card, border: `1px solid ${L.border}`, borderLeft: `3px solid ${L.crimson}`, borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ color: L.textMid, fontSize: 13, lineHeight: 1.55 }}>{item}</div>
            </div>
          )) : (
            <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 10, padding: '20px 24px', textAlign: 'center' }}>
              <div style={{ color: L.textLight, fontSize: 13, fontStyle: 'italic' }}>
                More employer signals are needed to establish a reliable sector trend.
              </div>
              <div style={{ color: L.textLight, fontSize: 12, marginTop: 6 }}>
                Validated signals generate intelligence automatically.
              </div>
            </div>
          )}
          <p style={{ color: L.textLight, fontSize: 11, margin: 0, fontStyle: 'italic' }}>
            Insights derived exclusively from validated employer signals. No individual organisation is identified in published intelligence.
          </p>
        </div>
      </div>

      {/* ── Sector preview ── */}
      {sector.length > 0 && (
        <div>
          <SectionHeader
            eyebrow="Aggregated sector data"
            title="Top Industry Competency Demand"
            action={
              <button onClick={() => onNavigate('industry')} style={{ background: 'none', border: 'none', color: L.crimson, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Full industry view →
              </button>
            }
          />
          <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            {sector.slice(0, 5).map((s, i) => (
              <div key={s.competency} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '13px 20px',
                borderBottom: i < Math.min(sector.length, 5) - 1 ? `1px solid ${L.border}` : 'none',
              }}>
                <div>
                  <span style={{ color: L.text, fontWeight: 700, fontSize: 14 }}>{s.competency}</span>
                  <span style={{ color: L.textMuted, fontSize: 12, marginLeft: 10 }}>{s.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <span style={{ color: demandColor(s.demandLevel), fontWeight: 700, fontSize: 12, textTransform: 'capitalize' }}>{s.demandLevel}</span>
                  <span style={{ color: s.trend === 'increasing' ? L.green : s.trend === 'decreasing' ? L.crimson : L.textMuted, fontSize: 12 }}>
                    {trendIcon(s.trend)} {s.trend}
                  </span>
                  <span style={{ color: L.textLight, fontSize: 11 }}>{s.contributingEmployers} org{s.contributingEmployers !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>
          <p style={{ color: L.textLight, fontSize: 11, margin: '8px 0 0', fontStyle: 'italic' }}>
            Aggregated from validated signals across AACP partner organisations. No individual employer identified.
          </p>
        </div>
      )}

    </div>
  );
}

// ── Submit Workforce Signal ───────────────────────────────────────────────────

const BLANK_SIGNAL = {
  employer_name: '', industry_subsector: '', region: '', occupation: '',
  role_title: '', competency: 'SR' as string, skill: '', importance_level: 'medium',
  proficiency_expectation: 'intermediate', hiring_difficulty: '', skills_gap: '',
  emerging_requirement: false, certification_required: '',
  workforce_readiness_expectation: '', future_demand: 'stable',
};

function SubmitSignalTab() {
  const savedName = localStorage.getItem('aacp_employer_name') ?? '';
  const [form, setForm] = useState({ ...BLANK_SIGNAL, employer_name: savedName });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [recentCount, setRecentCount] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ signals: EmpSignal[] }>('/employer/signals')
      .then(r => setRecentCount(r.signals.length)).catch(() => {});
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
    background: '#fff', border: `1px solid ${L.borderMid}`, color: L.text,
    borderRadius: 8, padding: '9px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box',
    outline: 'none',
  };
  const lbl: React.CSSProperties = {
    fontSize: 12, color: L.textMid, display: 'block', marginBottom: 5, fontWeight: 600, letterSpacing: 0.2,
  };

  return (
    <div>
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      {/* Header */}
      <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 14, padding: '22px 26px', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Eyebrow label="Employer Contribution" />
        <h3 style={{ color: L.text, fontWeight: 700, fontSize: 17, margin: '0 0 10px', letterSpacing: -0.2 }}>
          Share what you're seeing in your workforce.
        </h3>
        <p style={{ color: L.textMid, fontSize: 13, margin: '0 0 8px', lineHeight: 1.6 }}>
          AACP validates and translates employer signals into aggregated aviation workforce intelligence — used to align training, curriculum, and talent development with real industry needs.
        </p>
        <p style={{ color: L.textLight, fontSize: 12, margin: 0, fontStyle: 'italic' }}>
          Submissions are reviewed by AACP before contributing to sector intelligence. Your organisation is not individually identified in any published output.
        </p>
        {recentCount !== null && recentCount > 0 && (
          <div style={{ marginTop: 12, color: L.blue, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: L.blueLight, border: `1px solid ${L.blueBorder}`, color: L.blue, fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 6 }}>
              {recentCount} signal{recentCount !== 1 ? 's' : ''} submitted from your organisation
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Step 1 */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: L.crimson, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</div>
            <div style={{ fontWeight: 700, color: L.text, fontSize: 14 }}>Organisation</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={lbl}>Organisation Name *</label>
              <input required value={form.employer_name} onChange={e => set('employer_name', e.target.value)} style={inp} placeholder="e.g. WestJet Airlines" />
            </div>
            <div>
              <label style={lbl}>Aviation Sector</label>
              <select value={form.industry_subsector} onChange={e => set('industry_subsector', e.target.value)} style={inp}>
                <option value="">Select sector…</option>
                {['Commercial Aviation','General Aviation','Aircraft Maintenance','Air Traffic Management','Aerospace Manufacturing','Defence Aviation','UAV Operations','Airport Operations','Aviation Education and Training','Space and Launch'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Region</label>
              <select value={form.region} onChange={e => set('region', e.target.value)} style={inp}>
                <option value="">Select region…</option>
                {['British Columbia','Alberta','Saskatchewan','Manitoba','Ontario','Quebec','Atlantic Canada','Northern Canada','National'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: L.crimson, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</div>
            <div style={{ fontWeight: 700, color: L.text, fontSize: 14 }}>Occupation and Role</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={lbl}>Occupation</label>
              <select value={form.occupation} onChange={e => set('occupation', e.target.value)} style={inp}>
                <option value="">Select occupation…</option>
                {['Commercial Pilot','Aircraft Maintenance Engineer (AME)','Aircraft Maintenance Technician (AMT)','Air Traffic Controller','Flight Dispatcher','Aerospace Engineer','Avionics Technician','UAV Operator','Airport Operations Officer','Flight Instructor','Cabin Crew','Other'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Role Title</label>
              <input value={form.role_title} onChange={e => set('role_title', e.target.value)} style={inp} placeholder="e.g. Senior AME — Line Maintenance" />
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
        </div>

        {/* Step 3 */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: L.crimson, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</div>
            <div style={{ fontWeight: 700, color: L.text, fontSize: 14 }}>Competency Signal</div>
          </div>
          <p style={{ color: L.textMuted, fontSize: 12, margin: '0 0 18px', lineHeight: 1.5 }}>
            Submit one signal per competency. Submit multiple forms to cover all relevant competencies for this occupation.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={lbl}>AACP Competency *</label>
              <select required value={form.competency} onChange={e => set('competency', e.target.value)} style={inp}>
                {COMPETENCY_KEYS.map(k => <option key={k} value={k}>{k} — {COMPETENCY_LABELS[k]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Specific Skill or Capability</label>
              <input value={form.skill} onChange={e => set('skill', e.target.value)} style={inp} placeholder="e.g. Digital Systems Troubleshooting" />
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
              <label style={lbl}>Licensing / Certification Required</label>
              <input value={form.certification_required} onChange={e => set('certification_required', e.target.value)} style={inp} placeholder="e.g. Transport Canada AME Licence M1" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Competency Gap Description</label>
              <textarea value={form.skills_gap} onChange={e => set('skills_gap', e.target.value)}
                rows={2} style={{ ...inp, resize: 'vertical' }}
                placeholder="Describe the gap you observe in available personnel for this competency…" />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, background: L.blueLight, border: `1px solid ${L.blueBorder}`, borderRadius: 10, padding: '12px 16px' }}>
              <input type="checkbox" id="emerging_req" checked={form.emerging_requirement}
                onChange={e => set('emerging_requirement', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: L.crimson, cursor: 'pointer', flexShrink: 0 }} />
              <label htmlFor="emerging_req" style={{ ...lbl, marginBottom: 0, cursor: 'pointer', fontWeight: 500, color: L.blue }}>
                Flag as emerging requirement — this competency is increasing in importance and may not yet be widely available in the candidate pool
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <div style={{ fontSize: 12, color: L.textMuted, alignSelf: 'center' }}>
            Submissions are confidential and reviewed before publication.
          </div>
          <button type="submit"
            disabled={submitting || !form.employer_name || !form.competency}
            style={{
              background: (form.employer_name && form.competency) ? L.crimson : L.borderMid,
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '11px 30px', fontSize: 14, fontWeight: 700,
              cursor: (form.employer_name && form.competency) ? 'pointer' : 'not-allowed',
              letterSpacing: 0.3, boxShadow: (form.employer_name && form.competency) ? '0 2px 8px rgba(143,9,9,0.25)' : 'none',
            }}
          >{submitting ? 'Submitting…' : 'Submit Signal'}</button>
        </div>
      </form>
    </div>
  );
}

// ── My Signals ────────────────────────────────────────────────────────────────

const SIGNAL_STAGES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'review',    label: 'Under Review' },
  { key: 'validated', label: 'Validated' },
  { key: 'contributing', label: 'Contributing to Intelligence' },
];

function signalStage(status: string): number {
  if (status === 'validated') return 3;
  if (status === 'under_review' || status === 'needs_clarification') return 1;
  return 0;
}

function SignalProgressBar({ status }: { status: string }) {
  const stage = signalStage(status);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
        {SIGNAL_STAGES.map((s, i) => {
          const done = i <= stage;
          const active = i === stage;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < SIGNAL_STAGES.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 1 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: done ? L.crimson : L.border,
                  border: `2px solid ${done ? L.crimson : L.borderMid}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: active ? `0 0 0 3px ${L.crimsonBorder}` : 'none',
                }}>
                  {done && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>}
                </div>
                <div style={{ fontSize: 10, color: done ? L.crimson : L.textLight, fontWeight: done ? 700 : 400, whiteSpace: 'nowrap', textAlign: 'center', letterSpacing: 0.2 }}>
                  {s.label}
                </div>
              </div>
              {i < SIGNAL_STAGES.length - 1 && (
                <div style={{ flex: 1, height: 2, background: i < stage ? L.crimson : L.border, margin: '0 0 18px', transition: 'background 0.3s' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MySignalsTab() {
  const [signals, setSignals] = useState<EmpSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');

  useEffect(() => {
    apiFetch<{ signals: EmpSignal[] }>('/employer/signals')
      .then(r => setSignals(r.signals))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: L.textMuted, padding: 40, textAlign: 'center' }}>Loading signals…</div>;
  if (error)   return <div style={{ color: L.crimson, padding: 24 }}>{error}</div>;

  const counts = {
    total: signals.length,
    validated: signals.filter(s => s.validation_status === 'validated').length,
    pending:   signals.filter(s => s.validation_status === 'new').length,
    review:    signals.filter(s => ['under_review','needs_clarification'].includes(s.validation_status)).length,
  };

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Submitted', value: counts.total,     accent: undefined },
          { label: 'Validated',       value: counts.validated, accent: counts.validated > 0 ? L.green : undefined },
          { label: 'Awaiting Review', value: counts.pending,   accent: counts.pending > 0 ? L.blue : undefined },
          { label: 'Under Review',    value: counts.review,    accent: counts.review > 0 ? L.amber : undefined },
        ].map(c => (
          <div key={c.label} style={{ background: L.card, border: `1px solid ${L.border}`, borderTop: c.accent ? `3px solid ${c.accent}` : `3px solid ${L.border}`, borderRadius: 10, padding: '14px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ color: c.accent ?? L.text, fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
            <div style={{ color: L.textMuted, fontSize: 11, marginTop: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {signals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', background: L.card, border: `1px solid ${L.border}`, borderRadius: 14 }}>
          <div style={{ color: L.text, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No Signals Submitted</div>
          <div style={{ color: L.textMuted, fontSize: 13 }}>
            Use "Submit Workforce Signal" to contribute your first workforce intelligence signal.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14, gap: 8 }}>
            {(['cards','table'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                background: view === v ? L.crimsonLight : L.card,
                border: `1px solid ${view === v ? L.crimsonBorder : L.border}`,
                color: view === v ? L.crimson : L.textMuted,
                borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                textTransform: 'capitalize',
              }}>{v}</button>
            ))}
          </div>

          {view === 'cards' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {signals.map(s => (
                <div key={s.id} style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 14, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: L.text }}>
                        {s.occupation ?? 'General Aviation'}
                        {s.role_title && <span style={{ color: L.textMuted, fontSize: 13, fontWeight: 400, marginLeft: 8 }}>{s.role_title}</span>}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <span style={{ fontWeight: 700, color: L.textMid, fontSize: 13 }}>{s.competency}</span>
                        <span style={{ color: L.textMuted, fontSize: 12, marginLeft: 8 }}>{COMPETENCY_LABELS[s.competency] ?? s.competency}</span>
                        {s.skill && <span style={{ color: L.textMuted, fontSize: 12, marginLeft: 6 }}>· {s.skill}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 5, textTransform: 'capitalize',
                        background: { critical: L.crimsonLight, high: '#fff1f1', medium: L.amberLight, low: L.greenLight }[s.importance_level] ?? L.cardAlt,
                        color: { critical: L.crimson, high: L.crimsonMid, medium: L.amber, low: L.green }[s.importance_level] ?? L.textMuted,
                        border: `1px solid currentColor`,
                      }}>{s.importance_level} importance</span>
                      {s.emerging_requirement === 1 && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 5, background: L.blueLight, color: L.blue, border: `1px solid ${L.blueBorder}` }}>
                          Emerging
                        </span>
                      )}
                    </div>
                  </div>

                  <SignalProgressBar status={s.validation_status} />

                  {s.validation_status === 'validated' && (
                    <div style={{ marginTop: 12, background: L.greenLight, border: `1px solid ${L.greenBorder}`, borderRadius: 8, padding: '9px 14px', fontSize: 12, color: L.green, fontWeight: 600 }}>
                      ✓ This signal is contributing to aggregated AACP workforce intelligence.
                    </div>
                  )}
                  {s.validation_status === 'needs_clarification' && (
                    <div style={{ marginTop: 12, background: L.amberLight, border: `1px solid ${L.amberBorder}`, borderRadius: 8, padding: '9px 14px', fontSize: 12, color: L.amber, fontWeight: 600 }}>
                      AACP may reach out for clarification on this signal.
                    </div>
                  )}

                  <div style={{ color: L.textLight, fontSize: 11, marginTop: 10 }}>
                    Submitted {s.created_at ? new Date(s.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${L.border}`, background: L.cardAlt }}>
                      {['Competency','Occupation','Importance','Trend','Emerging','Status','Submitted'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: L.steel, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((s, i) => (
                      <tr key={s.id} style={{ borderBottom: i < signals.length - 1 ? `1px solid ${L.border}` : 'none' }}>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ fontWeight: 700, color: L.text }}>{s.competency}</span>
                          <span style={{ color: L.textMuted, fontSize: 11, display: 'block' }}>{COMPETENCY_LABELS[s.competency] ?? s.competency}</span>
                          {s.skill && <span style={{ color: L.textLight, fontSize: 11, display: 'block' }}>{s.skill}</span>}
                        </td>
                        <td style={{ padding: '11px 14px', color: L.textMid }}>{s.occupation ?? '—'}</td>
                        <td style={{ padding: '11px 14px', color: L.textMid, textTransform: 'capitalize' }}>{s.importance_level}</td>
                        <td style={{ padding: '11px 14px', color: s.future_demand === 'increasing' ? L.green : s.future_demand === 'decreasing' ? L.crimson : L.textMuted, textTransform: 'capitalize' }}>
                          {trendIcon(s.future_demand)} {s.future_demand}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          {s.emerging_requirement === 1 ? <span style={{ color: L.blue, fontWeight: 700 }}>Yes</span> : <span style={{ color: L.textLight }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={statusBadgeStyle(s.validation_status)}>{statusLabel(s.validation_status)}</span>
                        </td>
                        <td style={{ padding: '11px 14px', color: L.textLight, fontSize: 12, whiteSpace: 'nowrap' }}>
                          {s.created_at ? new Date(s.created_at).toLocaleDateString('en-CA') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p style={{ color: L.textLight, fontSize: 11, fontStyle: 'italic', marginTop: 16 }}>
            Validated signals contribute to aggregated AACP sector intelligence. Your organisation is not individually identified in published reports.
          </p>
        </>
      )}
    </div>
  );
}

// ── Industry Intelligence ─────────────────────────────────────────────────────

function IndustryIntelligenceTab() {
  const [signals, setSignals] = useState<SectorSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ signals: SectorSignal[] }>('/connector/intelligence')
      .then(r => setSignals(r.signals))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const demandColor = (d: string) => d === 'high' ? L.crimson : d === 'growing' ? L.amber : d === 'moderate' ? L.blue : L.textMuted;
  const evidenceColor = (e: string) => e === 'strong' ? L.green : e === 'moderate' ? L.amber : e === 'limited' ? L.blue : L.textMuted;

  const highDemand = signals.filter(s => s.demandLevel === 'high');
  const growing    = signals.filter(s => s.demandLevel === 'growing');
  const increasing = signals.filter(s => s.trend === 'increasing');

  return (
    <div>
      {/* Header */}
      <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 14, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <Eyebrow label="Powered by AACP Workforce Intelligence" />
        <h3 style={{ color: L.text, fontWeight: 700, fontSize: 16, margin: '0 0 8px', letterSpacing: -0.2 }}>
          Aviation and Aerospace Industry Intelligence
        </h3>
        <p style={{ color: L.textMid, fontSize: 13, margin: '0 0 6px', lineHeight: 1.6 }}>
          Derived from validated employer submissions across AACP partner organisations. All data is aggregated — individual organisations are not identified.
        </p>
        <p style={{ color: L.textLight, fontSize: 12, margin: 0, fontStyle: 'italic' }}>
          Detailed programme alignment and curriculum gap analysis is available in the Post-Secondary Intelligence module for registered institutions.
        </p>
      </div>

      {loading ? (
        <div style={{ color: L.textMuted, padding: 40, textAlign: 'center' }}>Loading sector intelligence…</div>
      ) : error ? (
        <div style={{ color: L.crimson, padding: 24, background: L.crimsonLight, borderRadius: 12, border: `1px solid ${L.crimsonBorder}` }}>{error}</div>
      ) : signals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', background: L.card, border: `1px solid ${L.border}`, borderRadius: 14 }}>
          <div style={{ color: L.text, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Insufficient Evidence</div>
          <div style={{ color: L.textMuted, fontSize: 13, maxWidth: 400, marginInline: 'auto', lineHeight: 1.6 }}>
            Aggregated sector intelligence becomes available once sufficient validated signals have been contributed by multiple organisations.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Competencies with Data', value: signals.length, accent: L.blue },
              { label: 'High Demand',            value: highDemand.length, accent: highDemand.length > 0 ? L.crimson : undefined },
              { label: 'Growing Demand',          value: growing.length, accent: growing.length > 0 ? L.amber : undefined },
              { label: 'Increasing Trend',        value: increasing.length, accent: increasing.length > 0 ? L.green : undefined },
            ].map(m => (
              <div key={m.label} style={{ background: L.card, border: `1px solid ${L.border}`, borderTop: m.accent ? `3px solid ${m.accent}` : `3px solid ${L.border}`, borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ color: m.accent ?? L.text, fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
                <div style={{ color: L.textMuted, fontSize: 11, marginTop: 7, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{m.label}</div>
              </div>
            ))}
          </div>

          <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${L.border}`, background: L.cardAlt }}>
                    {['Competency','Demand Level','Trend','Evidence Level','Signals','Contributing Orgs'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: L.steel, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s, i) => (
                    <tr key={s.competency} style={{ borderBottom: i < signals.length - 1 ? `1px solid ${L.border}` : 'none' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontWeight: 700, color: L.text }}>{s.competency}</span>
                        <span style={{ color: L.textMuted, fontSize: 11, display: 'block', marginTop: 2 }}>{s.label}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ color: demandColor(s.demandLevel), fontWeight: 700, textTransform: 'capitalize' }}>{s.demandLevel}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ color: s.trend === 'increasing' ? L.green : s.trend === 'decreasing' ? L.crimson : L.textMuted, fontWeight: 600 }}>
                          {trendIcon(s.trend)} {s.trend}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ color: evidenceColor(s.evidenceLevel), fontWeight: 600, textTransform: 'capitalize' }}>{s.evidenceLevel}</span>
                      </td>
                      <td style={{ padding: '12px 14px', color: L.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.signalCount}</td>
                      <td style={{ padding: '12px 14px', color: L.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.contributingEmployers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p style={{ color: L.textLight, fontSize: 11, fontStyle: 'italic', marginTop: 12 }}>
            Aggregated intelligence is updated as new signals are validated. Evidence level reflects the strength and volume of underlying data.
          </p>
        </>
      )}
    </div>
  );
}

// ── Talent Pipeline ───────────────────────────────────────────────────────────

function pipelineChipStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? L.crimson : L.card,
    color: active ? '#fff' : L.textMuted,
    border: `1px solid ${active ? L.crimson : L.border}`,
    borderRadius: 20, padding: '6px 16px', fontSize: 13,
    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: active ? 700 : 400,
    transition: 'background 0.15s, color 0.15s',
  };
}

function ParticipantCard({ completer, onSelect }: { completer: Completer; onSelect: () => void }) {
  const topAlignment = completer.pathwayAlignments[0];
  const fitStyle = topAlignment ? FIT_STYLE[topAlignment.fit] : null;
  return (
    <button onClick={onSelect} style={{
      background: L.card, border: `1px solid ${L.border}`, borderRadius: 14,
      padding: 20, cursor: 'pointer', textAlign: 'left', width: '100%',
      fontFamily: 'DM Sans, sans-serif', transition: 'border-color 0.15s, box-shadow 0.15s',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = L.crimson; e.currentTarget.style.boxShadow = '0 4px 16px rgba(143,9,9,0.1)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: `linear-gradient(135deg, ${L.crimson}, ${L.crimsonMid})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0,
        }}>{completer.name.charAt(0).toUpperCase()}</div>
        <div>
          <div style={{ color: L.text, fontSize: 15, fontWeight: 600 }}>{completer.name}</div>
          <div style={{ color: L.textMuted, fontSize: 12 }}>
            Completed {new Date(completer.programCompletedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
      {completer.topPathway && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: L.crimsonLight, borderRadius: 10, padding: '8px 12px', border: `1px solid ${L.crimsonBorder}` }}>
          <div>
            <div style={{ color: L.text, fontSize: 13, fontWeight: 600 }}>{PATHWAY_LABELS[completer.topPathway] ?? completer.topPathway}</div>
            {fitStyle && <div style={{ color: fitStyle.color, fontSize: 11 }}>{fitStyle.label}</div>}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {completer.validatedCompetencies.slice(0, 3).map((comp, i) => (
          <span key={i} style={{ background: L.greenLight, border: `1px solid ${L.greenBorder}`, color: L.green, fontSize: 10, padding: '2px 8px', borderRadius: 4 }}>
            {comp}
          </span>
        ))}
        {completer.validatedCompetencies.length > 3 && (
          <span style={{ color: L.textMuted, fontSize: 11, alignSelf: 'center' }}>+{completer.validatedCompetencies.length - 3} more</span>
        )}
      </div>
      <div style={{ color: L.crimson, fontSize: 12, fontWeight: 700, marginTop: 14, letterSpacing: 0.2 }}>View profile →</div>
    </button>
  );
}

function ParticipantDetail({ completer, onClose }: { completer: Completer; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', border: `1px solid ${L.border}`, borderRadius: 20, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', fontFamily: 'DM Sans, sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg, ${L.crimson}, ${L.crimsonMid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700 }}>
              {completer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{ color: L.text, margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{completer.name}</h2>
              <div style={{ color: L.textMuted, fontSize: 13, marginTop: 2 }}>{completer.email}</div>
              <div style={{ color: L.textMuted, fontSize: 12, marginTop: 2 }}>
                Cohort: {completer.cohort} · Completed {new Date(completer.programCompletedAt).toLocaleDateString('en-CA')}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: L.cardAlt, border: `1px solid ${L.border}`, borderRadius: 8, color: L.textMuted, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Close
          </button>
        </div>

        {completer.aciaCompleted && completer.topPathway && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: L.steel, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
              Career Intelligence Profile — ACIA
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {completer.pathwayAlignments.slice(0, 3).map((a, i) => {
                const fs = FIT_STYLE[a.fit];
                return (
                  <div key={i} style={{ background: L.cardAlt, border: `1px solid ${L.border}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: L.text, fontSize: 14, fontWeight: i === 0 ? 700 : 400 }}>{a.label}</span>
                        <span style={{ background: fs.color + '22', color: fs.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, border: `1px solid ${fs.color}44` }}>{fs.label}</span>
                      </div>
                      <div style={{ color: L.textMuted, fontSize: 12, marginTop: 3 }}>{a.highlights.slice(0, 2).join(' · ')}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{ color: L.steel, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
            Programme-Validated Competencies
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completer.validatedCompetencies.map((comp, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: L.greenLight, border: `1px solid ${L.greenBorder}`, borderRadius: 10, padding: '10px 14px' }}>
                <span style={{ color: L.green, fontSize: 14, flexShrink: 0, fontWeight: 700 }}>✓</span>
                <span style={{ color: L.text, fontSize: 13 }}>{comp}</span>
              </div>
            ))}
          </div>
        </div>

        {!completer.aciaCompleted && (
          <div style={{ background: L.amberLight, border: `1px solid ${L.amberBorder}`, borderRadius: 10, padding: '12px 14px', color: L.amber, fontSize: 13 }}>
            This participant has not yet completed the ACIA career intelligence assessment.
          </div>
        )}
      </div>
    </div>
  );
}

function TalentPipelineTab() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Completer | null>(null);
  const [filterPathway, setFilterPathway] = useState<string>('all');

  useEffect(() => {
    request<PipelineData>('/dashboard/employer').then(d => setData(d)).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: L.textMuted, padding: 40, textAlign: 'center' }}>Loading talent pipeline…</div>;
  if (error)   return <div style={{ color: L.crimson, padding: 24, background: L.crimsonLight, borderRadius: 12, border: `1px solid ${L.crimsonBorder}` }}>{error}</div>;

  const completers = data?.completers ?? [];
  const filtered = filterPathway === 'all' ? completers : completers.filter(c => c.topPathway === filterPathway);
  const pathways = Object.keys(data?.pathwayBreakdown ?? {});

  return (
    <div>
      {/* Hero */}
      <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 14, padding: '24px 28px', marginBottom: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Eyebrow label="Emerging talent aligned to your requirements" />
        <h3 style={{ color: L.text, fontWeight: 700, fontSize: 17, margin: '0 0 6px', letterSpacing: -0.2 }}>
          See how emerging talent aligns with your future workforce requirements.
        </h3>
        <p style={{ color: L.textMid, fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>
          AACP programme graduates have demonstrated competencies across aviation and aerospace pathways. The profiles below are shared with authorised employer partners.
        </p>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {[
            { label: 'Programme Completers', value: data?.totalCompleters ?? 0 },
            { label: 'ACIA Assessed',        value: completers.filter(c => c.aciaCompleted).length },
            { label: 'Pathways',             value: pathways.length },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ color: L.text, fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              <div style={{ color: L.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {pathways.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
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
        <div style={{ textAlign: 'center', padding: '60px 20px', background: L.card, border: `1px solid ${L.border}`, borderRadius: 14 }}>
          <div style={{ color: L.text, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No Programme Completers</div>
          <div style={{ color: L.textMuted, fontSize: 13, lineHeight: 1.6, maxWidth: 420, marginInline: 'auto' }}>
            Participants will appear here once they complete the full AACP programme and have ACIA profiles available.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(c => <ParticipantCard key={c.userId} completer={c} onSelect={() => setSelected(c)} />)}
        </div>
      )}

      {selected && <ParticipantDetail completer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

const TABS: { key: EmpTab; label: string }[] = [
  { key: 'overview',  label: 'Overview'                  },
  { key: 'signal',    label: '+ Submit Workforce Signal'  },
  { key: 'signals',   label: 'My Signals'                },
  { key: 'pipeline',  label: 'Talent Pipeline'           },
  { key: 'industry',  label: 'Industry Intelligence'     },
];

export function EmployerDashboard() {
  const [tab, setTab] = useState<EmpTab>('overview');

  return (
    <DashboardLayout title="Employer Workforce Intelligence">
      {/* Subtitle */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: L.textMuted, fontSize: 13, margin: 0, lineHeight: 1.6, maxWidth: 680 }}>
          Turn workforce requirements, competency signals, and talent evidence into actionable aviation workforce intelligence.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${L.border}`, marginBottom: 32, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            ...tabBtn(tab === t.key),
            ...(t.key === 'signal' ? {
              color: tab === t.key ? L.crimson : L.crimson,
              fontWeight: 700,
              opacity: tab === t.key ? 1 : 0.75,
            } : {}),
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview'  && <OverviewTab onNavigate={setTab} />}
      {tab === 'signal'    && <SubmitSignalTab />}
      {tab === 'signals'   && <MySignalsTab />}
      {tab === 'pipeline'  && <TalentPipelineTab />}
      {tab === 'industry'  && <IndustryIntelligenceTab />}
    </DashboardLayout>
  );
}
