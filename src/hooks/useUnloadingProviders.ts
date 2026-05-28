"use client";

import { useState, useEffect } from "react";

export interface UnloadingProvider {
  id: string;
  name: string;
  isActive: boolean;
}

/**
 * Hook de chargement des prestataires de déchargement.
 *
 * Multi-tenant : si `espaceSlug` est fourni (template d'accréditation,
 * sidebar logisticien avec `?espace=`), on filtre les prestataires de
 * cette organisation **+** ceux globaux. Sinon, comportement legacy.
 */
export function useUnloadingProviders(espaceSlug?: string | null) {
  const [providers, setProviders] = useState<UnloadingProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const espace =
      espaceSlug ??
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("espace")
        : null);
    const url = espace
      ? `/api/unloading-providers?espace=${encodeURIComponent(espace)}`
      : "/api/unloading-providers";
    fetch(url)
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
  }, [espaceSlug]);

  return { providers, loading };
}
