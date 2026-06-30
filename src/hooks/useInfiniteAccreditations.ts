"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Accreditation } from "@/types";

interface UseInfiniteAccreditationsOptions {
  /** Activé uniquement en mode défilement continu. */
  enabled: boolean;
  /** Premier lot fourni par le SSR (page 1 pour les filtres courants). */
  initialItems: Accreditation[];
  /** Total filtré (sert à savoir s'il reste des éléments). */
  total: number;
  perPage: number;
  /** Params URL courants (filtres, tri, recherche, espace). */
  searchParams: Record<string, string>;
}

interface UseInfiniteAccreditationsResult {
  items: Accreditation[];
  loading: boolean;
  hasMore: boolean;
  error: boolean;
  loadMore: () => void;
}

const RELEVANT_KEYS = [
  "q",
  "status",
  "zone",
  "vehicleType",
  "from",
  "to",
  "sort",
  "dir",
  "espace",
] as const;

/**
 * Chargement progressif des accréditations (offset/limit côté serveur).
 *
 * Garanties :
 *  - réinitialisation propre quand un filtre/tri/recherche change (clé dérivée
 *    des params) ;
 *  - déduplication par `id` entre deux lots ;
 *  - un seul fetch en vol à la fois ;
 *  - le total provient du SSR (`total`) → pas de chargement global client.
 */
export function useInfiniteAccreditations({
  enabled,
  initialItems,
  total,
  perPage,
  searchParams,
}: UseInfiniteAccreditationsOptions): UseInfiniteAccreditationsResult {
  const resetKey = useMemo(
    () =>
      RELEVANT_KEYS.map((k) => `${k}=${searchParams[k] ?? ""}`).join("&"),
    [searchParams]
  );

  const [items, setItems] = useState<Accreditation[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const loadingRef = useRef(false);
  const seenRef = useRef<Set<string>>(
    new Set(initialItems.map((a) => String(a.id)))
  );

  // Réinitialise la liste sur le 1er lot SSR à chaque changement de filtres/tri.
  useEffect(() => {
    setItems(initialItems);
    seenRef.current = new Set(initialItems.map((a) => String(a.id)));
    setError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const hasMore = items.length < total;

  const loadMore = useCallback(() => {
    if (!enabled || loadingRef.current) return;
    if (items.length >= total) return;

    loadingRef.current = true;
    setLoading(true);
    setError(false);

    const qs = new URLSearchParams();
    for (const k of RELEVANT_KEYS) {
      const v = searchParams[k];
      if (v) qs.set(k, v);
    }
    qs.set("offset", String(items.length));
    qs.set("limit", String(perPage));

    fetch(`/api/accreditations/dashboard?${qs.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { items: Accreditation[] }) => {
        setItems((prev) => {
          const next = [...prev];
          for (const it of data.items ?? []) {
            const id = String(it.id);
            if (!seenRef.current.has(id)) {
              seenRef.current.add(id);
              next.push(it);
            }
          }
          return next;
        });
      })
      .catch(() => setError(true))
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  }, [enabled, items.length, total, perPage, searchParams]);

  return { items, loading, hasMore, error, loadMore };
}
