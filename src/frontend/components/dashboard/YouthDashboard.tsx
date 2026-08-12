import { useState, useEffect, useCallback } from 'react';
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

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
  bgCard: '#1a0d10',
  bgDeep: '#12080d',
  border: '#3d1020',
  borderLight: '#2a1218',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyLight: '#cbd5e1',
  green: '#22c55e',
  amber: '#f59e0b',
  slate: '#64748b',
};

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

const STAGE_TITLES: Record<AssessmentStage, string> = {
  baseline: 'Baseline ACIA',
  completion: 'AACP Completion ACIA',
  followup: '90-Day Employment Follow-Up ACIA',
};

const STAGE_PURPOSES: Record<AssessmentStage, string> = {
  baseline: 'Establish your initial competency profile and workforce readiness baseline before the AACP.',
  completion: 'Measure competency development and workforce readiness change after completing the 8-week AACP.',
  followup: 'Measure how your competencies are transferring into the workplace after employer exposure.',
};

// ── Step pill ─────────────────────────────────────────────────────────────────

function StatusPill({ status, availableFrom }: { status: StageStatus['status']; availableFrom?: string }) {
  if (status === 'complete') {
    return (
      <span style={{
        background: '#14532d', color: C.green, border: '1px solid #166534',
        borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      }}>
        Completed
      </span>
    );
  }
  if (status === 'available') {
    return (
      <span style={{
        background: C.crimsonD, color: '#fca5a5', border: `1px solid ${C.crimson}`,
        borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      }}>
        Available Now
      </span>
    );
  }
  return (
    <span style={{
      background: '#1e1e2e', color: C.slate, border: '1px solid #2d2d44',
      borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>
      {availableFrom ? `Available ${fmt(availableFrom)}` : 'Locked'}
    </span>
  );
}

// ── Completed assessment card ─────────────────────────────────────────────────

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

// ── Assessment step (expandable) ──────────────────────────────────────────────

function AssessmentStep({
  stepNumber, stage, stageStatus, assessment, participantName, active, onActivate, onComplete,
}: {
  stepNumber: string;
  stage: AssessmentStage;
  stageStatus: StageStatus;
  assessment?: Assessment;
  participantName: string;
  active: boolean;
  onActivate: () => void;
  onComplete: () => void;
}) {
  const isDone = stageStatus.status === 'complete';
  const isAvail = stageStatus.status === 'available';

  return (
    <div style={{ display: 'flex', gap: 0, position: 'relative' }}>
      {/* Step dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 18 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: isDone ? C.crimson : isAvail ? C.bgCard : '#0e0e1a',
          border: `2px solid ${isDone ? C.crimson : isAvail ? C.border : '#2d2d44'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: isDone ? '#fff' : isAvail ? C.grey : C.slate,
          boxShadow: isDone ? `0 0 14px ${C.crimson}44` : 'none',
          zIndex: 1,
        }}>
          {isDone ? '✓' : stepNumber}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <StatusPill status={stageStatus.status} availableFrom={stageStatus.availableFrom} />
        </div>
        <div style={{ color: isDone ? C.white : isAvail ? C.greyLight : C.slate, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          {STAGE_TITLES[stage]}
        </div>
        <div style={{ color: C.grey, fontSize: 13, lineHeight: 1.6, marginBottom: isAvail && !active ? 14 : 0 }}>
          {STAGE_PURPOSES[stage]}
        </div>

        {/* Locked reason */}
        {stageStatus.status === 'locked' && stageStatus.reason && (
          <div style={{ color: C.slate, fontSize: 12, marginTop: 6, fontStyle: 'italic' }}>
            {stageStatus.reason}
          </div>
        )}

        {/* Completed: show card */}
        {isDone && assessment && (
          <CompletedAssessmentCard
            stage={stage}
            assessment={assessment}
            participantName={participantName}
          />
        )}

        {/* Available: begin button or inline assessment */}
        {isAvail && !active && (
          <button
            onClick={onActivate}
            style={{
              background: C.crimson, color: '#fff', border: 'none',
              borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', display: 'inline-block',
            }}
          >
            Begin {STAGE_TITLES[stage]}
          </button>
        )}

        {isAvail && active && (
          <div style={{ marginTop: 20, borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
            <ACIA stage={stage} onComplete={onComplete} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Program step (non-assessment) ─────────────────────────────────────────────

function ProgramStep({ stepNumber, enrolled, completed, completedAt, weeklyProgress }: {
  stepNumber: string;
  enrolled: boolean;
  completed: boolean;
  completedAt: string | null;
  weeklyProgress?: number;
}) {
  const dotColor = completed ? C.crimson : enrolled ? C.border : '#0e0e1a';
  const dotBorder = completed ? C.crimson : enrolled ? C.border : '#2d2d44';
  const dotTextColor = completed ? '#fff' : enrolled ? C.grey : C.slate;

  return (
    <div style={{ display: 'flex', gap: 0, position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 18 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: dotColor, border: `2px solid ${dotBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: dotTextColor,
          boxShadow: completed ? `0 0 14px ${C.crimson}44` : 'none', zIndex: 1,
        }}>
          {completed ? '✓' : stepNumber}
        </div>
      </div>
      <div style={{ flex: 1, paddingBottom: 28 }}>
        <div style={{ marginBottom: 6 }}>
          {completed ? (
            <span style={{ background: '#14532d', color: C.green, border: '1px solid #166534', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
              Completed
            </span>
          ) : enrolled ? (
            <span style={{ background: '#1c1a06', color: C.amber, border: '1px solid #92400e', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
              In Progress
            </span>
          ) : (
            <span style={{ background: '#1e1e2e', color: C.slate, border: '1px solid #2d2d44', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
              Pending Enrollment
            </span>
          )}
        </div>
        <div style={{ color: completed ? C.white : enrolled ? C.greyLight : C.slate, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          8-Week AACP Program
        </div>
        <div style={{ color: C.grey, fontSize: 13, lineHeight: 1.6 }}>
          Build and validate your aviation competencies with a coach across eight structured weeks.
        </div>
        {enrolled && !completed && typeof weeklyProgress === 'number' && (
          <div style={{ color: C.amber, fontSize: 12, marginTop: 6 }}>
            Week {weeklyProgress} of 8 in progress
          </div>
        )}
        {completed && completedAt && (
          <div style={{ color: C.grey, fontSize: 13, marginTop: 8 }}>
            Completed {fmt(completedAt)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Employer step ─────────────────────────────────────────────────────────────

function EmployerStep({ stepNumber, programCompleted }: { stepNumber: string; programCompleted: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 0, position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 18 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: '#0e0e1a', border: '2px solid #2d2d44',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: programCompleted ? C.grey : C.slate, zIndex: 1,
        }}>
          {stepNumber}
        </div>
      </div>
      <div style={{ flex: 1, paddingBottom: 28 }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{ background: '#1e1e2e', color: C.slate, border: '1px solid #2d2d44', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
            {programCompleted ? 'Ongoing' : 'Upcoming'}
          </span>
        </div>
        <div style={{ color: programCompleted ? C.greyLight : C.slate, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          Employer & Workplace Experience
        </div>
        <div style={{ color: C.grey, fontSize: 13, lineHeight: 1.6 }}>
          Employment, placements, work-integrated learning, or mentorship with AACP employer partners. This 90-day period allows your competencies to be applied in real workplace situations.
        </div>
      </div>
    </div>
  );
}

// ── Main journey ──────────────────────────────────────────────────────────────

function AACPJourney() {
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [weeklyProgress, setWeeklyProgress] = useState<number | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [activeStage, setActiveStage] = useState<AssessmentStage | null>(null);

  const participantName = localStorage.getItem('aacp_name') ?? 'Participant';

  const loadData = useCallback(async () => {
    try {
      const [eligRes, assRes, progRes] = await Promise.all([
        request<Eligibility>('/acia/eligibility').catch(() => null),
        request<{ assessments: Assessment[] }>('/acia/assessments').catch(() => ({ assessments: [] })),
        request<{ enrollment: { weeklyProgress?: number } | null }>('/program/status').catch(() => ({ enrollment: null })),
      ]);
      if (eligRes) setEligibility(eligRes);
      setAssessments(assRes.assessments ?? []);
      if (progRes.enrollment?.weeklyProgress !== undefined) setWeeklyProgress(progRes.enrollment.weeklyProgress);
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

  const stages: { key: AssessmentStage; stepNumber: string }[] = [
    { key: 'baseline', stepNumber: '01' },
    { key: 'completion', stepNumber: '03' },
    { key: 'followup', stepNumber: '05' },
  ];

  const lineStyle = (done: boolean) => ({
    position: 'absolute' as const, left: 22, top: 44, width: 2, height: 'calc(100% - 20px)',
    background: done ? C.crimson : C.borderLight, zIndex: 0,
  });

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', marginBottom: 24, fontWeight: 700, fontSize: 'clamp(1.3rem, 2.5vw, 1.7rem)' }}>Your AACP Journey</h2>

      <div style={{ position: 'relative' }}>
        {/* Step 1: Baseline ACIA */}
        <div style={{ position: 'relative' }}>
          <div style={lineStyle(eligibility?.stages.baseline.status === 'complete')} />
          <AssessmentStep
            stepNumber="01"
            stage="baseline"
            stageStatus={eligibility?.stages.baseline ?? { status: 'available' }}
            assessment={byStage.baseline}
            participantName={participantName}
            active={activeStage === 'baseline'}
            onActivate={() => setActiveStage('baseline')}
            onComplete={handleStageComplete}
          />
        </div>

        {/* Step 2: 8-Week Program */}
        <div style={{ position: 'relative' }}>
          <div style={lineStyle(eligibility?.program.completed ?? false)} />
          <ProgramStep
            stepNumber="02"
            enrolled={eligibility?.program.enrolled ?? false}
            completed={eligibility?.program.completed ?? false}
            completedAt={eligibility?.program.completedAt ?? null}
            weeklyProgress={weeklyProgress}
          />
        </div>

        {/* Step 3: Completion ACIA */}
        <div style={{ position: 'relative' }}>
          <div style={lineStyle(eligibility?.stages.completion.status === 'complete')} />
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
        </div>

        {/* Step 4: Employer Experience */}
        <div style={{ position: 'relative' }}>
          <div style={lineStyle(false)} />
          <EmployerStep
            stepNumber="04"
            programCompleted={eligibility?.program.completed ?? false}
          />
        </div>

        {/* Step 5: 90-Day Follow-Up ACIA */}
        <AssessmentStep
          stepNumber="05"
          stage="followup"
          stageStatus={eligibility?.stages.followup ?? { status: 'locked', reason: 'Complete the AACP Completion ACIA first' }}
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

// ── Email verification banner ─────────────────────────────────────────────────

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
      background: '#1a1400', border: '1px solid #d97706', borderRadius: 10,
      padding: '14px 18px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <div>
          <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>Email address not verified</div>
          <div style={{ color: '#9ca3a8', fontSize: 12, marginTop: 2 }}>
            Verify your email to ensure you receive AACP notifications and assessment updates.
          </div>
        </div>
      </div>
      {msg && <p style={{ color: '#fbbf24', fontSize: 12, margin: 0 }}>{msg}</p>}
      {!showInput ? (
        <button
          onClick={sendCode}
          disabled={sending}
          style={{
            alignSelf: 'flex-start', background: '#d97706', color: '#000', border: 'none',
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
              background: '#0f0a0b', color: '#f1f5f9', border: '1px solid #3d1020',
              borderRadius: 7, padding: '8px 12px', fontSize: 13, width: 120,
            }}
          />
          <button
            type="submit"
            disabled={verifying}
            style={{
              background: '#22c55e', color: '#000', border: 'none',
              borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {verifying ? 'Verifying…' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={sendCode}
            disabled={sending}
            style={{ background: 'none', border: 'none', color: '#9ca3a8', fontSize: 11, cursor: 'pointer' }}
          >
            Resend
          </button>
        </form>
      )}
    </div>
  );
}

// ── Dashboard root ────────────────────────────────────────────────────────────

export function YouthDashboard() {
  const { data, loading, error } = useYouthDashboard();

  const careerStage = localStorage.getItem('aacp_career_stage');
  const isTransitionPath = careerStage === 'student' || careerStage === 'transition';
  const emailVerified = localStorage.getItem('aacp_email_verified') === '1';

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
        <p role="alert" style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>
          {error}
        </p>
      )}

      {isTransitionPath ? (
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
    </DashboardLayout>
  );
}
