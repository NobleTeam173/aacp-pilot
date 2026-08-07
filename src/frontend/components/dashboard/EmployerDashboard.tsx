import { useState, useEffect } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { request } from '../../services/apiClient';

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
  bgCard: '#1a0d10',
  bg: '#0f0a0b',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyD: '#6b7280',
  green: '#22c55e',
  amber: '#f59e0b',
};

const PATHWAY_ICONS: Record<string, string> = {
  pilot: '✈️', ame: '🔧', amt: '⚙️', atc: '📡', aerospace: '🚀',
};

const PATHWAY_LABELS: Record<string, string> = {
  pilot: 'Pilot', ame: 'AME', amt: 'Aircraft Maint. Tech', atc: 'Air Traffic Control', aerospace: 'Aerospace & STEM',
};

const FIT_STYLE: Record<string, { color: string; label: string }> = {
  strong: { color: C.green, label: 'Strong Alignment' },
  good: { color: '#86efac', label: 'Good Alignment' },
  possible: { color: C.grey, label: 'Possible' },
};

interface Alignment {
  pathwayId: string;
  label: string;
  fit: 'strong' | 'good' | 'possible';
  highlights: string[];
}

interface Completer {
  userId: string;
  name: string;
  email: string;
  cohort: string;
  programCompletedAt: string;
  topPathway: string | null;
  pathwayAlignments: Alignment[];
  validatedCompetencies: string[];
  aciaCompleted: boolean;
}

interface DashboardData {
  completers: Completer[];
  totalCompleters: number;
  pathwayBreakdown: Record<string, number>;
}

export function EmployerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Completer | null>(null);
  const [filterPathway, setFilterPathway] = useState<string>('all');

  useEffect(() => {
    request<DashboardData>('/dashboard/employer')
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <DashboardLayout title="Employer Partner Portal">
        <div style={{ color: C.grey, padding: 40, textAlign: 'center' }}>Loading program completers…</div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Employer Partner Portal">
        <p role="alert" style={{ color: '#f87171' }}>{error}</p>
      </DashboardLayout>
    );
  }

  const completers = data?.completers ?? [];
  const filtered = filterPathway === 'all'
    ? completers
    : completers.filter(c => c.topPathway === filterPathway);

  const pathways = Object.keys(data?.pathwayBreakdown ?? {});

  return (
    <DashboardLayout title="Employer Partner Portal">
      {/* Header */}
      <section style={{ marginBottom: 28 }}>
        <div style={{
          background: 'linear-gradient(135deg, #1a0d10, #2d0f1a)',
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          padding: '24px 28px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 6px', fontSize: '1.4rem' }}>
              AACP Program Graduates
            </h2>
            <p style={{ color: C.grey, margin: 0, fontSize: 14 }}>
              Participants who completed the full 8-week Aviation & Aerospace Competency Program
            </p>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            {[
              { label: 'Program Completers', value: data?.totalCompleters ?? 0 },
              { label: 'ACIA Assessed', value: completers.filter(c => c.aciaCompleted).length },
              { label: 'Pathways Represented', value: pathways.length },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ color: C.white, fontSize: 28, fontWeight: 800, fontFamily: 'Fraunces, serif' }}>{value}</div>
                <div style={{ color: C.greyD, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pathway breakdown */}
      {pathways.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ color: C.white, fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Pathway Distribution</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilterPathway('all')}
              style={filterChipStyle(filterPathway === 'all')}
            >
              All Pathways ({data?.totalCompleters ?? 0})
            </button>
            {pathways.map(p => (
              <button
                key={p}
                onClick={() => setFilterPathway(p)}
                style={filterChipStyle(filterPathway === p)}
              >
                {PATHWAY_ICONS[p] ?? '📋'} {PATHWAY_LABELS[p] ?? p} ({data?.pathwayBreakdown[p]})
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Participant grid or empty state */}
      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
          {filtered.map(c => (
            <ParticipantCard
              key={c.userId}
              completer={c}
              onSelect={() => setSelected(c)}
            />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <ParticipantDetail completer={selected} onClose={() => setSelected(null)} />
      )}
    </DashboardLayout>
  );
}

function filterChipStyle(active: boolean) {
  return {
    background: active ? C.crimson : C.bgCard,
    color: active ? 'white' : C.grey,
    border: `1px solid ${active ? C.crimsonD : C.border}`,
    borderRadius: 20,
    padding: '6px 14px',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
    fontWeight: active ? 600 : 400,
  } as React.CSSProperties;
}

function ParticipantCard({ completer, onSelect }: { completer: Completer; onSelect: () => void }) {
  const topAlignment = completer.pathwayAlignments[0];
  const fitStyle = topAlignment ? FIT_STYLE[topAlignment.fit] : null;

  return (
    <button
      onClick={onSelect}
      style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: '20px',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        fontFamily: 'DM Sans, sans-serif',
        transition: 'border-color 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.crimson; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'none'; }}
    >
      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 16, fontWeight: 700, flexShrink: 0,
        }}>
          {completer.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ color: C.white, fontSize: 15, fontWeight: 600 }}>{completer.name}</div>
          <div style={{ color: C.greyD, fontSize: 12 }}>
            Completed {new Date(completer.programCompletedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Top pathway */}
      {completer.topPathway && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          background: '#2d0f1a', borderRadius: 10, padding: '8px 12px',
        }}>
          <span style={{ fontSize: 18 }}>{PATHWAY_ICONS[completer.topPathway] ?? '📋'}</span>
          <div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
              {PATHWAY_LABELS[completer.topPathway] ?? completer.topPathway}
            </div>
            {fitStyle && (
              <div style={{ color: fitStyle.color, fontSize: 11 }}>{fitStyle.label}</div>
            )}
          </div>
        </div>
      )}

      {/* Validated competencies preview */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {completer.validatedCompetencies.slice(0, 3).map((comp, i) => (
          <span key={i} style={{
            background: '#0f1a0f', border: '1px solid #1a3a1a',
            color: '#86efac', fontSize: 10, padding: '2px 8px', borderRadius: 4,
          }}>
            ✓ {comp}
          </span>
        ))}
        {completer.validatedCompetencies.length > 3 && (
          <span style={{ color: C.greyD, fontSize: 11, alignSelf: 'center' }}>
            +{completer.validatedCompetencies.length - 3} more
          </span>
        )}
      </div>

      <div style={{ color: C.crimson, fontSize: 12, fontWeight: 600, marginTop: 14 }}>
        View full profile →
      </div>
    </button>
  );
}

function ParticipantDetail({ completer, onClose }: { completer: Completer; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#12080d',
        border: `1px solid ${C.border}`,
        borderRadius: 20,
        padding: 28,
        width: '100%',
        maxWidth: 560,
        maxHeight: '90vh',
        overflowY: 'auto',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 20, fontWeight: 700,
            }}>
              {completer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: 0, fontSize: '1.2rem' }}>{completer.name}</h2>
              <div style={{ color: C.greyD, fontSize: 13, marginTop: 2 }}>{completer.email}</div>
              <div style={{ color: C.greyD, fontSize: 12, marginTop: 2 }}>
                Cohort: {completer.cohort} · Completed {new Date(completer.programCompletedAt).toLocaleDateString('en-CA')}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.grey, padding: '4px 10px', cursor: 'pointer', fontSize: 13,
            }}
          >
            Close
          </button>
        </div>

        {/* ACIA Career profile */}
        {completer.aciaCompleted && completer.topPathway && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Career Intelligence Profile (ACIA)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {completer.pathwayAlignments.slice(0, 3).map((a, i) => {
                const fs = FIT_STYLE[a.fit];
                return (
                  <div key={i} style={{
                    background: C.bgCard, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{PATHWAY_ICONS[a.pathwayId] ?? '📋'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: C.white, fontSize: 14, fontWeight: i === 0 ? 600 : 400 }}>{a.label}</span>
                        <span style={{
                          background: fs.color + '22', color: fs.color,
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        }}>{fs.label}</span>
                      </div>
                      <div style={{ color: C.greyD, fontSize: 12, marginTop: 3 }}>
                        {a.highlights.slice(0, 2).join(' · ')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Validated competencies */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Program-Validated Competencies
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completer.validatedCompetencies.map((comp, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#0f1a0f', border: '1px solid #1a3a1a',
                borderRadius: 10, padding: '10px 14px',
              }}>
                <span style={{ color: C.green, fontSize: 16, flexShrink: 0 }}>✓</span>
                <span style={{ color: C.white, fontSize: 13 }}>{comp}</span>
              </div>
            ))}
          </div>
        </div>

        {!completer.aciaCompleted && (
          <div style={{
            background: '#1a1400', border: '1px solid #3a2a00',
            borderRadius: 10, padding: '12px 14px',
            color: C.amber, fontSize: 13,
          }}>
            ⚠ This participant has not yet completed the ACIA career intelligence assessment.
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 20px',
      background: C.bgCard, border: `1px solid ${C.border}`,
      borderRadius: 18,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎓</div>
      <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 10px' }}>
        No Program Completers Yet
      </h3>
      <p style={{ color: C.grey, fontSize: 14, lineHeight: 1.6, maxWidth: 420, marginInline: 'auto', margin: 0 }}>
        Participants will appear here once they complete the full 8-week AACP program. Program completers with ACIA profiles will have their career alignment shown alongside their validated competencies.
      </p>
    </div>
  );
}
