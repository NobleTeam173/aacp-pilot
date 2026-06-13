import { useEffect, useMemo, useState } from 'react';
import { EmployerDashboard } from './components/dashboard/EmployerDashboard';
import { YouthDashboard } from './components/dashboard/YouthDashboard';
import { CoachDashboard } from './components/dashboard/CoachDashboard';

const navItems = [
  { id: 'youth', label: 'Youth' },
  { id: 'coach', label: 'Coach' },
  { id: 'employer', label: 'Employer' },
] as const;

type DashboardView = typeof navItems[number]['id'];

function resolveHashRoute(hash: string): DashboardView {
  const route = hash.replace('#', '');
  return navItems.some((item) => item.id === route) ? (route as DashboardView) : 'youth';
}

export function App() {
  const [currentView, setCurrentView] = useState<DashboardView>(() => resolveHashRoute(window.location.hash));

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentView(resolveHashRoute(window.location.hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const activeTitle = useMemo(() => navItems.find((item) => item.id === currentView)?.label ?? 'Dashboard', [currentView]);

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark">AACP</span>
          <div>
            <strong>Pilot dashboard</strong>
            <p>Competency and readiness insights for the pilot cohort.</p>
          </div>
        </div>
        <nav aria-label="Dashboard pages">
          <ul className="nav-list" role="tablist">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.id === currentView ? 'nav-button active' : 'nav-button'}
                  aria-pressed={item.id === currentView}
                  aria-current={item.id === currentView ? 'page' : undefined}
                  onClick={() => {
                    window.location.hash = item.id;
                    setCurrentView(item.id);
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="app-content" aria-label={`${activeTitle} view`}>
        {currentView === 'youth' && <YouthDashboard />}
        {currentView === 'coach' && <CoachDashboard />}
        {currentView === 'employer' && <EmployerDashboard />}
      </main>
    </div>
  );
}
