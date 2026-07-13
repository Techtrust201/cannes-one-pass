"use client";

/**
 * Hook client — Phase 6.
 *
 * Interroge `GET /api/planning` pour chaque catégorie d'un espace RX, pour
 * une phase donnée (MONTAGE ou DEMONTAGE), et renvoie une map
 * `categoryId -> PlanningResolution`.
 *
 * Comportement garanti :
 *   - si aucun emplacement n'est résolu (`location` null), ne fait AUCUN
 *     appel réseau et renvoie `{}` (aucune fusion possible) ;
 *   - une réponse `source !== "DB"` (LEGACY/EVENT_FALLBACK/NONE) est quand
 *     même renvoyée dans la map : c'est `applyPlanningOverrides` qui décide
 *     de l'ignorer (garde la donnée statique locale) — cf. planning-bridge.ts.
 *   - une erreur réseau/HTTP pour une catégorie ne bloque jamais les autres :
 *     elle est simplement absente de la map (traitée comme "pas d'override").
 */
import { useEffect, useState } from "react";
import type { PlanningResolution, PlanningPhase } from "@/lib/logistics-planning";
import type { RxCategoryId } from "./planning-data";
import { RX_CATEGORY_TO_DB_CODE } from "./planning-bridge";
import type { CategoryPlanningOverrides } from "./planning-bridge";

export interface PlanningOverrideLocation {
  exhibitorId: string;
  exhibitorLocationId: string;
}

export function useRxPlanningOverrides(params: {
  orgSlug: string;
  eventSlug: string;
  location: PlanningOverrideLocation | null;
  phase: PlanningPhase;
  categoryIds: string[];
}): CategoryPlanningOverrides {
  const { orgSlug, eventSlug, location, phase } = params;
  // Clé stable pour éviter de re-fetcher à chaque render pour un tableau
  // recréé avec le même contenu.
  const categoryIdsKey = params.categoryIds.join(",");
  const [overrides, setOverrides] = useState<CategoryPlanningOverrides>({});

  useEffect(() => {
    if (!location || !eventSlug || !categoryIdsKey) {
      setOverrides({});
      return;
    }
    const categoryIds = categoryIdsKey.split(",").filter(Boolean);
    let cancelled = false;

    Promise.all(
      categoryIds.map(async (catId) => {
        const categoryCode = RX_CATEGORY_TO_DB_CODE[catId as RxCategoryId];
        if (!categoryCode) return null;
        const qs = new URLSearchParams({
          orgSlug,
          eventSlug,
          phase,
          exhibitorId: location.exhibitorId,
          exhibitorLocationId: location.exhibitorLocationId,
          categoryCode,
        });
        try {
          const res = await fetch(`/api/planning?${qs.toString()}`);
          if (!res.ok) return null;
          const body = await res.json();
          if (!body?.ok || !body.resolution) return null;
          return [catId, body.resolution as PlanningResolution] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const next: CategoryPlanningOverrides = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setOverrides(next);
    });

    return () => {
      cancelled = true;
    };
  }, [orgSlug, eventSlug, phase, location, categoryIdsKey]);

  return overrides;
}
