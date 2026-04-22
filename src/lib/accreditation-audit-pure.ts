/**
 * Fonctions pures pour l'audit-log — sans dépendance à Prisma pour faciliter
 * les tests unitaires et l'utilisation côté client si nécessaire.
 */
import type { ActorSource } from "@prisma/client";

/**
 * Compare deux objets et retourne un diff des champs modifiés uniquement.
 * Ignore les champs techniques (id, version, updatedAt).
 */
export function computeDiff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>
): { before: Partial<T>; after: Partial<T> } {
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};
  const IGNORED = new Set(["id", "version", "updatedAt", "createdAt"]);
  for (const key of Object.keys(after)) {
    if (IGNORED.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      beforeDiff[key] = before[key];
      afterDiff[key] = after[key];
    }
  }
  return { before: beforeDiff as Partial<T>, after: afterDiff as Partial<T> };
}

/**
 * Déduit la source d'écriture en fonction du contexte :
 * - Pas de userId → PUBLIC_FORM (formulaire exposant public)
 * - Rôle SUPER_ADMIN → SUPER_ADMIN
 * - Sinon → LOGISTICIEN (agent ou admin "métier")
 */
export function inferActorSource(
  userId: string | null | undefined,
  role: "SUPER_ADMIN" | "ADMIN" | "USER" | null | undefined
): ActorSource {
  if (!userId) return "PUBLIC_FORM";
  if (role === "SUPER_ADMIN") return "SUPER_ADMIN";
  return "LOGISTICIEN";
}
