import { useState, useEffect } from 'react';
import { DashboardLayout } from './DashboardLayout';
import { ActionListCard } from './ActionListCard';
import { useYouthDashboard } from '../../hooks/useYouthDashboard';
import { CompetencyAssessment } from './CompetencyAssessment';
import { request } from '../../services/apiClient';

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  green: '#22c55e',
  amber: '#f59e0b',
};

interface ProgramEnrollment {
  enrolledAt: string;
  completedAt: string | null;
  cohort: string;
  weeklyProgress: number;
  validatedCompetencies: string[];
}

interface ACIAResult {
  topPathway: string;
  completedAt: string;
}

const PATHWAY_ICONS: Record<string, string> = {
  pilot: '✈️', ame: '🔧', amt: '⚙️', atc: '📡', aerospace: '🚀',
};

const PATHWAY_LABELS: Record<string, string> = {
  pilot: 'Pilot', ame: 'AME', amt: 'Aircraft Maint. Tech', atc: 'Air Traffic Control', aerospace: 'Aerospace & STEM',
};

function ProgramJourney() {
  const [aciaResult, setAciaResult] = useState<ACIAResult | null>(null);
  const [enrollment, setEnrollment] = useState<ProgramEnrollment | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      request<{ result: ACIAResult | null }>('/acia/result').catch(() => ({ result: null })),
      request<{ enrollment: ProgramEnrollment | null }>('/program/status').catch(() => ({ enrollment: null })),
    ]).then(([aciaRes, progRes]) => {
      setAciaResult(aciaRes.result);
      setEnrollment(progRes.enrollment);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;

  const steps = [
    {
      id: 'acia',
      icon: '🎯',
      title: 'Aviation Career Intelligence Assessment',
      description: 'Discover your innate strengths through 9 interactive missions.',
      done: !!aciaResult,
      detail: aciaResult
        ? `Completed · Primary pathway: ${PATHWAY_ICONS[aciaResult.topPathway] ?? ''} ${PATHWAY_LABELS[aciaResult.topPathway] ?? aciaResult.topPathway}`
        : 'Not yet started — begin below',
    },
    {
      id: 'program',
      icon: '📋',
      title: 'AACP 8-Week Program',
      description: 'Build and validate your aviation competencies with a coach.',
      done: !!enrollment?.completedAt,
      detail: !enrollment
        ? 'Pending ACIA completion and coach enrolment'
        : enrollment.completedAt
          ? `Completed · ${enrollment.validatedCompetencies.length} competencies validated`
          : `In progress · Week ${enrollment.weeklyProgress} of 8`,
    },
    {
      id: 'employer',
      icon: '🤝',
      title: 'Employer Visibility',
      description: 'Your profile becomes visible to aviation employer partners.',
      done: !!enrollment?.completedAt,
      detail: enrollment?.completedAt
        ? 'Your profile is visible to partner employers'
        : 'Available after completing the 8-week program',
    },
  ];

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', marginBottom: 16 }}>Your AACP Journey</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {steps.map((step, i) => (
          <div key={step.id} style={{ display: 'flex', gap: 0, position: 'relative' }}>
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div style={{
                position: 'absolute', left: 20, top: 48, width: 2, height: 'calc(100% - 24px)',
                background: step.done ? C.crimson : C.border, zIndex: 0,
              }} />
            )}
            {/* Step dot */}
            <div style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              background: step.done ? C.crimson : C.bgCard,
              border: `2px solid ${step.done ? C.crimson : C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, marginRight: 16, marginBottom: 20, zIndex: 1,
              boxShadow: step.done ? `0 0 12px ${C.crimson}44` : 'none',
              transition: 'all 0.3s',
            }}>
              {step.done ? '✓' : step.icon}
            </div>
            {/* Content */}
            <div style={{
              flex: 1, paddingBottom: 20,
              background: 'transparent',
            }}>
              <div style={{ color: step.done ? C.white : C.grey, fontSize: 14, fontWeight: 600 }}>{step.title}</div>
              <div style={{ color: C.grey, fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>{step.description}</div>
              <div style={{
                color: step.done ? C.green : C.grey,
                fontSize: 12, marginTop: 4, fontStyle: step.done ? 'normal' : 'italic',
              }}>
                {step.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function YouthDashboard() {
  const { data, loading, error } = useYouthDashboard();

  if (loading) {
    return (
      <DashboardLayout title="Youth Dashboard">
        <p>Loading youth dashboard...</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Youth Dashboard">
      {error && (
        <p role="alert" style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>
          {error}
        </p>
      )}

      <ProgramJourney />

      <section>
        <h2 style={{ color: C.white, fontFamily: 'Fraunces, serif', marginBottom: 16 }}>
          Aviation Career Intelligence Assessment (ACIA)
        </h2>
        <CompetencyAssessment />
      </section>

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
