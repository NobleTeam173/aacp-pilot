import { useState, useEffect } from 'react';
import { request, ApiError } from '../../services/apiClient';
import { ACIA } from '../acia/ACIA';
import { RpasIntakeForm } from './RpasIntakeForm';
import { RpasCareerProfile } from './RpasCareerProfile';
import { HUB_STEPS, currentStepIndex } from './rpasEngine';
import type { RpasProfile, RpasHubStatus } from './rpasEngine';

const C = {
  bg:       '#0f172a',
  bgCard:   '#1e293b',
  border:   '#334155',
  white:    '#f1f5f9',
  grey:     '#94a3b8',
  greyD:    '#8a9ab0',
  crimson:  '#8f0909',
  crimsonD: '#721010',
  green:    '#22c55e',
  greenBg:  'rgba(34,197,94,0.08)',
  amber:    '#fbbf24',
  amberBg:  'rgba(251,191,36,0.08)',
};

export function RpasHubDashboard({ isAdmin = false }: { isAdmin?: boolean }) {
  const [profile, setProfile] = useState<RpasProfile | null>(null);
  const [status, setStatus] = useState<RpasHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      const [p, s] = await Promise.all([
        request<RpasProfile>('/rpas/profile').catch((e: unknown) => {
          // 404 means the profile row hasn't been created yet — not an error
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }),
        request<RpasHubStatus>('/rpas/status'),
      ]);
      setProfile(p);
      setStatus(s);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load your RPAS Hub profile.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleEnroll() {
    setEnrolling(true);
    try {
      await request('/rpas/enroll', { method: 'POST', body: {} });
      await loadData();
    } catch (e: unknown) {
      setError((e as Error).message || 'Enrolment failed. Please try again.');
    } finally {
      setEnrolling(false);
    }
  }

  const hubStatus = status?.hubStatus ?? profile?.hubStatus ?? 'intake';
  const stepIdx = currentStepIndex(hubStatus);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ color: C.grey, fontSize: 14 }}>Loading RPAS Hub…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'DM Sans, sans-serif', padding: '32px 16px 64px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'inline-block', background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, borderRadius: 12, padding: '10px 16px', marginBottom: 16 }}>
            <span style={{ color: C.white, fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>AACP™</span>
          </div>
          <h1 style={{ color: C.white, fontSize: 'clamp(1.4rem, 3vw, 1.8rem)', fontWeight: 800, margin: '0 0 6px', lineHeight: 1.2 }}>
            RPAS Workforce Hub
          </h1>
          <p style={{ color: C.greyD, fontSize: 14, margin: 0 }}>
            Applied RPAS Workforce Intelligence
          </p>
        </div>

        {/* Journey progress */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 24 }}>
          <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14 }}>
            Your Journey
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {HUB_STEPS.map((step, i) => {
              const done    = i < stepIdx;
              const current = i === stepIdx;
              const future  = i > stepIdx;
              return (
                <div key={step.key} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  opacity: future ? 0.45 : 1,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: done ? C.green : current ? C.crimson : 'transparent',
                    border: `2px solid ${done ? C.green : current ? C.crimson : C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: C.white, fontWeight: 700,
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <div>
                    <div style={{ color: current ? C.white : done ? C.greyD : C.grey, fontSize: 13, fontWeight: current ? 700 : 400 }}>
                      {step.label}
                    </div>
                    {current && (
                      <div style={{ color: C.grey, fontSize: 12, marginTop: 1 }}>{step.description}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid #ef4444', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>
          </div>
        )}

        {/* Step panels */}

        {/* Intake */}
        {hubStatus === 'intake' && (
          isAdmin ? (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px' }}>
              <div style={{ color: C.amber, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Admin Preview</div>
              <div style={{ color: C.greyD, fontSize: 13, lineHeight: 1.6 }}>
                This is the participant intake stage. An RPAS participant would complete their background profile here to begin the intelligence assessment.
              </div>
              <div style={{ color: C.grey, fontSize: 12, marginTop: 12 }}>
                To manage RPAS applications and issue Hub invitations, go to <strong style={{ color: C.greyD }}>Approvals → Pilot Access → RPAS Workforce Hub</strong>.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ color: C.grey, fontSize: 13, marginBottom: 20 }}>
                Complete your RPAS background profile to begin your intelligence assessment.
              </div>
              <RpasIntakeForm onComplete={loadData} />
            </div>
          )
        )}

        {/* ACIA RPAS intake assessment */}
        {hubStatus === 'assessment' && status?.aciaIntakeStatus?.status !== 'complete' && (
          <div>
            <div style={{ color: C.grey, fontSize: 13, marginBottom: 20 }}>
              Complete your ACIA™ RPAS career intelligence assessment to generate your workforce profile.
            </div>
            <ACIA stage="rpas_intake" pathwayType="rpas" onComplete={loadData} />
          </div>
        )}

        {/* Awaiting profile generation */}
        {hubStatus === 'assessment' && status?.aciaIntakeStatus?.status === 'complete' && (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px', textAlign: 'center' }}>
            <div style={{ color: C.amber, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Processing your career intelligence…</div>
            <div style={{ color: C.greyD, fontSize: 13 }}>
              Your RPAS career intelligence profile is being prepared. Please check back shortly.
            </div>
            <button
              onClick={loadData}
              style={{ marginTop: 16, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 16px', color: C.grey, cursor: 'pointer', fontSize: 13 }}
            >
              Refresh
            </button>
          </div>
        )}

        {/* Career profile ready */}
        {(hubStatus === 'profile_ready' || hubStatus === 'enrolled' || hubStatus === 'complete') && profile && (
          <RpasCareerProfile
            profile={profile}
            onEnroll={hubStatus === 'profile_ready' ? handleEnroll : undefined}
            enrolling={enrolling}
          />
        )}

        {/* Enrolled - program underway */}
        {hubStatus === 'enrolled' && (
          <div style={{ background: C.greenBg, border: `1px solid ${C.green}44`, borderRadius: 16, padding: '20px 24px', marginTop: 16 }}>
            <div style={{ color: C.green, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              Applied RPAS Workforce Program — in progress
            </div>
            <div style={{ color: C.greyD, fontSize: 13, lineHeight: 1.6 }}>
              You are enrolled in the 1-week program. Your AACP advisor will be in touch with your program schedule and payment instructions.
            </div>
          </div>
        )}

        {/* Complete */}
        {hubStatus === 'complete' && (
          <div style={{ background: C.greenBg, border: `1px solid ${C.green}44`, borderRadius: 16, padding: '20px 24px', marginTop: 16 }}>
            <div style={{ color: C.green, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              Program complete — workforce profile ready
            </div>
            <div style={{ color: C.greyD, fontSize: 13, lineHeight: 1.6 }}>
              Your full RPAS workforce profile and next-step pathway are available. Your AACP advisor will be in touch to discuss your results.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
