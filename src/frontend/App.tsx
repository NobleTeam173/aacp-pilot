import { useEffect, useState } from 'react';
import { EmployerDashboard } from './components/dashboard/EmployerDashboard';
import { YouthDashboard } from './components/dashboard/YouthDashboard';
import { CoachDashboard } from './components/dashboard/CoachDashboard';
import { request, setStoredToken, setStoredRefreshToken, clearStoredTokens, getStoredToken } from './services/apiClient';

type Role = 'youth' | 'employer' | 'postsecondary' | 'admin';

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

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setMsg('Passwords do not match.'); return; }
    setMsg(''); setLoading(true);
    try {
      await request('/auth/register', {
        method: 'POST',
        body: {
          email, password, name, phone, role,
          ...(role === 'employer' ? { organizationName: orgName, jobTitle } : {}),
          ...(role === 'postsecondary' ? { institutionName, region, programArea } : {}),
        },
      });
      setSubmitted(true);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center', gap: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>&#x2705;</div>
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
    youth: 'Youth Participant',
    employer: 'Employer',
    postsecondary: 'Post-Secondary Institution',
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div className="login-brand">
          <span className="brand-mark">AACP</span>
          <p>Aviation &amp; Aerospace Competence Program</p>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: '#80011f', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Create Account
        </div>
        <p style={{ fontSize: 12, color: '#9ca3a8', marginBottom: 20, lineHeight: 1.6 }}>
          All accounts require administrator approval before access is granted. You will be notified by email.
        </p>

        {msg && <p className="login-msg" style={{ color: '#f87171' }}>{msg}</p>}

        <form onSubmit={handleSubmit} className="login-form">
          {/* Role selector */}
          <label>I am registering as
            <select value={role} onChange={e => setRole(e.target.value as RegisterRole)}>
              {(Object.entries(roleLabel) as [RegisterRole, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>

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

// ── Login form ────────────────────────────────────────────────────────────────

function LoginPage({ onLogin }: { onLogin: (auth: AuthState) => void }) {
  const [showRegister, setShowRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (showRegister) return <RegisterForm onBack={() => setShowRegister(false)} />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(''); setLoading(true);
    try {
      const res = await request<{
        userId: string; role: Role;
        accessToken?: string; refreshToken?: string;
        mfaRequired?: boolean; mfaSetupRequired?: boolean;
        message?: string;
      }>('/auth/login', { method: 'POST', body: { email, password, otp: otp || undefined } });

      if (res.mfaRequired) {
        setMfaRequired(true);
        setErrorMsg(res.mfaSetupRequired
          ? 'MFA setup required. Contact your administrator.'
          : 'Enter your 6-digit authenticator code.');
        setLoading(false); return;
      }

      if (res.accessToken && res.refreshToken) {
        setStoredToken(res.accessToken);
        setStoredRefreshToken(res.refreshToken);
        localStorage.setItem('aacp_role', res.role);
        onLogin({ role: res.role, userId: res.userId });
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">AACP</span>
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
      </div>
    </div>
  );
}

// ── Role → dashboard views ────────────────────────────────────────────────────

type DashboardView = 'youth' | 'coach' | 'employer' | 'postsecondary';

function viewsForRole(role: Role): DashboardView[] {
  if (role === 'admin') return ['youth', 'coach', 'employer', 'postsecondary'];
  if (role === 'employer') return ['employer'];
  if (role === 'postsecondary') return ['postsecondary'];
  return ['youth'];
}

const VIEW_LABELS: Record<DashboardView, string> = {
  youth: 'Youth',
  coach: 'Coach',
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

  useEffect(() => {
    const token = getStoredToken();
    const role = localStorage.getItem('aacp_role') as Role | null;
    const userId = localStorage.getItem('aacp_user_id') ?? 'restored';
    if (token && role) {
      setAuth({ role, userId });
      const hash = window.location.hash.replace('#', '') as DashboardView;
      const views = viewsForRole(role);
      setCurrentView(views.includes(hash) ? hash : views[0]);
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
          <span className="brand-mark">AACP</span>
          <div>
            <strong>Pilot Dashboard</strong>
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
                >
                  {VIEW_LABELS[view]}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <span className="role-chip">{auth.role === 'postsecondary' ? 'Post-Secondary' : auth.role}</span>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main className="app-content" aria-label="Dashboard view">
        {currentView === 'youth'          && <YouthDashboard />}
        {currentView === 'coach'          && <CoachDashboard />}
        {currentView === 'employer'       && <EmployerDashboard />}
        {currentView === 'postsecondary'  && <PostSecondaryDashboard />}
      </main>
    </div>
  );
}
