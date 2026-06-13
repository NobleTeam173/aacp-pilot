interface CompetencyProgressCardProps {
  competency: string;
  status: string;
  progress: number;
  coachFeedback?: string;
}

export function CompetencyProgressCard({ competency, status, progress, coachFeedback }: CompetencyProgressCardProps) {
  return (
    <div className="competency-progress-card">
      <h3>{competency}</h3>
      <p>Status: {status}</p>
      <p>Progress: {progress}%</p>
      {coachFeedback ? <p>Coach feedback: {coachFeedback}</p> : null}
    </div>
  );
}
