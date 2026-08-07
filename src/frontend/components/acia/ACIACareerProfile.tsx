import type { CareerAlignment, EvidenceItem } from './types';
import { strengthsFromEvidence } from './careerEngine';

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
  crimsonL: '#a8022a',
  bgCard: '#1a0d10',
  bg: '#0f0a0b',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyD: '#6b7280',
  green: '#22c55e',
};

const FIT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  strong: { label: 'Strong Alignment', color: C.green, bg: '#0f1a0f' },
  good: { label: 'Good Alignment', color: '#86efac', bg: '#0f1a12' },
  possible: { label: 'Possible Pathway', color: C.grey, bg: C.bgCard },
};

interface Props {
  alignments: CareerAlignment[];
  evidence: EvidenceItem[];
  onReset: () => void;
}

export function ACIACareerProfile({ alignments, evidence, onReset }: Props) {
  const top = alignments[0];
  const strengths = strengthsFromEvidence(evidence);

  return (
    <div style={{ padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
        <h2 style={{
          fontFamily: 'Fraunces, serif',
          fontSize: 'clamp(1.4rem, 2.5vw, 2rem)',
          color: C.white,
          margin: '0 0 10px',
          fontWeight: 700,
        }}>
          Your Aviation Career Intelligence Profile
        </h2>
        <p style={{ color: C.grey, fontSize: 14, margin: 0, lineHeight: 1.6, maxWidth: 560, marginInline: 'auto' }}>
          Based on your performance across all 9 missions, we've identified the aviation and aerospace pathways that best match your natural strengths, thinking style, and behavioural patterns.
        </p>
      </div>

      {/* Primary alignment highlight */}
      <div style={{
        background: 'linear-gradient(135deg, #1a0d10, #2d0f1a)',
        border: `2px solid ${C.crimson}`,
        borderRadius: 20,
        padding: '24px',
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -20, right: -20,
          fontSize: 80, opacity: 0.08,
        }}>{top.icon}</div>
        <div style={{
          background: C.crimson, color: 'white',
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
          padding: '3px 10px', borderRadius: 4, display: 'inline-block', marginBottom: 14,
        }}>
          Primary Pathway Match
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 32 }}>{top.icon}</span>
          <div>
            <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>
              {top.label}
            </h3>
            <div style={{ color: C.green, fontSize: 12, fontWeight: 600, marginTop: 2 }}>Strong Alignment</div>
          </div>
        </div>
        <p style={{ color: C.grey, fontSize: 14, lineHeight: 1.65, margin: '0 0 16px' }}>
          {top.description}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {top.highlights.map((h, i) => (
            <span key={i} style={{
              background: '#2d0f1a', border: `1px solid ${C.crimsonD}`,
              color: C.white, fontSize: 11, padding: '4px 10px', borderRadius: 6,
            }}>
              ✓ {h}
            </span>
          ))}
        </div>
      </div>

      {/* Top Observed Strengths */}
      {strengths.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 14px', fontSize: '1rem' }}>
            Top Observed Strengths
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {strengths.map((s, i) => (
              <div key={s.key} style={{
                background: C.bgCard,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
                    {i === 0 && <span style={{ color: C.crimson, marginRight: 6, fontSize: 11 }}>★</span>}
                    {s.label}
                  </span>
                  <span style={{ color: C.grey, fontSize: 11 }}>{Math.round(s.score * 100)}%</span>
                </div>
                <div style={{ height: 4, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${s.score * 100}%`,
                    background: i === 0
                      ? `linear-gradient(90deg, ${C.crimson}, ${C.crimsonL})`
                      : `linear-gradient(90deg, ${C.crimsonD}, ${C.crimson})`,
                    borderRadius: 4,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All pathways */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 14px', fontSize: '1rem' }}>
          All Pathway Alignments
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alignments.slice(1).map((a) => {
            const style = FIT_LABELS[a.fit];
            return (
              <div key={a.pathwayId} style={{
                background: style.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{a.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>{a.label}</span>
                    <span style={{
                      background: style.color + '22', color: style.color,
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    }}>
                      {style.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {a.highlights.slice(0, 2).map((h, i) => (
                      <span key={i} style={{ color: C.grey, fontSize: 11 }}>• {h}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Next steps for top pathway */}
      <div style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: '20px',
        marginBottom: 24,
      }}>
        <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 14px', fontSize: '1rem' }}>
          Recommended Next Steps — {top.label}
        </h3>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {top.nextSteps.map((step, i) => (
            <li key={i} style={{ color: C.grey, fontSize: 14, lineHeight: 1.6 }}>{step}</li>
          ))}
        </ol>
      </div>

      {/* Disclaimer */}
      <div style={{
        background: '#1a1400',
        border: '1px solid #3a2a00',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 24,
      }}>
        <div style={{ color: C.amber, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>ABOUT THIS PROFILE</div>
        <div style={{ color: C.greyD, fontSize: 12, lineHeight: 1.6 }}>
          This profile reflects behavioural patterns observed during your assessment missions. It is a career discovery tool designed to open conversations, not close them. Aviation careers are diverse — speak with a coach or industry mentor before making major decisions.
        </div>
      </div>

      <button
        onClick={onReset}
        style={{
          width: '100%',
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          color: C.grey,
          borderRadius: 12,
          padding: '12px',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Retake Assessment
      </button>
    </div>
  );
}

