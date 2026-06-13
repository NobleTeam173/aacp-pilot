interface SummaryMetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
}

export function SummaryMetricCard({ label, value, subtext }: SummaryMetricCardProps) {
  return (
    <div className="summary-metric-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {subtext ? <div className="subtext">{subtext}</div> : null}
    </div>
  );
}
