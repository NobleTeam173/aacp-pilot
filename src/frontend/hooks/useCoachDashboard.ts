import { useEffect, useState } from 'react';
import { fetchCoachDashboard, CoachDashboardData } from '../services/dashboardApi';

export function useCoachDashboard(params?: {
  pathway?: string;
  aciaStatus?: string;
  coachingStatus?: string;
  school?: string;
  region?: string;
}) {
  const [data, setData] = useState<CoachDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(params ?? {});

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchCoachDashboard(params ?? {})
      .then((result) => { if (isMounted) setData(result); })
      .catch((err: unknown) => { if (isMounted) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (isMounted) setLoading(false); });

    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}
