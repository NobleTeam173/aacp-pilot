interface RegulatoryFlagCardProps {
  title: string;
  count: number;
  details?: string;
}

export function RegulatoryFlagCard({ title, count, details }: RegulatoryFlagCardProps) {
  return (
    <div className="regulatory-flag-card">
      <h3>{title}</h3>
      <p>Count: {count}</p>
      {details ? <p>{details}</p> : null}
    </div>
  );
}
