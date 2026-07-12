import type { AccessibleIds } from "./auth-helpers";

/**
 * Utilitaire pur : renvoie true si l'utilisateur a accès à l'organisation donnée.
 * Centralise le contrôle `accessibleOrgIds !== "ALL" && !includes(orgId)`
 * dupliqué dans plusieurs routes (miroir de `canAccessEvent`).
 *
 * Placé dans un module sans dépendance runtime (import de type uniquement) afin
 * d'être testable sans charger `prisma`/`auth`.
 *
 * "ALL" = SUPER_ADMIN. Un id d'organisation vide/absent est refusé (sauf "ALL").
 */
export function canAccessOrganization(
  accessibleOrgIds: AccessibleIds,
  organizationId: string | null | undefined
): boolean {
  if (accessibleOrgIds === "ALL") return true;
  if (!organizationId) return false;
  return accessibleOrgIds.includes(organizationId);
}
