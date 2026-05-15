import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

export function useRepoHealth(name) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getRepoHealth(name);
      if (mounted.current) setData(result);
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    mounted.current = true;
    refetch();
    return () => {
      mounted.current = false;
    };
  }, [refetch]);

  return { data, loading, error, refetch };
}
