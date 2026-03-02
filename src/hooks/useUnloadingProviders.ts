"use client";

import { useState, useEffect } from "react";

export interface UnloadingProvider {
  id: string;
  name: string;
  isActive: boolean;
}

export function useUnloadingProviders() {
  const [providers, setProviders] = useState<UnloadingProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/unloading-providers")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setProviders(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { providers, loading };
}
