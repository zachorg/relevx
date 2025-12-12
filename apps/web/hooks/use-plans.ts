/**
 * usePlans web hook
 *
 * Provides real-time access to plans.
 */

import { useState, useEffect } from "react";
import {
  fetchPlans,
} from "@/lib/plans";
import { PlanInfo } from "core";

interface UsePlansResult {
  plans: PlanInfo[];
  loading: boolean;
  error: string | null;
}

export function usePlans(): UsePlansResult {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPlans = async () => {
      setLoading(true);
      setError(null);

      try {
        const plans = await fetchPlans();
        if (plans) {
          setPlans(plans);
          console.log(plans);
        } else {
          setPlans([]);
        }
      } catch (err) {
        console.error("Error fetching plans:", err);
        setError("Failed to fetch plans");
        setPlans([]);
      } finally {
        setLoading(false);
      }
    };

    loadPlans();
  }, []);

  return { plans, loading, error };
}
