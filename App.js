"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.App = App;
var react_1 = require("react");
var EmployerDashboard_1 = require("./components/dashboard/EmployerDashboard");
var YouthDashboard_1 = require("./components/dashboard/YouthDashboard");
var CoachDashboard_1 = require("./components/dashboard/CoachDashboard");
var navItems = [
    { id: 'youth', label: 'Youth' },
    { id: 'coach', label: 'Coach' },
    { id: 'employer', label: 'Employer' },
];
function resolveHashRoute(hash) {
    var route = hash.replace('#', '');
    return navItems.some(function (item) { return item.id === route; }) ? route : 'youth';
}
function App() {
    var _a = (0, react_1.useState)(function () { return resolveHashRoute(window.location.hash); }), currentView = _a[0], setCurrentView = _a[1];
    (0, react_1.useEffect)(function () {
        var handleHashChange = function () {
            setCurrentView(resolveHashRoute(window.location.hash));
        };
        window.addEventListener('hashchange', handleHashChange);
        return function () { return window.removeEventListener('hashchange', handleHashChange); };
    }, []);
    var activeTitle = (0, react_1.useMemo)(function () { var _a, _b; return (_b = (_a = navItems.find(function (item) { return item.id === currentView; })) === null || _a === void 0 ? void 0 : _a.label) !== null && _b !== void 0 ? _b : 'Dashboard'; }, [currentView]);
    return (<div className="app-shell">
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
            {navItems.map(function (item) { return (<li key={item.id}>
                <button type="button" className={item.id === currentView ? 'nav-button active' : 'nav-button'} aria-pressed={item.id === currentView} aria-current={item.id === currentView ? 'page' : undefined} onClick={function () {
                window.location.hash = item.id;
                setCurrentView(item.id);
            }}>
                  {item.label}
                </button>
              </li>); })}
          </ul>
        </nav>
      </aside>

      <main className="app-content" aria-label={"".concat(activeTitle, " view")}>
        {currentView === 'youth' && <YouthDashboard_1.YouthDashboard />}
        {currentView === 'coach' && <CoachDashboard_1.CoachDashboard />}
        {currentView === 'employer' && <EmployerDashboard_1.EmployerDashboard />}
      </main>
    </div>);
}
