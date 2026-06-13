import { DashboardLayout } from './DashboardLayout';
import { ChartCard } from './ChartCard';
import { TableCard } from './TableCard';
import { ActionListCard } from './ActionListCard';
import { useCoachDashboard } from '../../hooks/useCoachDashboard';

export function CoachDashboard() {
  const { data, loading, error } = useCoachDashboard();

  if (loading) {
    return (
      <DashboardLayout title="Coach Dashboard">
        <p>Loading coach dashboard...</p>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Coach Dashboard">
        <p role="alert">Unable to load coach dashboard: {error}</p>
      </DashboardLayout>
    );
  }

  const reviewRows = data?.reviewQueue.map((item) => ({
    User: item.userName,
    Competency: item.competencyTitle,
    Status: item.status,
    Submitted: new Date(item.submittedAt).toLocaleDateString(),
  })) ?? [];

  return (
    <DashboardLayout title="Coach Dashboard">
      <section>
        <h2>Review queue</h2>
        <TableCard title="Pending reviews" columns={['User', 'Competency', 'Status', 'Submitted']} rows={reviewRows} />
      </section>
      <section>
        <ChartCard title="Cohort readiness" description="Role-family readiness distribution.">
          <ul>
            {data?.cohortReadiness.map((item) => (
              <li key={item.roleFamilyId}>
                {item.roleFamilyName}: {item.averageReadiness}% readiness across {item.participantCount} participants.
              </li>
            ))}
          </ul>
        </ChartCard>
      </section>
      <section>
        <h2>Participant overview</h2>
        <div className="card-grid">
          {data?.participantOverview.map((participant) => (
            <div key={participant.userId} className="summary-metric-card">
              <strong>{participant.userName}</strong>
              <p>Score: {participant.currentScore}</p>
              <p>{participant.openItems} open items</p>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Regulatory review items</h2>
        <ul>
          {data?.regulatoryReviewItems.map((item) => (
            <li key={item.itemId}>
              <strong>{item.itemType}</strong> — {item.reason} (submitted {new Date(item.submittedAt).toLocaleDateString()})
            </li>
          ))}
        </ul>
      </section>
      <section>
        <ActionListCard
          title="Action items"
          actions={data?.actionItems.map((item) => ({
            id: item.actionId,
            title: item.title,
            description: item.description,
          })) ?? []}
        />
      </section>
    </DashboardLayout>
  );
}
