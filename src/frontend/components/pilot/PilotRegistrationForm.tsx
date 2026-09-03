import { useState, useEffect } from 'react';
import { request } from '../../services/apiClient';

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
};

interface InviteInfo {
  email: string;
  firstName: string;
  lastName: string;
  organization: string | null;
  pilotRole: string;
  cohortName: string | null;
  expiresAt: string;
}

interface Props {
  token: string;
  onComplete: (auth: { accessToken: string; refreshToken: string; userId: string; name: string; role: string }) => void;
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

export function PilotRegistrationForm({ token, onComplete }: Props) {
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [careerStage, setCareerStage] = useState('student');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<InviteInfo>(`/pilot/invite/${token}`)
      .then((data) => setInviteInfo(data))
      .catch((e: Error) => setLoadError(e.message || 'Invitation not found or has expired.'));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!agreed) { setError('Please accept the pilot program terms to continue'); return; }
    setError(null);
    setSubmitting(true);
    try {
      const data = await request<{
        accessToken: string; refreshToken: string; userId: string; name: string; role: string;
      }>(`/pilot/invite/${token}`, { method: 'POST', body: { password, email: inviteInfo!.email, careerStage: inviteInfo!.pilotRole === 'youth' ? careerStage : undefined } });
      onComplete({ accessToken: data.accessToken, refreshToken: data.refreshToken, userId: data.userId, name: data.name, role: data.role });
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

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-block', background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, borderRadius: 16, padding: '14px 20px', marginBottom: 20 }}>
            <span style={{ color: C.white, fontWeight: 800, fontSize: 20, letterSpacing: 1 }}>AACP™</span>
          </div>
          <div style={{ color: C.grey, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Early Access Program</div>
          <h1 style={{ color: C.white, fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
            You're Invited
          </h1>
          <p style={{ color: C.greyD, fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>
            Experience the Aviation &amp; Aerospace Competency Platform
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
            {inviteInfo.pilotRole === 'youth' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
                  Your Background
                </div>
                <label style={{ display: 'block', color: C.grey, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  What brings you to AACP?
                </label>
                <select
                  value={careerStage}
                  onChange={e => setCareerStage(e.target.value)}
                  style={{
                    width: '100%', background: C.bgInput, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: '11px 14px', color: C.white, fontSize: 14,
                    outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit',
                  }}
                >
                  <option value="exploring">Exploring my first aviation career</option>
                  <option value="student">Student / Recent Graduate</option>
                  <option value="stem">STEM Graduate entering aviation/aerospace</option>
                  <option value="transition">Transitioning from another industry</option>
                  <option value="aviation_professional">Current Aviation Professional</option>
                  <option value="intl_aviation_professional">Internationally Trained Aviation Professional</option>
                </select>
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
