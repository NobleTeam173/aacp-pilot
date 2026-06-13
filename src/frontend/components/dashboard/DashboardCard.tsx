import { ReactNode } from 'react';

interface DashboardCardProps {
  title: string;
  children: ReactNode;
}

export function DashboardCard({ title, children }: DashboardCardProps) {
  return (
    <div className="dashboard-card">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
