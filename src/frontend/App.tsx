import { useEffect, useState } from 'react';
import { EmployerDashboard } from './components/dashboard/EmployerDashboard';
import { YouthDashboard } from './components/dashboard/YouthDashboard';
import { CoachDashboard } from './components/dashboard/CoachDashboard';
import { AdminDashboard } from './components/dashboard/AdminDashboard';
import { ConnectorDashboard } from './components/connector/ConnectorDashboard';
import { IndustryIntelligence } from './components/postsecondary/IndustryIntelligence';
import { request, setStoredToken, setStoredRefreshToken, clearStoredTokens, getStoredToken, NetworkError, ServerError, ApiError } from './services/apiClient';
import { PilotRegistrationForm } from './components/pilot/PilotRegistrationForm';
import { ValidatorExperience } from './components/validator/ValidatorExperience';

type Role = 'youth' | 'employer' | 'postsecondary' | 'admin' | 'super_admin' | 'coach';

interface AuthState {
  role: Role;
  userId: string;
}

const CANADIAN_PROVINCES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
  'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia',
  'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec',
  'Saskatchewan', 'Yukon',
];

// ── Registration form ─────────────────────────────────────────────────────────

type RegisterRole = Exclude<Role, 'admin'>;

function RegisterForm({ onBack }: { onBack: () => void }) {
  const [role, setRole] = useState<RegisterRole>('youth');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // Employer fields
  const [orgName, setOrgName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  // Post-secondary fields
  const [institutionName, setInstitutionName] = useState('');
  const [region, setRegion] = useState('');
  const [programArea, setProgramArea] = useState('');
  // Youth-only: career stage
  const [careerStage, setCareerStage] = useState<string>('exploring');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [duplicateType, setDuplicateType] = useState<'email' | 'phone' | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setMsg('Passwords do not match.'); return; }
    setMsg(''); setDuplicateType(null); setLoading(true);
    try {
      await request('/auth/register', {
        method: 'POST',
        body: {
          email, password, name, phone, role,
          ...(role === 'youth' ? { careerStage } : {}),
          ...(role === 'employer' ? { organizationName: orgName, jobTitle } : {}),
          ...(role === 'postsecondary' ? { institutionName, region, programArea } : {}),
        },
      });
      setSubmitted(true);
    } catch (e: unknown) {
      const text = e instanceof Error ? e.message : 'Registration failed. Please try again.';
      if (text.includes('email address is already registered')) {
        setDuplicateType('email');
      } else if (text.includes('phone number is already registered')) {
        setDuplicateType('phone');
      } else {
        setMsg(text);
      }
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center', gap: 16 }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Registration Submitted</h2>
          <p style={{ fontSize: 13, color: '#9ca3a8', lineHeight: 1.7, maxWidth: 340 }}>
            Your account is pending administrator approval. You will be contacted at <strong>{email}</strong> once your access has been granted.
          </p>
          <button onClick={onBack} className="login-submit" style={{ marginTop: 16 }}>Back to Sign In</button>
        </div>
      </div>
    );
  }

  const roleLabel: Record<RegisterRole, string> = {
    youth: 'Participant',
    employer: 'Employer',
    postsecondary: 'Post-Secondary Institution',
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div className="login-brand">
          <span className="brand-mark">AACP™</span>
          <p>Aviation &amp; Aerospace Competence Program</p>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: '#8F0909', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Create Account
        </div>
        <p style={{ fontSize: 12, color: '#9ca3a8', marginBottom: 20, lineHeight: 1.6 }}>
          All accounts require administrator approval before access is granted. You will be notified by email.
        </p>

        {duplicateType && (
          <div style={{
            background: '#1a0d10', border: '1px solid #8F0909', borderRadius: 10,
            padding: '14px 16px', marginBottom: 16,
          }}>
            <p style={{ color: '#fca5a5', fontSize: 13, margin: '0 0 10px', lineHeight: 1.6 }}>
              {duplicateType === 'email'
                ? <>An account is already registered with <strong>{email}</strong>.</>
                : <>An account is already registered with the phone number <strong>{phone}</strong>.</>
              }
              {' '}Please sign in or recover your account.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onBack}
                style={{
                  background: '#8F0909', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 16px', fontSize: 13,
                  fontWeight: 700, cursor: 'pointer',
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setDuplicateType(null)}
                style={{
                  background: 'none', color: '#9ca3a8', border: '1px solid #3d1020',
                  borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                }}
              >
                Try different details
              </button>
            </div>
          </div>
        )}

        {msg && !duplicateType && <p className="login-msg" style={{ color: '#f87171' }}>{msg}</p>}

        <form onSubmit={handleSubmit} className="login-form">
          {/* Role selector */}
          <label>I am registering as
            <select value={role} onChange={e => setRole(e.target.value as RegisterRole)}>
              {(Object.entries(roleLabel) as [RegisterRole, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>

          {/* Youth: career stage */}
          {role === 'youth' && (
            <label>What brings you to AACP?
              <select value={careerStage} onChange={e => setCareerStage(e.target.value)}>
                <option value="exploring">Exploring my first aviation career</option>
                <option value="student">Student / Recent Graduate</option>
                <option value="stem">STEM Graduate entering aviation/aerospace</option>
                <option value="transition">Transitioning from another industry</option>
                <option value="aviation_professional">Current Aviation Professional</option>
                <option value="intl_aviation_professional">Internationally Trained Aviation Professional</option>
              </select>
            </label>
          )}

          {/* Common fields */}
          <label>Full Name
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
          </label>
          <label>Email Address
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label>Phone Number
            <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (___) ___-____" />
          </label>

          {/* Employer-specific */}
          {role === 'employer' && (
            <>
              <label>Organization Name
                <input required value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Company or organization" />
              </label>
              <label>Job Title
                <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Your position" />
              </label>
            </>
          )}

          {/* Post-secondary-specific */}
          {role === 'postsecondary' && (
            <>
              <label>Institution Name
                <input required value={institutionName} onChange={e => setInstitutionName(e.target.value)} placeholder="College or university name" />
              </label>
              <label>Province / Region
                <select required value={region} onChange={e => setRegion(e.target.value)}>
                  <option value="">Select province</option>
                  {CANADIAN_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label>Program Area
                <input value={programArea} onChange={e => setProgramArea(e.target.value)} placeholder="e.g. Aviation Technology, Aerospace Engineering" />
              </label>
            </>
          )}

          <label>Password
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters" minLength={8} />
          </label>
          <label>Confirm Password
            <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" />
          </label>

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Submitting…' : 'Submit Registration'}
          </button>

          <button type="button" onClick={onBack} style={{
            background: 'none', border: 'none', color: '#9ca3a8', fontSize: 13,
            cursor: 'pointer', padding: '4px 0', textAlign: 'center',
          }}>
            Already have an account? Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Coach Invite Accept form ──────────────────────────────────────────────────

function CoachInviteAcceptForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [info, setInfo] = useState<{ name: string; email: string; organizationType: string; organizationName: string | null } | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    request<{ name: string; email: string; organizationType: string; organizationName: string | null }>(`/auth/coach-invite/${token}`)
      .then(d => setInfo(d))
      .catch(e => setLoadErr(e instanceof Error ? e.message : 'Invalid or expired invitation link.'));
  }, [token]);

  const ORG_TYPE_LABELS: Record<string, string> = {
    employer: 'Employer Partner',
    educational_institution: 'Educational Institution',
    industry_association: 'Industry Association',
    aacp_direct: 'AACP',
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setMsg('Passwords do not match.'); return; }
    setLoading(true); setMsg('');
    try {
      await request(`/auth/coach-invite/${token}`, { method: 'POST', body: { password } });
      setDone(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('coach_invite');
      window.history.replaceState({}, '', url.toString());
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Activation failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">AACP™</span>
          <p>Aviation &amp; Aerospace Competence Program</p>
        </div>
        {done ? (
          <>
            <p style={{ fontSize: 13, color: '#a3e6b5', lineHeight: 1.7, margin: '0 0 16px' }}>
              Career coach account activated. You will be prompted to set up multi-factor authentication when you sign in.
            </p>
            <button className="login-submit" onClick={onDone}>Sign In</button>
          </>
        ) : loadErr ? (
          <>
            <p className="login-msg" style={{ color: '#f87171' }}>{loadErr}</p>
            <button className="login-submit" onClick={onDone}>Back to Sign In</button>
          </>
        ) : !info ? (
          <p style={{ fontSize: 13, color: '#9ca3a8' }}>Verifying invitation…</p>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8F0909', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Activate Career Coach Account
            </div>
            <div style={{ background: '#1a0d10', border: '1px solid #3d1020', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
              <p style={{ margin: 0, color: '#9ca3a8' }}>Invited as</p>
              <p style={{ margin: '4px 0 0', color: '#f1f5f9', fontWeight: 600 }}>{info.name}</p>
              <p style={{ margin: '2px 0 0', color: '#9ca3a8' }}>{info.email}</p>
              {info.organizationName && (
                <p style={{ margin: '4px 0 0', color: '#9ca3a8' }}>
                  {ORG_TYPE_LABELS[info.organizationType] ?? info.organizationType} · {info.organizationName}
                </p>
              )}
            </div>
            {msg && <p className="login-msg" style={{ color: '#f87171' }}>{msg}</p>}
            <form onSubmit={handleSubmit} className="login-form">
              <label>Set Password
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} />
              </label>
              <label>Confirm Password
                <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
              </label>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Activating…' : 'Activate Account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── Invite Accept form ────────────────────────────────────────────────────────

interface InviteInfo {
  invitedName: string;
  invitedEmail: string;
  invitedRole: string;
}

function InviteAcceptForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    request<{ invitedName: string; invitedEmail: string; invitedRole: string }>(`/auth/invite/${token}`)
      .then(d => setInfo(d))
      .catch(e => setLoadErr(e instanceof Error ? e.message : 'Invalid or expired invitation link.'));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setMsg('Passwords do not match.'); return; }
    setLoading(true); setMsg('');
    try {
      await request(`/auth/invite/${token}`, { method: 'POST', body: { password } });
      setDone(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Activation failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">AACP™</span>
          <p>Aviation &amp; Aerospace Competence Program</p>
        </div>
        {done ? (
          <>
            <p style={{ fontSize: 13, color: '#a3e6b5', lineHeight: 1.7, margin: '0 0 16px' }}>
              Account activated. You will now be prompted to set up multi-factor authentication when you sign in.
            </p>
            <button className="login-submit" onClick={onDone}>Sign In</button>
          </>
        ) : loadErr ? (
          <>
            <p className="login-msg" style={{ color: '#f87171' }}>{loadErr}</p>
            <button className="login-submit" onClick={onDone}>Back to Sign In</button>
          </>
        ) : !info ? (
          <p style={{ fontSize: 13, color: '#9ca3a8' }}>Verifying invitation…</p>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8F0909', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Activate Administrator Account
            </div>
            <div style={{ background: '#1a0d10', border: '1px solid #3d1020', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
              <p style={{ margin: 0, color: '#9ca3a8' }}>Invited as</p>
              <p style={{ margin: '4px 0 0', color: '#f1f5f9', fontWeight: 600 }}>{info.invitedName}</p>
              <p style={{ margin: '2px 0 0', color: '#9ca3a8' }}>{info.invitedEmail} · {info.invitedRole}</p>
            </div>
            {msg && <p className="login-msg" style={{ color: '#f87171' }}>{msg}</p>}
            <form onSubmit={handleSubmit} className="login-form">
              <label>Set Password
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} />
              </label>
              <label>Confirm Password
                <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
              </label>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Activating…' : 'Activate Account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── Forced password change (first login) ──────────────────────────────────────

function ForcePasswordChangeForm({ userId, email, currentPassword, onDone }: {
  userId: string;
  email: string;
  currentPassword: string;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setMsg('Passwords do not match.'); return; }
    setLoading(true); setMsg('');
    try {
      await request('/auth/first-password-change', {
        method: 'POST',
        body: { userId, email, currentPassword, newPassword: password },
      });
      onDone();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Password change failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">AACP™</span>
          <p>Aviation &amp; Aerospace Competence Program</p>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#8F0909', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Set Your Password
        </div>
        <p style={{ fontSize: 12, color: '#9ca3a8', marginBottom: 16, lineHeight: 1.6 }}>
          You must create a new password before continuing.
        </p>
        {msg && <p className="login-msg" style={{ color: '#f87171' }}>{msg}</p>}
        <form onSubmit={handleSubmit} className="login-form">
          <label>New Password
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} />
          </label>
          <label>Confirm Password
            <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
          </label>
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Saving…' : 'Set Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── MFA setup (first time for admin/super_admin) ──────────────────────────────

function MfaSetupForm({ email, password, otp, onSetupComplete }: {
  email: string;
  password: string;
  otp: string;
  onSetupComplete: () => void;
}) {
  const [secret, setSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [setupMsg, setSetupMsg] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    request<{ secret: string; otpauthUri?: string; message?: string }>('/auth/mfa/setup', {
      method: 'POST',
      body: { email, password },
    })
      .then(d => { setSecret(d.secret); if (d.otpauthUri) setOtpauthUri(d.otpauthUri); })
      .catch(e => setSetupMsg(e instanceof Error ? e.message : 'MFA setup failed.'));
  }, [email, password]);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg('');
    try {
      await request('/auth/mfa/confirm', { method: 'POST', body: { email, password, token: confirmCode } });
      onSetupComplete();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Verification failed. Check your code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">AACP™</span>
          <p>Aviation &amp; Aerospace Competence Program</p>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#8F0909', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Set Up Two-Factor Authentication
        </div>
        <p style={{ fontSize: 12, color: '#9ca3a8', marginBottom: 16, lineHeight: 1.6 }}>
          MFA is required for administrator accounts. Open your authenticator app (Google Authenticator, Authy, etc.) and scan or enter the key below.
        </p>
        {setupMsg && <p className="login-msg" style={{ color: '#f87171' }}>{setupMsg}</p>}
        {secret ? (
          <>
            <div style={{ background: '#1a0d10', border: '1px solid #3d1020', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3a8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>Manual entry key</p>
              <code style={{ fontSize: 13, color: '#f1f5f9', letterSpacing: 2, wordBreak: 'break-all' }}>{secret}</code>
              {otpauthUri && (
                <div style={{ marginTop: 10 }}>
                  <a
                    href={otpauthUri}
                    style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'underline' }}
                  >
                    Tap here to open in Google Authenticator (mobile)
                  </a>
                </div>
              )}
            </div>
            {msg && <p className="login-msg" style={{ color: '#f87171' }}>{msg}</p>}
            <form onSubmit={handleConfirm} className="login-form">
              <label>Verification Code
                <input required value={confirmCode} onChange={e => setConfirmCode(e.target.value)} placeholder="6-digit code from your app" maxLength={6} inputMode="numeric" />
              </label>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Verifying…' : 'Enable MFA'}
              </button>
            </form>
          </>
        ) : !setupMsg ? (
          <p style={{ fontSize: 13, color: '#9ca3a8' }}>Loading setup key…</p>
        ) : null}
      </div>
    </div>
  );
}

// ── Login form ────────────────────────────────────────────────────────────────

// ── Forgot password ───────────────────────────────────────────────────────────

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg('');
    try {
      await request('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">AACP™</span>
          <p>Aviation &amp; Aerospace Competence Program</p>
        </div>
        {sent ? (
          <>
            <p style={{ fontSize: 13, color: '#a3e6b5', lineHeight: 1.7, margin: '0 0 16px' }}>
              If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your inbox.
            </p>
            <button className="login-submit" onClick={onBack}>Back to Sign In</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: '#9ca3a8', lineHeight: 1.6, margin: '0 0 16px' }}>
              Enter your email address and we'll send you a link to reset your password.
            </p>
            {msg && <p className="login-msg" style={{ color: '#f87171' }}>{msg}</p>}
            <form onSubmit={handleSubmit} className="login-form">
              <label>Email Address
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
            <button
              type="button"
              onClick={onBack}
              style={{ background: 'none', border: 'none', color: '#9ca3a8', fontSize: 12, cursor: 'pointer', marginTop: 8 }}
            >
              Back to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Reset password (token from email link) ────────────────────────────────────

function ResetPasswordForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setMsg('Passwords do not match.'); return; }
    setLoading(true); setMsg('');
    try {
      await request('/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
      // Remove the token from the URL without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete('reset');
      window.history.replaceState({}, '', url.toString());
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Reset failed. Please request a new link.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">AACP™</span>
          <p>Aviation &amp; Aerospace Competence Program</p>
        </div>
        {done ? (
          <>
            <p style={{ fontSize: 13, color: '#a3e6b5', lineHeight: 1.7, margin: '0 0 16px' }}>
              Password reset successfully. You can now sign in with your new password.
            </p>
            <button className="login-submit" onClick={onDone}>Sign In</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8F0909', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Choose a New Password
            </div>
            {msg && <p className="login-msg" style={{ color: '#f87171' }}>{msg}</p>}
            <form onSubmit={handleSubmit} className="login-form">
              <label>New Password
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} />
              </label>
              <label>Confirm Password
                <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
              </label>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Resetting…' : 'Set New Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: (auth: AuthState) => void }) {
  const [showRegister, setShowRegister] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [pendingUserId, setPendingUserId] = useState('');
  const [pendingRole, setPendingRole] = useState<Role>('youth');
  const [showForceChange, setShowForceChange] = useState(false);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (showRegister) return <RegisterForm onBack={() => setShowRegister(false)} />;
  if (showForgot)   return <ForgotPasswordForm onBack={() => setShowForgot(false)} />;
  if (showForceChange) {
    return <ForcePasswordChangeForm
      userId={pendingUserId}
      email={email}
      currentPassword={password}
      onDone={() => { setShowForceChange(false); setErrorMsg('Password updated. Please sign in.'); }}
    />;
  }
  if (showMfaSetup) {
    return <MfaSetupForm
      email={email}
      password={password}
      otp={otp}
      onSetupComplete={() => { setShowMfaSetup(false); setMfaRequired(true); setErrorMsg('MFA enabled. Enter the code from your authenticator app.'); }}
    />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(''); setLoading(true);
    try {
      const res = await request<{
        userId: string; role: Role; name?: string; careerStage?: string;
        emailVerified?: boolean;
        accessToken?: string; refreshToken?: string;
        mfaRequired?: boolean; mfaSetupRequired?: boolean;
        passwordChangeRequired?: boolean;
        message?: string;
      }>('/auth/login', { method: 'POST', body: { email, password, otp: otp || undefined } });

      if (res.passwordChangeRequired && res.userId) {
        setPendingUserId(res.userId);
        setPendingRole(res.role ?? 'admin');
        setShowForceChange(true);
        setLoading(false); return;
      }

      if (res.mfaRequired) {
        if (res.mfaSetupRequired) {
          setPendingUserId(res.userId ?? '');
          setShowMfaSetup(true);
        } else {
          setMfaRequired(true);
          setErrorMsg('Enter your 6-digit authenticator code.');
        }
        setLoading(false); return;
      }

      if (res.accessToken && res.refreshToken) {
        setStoredToken(res.accessToken);
        setStoredRefreshToken(res.refreshToken);
        localStorage.setItem('aacp_role', res.role);
        if (res.careerStage) localStorage.setItem('aacp_career_stage', res.careerStage);
        if (res.name) localStorage.setItem('aacp_name', res.name);
        localStorage.setItem('aacp_email_verified', res.emailVerified ? '1' : '0');
        onLogin({ role: res.role, userId: res.userId });
      }
    } catch (e: unknown) {
      if (e instanceof NetworkError || e instanceof ServerError) {
        setErrorMsg('We’re unable to connect to the authentication service. Please try again shortly.');
      } else if (e instanceof ApiError) {
        const msg = e.message.toLowerCase();
        if (msg.includes('mfa') || msg.includes('token') || msg.includes('authenticator') || msg.includes('invalid') || msg.includes('credentials')) {
          setErrorMsg('Unable to sign in. Please verify your credentials and authentication code.');
        } else {
          setErrorMsg(e.message);
        }
      } else {
        setErrorMsg('We’re unable to connect to the authentication service. Please try again shortly.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">AACP™</span>
          <p>Aviation &amp; Aerospace Competence Program</p>
        </div>

        <div className="login-tabs">
          <button className="active">Sign in</button>
          <button onClick={() => { setShowRegister(true); setErrorMsg(''); }}>Register</button>
        </div>

        {errorMsg && <p className="login-msg">{errorMsg}</p>}

        <form onSubmit={handleSubmit} className="login-form">
          <label>Email Address
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label>Password
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </label>
          {mfaRequired && (
            <label>Authenticator Code
              <input required value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6} inputMode="numeric" />
            </label>
          )}
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setShowForgot(true)}
          style={{ background: 'none', border: 'none', color: '#9ca3a8', fontSize: 12, cursor: 'pointer', marginTop: 4, textDecoration: 'underline' }}
        >
          Forgot password?
        </button>
      </div>
    </div>
  );
}

// ── Role → dashboard views ────────────────────────────────────────────────────

type DashboardView = 'admin' | 'youth' | 'coach' | 'employer' | 'postsecondary' | 'connector';

function viewsForRole(role: Role): DashboardView[] {
  if (role === 'admin' || role === 'super_admin') return ['admin', 'connector', 'youth', 'coach', 'employer', 'postsecondary'];
  if (role === 'employer') return ['employer'];
  if (role === 'postsecondary') return ['postsecondary'];
  if (role === 'coach') return ['coach'];
  return ['youth'];
}

const VIEW_LABELS: Record<DashboardView, string> = {
  admin: 'Approvals',
  connector: 'AACP Connector',
  youth: 'Participant',
  coach: 'Career Advisor',
  employer: 'Employer',
  postsecondary: 'Post-Secondary',
};

// ── Placeholder for post-secondary dashboard ──────────────────────────────────

function PostSecondaryDashboard() {
  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Post-Secondary Dashboard</h2>
      <p style={{ color: '#9ca3a8', fontSize: 14 }}>Regional competency data across Canadian institutions — coming soon.</p>
    </div>
  );
}

// ── Main app shell ────────────────────────────────────────────────────────────

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [currentView, setCurrentView] = useState<DashboardView>('youth');
  const [adminPendingCount, setAdminPendingCount] = useState(0);

  // Validator experience — path-based routing /validate/:token
  const validateMatch = window.location.pathname.match(/^\/validate\/([a-f0-9]{64})$/);
  if (validateMatch) {
    return <ValidatorExperience token={validateMatch[1]} />;
  }

  // Password reset — token arrives as ?reset=<token> in the URL
  const resetToken = new URL(window.location.href).searchParams.get('reset');
  if (resetToken) {
    return <ResetPasswordForm token={resetToken} onDone={() => window.location.replace(window.location.pathname)} />;
  }

  // Pilot invitation — token arrives as ?pilot=<token>
  const pilotToken = new URL(window.location.href).searchParams.get('pilot');
  if (pilotToken) {
    return (
      <PilotRegistrationForm
        token={pilotToken}
        onComplete={(auth) => {
          setStoredToken(auth.accessToken);
          setStoredRefreshToken(auth.refreshToken);
          localStorage.setItem('aacp_role', auth.role);
          localStorage.setItem('aacp_user_id', auth.userId);
          if (auth.name) localStorage.setItem('aacp_name', auth.name);
          window.location.replace(window.location.pathname);
        }}
      />
    );
  }

  // Admin invitation — token arrives as ?invite=<token>
  const inviteToken = new URL(window.location.href).searchParams.get('invite');
  if (inviteToken) {
    return <InviteAcceptForm token={inviteToken} onDone={() => window.location.replace(window.location.pathname)} />;
  }

  // Coach invitation — token arrives as ?coach_invite=<token>
  const coachInviteToken = new URL(window.location.href).searchParams.get('coach_invite');
  if (coachInviteToken) {
    return <CoachInviteAcceptForm token={coachInviteToken} onDone={() => window.location.replace(window.location.pathname)} />;
  }

  useEffect(() => {
    const token = getStoredToken();
    const role = localStorage.getItem('aacp_role') as Role | null;
    const userId = localStorage.getItem('aacp_user_id') ?? 'restored';
    if (token && role) {
      setAuth({ role, userId });
      const views = viewsForRole(role);
      const hash = window.location.hash.replace('#', '') as DashboardView;
      // Admins always land on their own dashboard — never inherit a participant hash
      const defaultView = (role === 'admin' || role === 'super_admin') ? views[0] : (views.includes(hash) ? hash : views[0]);
      setCurrentView(defaultView);

      // Poll pending count for admin sidebar badge
      if (role === 'admin' || role === 'super_admin') {
        const fetchCount = () =>
          fetch('/admin/notifications', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then((d: { pendingCount?: number }) => setAdminPendingCount(d.pendingCount ?? 0))
            .catch(() => {});
        fetchCount();
        const iv = setInterval(fetchCount, 60_000);
        return () => clearInterval(iv);
      }
    }

    // Auto-logout when refresh token also expires
    const onExpired = () => {
      clearStoredTokens();
      localStorage.removeItem('aacp_user_id');
      setAuth(null);
    };
    window.addEventListener('aacp:session-expired', onExpired);
    return () => window.removeEventListener('aacp:session-expired', onExpired);
  }, []);

  function handleLogin(a: AuthState) {
    localStorage.setItem('aacp_user_id', a.userId);
    setAuth(a);
    setCurrentView(viewsForRole(a.role)[0]);
  }

  function handleLogout() {
    const refreshToken = localStorage.getItem('aacp_refresh_token');
    if (refreshToken) request('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => {});
    clearStoredTokens();
    localStorage.removeItem('aacp_user_id');
    setAuth(null);
  }

  if (!auth) return <LoginPage onLogin={handleLogin} />;

  const views = viewsForRole(auth.role);

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark">AACP™</span>
          <div>
            <strong>AACP Platform</strong>
            <p>Competency and readiness insights.</p>
          </div>
        </div>
        <nav aria-label="Dashboard pages">
          <ul className="nav-list" role="tablist">
            {views.map((view) => (
              <li key={view}>
                <button
                  type="button"
                  className={view === currentView ? 'nav-button active' : 'nav-button'}
                  aria-pressed={view === currentView}
                  aria-current={view === currentView ? 'page' : undefined}
                  onClick={() => { window.location.hash = view; setCurrentView(view); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                >
                  <span>{VIEW_LABELS[view]}</span>
                  {view === 'admin' && adminPendingCount > 0 && (
                    <span style={{
                      background: '#f59e0b', color: '#000', borderRadius: '50%',
                      minWidth: 18, height: 18, fontSize: 10, fontWeight: 800,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 4px',
                    }}>
                      {adminPendingCount}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <span className="role-chip">{
            auth.role === 'postsecondary' ? 'Post-Secondary' :
            auth.role === 'super_admin' ? 'Super Admin' :
            auth.role === 'admin' ? 'Admin' :
            auth.role === 'employer' ? 'Employer' :
            auth.role === 'youth' ? 'Participant' : auth.role
          }</span>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main className="app-content" aria-label="Dashboard view">
        {currentView === 'admin'          && <AdminDashboard />}
        {currentView === 'connector'      && <ConnectorDashboard />}
        {currentView === 'youth'          && <YouthDashboard />}
        {currentView === 'coach'          && <CoachDashboard />}
        {currentView === 'employer'       && <EmployerDashboard />}
        {currentView === 'postsecondary'  && <IndustryIntelligence />}
      </main>
    </div>
  );
}
