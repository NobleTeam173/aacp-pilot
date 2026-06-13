import { useEffect, useState } from 'react';
import { fetchCoachDashboard, CoachDashboardData } from '../services/dashboardApi';

export function useCoachDashboard(cohortId?: string, status?: string, reviewerId?: string) {
  const [data, setData] = useState<CoachDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setLoading(true);
    setError(null);

    fetchCoachDashboard({ cohortId, status, reviewerId })
      .then((result) => {
        if (isMounted) {
          setData(result);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [cohortId, status, reviewerId]);

  return { data, loading, error };
}
