"use client";

/**
 * Hook client — Phase 6 / 6C-A (F3/F4).
 *
 * Interroge `GET /api/planning` pour chaque catégorie d'un espace RX, pour
 * une phase donnée (MONTAGE ou DEMONTAGE), et renvoie un état structuré
 * distinguant explicitement les situations suivantes :
 *
 *   - DISABLED            : aucun appel réseau, `loading=false`, planning
 *                           legacy inchangé (comportement historique) ;
 *   - chargement          : `loading=true` pendant que les requêtes sont
 *                           en vol ;
 *   - résolution DB       : `overrides[catId]` contient la résolution
 *                           (`source: "DB"`), appliquée par
 *                           `applyPlanningOverrides` (planning-bridge.ts) ;
 *   - règle absente        : PLANNING_NOT_FOUND (ou autre erreur) confirmée
 *                           par le serveur ;
 *   - erreur HTTP/réseau   : la requête elle-même a échoué (jamais confondue
 *                           avec une absence de règle confirmée par le
 *                           serveur) ;
 *   - requête annulée      : ignorée silencieusement (AbortController),
 *                           ne met jamais à jour un état devenu obsolète.
 *
 * La décision par catégorie (quoi mettre dans `overrides`/`errorsByCategory`
 * selon le mode) est déléguée à `buildPlanningOverridesFromOutcomes`
 * (planning-bridge.ts), fonction PURE testable sans React : ce hook ne fait
 * que le fetch + la gestion d'état/annulation.
 */
import { useEffect, useState } from "react";
import type { PlanningResolution, PlanningPhase, PlanningMode } from "@/lib/logistics-planning";
import type { RxCategoryId } from "./planning-data";
import { RX_CATEGORY_TO_DB_CODE, buildPlanningOverridesFromOutcomes } from "./planning-bridge";
import type {
  CategoryPlanningOverrides,
  CategoryFetchErrors,
  CategoryFetchOutcome,
} from "./planning-bridge";

export interface PlanningOverrideLocation {
  exhibitorId: string;
  exhibitorLocationId: string;
}

export interface UseRxPlanningOverridesResult {
  /** Résolutions DB à fusionner dans l'espace statique (cf. `applyPlanningOverrides`). */
  overrides: CategoryPlanningOverrides;
  /** `true` pendant que des requêtes sont en vol pour les paramètres courants. */
  loading: boolean;
  /** Détail par catégorie des erreurs (règle absente en STRICT, HTTP, réseau). */
  errorsByCategory: CategoryFetchErrors;
  /** `true` si au moins une catégorie a une erreur (STRICT bloquant ou TRANSITION warning). */
  hasFetchError: boolean;
  /** Mode transmis en paramètre, renvoyé pour simplifier la consommation côté étape. */
  mode: PlanningMode;
}

const EMPTY_RESULT_FOR: (mode: PlanningMode) => UseRxPlanningOverridesResult = (mode) => ({
  overrides: {},
  loading: false,
  errorsByCategory: {},
  hasFetchError: false,
  mode,
});

/**
 * Exportée pour permettre un test unitaire ciblé (mock de `global.fetch`)
 * sans dépendre d'un environnement DOM/`@testing-library/react` — ce projet
 * exécute ses tests avec l'environnement Vitest `node`. La logique de
 * décision par mode reste, elle, entièrement dans `buildPlanningOverridesFromOutcomes`
 * (déjà pure et testée indépendamment).
 */
export async function fetchOneCategory(
  catId: string,
  categoryCode: string,
  qs: URLSearchParams,
  signal: AbortSignal
): Promise<CategoryFetchOutcome> {
  try {
    const res = await fetch(`/api/planning?${qs.toString()}`, { signal });
    if (!res.ok) {
      return { catId, resolution: null, fetchError: { kind: "HTTP", message: `HTTP ${res.status}` } };
    }
    const body = await res.json();
    if (!body?.ok || !body.resolution) {
      return {
        catId,
        resolution: null,
        fetchError: { kind: "HTTP", message: "Réponse invalide du serveur." },
      };
    }
    const resolution = body.resolution as PlanningResolution;
    if (resolution.error) {
      return { catId, resolution, fetchError: { kind: "NOT_FOUND", message: resolution.error.message } };
    }
    return { catId, resolution, fetchError: null };
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return "ABORTED";
    return {
      catId,
      resolution: null,
      fetchError: { kind: "NETWORK", message: err instanceof Error ? err.message : "Erreur réseau." },
    };
  }
}

export function useRxPlanningOverrides(params: {
  orgSlug: string;
  eventSlug: string;
  location: PlanningOverrideLocation | null;
  phase: PlanningPhase;
  categoryIds: string[];
  mode: PlanningMode;
}): UseRxPlanningOverridesResult {
  const { orgSlug, eventSlug, location, phase, mode } = params;
  // Clé stable pour éviter de re-fetcher à chaque render pour un tableau
  // recréé avec le même contenu.
  const categoryIdsKey = params.categoryIds.join(",");
  const [result, setResult] = useState<UseRxPlanningOverridesResult>(EMPTY_RESULT_FOR(mode));

  useEffect(() => {
    // DISABLED : aucun appel réseau, jamais — comportement historique garanti.
    if (mode === "DISABLED") {
      setResult(EMPTY_RESULT_FOR(mode));
      return;
    }
    if (!location || !eventSlug || !categoryIdsKey) {
      setResult(EMPTY_RESULT_FOR(mode));
      return;
    }
    const categoryIds = categoryIdsKey.split(",").filter(Boolean);
    const ctrl = new AbortController();
    setResult((prev) => ({ ...prev, loading: true, mode }));

    Promise.all(
      categoryIds.map((catId) => {
        const categoryCode = RX_CATEGORY_TO_DB_CODE[catId as RxCategoryId];
        if (!categoryCode) return Promise.resolve(null as CategoryFetchOutcome);
        const qs = new URLSearchParams({
          orgSlug,
          eventSlug,
          phase,
          exhibitorId: location.exhibitorId,
          exhibitorLocationId: location.exhibitorLocationId,
          categoryCode,
        });
        return fetchOneCategory(catId, categoryCode, qs, ctrl.signal);
      })
    ).then((outcomes) => {
      if (ctrl.signal.aborted) return;
      const { overrides, errorsByCategory, hasFetchError } = buildPlanningOverridesFromOutcomes(
        outcomes,
        mode,
        phase
      );
      setResult({ overrides, loading: false, errorsByCategory, hasFetchError, mode });
    });

    return () => {
      ctrl.abort();
    };
  }, [orgSlug, eventSlug, phase, location, categoryIdsKey, mode]);

  return result;
}
