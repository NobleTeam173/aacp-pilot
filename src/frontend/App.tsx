import { useEffect, useState } from 'react';
import { EmployerDashboard } from './components/dashboard/EmployerDashboard';
import { YouthDashboard } from './components/dashboard/YouthDashboard';
import { CoachDashboard } from './components/dashboard/CoachDashboard';
import { request, setStoredToken, setStoredRefreshToken, clearStoredTokens, getStoredToken } from './services/apiClient';

type Role = 'youth' | 'coach' | 'employer' | 'admin';

interface AuthState {
  role: Role;
  userId: string;
}

// ── Login form ────────────────────────────────────────────────────────────────

function LoginPage({ onLogin }: { onLogin: (auth: AuthState) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('youth');
  const [otp, setOtp] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (mode === 'register') {
        await request('/auth/register', { method: 'POST', body: { email, password, name, role } });
        setMode('login');
        setErrorMsg('Registered! Please log in.');
        setLoading(false);
        return;
      }

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
          : 'Enter your 6-digit MFA code below.');
        setLoading(false);
        return;
      }

      if (res.accessToken && res.refreshToken) {
        setStoredToken(res.accessToken);
        setStoredRefreshToken(res.refreshToken);
        localStorage.setItem('aacp_role', res.role);
        onLogin({ role: res.role, userId: res.userId });
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Login failed');
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
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setMfaRequired(false); setErrorMsg(''); }}>Sign in</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setMfaRequired(false); setErrorMsg(''); }}>Register</button>
        </div>

        {errorMsg && <p className="login-msg">{errorMsg}</p>}

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'register' && (
            <>
              <label>Full name
                <input required value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </label>
              <label>Role
                <select value={role} onChange={e => setRole(e.target.value as Role)}>
                  <option value="youth">Youth Participant</option>
                  <option value="coach">Coach</option>
                  <option value="employer">Employer</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </>
          )}

          <label>Email
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>

          <label>Password
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </label>

          {mfaRequired && (
            <label>MFA code
              <input required value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6} inputMode="numeric" />
            </label>
          )}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Role → allowed nav items ──────────────────────────────────────────────────

type DashboardView = 'youth' | 'coach' | 'employer';

function viewsForRole(role: Role): DashboardView[] {
  if (role === 'admin') return ['youth', 'coach', 'employer'];
  if (role === 'coach') return ['coach'];
  if (role === 'employer') return ['employer'];
  return ['youth'];
}

const VIEW_LABELS: Record<DashboardView, string> = {
  youth: 'Youth',
  coach: 'Coach',
  employer: 'Employer',
};

// ── Main app shell ────────────────────────────────────────────────────────────

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [currentView, setCurrentView] = useState<DashboardView>('youth');

  // Restore session from localStorage on first load
  useEffect(() => {
    const token = getStoredToken();
    const role = localStorage.getItem('aacp_role') as Role | null;
    const userId = localStorage.getItem('aacp_user_id') ?? 'restored';
    if (token && role) {
      setAuth({ role, userId });
      setCurrentView(viewsForRole(role)[0]);
    }
  }, []);

  function handleLogin(a: AuthState) {
    localStorage.setItem('aacp_user_id', a.userId);
    setAuth(a);
    setCurrentView(viewsForRole(a.role)[0]);
  }

  function handleLogout() {
    const refreshToken = localStorage.getItem('aacp_refresh_token');
    if (refreshToken) {
      request('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => {});
    }
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
            <strong>Pilot dashboard</strong>
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
                  onClick={() => {
                    window.location.hash = view;
                    setCurrentView(view);
                  }}
                >
                  {VIEW_LABELS[view]}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <span className="role-chip">{auth.role}</span>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main className="app-content" aria-label="Dashboard view">
        {currentView === 'youth'    && <YouthDashboard />}
        {currentView === 'coach'    && <CoachDashboard />}
        {currentView === 'employer' && <EmployerDashboard />}
      </main>
    </div>
  );
}
