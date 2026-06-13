import { DashboardLayout } from './DashboardLayout';
import { SummaryMetricCard } from './SummaryMetricCard';
import { ChartCard } from './ChartCard';
import { TableCard } from './TableCard';
import { RegulatoryFlagCard } from './RegulatoryFlagCard';
import { useEmployerDashboard } from '../../hooks/useEmployerDashboard';

export function EmployerDashboard() {
  const { data, loading, error } = useEmployerDashboard();

  if (loading) {
    return (
      <DashboardLayout title="Employer Dashboard">
        <p>Loading employer dashboard...</p>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Employer Dashboard">
        <p role="alert">Unable to load employer dashboard: {error}</p>
      </DashboardLayout>
    );
  }

  const readinessMetrics = [
    { label: 'Average Readiness', value: data?.summary.averageReadiness ?? 0, subtext: 'Across pilot cohort' },
    { label: 'Participants', value: data?.summary.participantCount ?? 0, subtext: 'Pilot maximum' },
    { label: 'High readiness', value: data?.summary.readinessBands.high ?? 0, subtext: 'Strong fit candidates' },
  ];

  const matchRows = data?.topMatches.map((match: { roleName: string; matchScore: number; status: string }) => ({
    Name: match.roleName,
    Role: match.roleName,
    Score: match.matchScore,
    Status: match.status,
  })) ?? [];

  return (
    <DashboardLayout title="Employer Dashboard">
      <section>
        <h2>Cohort readiness summary</h2>
        <div className="metric-grid">
          {readinessMetrics.map((metric) => (
            <SummaryMetricCard key={metric.label} label={metric.label} value={metric.value} subtext={metric.subtext} />
          ))}
        </div>
      </section>
      <section>
        <ChartCard title="Readiness trends" description="Track readiness changes over time.">
          <ul>
            {data?.readinessTrends.map((point: { period: string; averageReadiness: number }) => (
              <li key={point.period}>{point.period}: {point.averageReadiness}%</li>
            ))}
          </ul>
        </ChartCard>
      </section>
      <section>
        <ChartCard title="Gap map by role family" description="Identify role-family readiness gaps.">
          <ul>
            {data?.gapMapByRoleFamily.map((gap: { roleFamilyId: string; roleFamilyName: string; gapScore: number; averageReadiness: number }) => (
              <li key={gap.roleFamilyId}>
                {gap.roleFamilyName}: {gap.gapScore}% gap, readiness {gap.averageReadiness}%
              </li>
            ))}
          </ul>
        </ChartCard>
      </section>
      <section>
        <TableCard title="Top matches" columns={['Name', 'Role', 'Score', 'Status']} rows={matchRows} />
      </section>
      <section>
        <RegulatoryFlagCard
          title="Regulatory flags"
          count={data?.regulatoryFlags.length ?? 0}
          details="Items requiring human review under CARs or Transport Canada guidance."
        />
      </section>
      <section>
        <ChartCard title="Recent activity" description="Latest cohort actions and review events.">
          <ul>
            {data?.recentActivity.map((event: { title: string; status: string; date: string }, index: number) => (
              <li key={index}>
                <strong>{event.title}</strong> — {event.status} on {new Date(event.date).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </ChartCard>
      </section>
    </DashboardLayout>
  );
}
