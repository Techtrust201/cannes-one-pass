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

    // `silent` : rafraîchissement en arrière-plan sans repasser en loading
    // (évite tout flicker du menu « Déchargement par »).
    const load = (silent: boolean) => {
      if (!silent) setLoading(true);
      fetch(url)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (!cancelled && Array.isArray(data)) setProviders(data);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled && !silent) setLoading(false);
        });
    };

    load(false);

    // Mise à jour « live » optimisée : revalidation sur focus/onglet visible
    // + polling doux uniquement quand l'onglet est visible. Reflète les
    // changements d'ordre/CRUD prestataires faits en back-office.
    const revalidate = () => load(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") revalidate();
    }, 60000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [espace]);

  return { providers, loading };
}
