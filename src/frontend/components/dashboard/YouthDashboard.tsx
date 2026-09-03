import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { ActionListCard } from './ActionListCard';
import { useYouthDashboard } from '../../hooks/useYouthDashboard';
import { ACIA } from '../acia/ACIA';
import type { AssessmentStage } from '../acia/ACIA';
import ACIATransition from '../transition/ACIATransition';
import { request } from '../../services/apiClient';
import { ACIABadge } from '../acia/ACIABadge';
import type { BadgeData } from '../acia/ACIABadge';
import { openACIAReport } from '../acia/reportGenerator';

import { C } from '../../theme';

// â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

interface StageStatus {
  status: 'available' | 'complete' | 'locked';
  completedAt?: string;
  assessmentId?: string;
  availableFrom?: string;
  reason?: string;
}

interface Eligibility {
  stages: {
    baseline: StageStatus;
    completion: StageStatus;
    followup: StageStatus;
  };
  program: {
    enrolled: boolean;
    completed: boolean;
    completedAt: string | null;
  };
}

interface Assessment {
  id: string;
  assessmentStage: AssessmentStage;
  badgeId?: string;
  completedAt: string;
  topPathway?: string;
  pathwayType: string;
}

interface ProgramActivity {
  templateId: string;
  instanceId: string | null;
  weekNumber: number;
  activityKey: string;
  activityLabel: string | null;
  sortOrder: number | null;
  activityPurpose: string;
  deliveryType: string;
  completionAuthority: 'participant' | 'facilitator' | 'system';
  missionType: string | null;
  careerPathway: string | null;
  estimatedHours: number | null;
  programVersion: string;
  completionStatus: 'not_started' | 'in_progress' | 'completed' | 'skipped';
  weekReleased: boolean;
  startedAt: string | null;
  completedAt: string | null;
}

// â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

const STAGE_TITLES: Record<AssessmentStage, string> = {
  baseline: 'Baseline ACIA™',
  completion: 'AACP™ Completion ACIA™',
  followup: '90-Day Employment Follow-Up ACIA™',
};

const STAGE_PURPOSES: Record<AssessmentStage, string> = {
  baseline: 'Establish your initial competency profile and workforce readiness baseline before the AACP.',
  completion: 'Measure competency development and workforce readiness change after completing the 8-week AACP.',
  followup: 'Measure how your competencies are transferring into the workplace after employer exposure.',
};

// ── Status chip ───────────────────────────────────────────────────────────────

type ChipVariant = 'ready' | 'complete' | 'locked' | 'inprogress' | 'upcoming';

function StatusChip({ variant, label }: { variant: ChipVariant; label?: string }) {
  const map: Record<ChipVariant, { bg: string; color: string; border: string; text: string }> = {
    ready:      { bg: C.crimson,    color: '#fff',     border: C.crimson,      text: 'Ready to Begin' },
    complete:   { bg: C.greenBg,    color: C.green,    border: C.greenBorder,  text: 'Completed'      },
    locked:     { bg: C.bgDeep,     color: C.greyD,    border: C.border,       text: 'Locked'         },
    inprogress: { bg: C.blueBg,     color: C.blue,     border: C.blueBorder,   text: 'In Progress'    },
    upcoming:   { bg: C.bgDeep,     color: C.slate,    border: C.border,       text: 'Upcoming'       },
  };
  const s = map[variant];
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700,
      letterSpacing: 0.5, display: 'inline-block', whiteSpace: 'nowrap',
    }}>{label ?? s.text}</span>
  );
}

// ── Phase card ────────────────────────────────────────────────────────────────

function PhaseCard({
  number, title, chipVariant, chipLabel, description, reason, children, expanded,
}: {
  number: string; title: string; chipVariant: ChipVariant; chipLabel?: string;
  description: string; reason?: string; children?: React.ReactNode; expanded?: boolean;
}) {
  const isReady    = chipVariant === 'ready';
  const isDone     = chipVariant === 'complete';
  const isProgress = chipVariant === 'inprogress';
  const accentColor = isDone ? C.green : (isReady || isProgress) ? C.crimson : C.border;

  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: 14,
      boxShadow: (isReady || isProgress) ? `0 2px 16px ${C.crimson}12` : '0 1px 4px rgba(15,23,42,0.06)',
      overflow: 'hidden',
      transition: 'box-shadow 0.2s',
    }}>
      {/* Card header */}
      <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: isDone ? C.greenBg : isReady || isProgress ? C.crimson + '15' : C.bgDeep,
          border: `1px solid ${isDone ? C.greenBorder : isReady || isProgress ? C.crimson + '40' : C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: isDone ? C.green : isReady || isProgress ? C.crimson : C.greyD,
          letterSpacing: 0.5,
        }}>
          {isDone ? '✓' : number}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ color: C.white, fontWeight: 700, fontSize: 15, fontFamily: 'Fraunces, serif' }}>{title}</span>
            <StatusChip variant={chipVariant} label={chipLabel} />
          </div>
          <p style={{ color: C.grey, fontSize: 13, margin: 0, lineHeight: 1.6 }}>{description}</p>
          {reason && (
            <p style={{ color: C.greyD, fontSize: 12, margin: '6px 0 0', fontStyle: 'italic' }}>{reason}</p>
          )}
        </div>
      </div>

      {/* Body (actions / ACIA etc.) */}
      {(children || expanded) && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '18px 24px', background: C.bgDeep }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Completed assessment card ──────────────────────────────────────────────────────────────────────────────────────

function CompletedAssessmentCard({
  stage, assessment, participantName,
}: { stage: AssessmentStage; assessment: Assessment; participantName: string }) {
  const [showBadge, setShowBadge] = useState(false);

  const badgeData: BadgeData | null = assessment.badgeId ? {
    badgeId: assessment.badgeId,
    participantName,
    issueDate: assessment.completedAt,
    aciaVersion: '1.0',
    pathwayType: assessment.pathwayType,
  } : null;

  function handleReport() {
    openACIAReport({
      participantName,
      assessmentDate: assessment.completedAt,
      pathwayType: assessment.pathwayType,
      aciaVersion: '1.0',
      topPathway: assessment.topPathway,
      careerAlignments: [],
      competencies: [],
      developmentAreas: [],
      observedStrengths: [],
      emergingCapabilities: [],
      recommendedNextSteps: [],
      badgeId: assessment.badgeId,
      assessmentStage: stage,
    });
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ color: C.grey, fontSize: 13, marginBottom: 12 }}>
        Completed {fmt(assessment.completedAt)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          onClick={handleReport}
          style={{
            background: C.bgDeep, color: C.white, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Download Report
        </button>
        {badgeData && (
          <button
            onClick={() => setShowBadge(v => !v)}
            style={{
              background: C.bgDeep, color: C.white, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showBadge ? 'Hide Badge' : 'View Digital Badge'}
          </button>
        )}
      </div>
      {showBadge && badgeData && (
        <div style={{ marginTop: 16 }}>
          <ACIABadge data={badgeData} onClose={() => setShowBadge(false)} />
        </div>
      )}
    </div>
  );
}

// ── Post-baseline waitlist panel ──────────────────────────────────────────────

function WaitlistPanel({
  onViewFlightPlan,
  assessmentId,
  onJoined,
}: {
  onViewFlightPlan: () => void;
  assessmentId?: string;
  onJoined: () => void;
}) {
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    setJoining(true);
    setError('');
    try {
      const res = await request<{ joined?: boolean; alreadyOnWaitlist?: boolean; message: string }>(
        '/program/waitlist',
        { method: 'POST', body: { assessmentId } },
      );
      if (res.joined || res.alreadyOnWaitlist) {
        setJoined(true);
        onJoined();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not join the waitlist. Please try again.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div style={{
      marginTop: 20,
      background: 'linear-gradient(135deg, #0f1a2e 0%, #1a0a10 100%)',
      border: `1px solid ${C.crimson}30`,
      borderRadius: 12,
      padding: '20px 22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: C.crimson, boxShadow: `0 0 8px ${C.crimson}`,
          flexShrink: 0,
        }} />
        <span style={{
          color: C.white, fontSize: 13, fontWeight: 700, letterSpacing: '0.03em',
          textTransform: 'uppercase',
        }}>
          Your Next Step
        </span>
      </div>

      {joined ? (
        <>
          <p style={{ color: C.white, fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>
            You're on the AACP Waitlist
          </p>
          <p style={{ color: C.grey, fontSize: 13, lineHeight: 1.65, margin: '0 0 16px' }}>
            An AACP Career Advisor will review your career intelligence and reach out to discuss your pathway into the 8-Week AACP Program. No action is needed from you at this time.
          </p>
          <button
            onClick={onViewFlightPlan}
            style={{
              background: C.bgDeep, color: C.white, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            View My Flight Plan
          </button>
        </>
      ) : (
        <>
          <p style={{ color: C.grey, fontSize: 13, lineHeight: 1.65, margin: '0 0 18px' }}>
            Your baseline career intelligence is ready. The natural next step is the 8-Week AACP Program — a structured, coach-guided journey to develop and validate your aviation competencies. Join the waitlist and an AACP Career Advisor will reach out to guide you through the next steps.
          </p>
          {error && (
            <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 12px' }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={handleJoin}
              disabled={joining}
              style={{
                background: C.crimson, color: '#fff', border: 'none',
                borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700,
                cursor: joining ? 'not-allowed' : 'pointer', opacity: joining ? 0.7 : 1,
                letterSpacing: '0.02em',
              }}
            >
              {joining ? 'Joining…' : 'Join 8-Week AACP Waitlist'}
            </button>
            <button
              onClick={onViewFlightPlan}
              style={{
                background: C.bgDeep, color: C.white, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              View My Flight Plan
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Assessment step (card) ────────────────────────────────────────────────────

function AssessmentStep({
  stepNumber, stage, stageStatus, assessment, participantName, active, onActivate, onComplete, showBaselinePanel, flightPlanRef, onWaitlistJoined,
}: {
  stepNumber: string;
  stage: AssessmentStage;
  stageStatus: StageStatus;
  assessment?: Assessment;
  participantName: string;
  active: boolean;
  onActivate: () => void;
  onComplete: () => void;
  showBaselinePanel?: boolean;
  flightPlanRef?: React.RefObject<HTMLDivElement>;
  onWaitlistJoined?: () => void;
}) {
  const isDone = stageStatus.status === 'complete';
  const isAvail = stageStatus.status === 'available';
  const chip: ChipVariant = isDone ? 'complete' : isAvail ? 'ready' : 'locked';
  const chipLabel = stageStatus.status === 'locked' && stageStatus.availableFrom
    ? `Available ${fmt(stageStatus.availableFrom)}`
    : undefined;

  function scrollToFlightPlan() {
    flightPlanRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <PhaseCard
      number={stepNumber}
      title={STAGE_TITLES[stage]}
      chipVariant={chip}
      chipLabel={chipLabel}
      description={STAGE_PURPOSES[stage]}
      reason={stageStatus.status === 'locked' ? stageStatus.reason : undefined}
    >
      {isDone && assessment && (
        <>
          <div ref={flightPlanRef}>
            <CompletedAssessmentCard stage={stage} assessment={assessment} participantName={participantName} />
          </div>
          {showBaselinePanel && (
            <WaitlistPanel
              onViewFlightPlan={scrollToFlightPlan}
              assessmentId={assessment?.id}
              onJoined={() => onWaitlistJoined?.()}
            />
          )}
        </>
      )}
      {isAvail && !active && (
        <button
          onClick={onActivate}
          style={{
            background: C.crimson, color: '#fff', border: 'none',
            borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Begin {STAGE_TITLES[stage]} →
        </button>
      )}
      {isAvail && active && <ACIA stage={stage} onComplete={onComplete} />}
    </PhaseCard>
  );
}

// ── Captain ACIA program mission chat panel ───────────────────────────────────

const MISSION_SYSTEM_PROMPTS: Record<string, string> = {
  research: `You are Captain ACIA, an AI mentor guiding an aviation career research challenge. Help the participant explore aviation career pathways, research job market information, and articulate their findings. Ask probing questions about their research discoveries, what surprised them, and how the findings connect to their own interests and goals. Be encouraging and professionally oriented.`,
  career: `You are Captain ACIA, an AI mentor guiding a career exploration mission. Help the participant explore a specific aviation career pathway in depth — discussing responsibilities, entry requirements, working conditions, and day-to-day realities. Ask about what they find most appealing, what challenges concern them, and how this pathway aligns with their strengths. Be engaging and realistic.`,
};

const MISSION_WELCOME: Record<string, string> = {
  research: `Welcome to your Career Research Challenge! I'm Captain ACIA. Today we'll dive into the aviation job market together. What career pathway did you research, and what's the most interesting thing you discovered?`,
  career: `Welcome to your Career Exploration Mission! I'm Captain ACIA. Today we're going to explore an aviation career pathway in real depth. Which specific career are we investigating today, and what drew you to explore it?`,
};

function CaptainAciaChatPanel({ activity, onClose }: { activity: ProgramActivity; onClose: () => void }) {
  const missionType = activity.missionType ?? 'career';
  const systemPrompt = MISSION_SYSTEM_PROMPTS[missionType] ?? MISSION_SYSTEM_PROMPTS.career;
  const welcome = MISSION_WELCOME[missionType] ?? MISSION_WELCOME.career;

  type Msg = { role: 'user' | 'assistant'; content: string };
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: welcome }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionDone, setSessionDone] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError('');
    const updated: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(updated);
    setLoading(true);
    try {
      const token = localStorage.getItem('aacp_access_token');
      const res = await fetch('/acia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ systemPrompt, messages: updated }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'AI unavailable');
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? '' }]);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const userTurns = messages.filter(m => m.role === 'user').length;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ background: C.crimson, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Captain ACIA™ — {activity.activityLabel ?? 'Mission'}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: C.bgDeep }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
              background: m.role === 'user' ? C.crimson : C.bgCard,
              color: m.role === 'user' ? '#fff' : C.white,
              border: m.role === 'assistant' ? `1px solid ${C.border}` : 'none',
              boxShadow: m.role === 'assistant' ? '0 1px 3px rgba(15,23,42,0.06)' : 'none',
            }}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={{ color: C.grey, fontSize: 12, padding: '0 4px' }}>Captain ACIA is thinking…</div>}
        {error && <div style={{ color: '#dc2626', fontSize: 12 }}>{error}</div>}
        <div ref={endRef} />
      </div>
      {!sessionDone ? (
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, background: C.bgCard, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Type your response…"
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.bgDeep, color: C.white, outline: 'none' }}
            />
            <button onClick={send} disabled={loading || !input.trim()} style={{ padding: '8px 16px', borderRadius: 8, background: C.crimson, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: loading || !input.trim() ? 0.5 : 1 }}>Send</button>
          </div>
          {userTurns >= 3 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setSessionDone(true)} style={{ padding: '6px 14px', borderRadius: 8, background: 'none', border: `1px solid ${C.green}`, color: C.green, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Complete Session
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}`, background: C.bgCard }}>
          <p style={{ color: C.green, fontWeight: 600, fontSize: 13, margin: '0 0 4px' }}>Session complete — well done!</p>
          <p style={{ color: C.grey, fontSize: 12, margin: 0 }}>Your coach will review and confirm your participation in this mission.</p>
          <button onClick={onClose} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, background: C.crimson, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Close</button>
        </div>
      )}
    </div>
  );
}

// ── Reflection form ───────────────────────────────────────────────────────────

function ReflectionForm({ instanceId, onDone }: { instanceId: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!text.trim() || !instanceId) return;
    setSaving(true);
    setError('');
    try {
      await request('/participant/reflections', {
        method: 'POST',
        body: { reflectionType: 'post_activity', instanceId, reflectionText: text.trim() },
      });
      setSaved(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  if (saved) {
    return (
      <div style={{ padding: '10px 0', color: C.green, fontSize: 12, fontWeight: 600 }}>
        Reflection saved. <button onClick={onDone} style={{ background: 'none', border: 'none', color: C.grey, cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>Close</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0' }}>
      <p style={{ color: C.grey, fontSize: 12, margin: '0 0 6px' }}>Post-activity reflection (optional)</p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        placeholder="What did you learn or observe? Any questions or insights?"
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, background: C.bgDeep, color: C.white, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
      />
      {error && <p style={{ color: '#dc2626', fontSize: 11, margin: '4px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button onClick={submit} disabled={saving || !text.trim()} style={{ padding: '6px 14px', borderRadius: 8, background: C.crimson, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: saving || !text.trim() ? 0.5 : 1 }}>Save Reflection</button>
        <button onClick={onDone} style={{ padding: '6px 12px', borderRadius: 8, background: 'none', border: `1px solid ${C.border}`, color: C.grey, cursor: 'pointer', fontSize: 12 }}>Skip</button>
      </div>
    </div>
  );
}

// ── Activity row ──────────────────────────────────────────────────────────────

const DELIVERY_LABELS: Record<string, string> = {
  captain_acia: 'Captain ACIA™',
  workshop: 'Workshop',
  guided_activity: 'Guided Activity',
  coaching_session: 'Coaching Session',
  independent_study: 'Independent Study',
  field_experience: 'Field Experience',
  reflection: 'Reflection',
  assessment: 'Assessment',
};

const STATUS_COLORS: Record<string, string> = {
  completed: '#16a34a',
  in_progress: '#D97706',
  skipped: '#475569',
  not_started: '#475569',
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  skipped: 'Skipped',
  not_started: 'Not Started',
};

function ActivityRow({ activity, weekReleased, onRefresh }: {
  activity: ProgramActivity;
  weekReleased: boolean;
  onRefresh: () => void;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');
  // Track instanceId created during this session so reflection can reference it
  const [sessionInstanceId, setSessionInstanceId] = useState<string | null>(null);

  const locked = !weekReleased;
  const isCaptainAcia = activity.deliveryType === 'captain_acia';
  const hasMission = activity.missionType !== null;  // null missionType = review/non-chat activity
  const isSystem = activity.completionAuthority === 'system';
  const isFacilitator = activity.completionAuthority === 'facilitator';
  const isParticipant = activity.completionAuthority === 'participant';
  const isDone = activity.completionStatus === 'completed';
  const isSkipped = activity.completionStatus === 'skipped';

  async function startActivity(): Promise<string | null> {
    try {
      const res = await request<{ instanceId: string }>('/participant/activity-instances/start', { method: 'POST', body: { templateId: activity.templateId } });
      if (hasMission) setChatOpen(true);
      onRefresh();
      return res.instanceId;
    } catch { if (hasMission) setChatOpen(true); return null; }
  }

  async function selfComplete() {
    setCompleting(true);
    setCompleteError('');
    try {
      let instanceId = activity.instanceId;
      if (!instanceId) {
        instanceId = await startActivity() ?? null;
      }
      if (!instanceId) throw new Error('Could not start activity');
      await request('/participant/activity-instances/complete', { method: 'POST', body: { instanceId } });
      setSessionInstanceId(instanceId);
      onRefresh();
      setReflectionOpen(true);
    } catch (e) { setCompleteError((e as Error).message); }
    finally { setCompleting(false); }
  }

  const label = activity.activityLabel ?? activity.activityKey.replace(/_/g, ' ');
  const deliveryLabel = DELIVERY_LABELS[activity.deliveryType] ?? activity.deliveryType;
  // instanceId for reflection: prefer the one we just created, fall back to existing
  const reflectionInstanceId = sessionInstanceId ?? activity.instanceId ?? '';

  return (
    <div style={{ padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: locked ? C.bg : C.bgCard, opacity: locked ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: C.bgDeep, color: C.grey, border: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{deliveryLabel}</span>
            {locked && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: C.bgDeep, color: C.grey, border: `1px solid ${C.border}` }}>Locked</span>}
          </div>
          {!locked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[activity.completionStatus] }} />
              <span style={{ fontSize: 11, color: STATUS_COLORS[activity.completionStatus] }}>{STATUS_LABELS[activity.completionStatus]}</span>
              {isDone && activity.completedAt && (
                <span style={{ fontSize: 11, color: C.grey }}> · {fmt(activity.completedAt)}</span>
              )}
            </div>
          )}
          {isSystem && !locked && !isDone && (
            <p style={{ color: C.grey, fontSize: 11, margin: '4px 0 0' }}>Completed automatically when this program phase is reached.</p>
          )}
          {isFacilitator && !locked && !isDone && !isSkipped && (
            <p style={{ color: C.grey, fontSize: 11, margin: '4px 0 0' }}>Requires facilitator confirmation.</p>
          )}
        </div>
        {!locked && !isDone && !isSkipped && !isSystem && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {isCaptainAcia && hasMission && (
              // captain_acia with a missionType: launch the Captain ACIA chat session
              <button onClick={() => chatOpen ? setChatOpen(false) : startActivity()} style={{ padding: '5px 12px', borderRadius: 8, background: C.crimson, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {chatOpen ? 'Close Mission' : 'Launch Mission'}
              </button>
            )}
            {isCaptainAcia && !hasMission && isParticipant && (
              // captain_acia with null missionType (e.g. w01_04 report review): participant self-completes
              <button onClick={selfComplete} disabled={completing} style={{ padding: '5px 12px', borderRadius: 8, background: C.crimson, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: completing ? 0.6 : 1 }}>
                {completing ? 'Saving…' : 'Mark as Reviewed'}
              </button>
            )}
            {!isCaptainAcia && isParticipant && (
              <button onClick={selfComplete} disabled={completing} style={{ padding: '5px 12px', borderRadius: 8, background: C.crimson, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: completing ? 0.6 : 1 }}>
                {completing ? 'Saving…' : 'Mark Complete'}
              </button>
            )}
          </div>
        )}
        {!locked && isDone && isParticipant && reflectionInstanceId && (
          <button onClick={() => setReflectionOpen(r => !r)} style={{ padding: '5px 12px', borderRadius: 8, background: 'none', border: `1px solid ${C.border}`, color: C.grey, cursor: 'pointer', fontSize: 11 }}>
            {reflectionOpen ? 'Close' : 'Reflect'}
          </button>
        )}
      </div>
      {completeError && <p style={{ color: '#dc2626', fontSize: 11, margin: '6px 0 0' }}>{completeError}</p>}
      {chatOpen && !locked && (
        <CaptainAciaChatPanel activity={activity} onClose={() => { setChatOpen(false); onRefresh(); }} />
      )}
      {reflectionOpen && reflectionInstanceId && (
        <ReflectionForm instanceId={reflectionInstanceId} onDone={() => setReflectionOpen(false)} />
      )}
    </div>
  );
}

// ── Week group ────────────────────────────────────────────────────────────────

const WEEK_TITLES: Record<number, string> = {
  1: 'Orientation & ACIA™ Baseline',
  2: 'Career Research & Exploration',
  3: 'AME Career Pathway',
  4: 'Pilot Career Pathway',
  5: 'Air Traffic Control',
  6: 'STEM & Aerospace Pathways',
  7: 'Workplace Readiness',
  8: 'Program Completion & ACIA™',
};

function ProgramWeekGroup({ weekNumber, activities, releasedWeek, onRefresh }: {
  weekNumber: number;
  activities: ProgramActivity[];
  releasedWeek: number;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(weekNumber <= releasedWeek);
  const weekReleased = weekNumber <= releasedWeek;
  const completed = activities.every(a => a.completionStatus === 'completed' || a.completionStatus === 'skipped');
  const inProgress = weekReleased && !completed && activities.some(a => a.completionStatus === 'in_progress' || a.completionStatus === 'completed');

  const chipColor = !weekReleased ? C.grey
    : completed ? C.green
    : inProgress ? C.amber
    : C.crimson;
  const chipLabel = !weekReleased ? 'Locked'
    : completed ? 'Complete'
    : inProgress ? 'In Progress'
    : 'Released';

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: C.bgCard, border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: weekReleased ? C.crimson : C.bgDeep, color: weekReleased ? '#fff' : C.grey, fontWeight: 700, fontSize: 11, borderRadius: 6, padding: '2px 8px', minWidth: 20, textAlign: 'center', border: weekReleased ? 'none' : `1px solid ${C.border}` }}>W{weekNumber}</span>
          <span style={{ color: C.white, fontWeight: 600, fontSize: 13 }}>{WEEK_TITLES[weekNumber] ?? `Week ${weekNumber}`}</span>
          <span style={{ background: chipColor + '22', color: chipColor, fontSize: 10, padding: '2px 8px', borderRadius: 12, border: `1px solid ${chipColor}44` }}>{chipLabel}</span>
        </div>
        <span style={{ color: C.grey, fontSize: 14, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {expanded && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: C.bgDeep }}>
          {activities.map(a => (
            <ActivityRow key={a.templateId} activity={a} weekReleased={weekReleased} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Program step (card) ───────────────────────────────────────────────────────

function ProgramStep({ stepNumber, enrolled, completed, completedAt, releasedWeek, activities, onRefresh, onWaitlist }: {
  stepNumber: string;
  enrolled: boolean;
  completed: boolean;
  completedAt: string | null;
  releasedWeek: number;
  activities: ProgramActivity[];
  onRefresh: () => void;
  onWaitlist?: boolean;
}) {
  const chip: ChipVariant = completed ? 'complete' : enrolled ? 'inprogress' : 'upcoming';
  const chipLabel = completed ? undefined
    : enrolled ? `Week ${releasedWeek} of 8 Released`
    : onWaitlist ? 'Waitlist — AACP Team Will Contact You'
    : undefined;

  // Group activities by week
  const byWeek: Record<number, ProgramActivity[]> = {};
  for (const a of activities) {
    if (!byWeek[a.weekNumber]) byWeek[a.weekNumber] = [];
    byWeek[a.weekNumber].push(a);
  }
  const weekNums = Object.keys(byWeek).map(Number).sort((a, b) => a - b);

  return (
    <PhaseCard
      number={stepNumber}
      title="8-Week AACP Program"
      chipVariant={chip}
      chipLabel={chipLabel}
      description="Build and validate your aviation competencies with a coach across eight structured weeks."
    >
      {completed && completedAt && (
        <p style={{ color: C.grey, fontSize: 13, margin: '0 0 12px' }}>Completed {fmt(completedAt)}</p>
      )}
      {enrolled && weekNums.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {weekNums.map(wn => (
            <ProgramWeekGroup
              key={wn}
              weekNumber={wn}
              activities={byWeek[wn]}
              releasedWeek={releasedWeek}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </PhaseCard>
  );
}

// ── Employer step (card) ──────────────────────────────────────────────────────

function EmployerStep({ stepNumber, programCompleted }: { stepNumber: string; programCompleted: boolean }) {
  return (
    <PhaseCard
      number={stepNumber}
      title="Employer & Workplace Experience"
      chipVariant={programCompleted ? 'inprogress' : 'upcoming'}
      description="Employment, placements, work-integrated learning, or mentorship with AACP employer partners."
      reason="This 90-day period allows your competencies to be applied in real workplace situations."
    />
  );
}

// ── Journey progress header ───────────────────────────────────────────────────

function JourneyProgress({ phases }: { phases: { done: boolean; active: boolean }[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {phases.map((p, i) => (
        <div key={i} style={{
          flex: 1, height: 4, borderRadius: 4,
          background: p.done ? C.green : p.active ? C.crimson : C.border,
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  );
}

// ── Main journey ──────────────────────────────────────────────────────────────

function AACPJourney() {
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [releasedWeek, setReleasedWeek] = useState(0);
  const [activities, setActivities] = useState<ProgramActivity[]>([]);
  const [onWaitlist, setOnWaitlist] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeStage, setActiveStage] = useState<AssessmentStage | null>(null);
  const flightPlanRef = useRef<HTMLDivElement>(null);

  const participantName = localStorage.getItem('aacp_name') ?? 'Participant';

  const loadData = useCallback(async () => {
    try {
      const [eligRes, assRes, progRes] = await Promise.all([
        request<Eligibility>('/acia/eligibility').catch(() => null),
        request<{ assessments: Assessment[] }>('/acia/assessments').catch(() => ({ assessments: [] })),
        request<{ enrollment: { releasedWeek?: number; status?: string } | null; onWaitlist?: boolean }>('/program/status').catch(() => ({ enrollment: null })),
      ]);
      if (eligRes) setEligibility(eligRes);
      setAssessments(assRes.assessments ?? []);
      const rw = progRes.enrollment?.releasedWeek ?? 0;
      setReleasedWeek(rw);
      setOnWaitlist(progRes.onWaitlist ?? false);

      // Lazy load activity instances only when enrolled
      if (progRes.enrollment?.status === 'active' || (rw > 0)) {
        const actRes = await request<{ activities: ProgramActivity[]; releasedWeek: number }>('/participant/activity-instances').catch(() => ({ activities: [], releasedWeek: 0 }));
        setActivities(actRes.activities ?? []);
        if (actRes.releasedWeek > rw) setReleasedWeek(actRes.releasedWeek);
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function handleStageComplete() {
    setActiveStage(null);
    loadData();
  }

  if (!loaded) return null;

  const byStage = Object.fromEntries(assessments.map(a => [a.assessmentStage, a])) as Partial<Record<AssessmentStage, Assessment>>;

  const baselineDone  = eligibility?.stages.baseline.status === 'complete';
  const programDone   = eligibility?.program.completed ?? false;
  const completionDone = eligibility?.stages.completion.status === 'complete';
  const followupDone  = eligibility?.stages.followup.status === 'complete';

  const phases = [
    { done: baselineDone,   active: !baselineDone },
    { done: programDone,    active: baselineDone && !programDone },
    { done: completionDone, active: programDone && !completionDone },
    { done: false,          active: completionDone && !followupDone },
    { done: followupDone,   active: false },
  ];
  const completedCount = phases.filter(p => p.done).length;

  return (
    <section style={{ marginBottom: 28 }}>
      {/* Section header */}
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <path d="M8 38l6-6 10 4 16-18 4 2-12 20 6 2 8-8 3 1-5 10-36-7z" fill="#8F0909"/>
            </svg>
            <div>
              <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', margin: 0, fontWeight: 700, fontSize: 'clamp(1.1rem, 2vw, 1.4rem)', lineHeight: 1.2 }}>
                Your AACP™ Journey
              </h2>
              <p style={{ color: C.grey, fontSize: 12, margin: '2px 0 0', letterSpacing: 0.3 }}>
                Aviation Career Intelligence Programme
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: C.crimson, fontWeight: 800, fontSize: 18, lineHeight: 1 }}>{completedCount}<span style={{ color: C.greyD, fontWeight: 400, fontSize: 13 }}>/5</span></div>
            <div style={{ color: C.greyD, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 }}>Phases complete</div>
          </div>
        </div>
        <JourneyProgress phases={phases} />
      </div>

      {/* Phase cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AssessmentStep
          stepNumber="01"
          stage="baseline"
          stageStatus={eligibility?.stages.baseline ?? { status: 'available' }}
          assessment={byStage.baseline}
          participantName={participantName}
          active={activeStage === 'baseline'}
          onActivate={() => setActiveStage('baseline')}
          onComplete={handleStageComplete}
          showBaselinePanel={baselineDone && !programDone && !onWaitlist}
          flightPlanRef={flightPlanRef}
          onWaitlistJoined={() => setOnWaitlist(true)}
        />
        <ProgramStep
          stepNumber="02"
          enrolled={eligibility?.program.enrolled ?? false}
          completed={eligibility?.program.completed ?? false}
          completedAt={eligibility?.program.completedAt ?? null}
          releasedWeek={releasedWeek}
          activities={activities}
          onRefresh={loadData}
          onWaitlist={onWaitlist}
        />
        <AssessmentStep
          stepNumber="03"
          stage="completion"
          stageStatus={eligibility?.stages.completion ?? { status: 'locked', reason: 'Complete the Baseline ACIA first' }}
          assessment={byStage.completion}
          participantName={participantName}
          active={activeStage === 'completion'}
          onActivate={() => setActiveStage('completion')}
          onComplete={handleStageComplete}
        />
        <EmployerStep
          stepNumber="04"
          programCompleted={eligibility?.program.completed ?? false}
        />
        <AssessmentStep
          stepNumber="05"
          stage="followup"
          stageStatus={eligibility?.stages.followup ?? {
            status: 'locked',
            reason: 'Available 90 days after completion of the 8-Week AACP and during/after employer or workplace experience.',
          }}
          assessment={byStage.followup}
          participantName={participantName}
          active={activeStage === 'followup'}
          onActivate={() => setActiveStage('followup')}
          onComplete={handleStageComplete}
        />
      </div>

    </section>
  );
}

// â"€â"€ Email verification banner â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function EmailVerificationBanner() {
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [msg, setMsg] = useState('');
  const [verified, setVerified] = useState(false);

  async function sendCode() {
    setSending(true); setMsg('');
    try {
      await request('/auth/verify-email/send', { method: 'POST', body: {} });
      setShowInput(true);
      setMsg('Verification code sent — check your email.');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Failed to send code.');
    } finally {
      setSending(false);
    }
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true); setMsg('');
    try {
      await request('/auth/verify-email/confirm', { method: 'POST', body: { code } });
      localStorage.setItem('aacp_email_verified', '1');
      setVerified(true);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Invalid code. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  if (verified) return null;

  return (
    <div style={{
      background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 10,
      padding: '14px 18px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d97706", display: "inline-block", flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ color: C.amber, fontWeight: 700, fontSize: 13 }}>Email address not verified</div>
          <div style={{ color: C.grey, fontSize: 12, marginTop: 2 }}>
            Verify your email to ensure you receive AACP notifications and assessment updates.
          </div>
        </div>
      </div>
      {msg && <p style={{ color: C.amber, fontSize: 12, margin: 0 }}>{msg}</p>}
      {!showInput ? (
        <button
          onClick={sendCode}
          disabled={sending}
          style={{
            alignSelf: 'flex-start', background: C.amber, color: '#fff', border: 'none',
            borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {sending ? 'Sending…' : 'Send Verification Code'}
        </button>
      ) : (
        <form onSubmit={confirmCode} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="6-digit code"
            maxLength={6}
            inputMode="numeric"
            required
            style={{
              background: C.bg, color: C.white, border: `1px solid ${C.border}`,
              borderRadius: 7, padding: '8px 12px', fontSize: 13, width: 120,
            }}
          />
          <button
            type="submit"
            disabled={verifying}
            style={{
              background: C.green, color: '#fff', border: 'none',
              borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {verifying ? 'Verifying…' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={sendCode}
            disabled={sending}
            style={{ background: 'none', border: 'none', color: C.slate, fontSize: 11, cursor: 'pointer' }}
          >
            Resend
          </button>
        </form>
      )}
    </div>
  );
}

// â"€â"€ Dashboard root â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// ── Professional Profile Section ──────────────────────────────────────────────

const SUBSECTORS = ['Commercial Aviation', 'General Aviation', 'AME / Aircraft Maintenance', 'Air Traffic Control', 'Aerospace Engineering', 'Airport Operations', 'Aviation Safety', 'Flight Training', 'Unmanned Aviation / Drones', 'Other'];
const OPP_STATUS_LABELS: Record<string, string> = {
  not_looking: 'Not Currently Looking',
  open: 'Open to Opportunities',
  actively_exploring: 'Actively Exploring',
  advancement: 'Seeking Career Advancement',
};
const MOBILITY_LABELS: Record<string, string> = {
  local: 'Local Only', regional: 'Regional', national: 'National', international: 'International / Relocate',
};

interface ProfProfile {
  occupation?: string; yearsExperience?: string; employerName?: string; location?: string;
  aviationSubsector?: string; education?: string; licencesCertifications?: string;
  careerGoals?: string; geographicMobility?: string; employmentStatus?: string;
  opportunityStatus?: string; pilotFields?: Record<string, string>; ameFields?: Record<string, string>;
  credentialStatus?: string;
}

function ProfessionalProfileSection({ isPilot, isAME }: { isPilot?: boolean; isAME?: boolean }) {
  const [profile, setProfile] = useState<ProfProfile | null>(null);
  const [pgLoading, setPgLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfProfile>({});

  useEffect(() => {
    request<{ profile: ProfProfile | null }>('/participant/professional-profile')
      .then(r => { setProfile(r.profile); if (r.profile) { setForm(r.profile); } else { setEditing(true); } })
      .catch(() => setEditing(true))
      .finally(() => setPgLoading(false));
  }, []);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const setPilot = (k: string, v: string) => setForm(p => ({ ...p, pilotFields: { ...(p.pilotFields ?? {}), [k]: v } }));
  const setAME2 = (k: string, v: string) => setForm(p => ({ ...p, ameFields: { ...(p.ameFields ?? {}), [k]: v } }));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try { await request('/participant/professional-profile', { method: 'POST', body: form }); setProfile(form); setEditing(false); }
    finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, borderRadius: 8, padding: '9px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { display: 'block', color: C.greyD, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 };
  const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };

  if (pgLoading) return null;

  if (!editing && profile) {
    return (
      <section style={{ marginBottom: 24 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.crimson}`, borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Professional Profile</div>
              <div style={{ color: C.white, fontWeight: 700, fontSize: 15 }}>{profile.occupation ?? 'Aviation Professional'}</div>
              <div style={{ color: C.grey, fontSize: 12, marginTop: 2 }}>
                {[profile.yearsExperience ? `${profile.yearsExperience} experience` : null, profile.aviationSubsector, profile.location].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <span style={{ background: C.bgDeep, border: `1px solid ${C.border}`, color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '3px 10px', borderRadius: 6, textTransform: 'uppercase' }}>Self-Reported</span>
              <span style={{ color: C.grey, fontSize: 11 }}>{OPP_STATUS_LABELS[profile.opportunityStatus ?? ''] ?? 'Not Currently Looking'}</span>
            </div>
          </div>
          {profile.licencesCertifications && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
              <span style={{ color: C.greyD, fontSize: 11, fontWeight: 600 }}>Licences / Certifications: </span>
              <span style={{ color: C.grey, fontSize: 12 }}>{profile.licencesCertifications}</span>
            </div>
          )}
          <button onClick={() => { setForm(profile); setEditing(true); }} style={{ marginTop: 14, background: 'none', border: `1px solid ${C.border}`, color: C.grey, borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>
            Edit Profile
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.crimson}`, borderRadius: 14, padding: '22px 26px' }}>
        <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Professional Profile</div>
        <h3 style={{ color: C.white, margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 700 }}>Tell us about your aviation background</h3>
        <p style={{ color: C.grey, fontSize: 12, margin: '0 0 20px', lineHeight: 1.6 }}>
          All credentials are self-reported until independently verified.
        </p>
        <form onSubmit={handleSave}>
          <div style={{ ...row2, marginBottom: 14 }}>
            <div><label style={lbl}>Current Occupation</label><input style={inp} value={form.occupation ?? ''} onChange={e => set('occupation', e.target.value)} placeholder="e.g. Commercial Pilot, AME, ATC Officer" /></div>
            <div><label style={lbl}>Years of Aviation Experience</label>
              <select style={inp} value={form.yearsExperience ?? ''} onChange={e => set('yearsExperience', e.target.value)}>
                <option value="">Select…</option>
                {['Less than 1 year', '1–2 years', '3–5 years', '6–10 years', '11–20 years', '20+ years'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ ...row2, marginBottom: 14 }}>
            <div><label style={lbl}>Aviation Subsector</label>
              <select style={inp} value={form.aviationSubsector ?? ''} onChange={e => set('aviationSubsector', e.target.value)}>
                <option value="">Select…</option>
                {SUBSECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Location (City / Province)</label><input style={inp} value={form.location ?? ''} onChange={e => set('location', e.target.value)} placeholder="e.g. Calgary, AB" /></div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Licences &amp; Certifications (self-reported)</label><input style={inp} value={form.licencesCertifications ?? ''} onChange={e => set('licencesCertifications', e.target.value)} placeholder="e.g. CPL, Multi-IFR, AME M2, ATPL" /></div>
          <div style={{ ...row2, marginBottom: 14 }}>
            <div><label style={lbl}>Current Employer (optional)</label><input style={inp} value={form.employerName ?? ''} onChange={e => set('employerName', e.target.value)} placeholder="Organisation name" /></div>
            <div><label style={lbl}>Employment Status</label>
              <select style={inp} value={form.employmentStatus ?? ''} onChange={e => set('employmentStatus', e.target.value)}>
                <option value="">Select…</option>
                {['Employed Full-Time', 'Employed Part-Time', 'Contract / Seasonal', 'Self-Employed', 'Unemployed / Between Roles', 'Retired'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ ...row2, marginBottom: 14 }}>
            <div><label style={lbl}>Opportunity Status</label>
              <select style={inp} value={form.opportunityStatus ?? 'not_looking'} onChange={e => set('opportunityStatus', e.target.value)}>
                {Object.entries(OPP_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Geographic Mobility</label>
              <select style={inp} value={form.geographicMobility ?? 'national'} onChange={e => set('geographicMobility', e.target.value)}>
                {Object.entries(MOBILITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Education</label><input style={inp} value={form.education ?? ''} onChange={e => set('education', e.target.value)} placeholder="e.g. Aviation Technology Diploma, B.Sc. Aerospace Engineering" /></div>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Career Goals &amp; Preferred Future Roles</label>
            <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={form.careerGoals ?? ''} onChange={e => set('careerGoals', e.target.value)} placeholder="Describe where you'd like your aviation career to go…" />
          </div>
          {isPilot && (
            <div style={{ background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px', marginBottom: 14 }}>
              <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Pilot Information</div>
              <div style={{ ...row2, marginBottom: 12 }}>
                <div><label style={lbl}>Licence Type</label><input style={inp} value={form.pilotFields?.licenceType ?? ''} onChange={e => setPilot('licenceType', e.target.value)} placeholder="e.g. CPL, ATPL, PPL" /></div>
                <div><label style={lbl}>Ratings</label><input style={inp} value={form.pilotFields?.ratings ?? ''} onChange={e => setPilot('ratings', e.target.value)} placeholder="e.g. Multi-IFR, Float, Night" /></div>
              </div>
              <div style={{ ...row2, marginBottom: 12 }}>
                <div><label style={lbl}>Total Flight Hours</label><input style={{ ...inp }} type="number" value={form.pilotFields?.totalHours ?? ''} onChange={e => setPilot('totalHours', e.target.value)} placeholder="e.g. 1200" /></div>
                <div><label style={lbl}>PIC Hours</label><input style={{ ...inp }} type="number" value={form.pilotFields?.picHours ?? ''} onChange={e => setPilot('picHours', e.target.value)} placeholder="e.g. 800" /></div>
              </div>
              <div style={{ ...row2 }}>
                <div><label style={lbl}>Multi-Engine Hours</label><input style={{ ...inp }} type="number" value={form.pilotFields?.multiEngineHours ?? ''} onChange={e => setPilot('multiEngineHours', e.target.value)} placeholder="e.g. 400" /></div>
                <div><label style={lbl}>Aircraft / Type Experience</label><input style={inp} value={form.pilotFields?.aircraftExperience ?? ''} onChange={e => setPilot('aircraftExperience', e.target.value)} placeholder="e.g. C172, B737, DHC-8" /></div>
              </div>
            </div>
          )}
          {isAME && (
            <div style={{ background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px', marginBottom: 14 }}>
              <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>AME / Maintenance Information</div>
              <div style={{ ...row2, marginBottom: 12 }}>
                <div><label style={lbl}>AME Licence / Category</label><input style={inp} value={form.ameFields?.licenceCategory ?? ''} onChange={e => setAME2('licenceCategory', e.target.value)} placeholder="e.g. M1, M2, E, S, TP" /></div>
                <div><label style={lbl}>Years Maintenance Experience</label><input style={inp} value={form.ameFields?.yearsMaintenanceExp ?? ''} onChange={e => setAME2('yearsMaintenanceExp', e.target.value)} placeholder="e.g. 8" /></div>
              </div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>Technical Specialties</label><input style={inp} value={form.ameFields?.technicalSpecialties ?? ''} onChange={e => setAME2('technicalSpecialties', e.target.value)} placeholder="e.g. Avionics, Structures, Powerplant, NDT" /></div>
              <div><label style={lbl}>Aircraft Experience</label><input style={inp} value={form.ameFields?.aircraftExperience ?? ''} onChange={e => setAME2('aircraftExperience', e.target.value)} placeholder="e.g. B737, ATR-72, Citation" /></div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button type="submit" disabled={saving} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save Professional Profile'}
            </button>
            {profile && <button type="button" onClick={() => setEditing(false)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.grey, borderRadius: 8, padding: '10px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>}
          </div>
          <p style={{ color: C.greyD, fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>All credentials are self-reported. AACP does not verify licences or certifications.</p>
        </form>
      </div>
    </section>
  );
}

// ── Talent Network Section ────────────────────────────────────────────────────

interface TalentNetworkStatus {
  enrolled: boolean; enrolledAt?: string;
  settings?: { opportunityStatus: string; geographicMobility: string; contactPermission: boolean; };
}

interface TalentConnection {
  id: string; status: string; employer_note: string | null;
  created_at: string; responded_at: string | null;
  employer_name: string; organization_name: string | null;
}

function TalentNetworkSection({ aciaCompleted }: { aciaCompleted: boolean }) {
  const [status, setStatus] = useState<TalentNetworkStatus | null>(null);
  const [connections, setConnections] = useState<TalentConnection[]>([]);
  const [tnLoading, setTnLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState({ opportunityStatus: 'not_looking', geographicMobility: 'national', contactPermission: false });

  useEffect(() => {
    Promise.all([
      request<TalentNetworkStatus>('/participant/talent-network').catch(() => null),
      request<{ connections: TalentConnection[] }>('/participant/talent-connections').catch(() => ({ connections: [] })),
    ]).then(([net, conn]) => {
      if (net) { setStatus(net); if (net.settings) setSettings({ opportunityStatus: net.settings.opportunityStatus, geographicMobility: net.settings.geographicMobility, contactPermission: net.settings.contactPermission }); }
      setConnections(conn.connections ?? []);
    }).finally(() => setTnLoading(false));
  }, []);

  async function handleJoin() {
    setSaving(true);
    try { await request('/participant/talent-network', { method: 'POST', body: { enrolled: true, ...settings } }); setStatus({ enrolled: true, settings }); setEditing(false); }
    finally { setSaving(false); }
  }

  async function handleLeave() {
    setSaving(true);
    try { await request('/participant/talent-network', { method: 'POST', body: { enrolled: false } }); setStatus(prev => prev ? { ...prev, enrolled: false } : { enrolled: false }); }
    finally { setSaving(false); }
  }

  async function handleUpdateSettings() {
    setSaving(true);
    try { await request('/participant/talent-network', { method: 'POST', body: { enrolled: true, ...settings } }); setStatus(prev => prev ? { ...prev, settings } : { enrolled: true, settings }); setEditing(false); }
    finally { setSaving(false); }
  }

  async function respondToConnection(id: string, action: 'accept' | 'decline') {
    try {
      await request(`/participant/talent-connections/${id}`, { method: 'PUT', body: { action } });
      setConnections(cs => cs.map(c => c.id === id ? { ...c, status: action === 'accept' ? 'connection_accepted' : 'connection_declined', responded_at: new Date().toISOString() } : c));
    } catch { /* ignore */ }
  }

  if (tnLoading) return null;

  const pendingConns = connections.filter(c => c.status === 'interest_sent');

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>AACP Talent Network</div>
            <h3 style={{ color: C.white, margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 700 }}>
              Be Visible to AACP Employer Partners
              {pendingConns.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: C.crimson, color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 800, marginLeft: 8 }}>{pendingConns.length}</span>
              )}
            </h3>
            <p style={{ color: C.grey, fontSize: 12, margin: 0, lineHeight: 1.55, maxWidth: 520 }}>Allow verified aviation and aerospace employers to discover your profile based on your qualifications, competency evidence, and career interests.</p>
          </div>
          <div>
            {status?.enrolled
              ? <span style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, color: C.green, fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: '4px 12px', borderRadius: 8, textTransform: 'uppercase' }}>Visible to Employers</span>
              : <span style={{ background: C.bgDeep, border: `1px solid ${C.border}`, color: C.greyD, fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: '4px 12px', borderRadius: 8, textTransform: 'uppercase' }}>Not in Network</span>
            }
          </div>
        </div>

        {!aciaCompleted && (
          <div style={{ padding: '18px 24px', background: C.bgDeep }}>
            <p style={{ color: C.grey, fontSize: 13, margin: 0, lineHeight: 1.6 }}>Complete the ACIA to unlock Talent Network eligibility. Employer Partners will see your competency evidence and career alignment — never your raw assessment responses.</p>
          </div>
        )}

        {aciaCompleted && !status?.enrolled && !editing && (
          <div style={{ padding: '20px 24px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setEditing(true)} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Join Talent Network</button>
            <span style={{ color: C.grey, fontSize: 12 }}>Participation is entirely optional. You can leave at any time.</span>
          </div>
        )}

        {aciaCompleted && editing && (
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', color: C.greyD, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>Opportunity Status</label>
                <select style={{ background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, borderRadius: 8, padding: '9px 12px', fontSize: 13, width: '100%' }} value={settings.opportunityStatus} onChange={e => setSettings(s => ({ ...s, opportunityStatus: e.target.value }))}>
                  {Object.entries(OPP_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: C.greyD, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>Geographic Mobility</label>
                <select style={{ background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, borderRadius: 8, padding: '9px 12px', fontSize: 13, width: '100%' }} value={settings.geographicMobility} onChange={e => setSettings(s => ({ ...s, geographicMobility: e.target.value }))}>
                  {Object.entries(MOBILITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 18 }}>
              <input type="checkbox" checked={settings.contactPermission} onChange={e => setSettings(s => ({ ...s, contactPermission: e.target.checked }))} style={{ accentColor: C.crimson }} />
              <span style={{ color: C.grey, fontSize: 13, lineHeight: 1.5 }}>Allow employers to request direct contact once a connection is accepted</span>
            </label>
            <p style={{ color: C.greyD, fontSize: 11, marginBottom: 16, lineHeight: 1.5 }}>Employers see a summary of your professional background and competency evidence — not your raw ACIA responses or personal contact details. You choose whether to connect.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={status?.enrolled ? handleUpdateSettings : handleJoin} disabled={saving} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving…' : status?.enrolled ? 'Update Settings' : 'Join Talent Network'}
              </button>
              <button onClick={() => setEditing(false)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.grey, borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>Not Now</button>
            </div>
          </div>
        )}

        {aciaCompleted && status?.enrolled && !editing && (
          <div style={{ padding: '18px 24px' }}>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
              <div><span style={{ color: C.greyD, fontSize: 11 }}>Status: </span><span style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>{OPP_STATUS_LABELS[status.settings?.opportunityStatus ?? ''] ?? 'Not Looking'}</span></div>
              <div><span style={{ color: C.greyD, fontSize: 11 }}>Mobility: </span><span style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>{MOBILITY_LABELS[status.settings?.geographicMobility ?? ''] ?? 'National'}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditing(true)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.grey, borderRadius: 8, padding: '7px 16px', fontSize: 12, cursor: 'pointer' }}>Manage Visibility</button>
              <button onClick={handleLeave} disabled={saving} style={{ background: 'none', border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 8, padding: '7px 16px', fontSize: 12, cursor: 'pointer' }}>Leave Network</button>
            </div>
          </div>
        )}

        {pendingConns.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 24px' }}>
            <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Employer Interest — Awaiting Your Response</div>
            {pendingConns.map(c => (
              <div key={c.id} style={{ background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ color: C.white, fontWeight: 600, fontSize: 13 }}>{c.employer_name}{c.organization_name ? ` — ${c.organization_name}` : ''}</div>
                  <div style={{ color: C.grey, fontSize: 11, marginTop: 3 }}>Expressed interest {new Date(c.created_at).toLocaleDateString('en-CA')}</div>
                  {c.employer_note && <div style={{ color: C.greyD, fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>"{c.employer_note}"</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => respondToConnection(c.id, 'accept')} style={{ background: C.green, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Connect</button>
                  <button onClick={() => respondToConnection(c.id, 'decline')} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.grey, borderRadius: 7, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Participant Handoff Section ───────────────────────────────────────────────
// Participant direction selection + handoff consent/view.
// Additive — does not modify existing dashboard logic.

interface ParticipantHandoff {
  id: string;
  direction_id: string | null;
  destination_org_id: string;
  org_name: string;
  destination_type: string;
  handoff_type: string;
  handoff_status: string;
  consent_id: string | null;
  initiated_at: string;
  sent_at: string | null;
  acknowledged_at: string | null;
}

interface ParticipantDirection {
  id: string;
  direction_label: string;
  direction_type: string;
  target_occupation: string | null;
  status: string;
  selected_at: string;
}

const HF_STATUS_LABEL: Record<string, string> = {
  draft: 'Pending Review', awaiting_consent: 'Your Authorization Required',
  authorized: 'Authorized', ready: 'Preparing', sent: 'Sent to Partner',
  acknowledged: 'Partner Acknowledged', closed: 'Closed', cancelled: 'Cancelled',
};
const HF_STATUS_COLOR: Record<string, string> = {
  draft: C.greyD, awaiting_consent: C.amber, authorized: '#3b82f6',
  ready: '#8b5cf6', sent: C.green, acknowledged: C.green, closed: C.greyD, cancelled: C.red,
};

function ParticipantHandoffSection() {
  const [directions, setDirections] = useState<ParticipantDirection[]>([]);
  const [handoffs, setHandoffs]     = useState<ParticipantHandoff[]>([]);
  const [showDir, setShowDir]       = useState(false);
  const [dirForm, setDirForm]       = useState({ label: '', type: 'employment', occupation: '' });
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [consentHandoff, setConsentHandoff] = useState<{ handoff: ParticipantHandoff; consent: Record<string, unknown> } | null>(null);
  const [consentAction, setConsentAction] = useState('');

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); }

  async function load() {
    setLoading(true);
    try {
      const [dRes, hRes] = await Promise.all([
        request<{ directions: ParticipantDirection[] }>('GET', '/participant/directions'),
        request<{ handoffs: ParticipantHandoff[] }>('GET', '/participant/handoffs'),
      ]);
      setDirections(dRes.directions ?? []);
      setHandoffs(hRes.handoffs ?? []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreateDirection() {
    if (!dirForm.label.trim()) { showToast('Direction name is required', false); return; }
    try {
      await request<{ id: string }>('POST', '/participant/directions', {
        direction_label: dirForm.label.trim(), direction_type: dirForm.type, target_occupation: dirForm.occupation || undefined,
      });
      showToast('Career direction recorded');
      setShowDir(false);
      setDirForm({ label: '', type: 'employment', occupation: '' });
      await load();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', false); }
  }

  async function handleWithdrawDirection(id: string) {
    try {
      await request('PUT', `/participant/directions/${id}`, { status: 'withdrawn' });
      showToast('Direction withdrawn');
      await load();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', false); }
  }

  async function openConsentDetail(h: ParticipantHandoff) {
    if (!h.consent_id) return;
    try {
      const res = await request<{ consent: Record<string, unknown>; destination: Record<string, unknown>; handoff_type: string }>('GET', `/participant/handoffs/${h.id}/consent`);
      setConsentHandoff({ handoff: h, consent: res.consent });
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', false); }
  }

  async function handleConsentAction(handoffId: string, action: string) {
    try {
      const res = await request<{ message: string }>('POST', `/participant/handoffs/${handoffId}/consent`, { action });
      showToast(res.message);
      setConsentHandoff(null);
      await load();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', false); }
  }

  const activeDir = directions.find(d => d.status === 'active');
  const awaitingConsent = handoffs.filter(h => h.handoff_status === 'awaiting_consent');

  const cardStyle: React.CSSProperties = { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 10 };
  const labelStyle: React.CSSProperties = { color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 };
  const inputStyle: React.CSSProperties = { width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, padding: '7px 10px', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };

  if (loading) return null; // Don't show skeleton — purely additive
  if (directions.length === 0 && handoffs.length === 0 && !showDir) {
    // Minimal prompt — only show if participant has program week 8 access contextually
    return null;
  }

  return (
    <section style={{ marginTop: 24 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.ok ? C.green : C.red, color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          {toast.msg}
        </div>
      )}

      {/* Consent modal */}
      {consentHandoff && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '28px 28px', maxWidth: 520, width: '100%' }}>
            <div style={{ color: C.white, fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Your Authorization Required</div>
            <div style={{ color: C.grey, fontSize: 13, marginBottom: 16 }}>AACP is requesting your permission to share information with a partner organization on your behalf.</div>
            <div style={cardStyle}>
              <div style={labelStyle}>Information That Would Be Shared</div>
              <div style={{ color: C.white, fontSize: 12, lineHeight: 1.7 }}>
                {(() => { try { return (JSON.parse(consentHandoff.consent.information_categories as string) as string[]).map(c => `• ${c.replace(/_/g,' ')}`).join('\n'); } catch { return String(consentHandoff.consent.information_categories); } })().split('\n').map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Purpose</div>
              <div style={{ color: C.white, fontSize: 12 }}>{consentHandoff.consent.consent_purpose as string}</div>
            </div>
            <div style={{ background: C.amber + '15', border: `1px solid ${C.amber}44`, borderRadius: 7, padding: '9px 12px', marginBottom: 16, fontSize: 12, color: C.amber }}>
              Consent is specific to this handoff only. It does not authorize sharing your information for any other purpose. You may withdraw before information is sent.
            </div>
            <div style={{ background: C.red + '10', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 11, color: C.greyD }}>
              Consent text version: {consentHandoff.consent.consent_text_version as string} — DRAFT, requires legal/privacy review before production use.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => handleConsentAction(consentHandoff.handoff.id, 'grant')} style={{ background: C.green, color: '#fff', border: 'none', borderRadius: 7, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Authorize</button>
              <button onClick={() => handleConsentAction(consentHandoff.handoff.id, 'decline')} style={{ background: C.red + '33', border: `1px solid ${C.red}55`, color: C.red, borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Decline</button>
              <button onClick={() => setConsentHandoff(null)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.greyD, borderRadius: 7, padding: '9px 14px', fontSize: 12, cursor: 'pointer' }}>Review Later</button>
            </div>
          </div>
        </div>
      )}

      {/* Awaiting consent alert */}
      {awaitingConsent.length > 0 && awaitingConsent.map(h => (
        <div key={h.id} onClick={() => openConsentDetail(h)} style={{ ...cardStyle, borderColor: C.amber, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ color: C.amber, fontWeight: 700, fontSize: 13 }}>Your authorization is required</div>
            <div style={{ color: C.grey, fontSize: 12 }}>AACP has proposed a handoff to <strong style={{ color: C.white }}>{h.org_name}</strong> ({h.destination_type.replace('_',' ')}). Tap to review and authorize.</div>
          </div>
        </div>
      ))}

      {/* Career Direction */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={labelStyle}>Career Direction</div>
            <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>Your Selected Transition Direction</div>
          </div>
          {!showDir && (
            <button onClick={() => setShowDir(true)} style={{ background: C.crimson + '22', border: `1px solid ${C.crimson}55`, color: C.crimson, borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              {activeDir ? 'Update Direction' : 'Select Direction'}
            </button>
          )}
        </div>

        {activeDir ? (
          <div style={{ background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: showDir ? 12 : 0 }}>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 13 }}>{activeDir.direction_label}</div>
            <div style={{ color: C.grey, fontSize: 11, marginTop: 3 }}>{activeDir.direction_type.replace('_',' ')} {activeDir.target_occupation ? `· ${activeDir.target_occupation}` : ''}</div>
            <div style={{ color: C.greyD, fontSize: 10, marginTop: 4 }}>Selected {new Date(activeDir.selected_at).toLocaleDateString('en-CA')}</div>
            <button onClick={() => handleWithdrawDirection(activeDir.id)} style={{ background: 'none', border: 'none', color: C.greyD, fontSize: 10, cursor: 'pointer', marginTop: 6, textDecoration: 'underline' }}>Withdraw this direction</button>
          </div>
        ) : (
          !showDir && <div style={{ color: C.grey, fontSize: 12 }}>You have not yet selected a career transition direction.</div>
        )}

        {showDir && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={labelStyle}>Direction Name</div>
                <input value={dirForm.label} onChange={e => setDirForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Commercial Pilot Training" style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Type</div>
                <select value={dirForm.type} onChange={e => setDirForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                  <option value="employment">Employment</option>
                  <option value="education_training">Education / Regulated Training</option>
                  <option value="industry_experience">Industry Experience</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>Target Occupation (optional)</div>
                <input value={dirForm.occupation} onChange={e => setDirForm(f => ({ ...f, occupation: e.target.value }))} placeholder="e.g. Commercial Pilot" style={inputStyle} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.greyD, marginBottom: 10 }}>Your direction represents your choice. AACP staff may support the transition process but your career direction belongs to you.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreateDirection} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Record My Direction</button>
              <button onClick={() => setShowDir(false)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.greyD, borderRadius: 7, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Active handoffs */}
      {handoffs.filter(h => !['closed','cancelled'].includes(h.handoff_status)).map(h => (
        <div key={h.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={labelStyle}>Handoff</div>
              <div style={{ color: C.white, fontWeight: 700, fontSize: 13 }}>{h.org_name}</div>
              <div style={{ color: C.grey, fontSize: 11, marginTop: 2 }}>{h.destination_type.replace('_',' ')} · {h.handoff_type.replace(/_/g,' ')}</div>
            </div>
            <span style={{ background: `${HF_STATUS_COLOR[h.handoff_status] ?? C.greyD}22`, border: `1px solid ${HF_STATUS_COLOR[h.handoff_status] ?? C.greyD}55`, color: HF_STATUS_COLOR[h.handoff_status] ?? C.greyD, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              {HF_STATUS_LABEL[h.handoff_status] ?? h.handoff_status}
            </span>
          </div>
          {h.handoff_status === 'awaiting_consent' && (
            <button onClick={() => openConsentDetail(h)} style={{ marginTop: 10, background: C.amber + '22', border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Review & Authorize →
            </button>
          )}
          {h.handoff_status === 'authorized' && (
            <button onClick={() => handleConsentAction(h.id, 'withdraw')} style={{ marginTop: 10, background: 'none', border: `1px solid ${C.border}`, color: C.greyD, borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer' }}>
              Withdraw Authorization
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

export function YouthDashboard() {
  const { data, loading, error } = useYouthDashboard();

  const careerStage = localStorage.getItem('aacp_career_stage');
  const isTransitionPath = careerStage === 'transition' || careerStage === 'stem';
  const isAvProfessional = careerStage === 'aviation_professional' || careerStage === 'intl_aviation_professional';
  const avSubsector = localStorage.getItem('aacp_av_subsector') ?? '';
  const emailVerified = localStorage.getItem('aacp_email_verified') === '1';

  const [avProfAciaCompleted, setAvProfAciaCompleted] = useState(false);
  // Enrollment check — participants enrolled in the program see AACPJourney regardless of careerStage path.
  const [enrolledInProgram, setEnrolledInProgram] = useState(false);

  useEffect(() => {
    if (!isAvProfessional) return;
    request<{ assessments: Assessment[] }>('/acia/assessments')
      .then(res => {
        setAvProfAciaCompleted((res.assessments?.length ?? 0) > 0);
      })
      .catch(() => {});
  }, [isAvProfessional]);

  useEffect(() => {
    request<{ enrollment: { status?: string } | null }>('/program/status')
      .then(res => setEnrolledInProgram(res.enrollment?.status === 'active'))
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <DashboardLayout title="Participant Dashboard">
        <p>Loading dashboard...</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Participant Dashboard">
      {!emailVerified && <EmailVerificationBanner />}

      {error && (
        <p role="alert" style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>
          {error}
        </p>
      )}

      {enrolledInProgram ? (
        // Enrolled participants always see AACPJourney regardless of careerStage path.
        <AACPJourney />
      ) : isAvProfessional ? (
        <>
          <ProfessionalProfileSection
            isPilot={avSubsector?.toLowerCase().includes('pilot') || avSubsector?.toLowerCase().includes('commercial aviation')}
            isAME={avSubsector?.toLowerCase().includes('ame') || avSubsector?.toLowerCase().includes('maintenance')}
          />
          <section>
            <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', marginBottom: 16 }}>
              Aviation Career Intelligence Assessment (ACIA)
            </h2>
            <ACIATransition />
          </section>
          <TalentNetworkSection aciaCompleted={avProfAciaCompleted} />
        </>
      ) : isTransitionPath ? (
        <section>
          <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', marginBottom: 16 }}>
            Aviation Career Intelligence Assessment (ACIA)
          </h2>
          <ACIATransition />
        </section>
      ) : (
        <AACPJourney />
      )}

      {!error && !loading && data?.nextSteps?.length > 0 && (
        <section>
          <ActionListCard
            title="Next steps"
            actions={data.nextSteps.map((step) => ({
              id: step.stepId,
              title: step.title,
              description: `${step.description}${step.dueDate ? ` Due ${new Date(step.dueDate).toLocaleDateString()}` : ''}`,
            }))}
          />
        </section>
      )}

      {/* Handoff section — additive, does not appear until directions or handoffs exist */}
      <ParticipantHandoffSection />

    </DashboardLayout>
  );
}



