import { DashboardLayout } from './DashboardLayout';
import { SummaryMetricCard } from './SummaryMetricCard';
import { ActionListCard } from './ActionListCard';
import { useYouthDashboard } from '../../hooks/useYouthDashboard';

export function YouthDashboard() {
  const { data, loading, error } = useYouthDashboard();

  if (loading) {
    return (
      <DashboardLayout title="Youth Dashboard">
        <p>Loading youth dashboard...</p>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Youth Dashboard">
        <p role="alert">Unable to load youth dashboard: {error}</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Youth Dashboard">
      <section>
        <h2>Progress</h2>
        <div className="metric-grid">
          <SummaryMetricCard label="Readiness Score" value={data?.progress.readinessScore ?? 0} subtext="Current pathway progress" />
          <SummaryMetricCard label="Competencies completed" value={data?.progress.competencyCompleted ?? 0} subtext="Out of 12 core items" />
          <SummaryMetricCard label="Pending review" value={data?.progress.competencyPendingReview ?? 0} subtext="Needs coach validation" />
        </div>
      </section>
      <section>
        <h2>Badges</h2>
        <div className="card-grid">
          {data?.badges.map((badge) => (
            <div key={badge.badgeId} className="summary-metric-card">
              <strong>{badge.title}</strong>
              <p>{badge.description}</p>
              <small>Earned {new Date(badge.earnedAt).toLocaleDateString()}</small>
            </div>
          ))}
        </div>
      </section>
      <section>
        <ActionListCard
          title="Next steps"
          actions={data?.nextSteps.map((step) => ({
            id: step.stepId,
            title: step.title,
            description: `${step.description}${step.dueDate ? ` Due ${new Date(step.dueDate).toLocaleDateString()}` : ''}`,
          })) ?? []}
        />
      </section>
    </DashboardLayout>
  );
}
