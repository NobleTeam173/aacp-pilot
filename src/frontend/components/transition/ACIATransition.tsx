import { useState, useRef, useEffect } from 'react';
import type { ACIASession, QuestionResponse } from '../acia/types';
import { ALIGNMENT_LABELS, EVIDENCE_STATE_LABELS, COMPETENCY_LABELS } from '../acia/types';
import type { CompetencyKey } from '../acia/types';
import { selectNextQuestion } from '../acia/adaptiveEngine';
import { AdaptiveQuestion } from '../acia/missions/AdaptiveQuestion';
import {
  computeTransitionAlignments, computeTransitionCompetencies,
  TRANSITION_MENTOR_SYSTEM, DISCOVERY_CLOSING_MESSAGE, buildExtractionPrompt,
} from './transitionEngine';
import type { TransitionSession, TransitionProfile, ConversationMessage } from './types';
import type { CareerStage } from './types';
import { ACIABadge } from '../acia/ACIABadge';
import type { BadgeData } from '../acia/ACIABadge';
import { openACIAReport } from '../acia/reportGenerator';

const ALIGNMENT_COLORS: Record<string, string> = {
  strong:       '#4caf50',
  promising:    '#8bc34a',
  developing:   '#ffd740',
  exploratory:  '#64b5f6',
  insufficient: '#ef5350',
};

const C = {
  bg:        '#08090a',
  card:      '#111316',
  border:    '#1e2126',
  muted:     '#444a54',
  sub:       '#7a8390',
  body:      '#c8cdd4',
  heading:   '#f0f2f5',
  accent:    '#dc143c',
  accentDim: '#7a0b22',
};

function makeSessionId() {
  return `ts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeSession(careerStage: CareerStage): TransitionSession {
  return {
    sessionId: makeSessionId(),
    startedAt: new Date().toISOString(),
    careerStage,
    conversationHistory: [],
    discoveryClosing: false,
    conversationPhaseComplete: false,
    profile: { confirmed: false },
    profileReviewComplete: false,
    aciaResponses: [],
    aciaAskedIds: [],
    aciaComplete: false,
    aciaBridgeShown: false,
    competencies: {},
    alignments: [],
    resultsSaved: false,
  };
}

function getApiBase() {
  return (window as unknown as { __API_BASE__?: string }).__API_BASE__ ?? '';
}

async function getToken(): Promise<string | null> {
  return localStorage.getItem('aacp_access_token');
}

// ── Welcome ───────────────────────────────────────────────────────────────────

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 20, letterSpacing: '-0.02em', color: C.sub }}>✈</div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: C.heading, marginBottom: 12, letterSpacing: '-0.02em' }}>
        ACIA Career Transition Intelligence
      </h1>
      <p style={{ color: C.body, lineHeight: 1.75, marginBottom: 32, fontSize: 15 }}>
        You bring experience from outside aviation. This assessment maps what you have already built — technically, professionally, and cognitively — into Canadian aviation and aerospace career pathways.
      </p>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '24px 28px', marginBottom: 40, textAlign: 'left' }}>
        <p style={{ color: C.sub, fontSize: 11, marginBottom: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>What to expect</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            ['Professional Discovery', 'A structured conversation about your background — approx. 15–20 minutes.'],
            ['ACIA Assessment', 'Intelligence missions across 13 cognitive and aptitude domains — approx. 20–30 minutes.'],
            ['Transition Flight Plan', 'Career alignments, competency evidence, skills bridge, and next steps.'],
          ].map(([title, desc], i) => (
            <div key={i} style={{ display: 'flex', gap: 14 }}>
              <div style={{ color: C.accent, fontWeight: 700, fontSize: 13, minWidth: 18, paddingTop: 1 }}>{i + 1}</div>
              <div>
                <div style={{ color: C.heading, fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                <div style={{ color: C.sub, fontSize: 13 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={onStart}
        style={{
          background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentDim} 100%)`,
          color: '#fff', border: 'none', borderRadius: 8,
          padding: '14px 40px', fontSize: 15, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '0.02em',
        }}
      >
        Begin Assessment
      </button>
    </div>
  );
}

// ── Discovery CTA (3D premium button) ────────────────────────────────────────

function DiscoveryCTA({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <div style={{ textAlign: 'center', padding: '56px 24px 40px' }}>
      <style>{`
        @keyframes cta-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Ambient glow behind button */}
      <div style={{
        position: 'relative', display: 'inline-block',
      }}>
        <div style={{
          position: 'absolute', inset: '-20px',
          background: 'radial-gradient(ellipse, rgba(220,20,60,0.18) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none',
          animation: 'cta-pulse 3s ease-in-out infinite',
        }} />

        <button
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => { setHovered(false); setPressed(false); }}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onClick={onClick}
          disabled={loading}
          style={{
            position: 'relative',
            display: 'block',
            background: pressed
              ? 'linear-gradient(180deg, #1a0d10 0%, #0d0608 100%)'
              : hovered
              ? 'linear-gradient(180deg, #2a1018 0%, #1a0810 60%, #0f0508 100%)'
              : 'linear-gradient(180deg, #22101a 0%, #160810 60%, #0d0508 100%)',
            border: '1px solid rgba(220,20,60,0.35)',
            borderTop: pressed ? '1px solid rgba(220,20,60,0.2)' : '1px solid rgba(220,20,60,0.55)',
            borderRadius: 12,
            padding: '22px 52px',
            cursor: loading ? 'wait' : 'pointer',
            outline: 'none',
            transform: pressed ? 'translateY(2px) scale(0.99)' : hovered ? 'translateY(-3px) scale(1.01)' : 'translateY(0) scale(1)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease',
            boxShadow: pressed
              ? '0 2px 12px rgba(0,0,0,0.7), inset 0 1px 3px rgba(0,0,0,0.5)'
              : hovered
              ? '0 16px 48px rgba(220,20,60,0.3), 0 6px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)'
              : '0 8px 32px rgba(220,20,60,0.2), 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {/* Top edge metallic highlight */}
          <div style={{
            position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
            borderRadius: 1,
          }} />

          <div style={{
            color: '#f0e8ea',
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            marginBottom: 6,
            textShadow: '0 1px 8px rgba(220,20,60,0.4)',
          }}>
            {loading ? 'Preparing…' : 'Continue to ACIA Assessment'}
          </div>
          <div style={{
            color: 'rgba(200,180,185,0.55)',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>
            Begin Your Intelligence Missions
          </div>

          {/* Bottom edge shadow line (depth illusion) */}
          <div style={{
            position: 'absolute', bottom: -1, left: '5%', right: '5%', height: 1,
            background: 'rgba(0,0,0,0.8)',
          }} />
        </button>

        {/* 3D depth base */}
        <div style={{
          position: 'absolute', bottom: -5, left: '2%', right: '2%',
          height: 6, borderRadius: '0 0 12px 12px',
          background: 'linear-gradient(180deg, rgba(80,10,20,0.6), rgba(0,0,0,0.4))',
          transform: pressed ? 'scaleY(0.5)' : 'scaleY(1)',
          transition: 'transform 0.15s ease',
          zIndex: -1,
        }} />
      </div>
    </div>
  );
}

// ── Premium 3D CTA button (reusable) ─────────────────────────────────────────

function PremiumCTA({ label, sub, onClick, loading = false }: { label: string; sub?: string; onClick: () => void; loading?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{
        position: 'absolute', inset: '-20px',
        background: 'radial-gradient(ellipse, rgba(220,20,60,0.15) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
        animation: 'bridge-glow 3s ease-in-out infinite',
      }} />
      <button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onClick={onClick}
        disabled={loading}
        style={{
          position: 'relative', display: 'block',
          background: pressed ? 'linear-gradient(180deg,#1a0d10,#0d0608)' : hovered ? 'linear-gradient(180deg,#2a1018,#1a0810 60%,#0f0508)' : 'linear-gradient(180deg,#22101a,#160810 60%,#0d0508)',
          border: '1px solid rgba(220,20,60,0.35)',
          borderTop: pressed ? '1px solid rgba(220,20,60,0.2)' : '1px solid rgba(220,20,60,0.55)',
          borderRadius: 12, padding: '20px 48px', cursor: loading ? 'wait' : 'pointer', outline: 'none',
          transform: pressed ? 'translateY(2px) scale(0.99)' : hovered ? 'translateY(-3px) scale(1.01)' : 'none',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
          boxShadow: pressed ? '0 2px 12px rgba(0,0,0,0.7),inset 0 1px 3px rgba(0,0,0,0.5)' : hovered ? '0 16px 48px rgba(220,20,60,0.3),0 6px 20px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.06)' : '0 8px 32px rgba(220,20,60,0.2),0 4px 12px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)' }} />
        <div style={{ color: '#f0e8ea', fontSize: 14, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: sub ? 5 : 0, textShadow: '0 1px 8px rgba(220,20,60,0.4)' }}>
          {loading ? 'Please wait…' : label}
        </div>
        {sub && <div style={{ color: 'rgba(200,180,185,0.5)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500 }}>{sub}</div>}
        <div style={{ position: 'absolute', bottom: -1, left: '5%', right: '5%', height: 1, background: 'rgba(0,0,0,0.8)' }} />
      </button>
      <div style={{ position: 'absolute', bottom: -5, left: '2%', right: '2%', height: 6, borderRadius: '0 0 12px 12px', background: 'linear-gradient(180deg,rgba(80,10,20,0.6),rgba(0,0,0,0.4))', transform: pressed ? 'scaleY(0.5)' : 'scaleY(1)', transition: 'transform 0.15s ease', zIndex: -1 }} />
    </div>
  );
}

// ── ACIA Post-Assessment Hub ───────────────────────────────────────────────────

function generateSubmissionId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  return [...arr].map((b, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + b.toString(16).padStart(2, '0')).join('');
}

function ACIABridgeScreen({ session, onView }: { session: TransitionSession; onView: () => void }) {
  const [saving, setSaving] = useState(true);
  const [savedData, setSavedData] = useState<{ assessmentId: string; badgeId: string; completedAt: string } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showBadge, setShowBadge] = useState(false);
  const [enrollDone, setEnrollDone] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const saveAttempted = useRef(false);
  const submissionId = useRef<string>(generateSubmissionId());

  // Save to backend once on mount, with up to 5 attempts + idempotency
  useEffect(() => {
    if (saveAttempted.current || savedData) return;
    saveAttempted.current = true;

    const token = localStorage.getItem('aacp_access_token');
    const participantName = localStorage.getItem('aacp_name') ?? localStorage.getItem('aacp_email') ?? 'Participant';
    const topAlignment = session.alignments[0];

    const competencyProfile = Object.fromEntries(
      Object.entries(session.competencies).map(([k, v]) => [k, { state: v?.state, rawScore: v?.rawScore }])
    );
    const developmentAreas = Object.entries(session.competencies)
      .filter(([, v]) => v && (v.state === 'emerging' || v.state === 'developing'))
      .map(([k]) => COMPETENCY_LABELS[k as CompetencyKey] ?? k);

    const payload = {
      submissionId: submissionId.current,
      pathwayType: 'transition',
      participantName,
      startedAt: session.startedAt,
      topPathway: topAlignment?.label ?? null,
      competencyProfile,
      careerAlignment: session.alignments.slice(0, 8),
      evidenceConfidence: topAlignment?.evidenceConfidence ?? null,
      developmentAreas,
      recommendedPathways: session.alignments.slice(0, 5).map(a => a.label),
      sessionSummary: {
        profile: session.profile,
        aciaResponseCount: session.aciaResponses.length,
      },
    };

    const attempt = async (n: number) => {
      setRetryCount(n);
      try {
        const r = await fetch('/acia/assessment/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(payload),
        });
        if (!r.ok && r.status !== 200 && r.status !== 201) throw new Error(`HTTP ${r.status}`);
        const d: { assessmentId?: string; badgeId?: string; completedAt?: string } = await r.json();
        if (d.assessmentId) {
          setSavedData({ assessmentId: d.assessmentId, badgeId: d.badgeId ?? '', completedAt: d.completedAt ?? new Date().toISOString() });
          setSaveError(false);
          setSaving(false);
          return;
        }
        throw new Error('Unexpected response shape');
      } catch (e) {
        console.error(`[ACIATransition] save attempt ${n + 1} failed:`, e);
        if (n < 4) {
          await new Promise(r => setTimeout(r, Math.min(3000 * (n + 1), 15000)));
          await attempt(n + 1);
        } else {
          setSaveError(true);
          setSaving(false);
        }
      }
    };

    attempt(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualRetry = () => {
    setSaveError(false);
    setSaving(true);
    saveAttempted.current = false;
  };

  function handleDownloadReport() {
    const participantName = localStorage.getItem('aacp_name') ?? localStorage.getItem('aacp_email') ?? 'Participant';
    const topAlignment = session.alignments[0];
    const competencies = Object.entries(session.competencies)
      .filter(([, v]) => v && v.state !== 'insufficient')
      .map(([k, v]) => ({ key: k, label: COMPETENCY_LABELS[k as CompetencyKey] ?? k, state: v!.state }));

    openACIAReport({
      participantName,
      assessmentDate: savedData?.completedAt ?? new Date().toISOString(),
      pathwayType: 'transition',
      aciaVersion: '1.0',
      topPathway: topAlignment?.label,
      careerAlignments: session.alignments.slice(0, 6).map(a => ({
        label: a.label,
        alignment: a.alignment,
        description: a.description,
        observedStrengths: a.aciaObservedStrengths,
        developmentOpportunities: [],
        nextSteps: a.nextSteps,
        aviationBridgeNeeded: a.aviationBridgeNeeded,
        credentialNote: a.credentialNote,
      })),
      competencies,
      developmentAreas: competencies.filter(c => c.state === 'emerging' || c.state === 'developing').map(c => c.label),
      observedStrengths: topAlignment?.aciaObservedStrengths ?? [],
      emergingCapabilities: competencies.filter(c => c.state === 'emerging').map(c => c.label),
      professionalProfile: {
        currentRole: session.profile.currentJobTitle,
        industry: session.profile.currentIndustry,
        yearsExperience: session.profile.yearsExperience,
        educationLevel: session.profile.educationLevel,
        domain: session.profile.detectedDomain,
      },
      transferableCompetencies: topAlignment?.professionalStrengths ?? [],
      aviationKnowledge: [],
      skillsBridge: session.alignments[0]?.aviationBridgeNeeded ?? [],
      recommendedNextSteps: topAlignment?.nextSteps ?? [],
      badgeId: savedData?.badgeId,
    } as Parameters<typeof openACIAReport>[0]);
  }

  async function handleExpressInterest() {
    setEnrollLoading(true);
    const token = localStorage.getItem('aacp_access_token');
    try {
      await fetch('/program/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ assessmentId: savedData?.assessmentId ?? null }),
      });
      setEnrollDone(true);
    } catch { setEnrollDone(true); }
    finally { setEnrollLoading(false); }
  }

  const badgeData: BadgeData | null = savedData ? {
    badgeId: savedData.badgeId,
    participantName: localStorage.getItem('aacp_name') ?? 'Participant',
    issueDate: savedData.completedAt,
    aciaVersion: '1.0',
    pathwayType: 'transition',
  } : null;

  const actionBtn = (label: string, onClick: () => void, done = false): React.CSSProperties => ({
    background: done ? '#0d2010' : C.card,
    color: done ? '#4caf50' : C.body,
    border: `1px solid ${done ? '#1a4a20' : C.border}`,
    borderRadius: 8, padding: '12px 20px', fontSize: 13,
    fontWeight: 600, cursor: 'pointer', textAlign: 'left' as const,
    width: '100%', display: 'block',
  });

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
      <style>{`@keyframes bridge-glow { 0%,100%{opacity:0.5} 50%{opacity:1} } @keyframes check-in { from{opacity:0;transform:scale(0.5)} to{opacity:1;transform:scale(1)} } @keyframes tr-spin { to{transform:rotate(360deg)} }`}</style>

      {/* Server-confirmed completion indicator */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        {saving ? (
          <>
            <div style={{ width: 72, height: 72, borderRadius: '50%', border: '3px solid #8F0909', borderTopColor: 'transparent', animation: 'tr-spin 1s linear infinite', margin: '0 auto 20px' }} />
            <h2 style={{ color: C.heading, fontSize: 20, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>Saving Your Career Intelligence</h2>
            <p style={{ color: C.sub, fontSize: 13 }}>
              {retryCount === 0 ? 'Securing your assessment results…' : `Retrying… (attempt ${retryCount + 1} of 5)`}
            </p>
          </>
        ) : saveError ? (
          <>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#1a0a0a', border: '2px solid #8F0909', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>⚠</div>
            <h2 style={{ color: C.heading, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Trouble Saving Results</h2>
            <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.6, maxWidth: 400, margin: '0 auto 20px' }}>
              We couldn't save your Career Intelligence right now. Your responses have been preserved. Please keep this page open while we retry, or tap below.
            </p>
            <button onClick={handleManualRetry} style={{ background: '#8F0909', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Retry Save
            </button>
          </>
        ) : (
          <>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'radial-gradient(#0d2010,#06120a)', border: '2px solid rgba(76,175,80,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'check-in 0.5s ease', boxShadow: '0 0 32px rgba(76,175,80,0.2)' }}>
              <span style={{ fontSize: 28, color: '#4caf50' }}>✓</span>
            </div>
            <h2 style={{ color: C.heading, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 8 }}>Baseline ACIA Completed</h2>
            <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.7, maxWidth: 460, margin: '0 auto' }}>
              Your ACIA evidence has been collected and your Career Intelligence Profile is ready. Your digital badge has been issued.
            </p>
          </>
        )}
      </div>

      {/* Action cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 40 }}>
        {/* View profile */}
        <button onClick={onView} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1a0d10', border: `1px solid ${C.accentDim}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>📋</span>
          </div>
          <div>
            <div style={{ color: C.heading, fontSize: 14, fontWeight: 700 }}>View Career Intelligence Profile</div>
            <div style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>Competency evidence, career alignments, Transition Flight Plan</div>
          </div>
          <span style={{ color: C.muted, marginLeft: 'auto', fontSize: 16 }}>›</span>
        </button>

        {/* Download report */}
        <button onClick={handleDownloadReport} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#0a1020', border: `1px solid #1e2a3a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>📄</span>
          </div>
          <div>
            <div style={{ color: C.heading, fontSize: 14, fontWeight: 700 }}>Download ACIA Report</div>
            <div style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>Professional PDF — suitable for advisors, training providers, and employers</div>
          </div>
          <span style={{ color: C.muted, marginLeft: 'auto', fontSize: 16 }}>›</span>
        </button>

        {/* View badge */}
        <button onClick={() => setShowBadge(v => !v)} style={{ background: showBadge ? '#1a0a10' : C.card, border: `1px solid ${showBadge ? C.accentDim : C.border}`, borderRadius: 10, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1a0a10', border: `1px solid ${C.accentDim}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>🎖</span>
          </div>
          <div>
            <div style={{ color: C.heading, fontSize: 14, fontWeight: 700 }}>View Digital Completion Badge</div>
            <div style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>Download, share, or verify your ACIA badge {saving ? '(issuing…)' : savedData ? '— ready' : ''}</div>
          </div>
          <span style={{ color: C.muted, marginLeft: 'auto', fontSize: 16 }}>{showBadge ? '▼' : '›'}</span>
        </button>

        {showBadge && badgeData && (
          <div style={{ marginTop: -4, marginBottom: 4 }}>
            <ACIABadge data={badgeData} onClose={() => setShowBadge(false)} />
          </div>
        )}
        {showBadge && !badgeData && (
          <div style={{ padding: '16px 20px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.sub, fontSize: 13, textAlign: 'center' }}>
            {saving ? 'Issuing badge…' : 'Badge data unavailable. Please try again.'}
          </div>
        )}
      </div>

      {/* Primary CTA — 8-week program */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: C.sub, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20, fontWeight: 600 }}>Your Next Step</div>
        {enrollDone ? (
          <div style={{ background: '#0d2010', border: '1px solid #1a4a20', borderRadius: 10, padding: '20px 24px', color: '#4caf50', fontSize: 14, lineHeight: 1.65 }}>
            ✓ Your interest has been recorded. An AACP advisor will be in touch about upcoming cohorts and enrollment.
          </div>
        ) : (
          <PremiumCTA
            label="Enroll in the 8-Week AACP Program"
            sub="Begin Your Aviation Career Development"
            onClick={handleExpressInterest}
            loading={enrollLoading}
          />
        )}
        <p style={{ color: C.muted, fontSize: 11, marginTop: 16, lineHeight: 1.6 }}>
          The 8-Week AACP Program is the structured development pathway that follows ACIA — mentored learning, competency development, industry exposure, and career guidance aligned to your results.
        </p>
      </div>
    </div>
  );
}

// ── Conversation phase ────────────────────────────────────────────────────────

const OPENING_MESSAGE = "Welcome. I'm glad you're here. To get started, could you tell me about your educational background — what did you study, and where did you do that?";

function ConversationPhase({
  session,
  onUpdate,
}: {
  session: TransitionSession;
  onUpdate: (updates: Partial<TransitionSession>) => void;
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session.conversationHistory.length === 0) {
      onUpdate({
        conversationHistory: [{
          role: 'assistant',
          content: OPENING_MESSAGE,
          timestamp: new Date().toISOString(),
        }],
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const history = session.conversationHistory;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length]);

  async function sendMessage(userText: string) {
    if (!userText.trim()) return;
    const token = await getToken();
    const newHistory: ConversationMessage[] = [
      ...history,
      { role: 'user' as const, content: userText, timestamp: new Date().toISOString() },
    ];
    onUpdate({ conversationHistory: newHistory });

    setLoading(true);
    try {
      const messages = newHistory.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${getApiBase()}/acia/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages,
          systemPrompt: TRANSITION_MENTOR_SYSTEM,
          maxTokens: 400,
        }),
      });

      if (!res.ok) throw new Error('Failed');
      const data = await res.json() as { reply?: string };
      const aiMsg: ConversationMessage = {
        role: 'assistant',
        content: data.reply ?? 'Could you tell me more about that?',
        timestamp: new Date().toISOString(),
      };
      onUpdate({ conversationHistory: [...newHistory, aiMsg] });
    } catch {
      const errMsg: ConversationMessage = {
        role: 'assistant',
        content: 'I had trouble connecting. Please send your message again.',
        timestamp: new Date().toISOString(),
      };
      onUpdate({ conversationHistory: [...newHistory, errMsg] });
    } finally {
      setLoading(false);
    }
  }

  // Step 1: lock input, append closing message, show CTA
  function handleDiscoveryComplete() {
    const closingMsg: ConversationMessage = {
      role: 'assistant',
      content: DISCOVERY_CLOSING_MESSAGE,
      timestamp: new Date().toISOString(),
    };
    onUpdate({
      discoveryClosing: true,
      conversationHistory: [...history, closingMsg],
    });
  }

  // Step 2: CTA clicked — extract profile, advance phase
  async function handleContinueToACIA() {
    setLoading(true);
    try {
      const token = await getToken();
      const extractionPrompt = buildExtractionPrompt(history.map(m => ({ role: m.role, content: m.content })));
      const res = await fetch(`${getApiBase()}/acia/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: extractionPrompt }],
          maxTokens: 1200,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { reply?: string };
        try {
          const jsonMatch = (data.reply ?? '').match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const extracted = JSON.parse(jsonMatch[0]) as Partial<TransitionProfile>;
            onUpdate({
              conversationPhaseComplete: true,
              profile: { ...session.profile, ...extracted, confirmed: false },
            });
            return;
          }
        } catch { /* fall through */ }
      }
      onUpdate({ conversationPhaseComplete: true });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading || session.discoveryClosing) return;
    const text = input;
    setInput('');
    void sendMessage(text);
  }

  const minTurns = 6;
  const userTurns = history.filter(m => m.role === 'user').length;
  const canFinish = userTurns >= minTurns && !session.discoveryClosing;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.heading, margin: 0 }}>Professional Discovery</h2>
        <p style={{ color: C.sub, fontSize: 13, margin: '4px 0 0' }}>Share your background — the mentor will ask one question at a time.</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
        {history.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%',
              background: msg.role === 'user' ? C.accentDim : C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: '12px 16px',
              color: C.body,
              fontSize: 14,
              lineHeight: 1.65,
            }}>
              {msg.role === 'assistant' && (
                <div style={{ color: C.accent, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>Mentor</div>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', color: C.muted, fontSize: 13 }}>…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input locked when discoveryClosing */}
      {!session.discoveryClosing && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
            placeholder="Your response..."
            rows={2}
            style={{
              flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.body, padding: '10px 12px', fontSize: 14, resize: 'none', outline: 'none',
            }}
            disabled={loading}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              type="submit"
              disabled={!input.trim() || loading}
              style={{
                background: C.accent, color: '#fff', border: 'none', borderRadius: 6,
                padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                opacity: (!input.trim() || loading) ? 0.5 : 1,
              }}
            >
              Send
            </button>
            {canFinish && (
              <button
                type="button"
                onClick={handleDiscoveryComplete}
                disabled={loading}
                style={{
                  background: 'transparent', color: C.sub, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                }}
              >
                Continue →
              </button>
            )}
          </div>
        </form>
      )}

      {!session.discoveryClosing && !canFinish && (
        <p style={{ color: C.muted, fontSize: 12, textAlign: 'right', marginTop: 6 }}>
          {minTurns - userTurns} more response{minTurns - userTurns !== 1 ? 's' : ''} to unlock Continue
        </p>
      )}

      {/* Discovery complete — show premium CTA */}
      {session.discoveryClosing && (
        <DiscoveryCTA onClick={handleContinueToACIA} loading={loading} />
      )}
    </div>
  );
}

// ── Profile review phase ──────────────────────────────────────────────────────

function ProfileReview({
  profile,
  onConfirm,
}: {
  profile: TransitionProfile;
  onConfirm: (p: TransitionProfile) => void;
}) {
  const [local, setLocal] = useState<TransitionProfile>({ ...profile });

  function field(label: string, key: keyof TransitionProfile, type: 'text' | 'number' | 'checkbox' = 'text') {
    const val = local[key];
    if (type === 'checkbox') {
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
          <input type="checkbox" checked={!!val} onChange={e => setLocal(p => ({ ...p, [key]: e.target.checked }))} style={{ accentColor: C.accent }} />
          <label style={{ color: C.body, fontSize: 14 }}>{label}</label>
        </div>
      );
    }
    return (
      <div key={key} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
        <label style={{ display: 'block', color: C.sub, fontSize: 12, marginBottom: 4 }}>{label}</label>
        <input
          type={type}
          value={type === 'number' ? (val as number ?? '') : (val as string ?? '')}
          onChange={e => setLocal(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
          style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, color: C.body, padding: '6px 10px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.heading, marginBottom: 8 }}>Confirm Your Professional Profile</h2>
      <p style={{ color: C.sub, fontSize: 14, marginBottom: 24, lineHeight: 1.65 }}>
        Review and correct anything below. This profile forms the Source A evidence that ACIA results will be measured against.
      </p>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0 20px' }}>
        {field('Current Job Title', 'currentJobTitle')}
        {field('Current Industry', 'currentIndustry')}
        {field('Years of Experience', 'yearsExperience', 'number')}
        {field('Field of Study', 'fieldOfStudy')}
        {field('Education Level', 'educationLevel')}
        {field('Professional Designation', 'professionalDesignation')}
        {field('Aviation Interest', 'aviationInterest')}
        {field('Career Transition Goal', 'careerTransitionGoal')}
        {field('Safety-Sensitive Work', 'safetySensitiveWork', 'checkbox')}
        {field('Regulatory / Compliance Exposure', 'regulatoryExposure', 'checkbox')}
        {field('Leadership / Supervisory Experience', 'leadershipExperience', 'checkbox')}
        {field('Project Management Experience', 'projectManagementExperience', 'checkbox')}
      </div>
      <button
        onClick={() => onConfirm({ ...local, confirmed: true })}
        style={{
          marginTop: 24, background: C.accent, color: '#fff', border: 'none',
          borderRadius: 6, padding: '12px 32px', fontSize: 15, fontWeight: 600,
          cursor: 'pointer', width: '100%',
        }}
      >
        Confirm — Begin ACIA Missions
      </button>
    </div>
  );
}

// ── ACIA missions phase ───────────────────────────────────────────────────────

function ACIAMissionsPhase({
  session,
  onUpdate,
}: {
  session: TransitionSession;
  onUpdate: (updates: Partial<TransitionSession>) => void;
}) {
  const MAX_MISSIONS = 15;
  const missionCount = session.aciaAskedIds.length;

  const pseudoSession: ACIASession = {
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    evidence: [],
    responses: session.aciaResponses,
    askedQuestionIds: session.aciaAskedIds,
    competencies: {},
    missions: [],
    currentMissionIndex: 0,
    chatHistory: {},
  };

  const result = selectNextQuestion(pseudoSession);

  function handleQuestionComplete(qResponse: QuestionResponse) {
    onUpdate({
      aciaResponses: [...session.aciaResponses, qResponse],
      aciaAskedIds: [...session.aciaAskedIds, qResponse.questionId],
    });
  }

  if (!result || missionCount >= MAX_MISSIONS) {
    // Compute results and set aciaComplete — bridge screen shown by getPhase()
    if (!session.aciaComplete) {
      const competencies = computeTransitionCompetencies(session.aciaResponses, session.profile);
      const alignments = computeTransitionAlignments(session.aciaResponses, session.profile);
      onUpdate({ aciaComplete: true, competencies, alignments });
    }
    // Render nothing — parent will switch to acia_bridge phase
    return null;
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.heading, margin: 0 }}>ACIA Intelligence Missions</h2>
          <p style={{ color: C.sub, fontSize: 13, margin: '2px 0 0' }}>Mission {missionCount + 1} of {MAX_MISSIONS}</p>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>{result.question.family}</div>
      </div>
      <div style={{ height: 3, background: C.border, borderRadius: 2, marginBottom: 20 }}>
        <div style={{
          height: '100%', width: `${(missionCount / MAX_MISSIONS) * 100}%`,
          background: C.accent, borderRadius: 2, transition: 'width 0.3s',
        }} />
      </div>
      <AdaptiveQuestion
        key={result.question.questionId}
        question={result.question}
        variantText={result.variant}
        expectedCorrect={result.expectedCorrect}
        onComplete={handleQuestionComplete}
      />
    </div>
  );
}

// ── Results / Transition Flight Plan ─────────────────────────────────────────

const ALIGNMENT_BADGE_BG: Record<string, string> = {
  strong: '#0d3b1e', promising: '#1a2e0a', developing: '#1a1a0a',
  exploratory: '#1a1a2e', insufficient: '#2e0a0a',
};

function ResultsPhase({ session }: { session: TransitionSession }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const top = session.alignments.filter(a => a.alignment !== 'insufficient').slice(0, 8);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.heading, marginBottom: 8, letterSpacing: '-0.02em' }}>
          Your Transition Flight Plan
        </h1>
        <p style={{ color: C.sub, fontSize: 14 }}>
          Career alignment determined by two independent evidence sources — your professional background and ACIA observed performance.
        </p>
      </div>

      {/* Profile summary */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 24px', marginBottom: 32 }}>
        <h3 style={{ color: C.heading, fontSize: 12, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
          Source A — Professional Background
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 28px' }}>
          {[
            ['Current Role', session.profile.currentJobTitle ?? '—'],
            ['Industry', session.profile.currentIndustry ?? '—'],
            ['Experience', session.profile.yearsExperience ? `${session.profile.yearsExperience} years` : '—'],
            ['Domain', (session.profile.detectedDomain ?? '—').replace(/_/g, ' ')],
            ['Education', (session.profile.educationLevel ?? '—').replace(/_/g, ' ')],
            ['Aviation Interest', session.profile.aviationInterest ?? '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <span style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
              <div style={{ color: C.body, fontSize: 14, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Competency evidence */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ color: C.heading, fontSize: 12, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
          Source B — ACIA Observed Competency Evidence
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          {(Object.entries(session.competencies) as [string, { state: string; rawScore: number }][])
            .sort((a, b) => b[1].rawScore - a[1].rawScore)
            .map(([key, obs]) => (
              <div key={key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ color: C.sub, fontSize: 11, marginBottom: 4 }}>{COMPETENCY_LABELS[key as CompetencyKey] ?? key}</div>
                <div style={{ color: C.body, fontSize: 13, fontWeight: 500 }}>
                  {EVIDENCE_STATE_LABELS[obs.state as keyof typeof EVIDENCE_STATE_LABELS] ?? obs.state}
                </div>
                <div style={{ height: 3, background: C.border, borderRadius: 2, marginTop: 6 }}>
                  <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, (obs.rawScore + 1) / 2 * 100))}%`, background: C.accent, borderRadius: 2 }} />
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Career alignments */}
      <div>
        <h3 style={{ color: C.heading, fontSize: 12, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Career Alignment</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {top.map(alignment => {
            const isOpen = expanded === alignment.careerId;
            const badgeBg = ALIGNMENT_BADGE_BG[alignment.alignment] ?? C.card;
            const badgeFg = ALIGNMENT_COLORS[alignment.alignment] ?? C.body;
            return (
              <div key={alignment.careerId} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : alignment.careerId)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '16px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ color: C.heading, fontSize: 15, fontWeight: 600 }}>{alignment.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: badgeBg, color: badgeFg, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {ALIGNMENT_LABELS[alignment.alignment]}
                      </span>
                    </div>
                    <span style={{ color: C.sub, fontSize: 12 }}>{alignment.family}</span>
                  </div>
                  <span style={{ color: C.muted, fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${C.border}` }}>
                    <p style={{ color: C.body, fontSize: 14, lineHeight: 1.65, margin: '16px 0' }}>{alignment.description}</p>

                    {alignment.professionalStrengths.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <h4 style={{ color: C.sub, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Source A — Professional Evidence</h4>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {alignment.professionalStrengths.map((s, i) => (
                            <li key={i} style={{ color: C.body, fontSize: 14, padding: '3px 0', display: 'flex', gap: 8 }}>
                              <span style={{ color: '#4caf50' }}>●</span>{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {alignment.aciaObservedStrengths.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <h4 style={{ color: C.sub, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Source B — ACIA Observed</h4>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {alignment.aciaObservedStrengths.map((s, i) => (
                            <li key={i} style={{ color: C.body, fontSize: 14, padding: '3px 0', display: 'flex', gap: 8 }}>
                              <span style={{ color: C.accent }}>●</span>{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ color: C.sub, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Aviation Bridge Required</h4>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {alignment.aviationBridgeNeeded.map((s, i) => (
                          <li key={i} style={{ color: C.body, fontSize: 14, padding: '3px 0', display: 'flex', gap: 8 }}>
                            <span style={{ color: C.muted }}>→</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ background: '#080a0c', border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
                      <h4 style={{ color: C.sub, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Credential Note</h4>
                      <p style={{ color: C.body, fontSize: 13, lineHeight: 1.55, margin: 0 }}>{alignment.credentialNote}</p>
                    </div>

                    <div>
                      <h4 style={{ color: C.sub, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Next Steps</h4>
                      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {alignment.nextSteps.map((s, i) => (
                          <li key={i} style={{ color: C.body, fontSize: 14, padding: '3px 0', display: 'flex', gap: 10 }}>
                            <span style={{ color: C.accent, fontWeight: 700, minWidth: 16 }}>{i + 1}.</span>{s}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 40, padding: '20px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, textAlign: 'center' }}>
        <p style={{ color: C.sub, fontSize: 13, margin: 0 }}>
          Alignment is determined by two independent evidence sources. Source A (professional background) forms initial hypotheses. Source B (ACIA observed) validates, challenges, or redirects those hypotheses. Evidence states reflect observable quality — not numeric scoring or pass/fail.
        </p>
      </div>
    </div>
  );
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

type Phase = 'welcome' | 'conversation' | 'profile_review' | 'acia_missions' | 'acia_bridge' | 'results';

export default function ACIATransition() {
  const careerStage = (localStorage.getItem('aacp_career_stage') ?? 'transition') as CareerStage;
  const [session, setSession] = useState<TransitionSession | null>(null);

  function updateSession(updates: Partial<TransitionSession>) {
    setSession(s => s ? { ...s, ...updates } : s);
  }

  function getPhase(): Phase {
    if (!session) return 'welcome';
    if (!session.conversationPhaseComplete) return 'conversation';
    if (!session.profileReviewComplete) return 'profile_review';
    if (!session.aciaComplete) return 'acia_missions';
    if (!session.aciaBridgeShown) return 'acia_bridge';
    return 'results';
  }

  const phase = getPhase();

  const PHASE_LABELS: Record<Phase, string> = {
    welcome: 'Welcome',
    conversation: 'Discovery',
    profile_review: 'Profile',
    acia_missions: 'ACIA Missions',
    acia_bridge: 'ACIA Complete',
    results: 'Flight Plan',
  };
  const PHASE_ORDER: Phase[] = ['conversation', 'profile_review', 'acia_missions', 'acia_bridge', 'results'];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.body }}>
      {/* Progress bar */}
      {session && phase !== 'welcome' && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: C.bg, borderBottom: `1px solid ${C.border}`,
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {PHASE_ORDER.map((p, i) => {
            const currentIdx = PHASE_ORDER.indexOf(phase);
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <div style={{ width: 20, height: 1, background: C.border }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: done ? '#4caf50' : active ? C.accent : C.border }} />
                  <span style={{ fontSize: 11, color: active ? C.body : C.muted, display: 'none' }}>
                    {PHASE_LABELS[p]}
                  </span>
                </div>
              </div>
            );
          })}
          <span style={{ marginLeft: 8, fontSize: 12, color: C.sub, fontWeight: 600 }}>
            {PHASE_LABELS[phase]}
          </span>
        </div>
      )}

      {phase === 'welcome' && <WelcomeScreen onStart={() => setSession(makeSession(careerStage))} />}
      {phase === 'conversation' && session && (
        <ConversationPhase session={session} onUpdate={updateSession} />
      )}
      {phase === 'profile_review' && session && (
        <ProfileReview
          profile={session.profile}
          onConfirm={p => updateSession({ profile: p, profileReviewComplete: true })}
        />
      )}
      {phase === 'acia_missions' && session && (
        <ACIAMissionsPhase session={session} onUpdate={updateSession} />
      )}
      {phase === 'acia_bridge' && session && (
        <ACIABridgeScreen session={session} onView={() => updateSession({ aciaBridgeShown: true })} />
      )}
      {phase === 'results' && session && (
        <ResultsPhase session={session} />
      )}
    </div>
  );
}
