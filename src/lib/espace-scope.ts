import type { AccessibleIds } from "./auth-helpers";

/**
 * Calcul pur (sans accès DB) de l'intersection entre le périmètre de base
 * d'un utilisateur et les events d'un Espace donné.
 *
 * - `baseIds` : périmètre de base (`ALL` pour super-admin, sinon liste).
 * - `orgEventIds` : events rattachés à l'Espace cible (null si espace inconnu).
 *
 * Règles :
 *   - orgEventIds === null  → [] (slug inconnu)
 *   - baseIds === "ALL"     → tous les events de l'org
 *   - sinon                 → intersection
 */
export function intersectEventIds(
  baseIds: AccessibleIds,
  orgEventIds: string[] | null
): AccessibleIds {
  if (orgEventIds === null) return [];
  if (baseIds === "ALL") return orgEventIds;
  const set = new Set(baseIds);
  return orgEventIds.filter((id) => set.has(id));
}
