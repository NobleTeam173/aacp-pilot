import { useEffect, useState } from 'react';
import { fetchYouthDashboard, YouthDashboardData } from '../services/dashboardApi';

export function useYouthDashboard(userId?: string, cohortId?: string) {
  const [data, setData] = useState<YouthDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setLoading(true);
    setError(null);

    fetchYouthDashboard({ userId, cohortId })
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
  }, [userId, cohortId]);

  return { data, loading, error };
}
