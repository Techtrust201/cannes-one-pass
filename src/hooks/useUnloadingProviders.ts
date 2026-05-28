"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { withEspaceQuery } from "@/lib/url";

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
 * cette organisation **+** ceux globaux. Sinon, lit `?espace=` depuis l'URL.
 */
export function useUnloadingProviders(espaceSlug?: string | null) {
  const searchParams = useSearchParams();
  const espaceFromUrl = searchParams?.get("espace")?.trim() || null;
  const espace = espaceSlug ?? espaceFromUrl;

  const [providers, setProviders] = useState<UnloadingProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const url = withEspaceQuery("/api/unloading-providers", espace);
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
  }, [espace]);

  return { providers, loading };
}
