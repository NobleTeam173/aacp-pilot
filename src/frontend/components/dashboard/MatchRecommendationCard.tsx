interface MatchRecommendationCardProps {
  matchTitle: string;
  score: number;
  roleName: string;
  summary?: string;
}

export function MatchRecommendationCard({ matchTitle, score, roleName, summary }: MatchRecommendationCardProps) {
  return (
    <div className="match-recommendation-card">
      <h3>{matchTitle}</h3>
      <p>Role: {roleName}</p>
      <p>Score: {score}</p>
      {summary ? <p>{summary}</p> : null}
    </div>
  );
}
