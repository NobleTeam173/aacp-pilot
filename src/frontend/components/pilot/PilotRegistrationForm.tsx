import { useState, useEffect } from 'react';
import { request } from '../../services/apiClient';
import {
  getNextQuestion,
  computeRouting,
  PROGRAM_LABELS,
  SPECIALIZATION_LABELS,
  type CareerStage,
  type AviationBackground,
  type OccupationalInterest,
  type RpasObjective,
  type RoutingAnswers,
  type RoutingResult,
} from '../routing/routingEngine';

const C = {
  bg: '#0f172a',
  bgCard: '#1e293b',
  bgInput: '#0f172a',
  border: '#334155',
  borderFocus: '#8b1a2d',
  crimson: '#8F0909',
  crimsonD: '#721010',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyD: '#8a9ab0',
  green: '#22c55e',
  greenBg: 'rgba(34,197,94,0.1)',
  greenBorder: '#16a34a',
  redBg: 'rgba(239,68,68,0.1)',
  redBorder: '#ef4444',
  blueBg: 'rgba(59,130,246,0.1)',
  blueBorder: '#3b82f6',
  blueText: '#93c5fd',
};

interface InviteInfo {
  email: string;
  firstName: string;
  lastName: string;
  organization: string | null;
  pilotRole: string;
  cohortName: string | null;
  hubType: string | null;
  expiresAt: string;
}

interface Props {
  token: string;
  onComplete: (auth: { accessToken: string; refreshToken: string; userId: string; name: string; role: string; hubType?: string | null }) => void;
}

const ROLE_LABELS: Record<string, string> = {
  youth: 'Participant',
  employer: 'Employer Partner',
  postsecondary: 'Post-Secondary Partner',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  youth: 'Explore career pathways, complete assessments, and connect with industry opportunities.',
  employer: 'Share workforce intelligence, review competency data, and connect with emerging talent.',
  postsecondary: 'Map curriculum to industry needs, view competency gaps, and align programming.',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'Strong match',
  medium: 'Good fit',
  low: 'Advisor review',
};

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', color: C.grey, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', background: C.bgInput, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '11px 14px', color: value ? C.white : C.grey, fontSize: 14,
          outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit',
        }}
      >
        <option value="" disabled>Select an option…</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function PilotRegistrationForm({ token, onComplete }: Props) {
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Routing state
  const [careerStage, setCareerStage] = useState<CareerStage>('student');
  const [aviationBackground, setAviationBackground] = useState<AviationBackground | ''>('');
  const [occupationalInterest, setOccupationalInterest] = useState<OccupationalInterest | ''>('');
  const [rpasObjective, setRpasObjective] = useState<RpasObjective | ''>('');
  const [routingResult, setRoutingResult] = useState<RoutingResult | null>(null);

  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<InviteInfo>(`/cohort/invite/${token}`)
      .then((data) => setInviteInfo(data))
      .catch((e: Error) => setLoadError(e.message || 'Invitation not found or has expired.'));
  }, [token]);

  // Recompute routing whenever answers change
  useEffect(() => {
    if (!inviteInfo || inviteInfo.pilotRole !== 'youth') return;

    const partialAnswers: Partial<RoutingAnswers> = { careerStage };
    if (aviationBackground) partialAnswers.aviationBackground = aviationBackground as AviationBackground;
    if (occupationalInterest) partialAnswers.occupationalInterest = occupationalInterest as OccupationalInterest;
    if (rpasObjective) partialAnswers.rpasObjective = rpasObjective as RpasObjective;

    const nextQ = getNextQuestion(partialAnswers);
    if (nextQ === null && occupationalInterest) {
      // All questions answered — compute result
      const result = computeRouting(partialAnswers as RoutingAnswers);
      setRoutingResult(result);
    } else {
      setRoutingResult(null);
    }
  }, [careerStage, aviationBackground, occupationalInterest, rpasObjective, inviteInfo]);

  const buildRoutingAnswers = (): RoutingAnswers | undefined => {
    if (!inviteInfo || inviteInfo.pilotRole !== 'youth') return undefined;
    const answers: RoutingAnswers = { careerStage };
    if (aviationBackground) answers.aviationBackground = aviationBackground as AviationBackground;
    if (occupationalInterest) answers.occupationalInterest = occupationalInterest as OccupationalInterest;
    if (rpasObjective) answers.rpasObjective = rpasObjective as RpasObjective;
    return answers;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!agreed) { setError('Please accept the pilot program terms to continue'); return; }
    setError(null);
    setSubmitting(true);
    try {
      const routingAnswers = buildRoutingAnswers();
      const data = await request<{
        accessToken: string; refreshToken: string; userId: string; name: string; role: string; hubType?: string | null;
      }>(`/cohort/invite/${token}`, {
        method: 'POST',
        body: {
          password,
          email: inviteInfo!.email,
          careerStage: inviteInfo!.pilotRole === 'youth' ? careerStage : undefined,
          routingAnswers: routingAnswers ?? undefined,
        },
      });
      onComplete({ accessToken: data.accessToken, refreshToken: data.refreshToken, userId: data.userId, name: data.name, role: data.role, hubType: data.hubType ?? null });
    } catch (e: unknown) {
      setError((e as Error).message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ maxWidth: 480, width: '100%' }}>
          <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>✈</div>
            <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Invitation Unavailable</div>
            <div style={{ color: C.greyD, fontSize: 14 }}>{loadError}</div>
            <div style={{ color: C.grey, fontSize: 13, marginTop: 16 }}>
              If you believe this is an error, contact your AACP administrator.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!inviteInfo) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ color: C.grey, fontSize: 14 }}>Validating invitation…</div>
      </div>
    );
  }

  const roleLabel = ROLE_LABELS[inviteInfo.pilotRole] ?? inviteInfo.pilotRole;
  const roleDesc = ROLE_DESCRIPTIONS[inviteInfo.pilotRole] ?? '';
  const expiry = new Date(inviteInfo.expiresAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  // Determine which follow-up questions to show
  const isYouth = inviteInfo.pilotRole === 'youth';
  const partialAnswers: Partial<RoutingAnswers> = isYouth ? { careerStage } : {};
  if (aviationBackground) partialAnswers.aviationBackground = aviationBackground as AviationBackground;
  if (occupationalInterest) partialAnswers.occupationalInterest = occupationalInterest as OccupationalInterest;
  if (rpasObjective) partialAnswers.rpasObjective = rpasObjective as RpasObjective;

  const nextQuestion = isYouth ? getNextQuestion(partialAnswers) : null;
  const showAviationBg = isYouth && (aviationBackground !== '' || nextQuestion === 'aviationBackground');
  const showOccupationalInterest = isYouth && (occupationalInterest !== '' || (aviationBackground !== '' && (nextQuestion === 'occupationalInterest' || nextQuestion === null)));
  const showRpasObjective = isYouth && occupationalInterest === 'rpas_drones' && (rpasObjective !== '' || nextQuestion === 'rpasObjective' || nextQuestion === null);

  const aviationProfessionalStages: CareerStage[] = ['aviation_professional', 'intl_aviation_professional'];
  const hideAviationBgQuestion = isYouth && aviationProfessionalStages.includes(careerStage);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-block', background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, borderRadius: 16, padding: '14px 20px', marginBottom: 20 }}>
            <span style={{ color: C.white, fontWeight: 800, fontSize: 20, letterSpacing: 1 }}>AACP™</span>
          </div>
          <div style={{ color: C.grey, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            {inviteInfo.hubType === 'rpas' ? 'RPAS Workforce Hub' : 'Early Access Program'}
          </div>
          <h1 style={{ color: C.white, fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
            {inviteInfo.hubType === 'rpas' ? 'Welcome to the RPAS Workforce Hub' : "You're Invited"}
          </h1>
          <p style={{ color: C.greyD, fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>
            {inviteInfo.hubType === 'rpas'
              ? 'Create your account to begin your RPAS career intelligence intake.'
              : 'Experience the Aviation & Aerospace Competency Platform'}
          </p>
        </div>

        {/* Invite summary card */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ background: `${C.crimson}22`, border: `1px solid ${C.crimson}55`, borderRadius: 12, padding: '10px 14px', flexShrink: 0 }}>
              <span style={{ color: C.crimson, fontWeight: 800, fontSize: 13 }}>{roleLabel}</span>
            </div>
            {inviteInfo.cohortName && (
              <div style={{ color: C.grey, fontSize: 12 }}>
                Cohort: <span style={{ color: C.greyD }}>{inviteInfo.cohortName}</span>
              </div>
            )}
          </div>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
            {inviteInfo.firstName} {inviteInfo.lastName}
          </div>
          <div style={{ color: C.grey, fontSize: 13, marginBottom: inviteInfo.organization ? 4 : 0 }}>{inviteInfo.email}</div>
          {inviteInfo.organization && <div style={{ color: C.greyD, fontSize: 13 }}>{inviteInfo.organization}</div>}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ color: C.greyD, fontSize: 13, lineHeight: 1.5 }}>{roleDesc}</div>
          </div>
          <div style={{ marginTop: 10, color: C.grey, fontSize: 12 }}>
            Invitation expires: <span style={{ color: C.greyD }}>{expiry}</span>
          </div>
        </div>

        {/* Registration form */}
        <form onSubmit={handleSubmit}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px', marginBottom: 16 }}>
            {isYouth && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
                  Your Background
                </div>

                {/* Career Stage */}
                <SelectField
                  label="What brings you to AACP?"
                  value={careerStage}
                  onChange={v => {
                    setCareerStage(v as CareerStage);
                    setAviationBackground('');
                    setOccupationalInterest('');
                    setRpasObjective('');
                  }}
                  options={[
                    { value: 'exploring', label: 'Exploring my first aviation career' },
                    { value: 'student', label: 'Student / Recent Graduate' },
                    { value: 'stem', label: 'STEM Graduate entering aviation/aerospace' },
                    { value: 'transition', label: 'Transitioning from another industry' },
                    { value: 'aviation_professional', label: 'Current Aviation Professional' },
                    { value: 'intl_aviation_professional', label: 'Internationally Trained Aviation Professional' },
                  ]}
                />

                {/* Aviation background — not shown for aviation professionals */}
                {showAviationBg && !hideAviationBgQuestion && (
                  <SelectField
                    label="Do you have aviation education, training, or professional experience?"
                    value={aviationBackground}
                    onChange={v => {
                      setAviationBackground(v as AviationBackground);
                      setOccupationalInterest('');
                      setRpasObjective('');
                    }}
                    options={[
                      { value: 'yes', label: 'Yes' },
                      { value: 'in_progress', label: 'In progress / currently studying' },
                      { value: 'no', label: 'No' },
                    ]}
                  />
                )}

                {/* Occupational interest */}
                {showOccupationalInterest && (
                  <SelectField
                    label="Which aviation area interests you most?"
                    value={occupationalInterest}
                    onChange={v => {
                      setOccupationalInterest(v as OccupationalInterest);
                      setRpasObjective('');
                    }}
                    options={[
                      { value: 'engine_maintenance', label: 'Aircraft Engine Maintenance & Gas Turbine Technology' },
                      { value: 'ame_airframe', label: 'Aircraft Maintenance Engineering (AME)' },
                      { value: 'pilot_flight_ops', label: 'Pilot / Flight Operations' },
                      { value: 'rpas_drones', label: 'RPAS / Drones & Autonomous Systems' },
                      { value: 'atc', label: 'Air Traffic Control' },
                      { value: 'not_sure', label: "I'm not sure yet" },
                    ]}
                  />
                )}

                {/* RPAS objective — only when RPAS interest selected */}
                {showRpasObjective && (
                  <SelectField
                    label="What is your primary RPAS goal?"
                    value={rpasObjective}
                    onChange={v => setRpasObjective(v as RpasObjective)}
                    options={[
                      { value: 'exploring', label: 'Exploring RPAS career opportunities' },
                      { value: 'transition', label: 'Transitioning into RPAS as a career' },
                    ]}
                  />
                )}
              </div>
            )}

            <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>
              Set Your Password
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', color: C.grey, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                style={{
                  width: '100%', background: C.bgInput, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '11px 14px', color: C.white, fontSize: 14,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: C.grey, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter password"
                style={{
                  width: '100%', background: C.bgInput, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '11px 14px', color: C.white, fontSize: 14,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                style={{ marginTop: 2, accentColor: C.crimson }}
              />
              <span style={{ color: C.grey, fontSize: 13, lineHeight: 1.5 }}>
                I understand this is an early access pilot program. My feedback will help shape the final product.
                Data collected during the pilot is for evaluation purposes only.
              </span>
            </label>
          </div>

          {/* Routing recommendation preview */}
          {isYouth && routingResult && (
            <div style={{
              background: C.blueBg,
              border: `1px solid ${C.blueBorder}`,
              borderRadius: 16,
              padding: '16px 20px',
              marginBottom: 16,
            }}>
              <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                Recommended Pathway
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const, marginBottom: 10 }}>
                <div>
                  <div style={{ color: C.white, fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                    {PROGRAM_LABELS[routingResult.recommendedProgram]}
                  </div>
                  {routingResult.recommendedSpecialization && (
                    <div style={{ color: C.blueText, fontSize: 13 }}>
                      {SPECIALIZATION_LABELS[routingResult.recommendedSpecialization]}
                    </div>
                  )}
                </div>
                <div style={{
                  background: routingResult.confidence === 'high' ? C.greenBg : C.blueBg,
                  border: `1px solid ${routingResult.confidence === 'high' ? C.greenBorder : C.blueBorder}`,
                  borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700,
                  color: routingResult.confidence === 'high' ? C.green : C.blueText,
                  whiteSpace: 'nowrap' as const, flexShrink: 0,
                }}>
                  {CONFIDENCE_LABELS[routingResult.confidence]}
                </div>
              </div>
              <div style={{ color: C.greyD, fontSize: 12, lineHeight: 1.6 }}>
                {routingResult.rationale}
              </div>
              <div style={{ color: C.grey, fontSize: 11, marginTop: 10 }}>
                This recommendation is advisory. An AACP advisor will confirm your pathway after registration.
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', background: submitting ? C.crimsonD : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
              color: C.white, border: 'none', borderRadius: 12,
              padding: '14px', fontWeight: 700, fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s', opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Creating your account…' : 'Join the Pilot Program →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', color: C.grey, fontSize: 12, marginTop: 20 }}>
          Already have an account?{' '}
          <button
            onClick={() => window.location.href = '/'}
            style={{ background: 'none', border: 'none', color: C.crimson, cursor: 'pointer', fontSize: 12, padding: 0 }}
          >
            Sign in here
          </button>
        </div>
      </div>
    </div>
  );
}
