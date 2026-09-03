import { useState } from 'react';
import type { CareerAlignment, EvidenceItem, QuestionResponse, CompetencyKey } from './types';
import { EVIDENCE_STATE_LABELS, ALIGNMENT_LABELS, COMPETENCY_LABELS } from './types';
import { computeCompetencyIndex, getTopCompetencies, getDevelopmentOpportunities } from './evidenceEngine';
import { ACIABadge } from './ACIABadge';
import type { BadgeData } from './ACIABadge';
import { openACIAReport } from './reportGenerator';
import type { ReportData } from './reportGenerator';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  crimsonL: '#a8022a',
  bgCard: '#1a0d10',
  bg: '#0f0a0b',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyD: '#8a9ab0',
  green: '#16a34a',
  greenL: '#86efac',
};

const ALIGNMENT_COLORS: Record<string, { color: string; bg: string }> = {
  strong: { color: C.greenL, bg: '#0f1a0f' },
  promising: { color: '#67e8f9', bg: '#0a1a1f' },
  developing: { color: '#fde68a', bg: '#1a1600' },
  exploratory: { color: C.grey, bg: C.bgCard },
  insufficient: { color: C.greyD, bg: C.bgCard },
};

const STATE_COLORS: Record<string, string> = {
  strong: C.greenL,
  demonstrated: '#86efac',
  developing: '#fde68a',
  emerging: '#94a3b8',
  insufficient: C.greyD,
};

interface Props {
  alignments: CareerAlignment[];
  evidence: EvidenceItem[];
  responses: QuestionResponse[];
  onReset: () => void;
  onDone?: () => void;
  savedData?: { assessmentId: string; badgeId: string; completedAt: string };
  participantName?: string;
  stage?: string;
}

export function ACIACareerProfile({ alignments, evidence, responses, onReset, onDone, savedData, participantName, stage }: Props) {
  const [showBadge, setShowBadge] = useState(false);
  const top = alignments[0];
  const competencies = computeCompetencyIndex(responses, evidence);
  const topStrengths = getTopCompetencies(competencies, 6);
  const devOps = getDevelopmentOpportunities(competencies);

  function handleDownloadReport() {
    const name = participantName ?? localStorage.getItem('aacp_name') ?? 'Participant';
    // Only surface a top pathway when it has actual evidence behind it
    const reliableTop = top && top.alignment !== 'insufficient' && top.evidenceConfidence !== 'low' ? top : null;
    const report: ReportData = {
      participantName: name,
      assessmentDate: savedData?.completedAt ?? new Date().toISOString(),
      pathwayType: 'standard',
      aciaVersion: '1.0',
      assessmentStage: (stage as 'baseline' | 'completion' | 'followup') ?? 'baseline',
      topPathway: reliableTop?.label,
      careerAlignments: alignments.map(a => ({
        label: a.label,
        alignment: a.alignment,
        evidenceConfidence: a.evidenceConfidence,
        description: a.description,
        observedStrengths: a.observedStrengths,
        developmentOpportunities: a.developmentOpportunities,
        nextSteps: a.nextSteps,
      })),
      competencies: topStrengths.map(obs => ({
        key: obs.key,
        label: COMPETENCY_LABELS[obs.key as CompetencyKey] ?? obs.key,
        state: obs.state,
        confidence: String(obs.observationCount),
      })),
      developmentAreas: devOps.map(o => COMPETENCY_LABELS[o.key as CompetencyKey] ?? o.key),
      observedStrengths: reliableTop?.observedStrengths ?? [],
      emergingCapabilities: devOps.map(o => COMPETENCY_LABELS[o.key as CompetencyKey] ?? o.key),
      recommendedNextSteps: reliableTop?.nextSteps ?? [],
      badgeId: savedData?.badgeId,
    };
    openACIAReport(report);
  }

  const badgeData: BadgeData | null = savedData?.badgeId ? {
    badgeId: savedData.badgeId,
    participantName: participantName ?? localStorage.getItem('aacp_name') ?? 'Participant',
    issueDate: savedData.completedAt,
    aciaVersion: '1.0',
    pathwayType: 'standard',
    assessmentStage: stage ?? 'baseline',
  } : null;

  const topAlignmentMeta = ALIGNMENT_COLORS[top?.alignment ?? 'insufficient'];

  return (
    <div style={{ padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          display: 'inline-block',
          background: '#2d0f1a', border: `1px solid ${C.crimsonD}`,
          borderRadius: 20, padding: '4px 14px', marginBottom: 16,
        }}>
          <span style={{ color: C.crimson, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            AACP · Aviation Career Intelligence
          </span>
        </div>
        <h2 style={{
          fontFamily: 'Fraunces, serif',
          fontSize: 'clamp(1.4rem, 2.5vw, 2rem)',
          color: C.white, margin: '0 0 12px', fontWeight: 700,
        }}>
          Aviation Career Intelligence Profile
        </h2>
        <p style={{ color: C.grey, fontSize: 14, margin: 0, lineHeight: 1.6, maxWidth: 560, marginInline: 'auto' }}>
          This profile reflects behavioural patterns observed across your assessment missions and intelligence challenges. It is a discovery tool, not a verdict.
        </p>
      </div>

      {/* Primary Alignment */}
      {top && (
        <div style={{
          background: 'linear-gradient(135deg, #1a0d10, #2d0f1a)',
          border: `2px solid ${C.crimson}`,
          borderRadius: 20, padding: 24, marginBottom: 24,
        }}>
          <div style={{
            display: 'inline-block',
            background: C.crimson, color: 'white',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
            padding: '3px 10px', borderRadius: 4, marginBottom: 16,
          }}>
            Primary Career Alignment
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
            <div>
              <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 700 }}>
                {top.label}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: topAlignmentMeta.color + '22',
                  color: topAlignmentMeta.color,
                  fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 5,
                }}>
                  {ALIGNMENT_LABELS[top.alignment]}
                </span>
                <span style={{ color: C.greyD, fontSize: 11 }}>
                  Evidence Confidence: {top.evidenceConfidence.charAt(0).toUpperCase() + top.evidenceConfidence.slice(1)}
                </span>
              </div>
            </div>
          </div>
          <p style={{ color: C.grey, fontSize: 14, lineHeight: 1.65, margin: '0 0 16px' }}>
            {top.description}
          </p>
          {top.observedStrengths.length > 0 && (
            <div style={{ marginBottom: top.developmentOpportunities.length > 0 ? 12 : 0 }}>
              <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Observed Strengths
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {top.observedStrengths.map((h, i) => (
                  <span key={i} style={{
                    background: '#2d0f1a', border: `1px solid ${C.crimsonD}`,
                    color: C.white, fontSize: 11, padding: '4px 10px', borderRadius: 6,
                  }}>
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}
          {top.developmentOpportunities.length > 0 && (
            <div>
              <div style={{ color: C.greyD, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Development Opportunity
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {top.developmentOpportunities.map((d, i) => (
                  <span key={i} style={{
                    background: '#1a1600', border: '1px solid #3a2a00',
                    color: '#fde68a', fontSize: 11, padding: '4px 10px', borderRadius: 6,
                  }}>{d}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Competency Profile */}
      {topStrengths.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 14px', fontSize: '1rem' }}>
            Competency Profile — Observed Evidence
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topStrengths.map((obs, i) => (
              <div key={obs.key} style={{
                background: C.bgCard, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
                    {i === 0 && <span style={{ color: C.crimson, marginRight: 6, fontSize: 9, fontWeight: 800, letterSpacing: '0.05em' }}>LEAD</span>}
                    {COMPETENCY_LABELS[obs.key as CompetencyKey]}
                  </span>
                  <span style={{
                    background: STATE_COLORS[obs.state] + '22',
                    color: STATE_COLORS[obs.state],
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  }}>
                    {EVIDENCE_STATE_LABELS[obs.state]}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.max(8, ((obs.rawScore + 1) / 2) * 100)}%`,
                      background: i === 0
                        ? `linear-gradient(90deg, ${C.crimson}, ${C.crimsonL})`
                        : `linear-gradient(90deg, ${C.crimsonD}, ${C.crimson})`,
                      borderRadius: 4, transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <span style={{ color: C.greyD, fontSize: 10, whiteSpace: 'nowrap' }}>
                    {obs.observationCount} obs.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Development Opportunities */}
      {devOps.length > 0 && (
        <div style={{
          background: '#1a1600', border: '1px solid #3a2a00',
          borderRadius: 14, padding: '16px 18px', marginBottom: 24,
        }}>
          <h3 style={{ color: '#fde68a', fontFamily: 'Fraunces, serif', margin: '0 0 12px', fontSize: '0.95rem' }}>
            Emerging Capabilities
          </h3>
          <p style={{ color: C.greyD, fontSize: 12, margin: '0 0 12px', lineHeight: 1.6 }}>
            These competencies showed early indicators during the assessment. With targeted experience or training, they are areas of growth potential.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {devOps.map(obs => (
              <div key={obs.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 3, height: 20, background: '#92400e', borderRadius: 2 }} />
                <span style={{ color: '#fde68a', fontSize: 13, fontWeight: 600 }}>
                  {COMPETENCY_LABELS[obs.key as CompetencyKey]}
                </span>
                <span style={{ color: C.greyD, fontSize: 11 }}>
                  — {EVIDENCE_STATE_LABELS[obs.state]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All pathway alignments */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: '0 0 14px', fontSize: '1rem' }}>
          All Career Pathway Alignments
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alignments.slice(1, 7).map((a) => {
            const meta = ALIGNMENT_COLORS[a.alignment] ?? ALIGNMENT_COLORS.exploratory;
            return (
              <div key={a.pathwayId} style={{
                background: meta.bg, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: a.observedStrengths.length > 0 ? 8 : 0 }}>
                  <span style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>{a.label}</span>
                  <span style={{
                    background: meta.color + '22', color: meta.color,
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    marginLeft: 'auto', whiteSpace: 'nowrap',
                  }}>
                    {ALIGNMENT_LABELS[a.alignment]}
                  </span>
                </div>
                {a.observedStrengths.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {a.observedStrengths.slice(0, 2).map((h, i) => (
                      <span key={i} style={{ color: C.grey, fontSize: 11 }}>· {h}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Next Steps */}
      {top && (
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: 20, marginBottom: 24,
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
      )}

      {/* Evidence confidence notice */}
      <div style={{
        background: '#0f0a0b', border: `1px solid ${C.border}`,
        borderRadius: 12, padding: '14px 16px', marginBottom: 24,
      }}>
        <div style={{ color: C.greyD, fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
          About this Profile
        </div>
        <div style={{ color: C.greyD, fontSize: 12, lineHeight: 1.6 }}>
          This profile reflects behavioural patterns observed during your assessment. Evidence is accumulated across multiple interactions — not from single responses. Aviation careers are diverse: use this as a starting point for conversations with a coach or industry mentor, not a final decision.
        </div>
      </div>

      {/* Post-assessment actions */}
      {savedData && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <button onClick={handleDownloadReport} style={{
            background: C.crimson, color: '#fff', border: 'none',
            borderRadius: 10, padding: '10px 18px', fontSize: 13,
            fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em',
          }}>
            Download ACIA Report
          </button>
          {badgeData && (
            <button onClick={() => setShowBadge(v => !v)} style={{
              background: C.bgCard, color: C.white, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '10px 18px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer',
            }}>
              {showBadge ? 'Hide Badge' : 'View Digital Badge'}
            </button>
          )}
        </div>
      )}

      {showBadge && badgeData && (
        <div style={{ marginBottom: 20 }}>
          <ACIABadge data={badgeData} onClose={() => setShowBadge(false)} />
        </div>
      )}

      {onDone && (
        <button
          onClick={onDone}
          style={{
            width: '100%',
            background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            border: 'none', color: 'white',
            borderRadius: 12, padding: '14px',
            cursor: 'pointer', fontSize: 15, fontWeight: 700,
            marginBottom: 10,
          }}
        >
          Return to My Journey →
        </button>
      )}

    </div>
  );
}
