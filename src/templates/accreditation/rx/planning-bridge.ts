/**
 * Pont pur entre le planning statique legacy (`planning-data.ts` /
 * `RX_SPACES`) et le planning en base (`LogisticsPlanning`, Phase 6).
 *
 * Aucun accès réseau ici : ce module ne fait que fusionner des données déjà
 * chargées. Le principe de sécurité comportementale est le suivant :
 *
 *   - en mode `DISABLED` (défaut sur tous les événements existants), l'appel
 *     à l'API `/api/planning` renvoie `source: "NONE"` et AUCUNE fusion n'a
 *     lieu ⇒ le formulaire se comporte EXACTEMENT comme avant cette phase ;
 *   - en `TRANSITION`/`STRICT`, seules les résolutions `source === "DB"`
 *     remplacent les plages legacy (`liv`/`rep`) d'une catégorie donnée ;
 *     une résolution `NONE`/`LEGACY` renvoyée par l'API est ignorée ici, on
 *     garde alors la donnée statique locale déjà chargée (identique à RX
 *     absent en base ⇒ fallback `planning-data.ts`) ;
 *   - une résolution en erreur (`STRICT` sans règle) retire la catégorie de
 *     l'espace effectif (elle n'est alors plus proposée au public, jamais
 *     sélectionnable, jamais soumise avec un créneau inventé).
 */

import type { DateTimeSlots, RxCategoryId } from "./planning-data";
import type { RxSpaceDef, RxCategory } from "./config";
import type { PlanningPhase, PlanningMode, PlanningResolution } from "@/lib/logistics-planning";

/**
 * Correspondance entre l'identifiant de catégorie legacy (kebab-case, utilisé
 * par `config.ts`/`planning-data.ts`) et le `categoryCode` canonique stocké
 * dans `LogisticsPlanning` (aligné sur `planning-rx-adapter.ts`).
 */
export const RX_CATEGORY_TO_DB_CODE: Record<RxCategoryId, string> = {
  "ponton-privatif": "PONTON_PRIVATIF",
  "stand-tente": "TERRE",
  "bateau-terre": "BATEAUX_A_TERRE",
};

export type RxPlanningPhaseKey = "liv" | "rep";

/** Résultat de résolution par catégorie, pour une phase donnée (MONTAGE ou DEMONTAGE). */
export type CategoryPlanningOverrides = Partial<Record<string, PlanningResolution>>;

/**
 * Fusionne les résolutions DB dans une copie de l'espace RX. Ne modifie
 * jamais l'objet source (`RX_SPACES` reste la référence legacy intacte).
 *
 * - `overrides[cat.id]?.source === "DB"` → remplace `cat[phaseKey]` par la
 *   résolution DB (créneaux réels importés) ;
 * - `overrides[cat.id]?.error` (STRICT sans règle) → vide `cat[phaseKey]`
 *   (la catégorie disparaît des choix proposés, comme si elle n'avait pas
 *   de plage — comportement déjà géré par les filtres existants) ;
 * - sinon (pas d'override, ou source LEGACY/EVENT_FALLBACK/NONE sans erreur)
 *   → conserve la donnée statique locale telle quelle.
 */
export function applyPlanningOverrides(
  space: RxSpaceDef | null,
  overrides: CategoryPlanningOverrides,
  phaseKey: RxPlanningPhaseKey
): RxSpaceDef | null {
  if (!space) return null;
  const hasAnyOverride = Object.keys(overrides).length > 0;
  if (!hasAnyOverride) return space;

  return {
    ...space,
    categories: space.categories.map((cat) => {
      const resolution = overrides[cat.id];
      if (!resolution) return cat;
      if (resolution.error) {
        return { ...cat, [phaseKey]: {} as DateTimeSlots };
      }
      if (resolution.source === "DB") {
        return { ...cat, [phaseKey]: resolution.slots as DateTimeSlots };
      }
      return cat;
    }),
  };
}

/** Variante de `findCategory` (config.ts) opérant sur un espace déjà résolu/fusionné, sans dépendre du registre global `RX_SPACES`. */
export function findCategoryIn(space: RxSpaceDef | null, categoryId: string): RxCategory | null {
  if (!space) return null;
  return space.categories.find((c) => c.id === categoryId) ?? null;
}

/**
 * Phase 6C-A (F5/F6) — Indique si une catégorie a reçu une résolution en
 * erreur (règle absente confirmée par le serveur ou échec HTTP/réseau en
 * STRICT, cf. `useRxPlanningOverrides`). Utilisé par les étapes
 * Livraison/Reprise pour désactiver la validation et afficher un message
 * traduit tant que la catégorie sélectionnée n'est pas résolue — jamais pour
 * la faire disparaître silencieusement.
 */
export function categoryHasBlockingPlanningError(
  overrides: CategoryPlanningOverrides,
  categoryId: string
): boolean {
  return Boolean(overrides[categoryId]?.error);
}

// ────────────────────────────────────────────────────────────────────────
// Phase 6C-A — Décision pure par catégorie, extraite de
// `useRxPlanningOverrides` pour rester testable sans dépendance React.
// ────────────────────────────────────────────────────────────────────────

export type CategoryFetchErrorKind = "NOT_FOUND" | "HTTP" | "NETWORK";

export interface CategoryFetchError {
  kind: CategoryFetchErrorKind;
  message: string;
}

export type CategoryFetchErrors = Partial<Record<string, CategoryFetchError>>;

/** Résultat brut d'une tentative de résolution réseau pour une catégorie (ou `null` si le code DB est inconnu, ou `"ABORTED"` si la requête a été annulée). */
export type CategoryFetchOutcome =
  | {
      catId: string;
      resolution: PlanningResolution | null;
      fetchError: CategoryFetchError | null;
    }
  | null
  | "ABORTED";

export interface BuildPlanningOverridesResult {
  overrides: CategoryPlanningOverrides;
  errorsByCategory: CategoryFetchErrors;
  hasFetchError: boolean;
}

/** Résolution synthétique construite pour un échec HTTP/réseau local (jamais renvoyée par le serveur). */
function syntheticErrorResolution(phase: PlanningPhase, message: string): PlanningResolution {
  return {
    source: "NONE",
    mode: "STRICT",
    phase,
    categoryCode: "",
    scope: null,
    scopeKey: null,
    slots: {},
    rule: null,
    error: { code: "PLANNING_NOT_FOUND", message },
  };
}

/**
 * Construit `overrides`/`errorsByCategory`/`hasFetchError` à partir des
 * résultats bruts de résolution par catégorie (Phase 6C-A / F3).
 *
 * Comportement par mode (D1), STRICTEMENT symétrique à `resolvePlanning` :
 *   - `TRANSITION` : une règle absente confirmée par le serveur retombe
 *     silencieusement sur le legacy (rien inséré dans `overrides`) ; une
 *     erreur HTTP/réseau retombe aussi sur le legacy, mais avec un warning
 *     non bloquant (`hasFetchError=true`, pas d'entrée `overrides`) ;
 *   - `STRICT` : dans TOUS les cas d'erreur (règle absente confirmée OU
 *     échec HTTP/réseau local), la catégorie reçoit une résolution en
 *     erreur dans `overrides` — `applyPlanningOverrides` vide alors ses
 *     créneaux plutôt que de conserver silencieusement le legacy.
 *
 * Fonction pure : aucune dépendance React, aucun accès réseau.
 */
export function buildPlanningOverridesFromOutcomes(
  outcomes: CategoryFetchOutcome[],
  mode: PlanningMode,
  phase: PlanningPhase
): BuildPlanningOverridesResult {
  const overrides: CategoryPlanningOverrides = {};
  const errorsByCategory: CategoryFetchErrors = {};
  let hasFetchError = false;

  for (const entry of outcomes) {
    if (!entry || entry === "ABORTED") continue;
    const { catId, resolution, fetchError } = entry;

    if (resolution && !resolution.error) {
      if (resolution.source === "DB") overrides[catId] = resolution;
      continue;
    }

    if (mode === "STRICT") {
      hasFetchError = true;
      if (fetchError) errorsByCategory[catId] = fetchError;
      overrides[catId] =
        resolution ?? syntheticErrorResolution(phase, fetchError?.message ?? "Erreur de résolution.");
    } else {
      if (fetchError && fetchError.kind !== "NOT_FOUND") {
        hasFetchError = true;
        errorsByCategory[catId] = fetchError;
      }
      // TRANSITION : ne jamais insérer dans `overrides` — `applyPlanningOverrides`
      // conserve alors la donnée statique locale (legacy) intacte.
    }
  }

  return { overrides, errorsByCategory, hasFetchError };
}
