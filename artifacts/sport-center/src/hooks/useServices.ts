import { useState, useEffect } from "react";
import type { Facility } from "@/types";

const CACHE: { data: Facility[] | null; ts: number } = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

export function useServices() {
  const [services, setServices] = useState<Facility[]>(CACHE.data ?? []);
  const [loading, setLoading] = useState(CACHE.data === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (CACHE.data && Date.now() - CACHE.ts < CACHE_TTL) {
      setServices(CACHE.data);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/sport-center/services")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Facility[]>;
      })
      .then((data) => {
        if (cancelled) return;
        CACHE.data = data;
        CACHE.ts = Date.now();
        setServices(data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Gagal memuat daftar fasilitas");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { services, loading, error };
}
