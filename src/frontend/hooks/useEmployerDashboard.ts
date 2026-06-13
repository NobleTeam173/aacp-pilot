import { useEffect, useState } from 'react';
import { fetchEmployerDashboard, EmployerDashboardData } from '../services/dashboardApi';

export function useEmployerDashboard(cohortId?: string, roleFamilyId?: string, timeframe: string = '30d') {
  const [data, setData] = useState<EmployerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setLoading(true);
    setError(null);

    fetchEmployerDashboard({ cohortId, roleFamilyId, timeframe })
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
  }, [cohortId, roleFamilyId, timeframe]);

  return { data, loading, error };
}
