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
import type { PlanningResolution } from "@/lib/logistics-planning";

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
