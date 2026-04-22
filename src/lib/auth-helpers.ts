import { auth } from "./auth";
import { prisma } from "./prisma";
import type { Feature, UserRole } from "@prisma/client";

/**
 * Récupère la session courante depuis les headers de la requête.
 */
export async function getSession(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  return session;
}

/**
 * Vérifie que l'utilisateur est authentifié et retourne la session.
 * Throw une Response 401 si non authentifié.
 */
export async function requireAuth(request: Request) {
  const session = await getSession(request);
  if (!session) {
    throw new Response("Non authentifié", { status: 401 });
  }

  // Vérifier que le compte est actif
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, role: true },
  });

  if (!user || !user.isActive) {
    throw new Response("Compte désactivé", { status: 403 });
  }

  return { session, role: user.role };
}

/**
 * Vérifie que l'utilisateur a le rôle requis.
 * Throw une Response 403 si le rôle est insuffisant.
 */
export async function requireRole(
  request: Request,
  requiredRole: UserRole
) {
  const { session, role } = await requireAuth(request);

  const roleHierarchy: Record<UserRole, number> = {
    USER: 0,
    ADMIN: 1,
    SUPER_ADMIN: 2,
  };

  if (roleHierarchy[role] < roleHierarchy[requiredRole]) {
    throw new Response("Accès insuffisant", { status: 403 });
  }

  return { session, role };
}

/**
 * Vérifie si un utilisateur a une permission spécifique.
 * Les SUPER_ADMIN ont toujours accès à tout.
 */
export async function hasPermission(
  userId: string,
  feature: Feature,
  type: "read" | "write" = "read"
): Promise<boolean> {
  // Vérifier le rôle
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });

  if (!user || !user.isActive) return false;

  // Super admin a tous les accès
  if (user.role === "SUPER_ADMIN") return true;

  // Chercher la permission spécifique
  const permission = await prisma.userPermission.findUnique({
    where: {
      userId_feature: {
        userId,
        feature,
      },
    },
  });

  if (!permission) return false;

  return type === "read" ? permission.canRead : permission.canWrite;
}

/**
 * Vérifie une permission et throw 403 si refusée.
 */
export async function requirePermission(
  request: Request,
  feature: Feature,
  type: "read" | "write" = "read"
) {
  const { session } = await requireAuth(request);

  const allowed = await hasPermission(session.user.id, feature, type);
  if (!allowed) {
    throw new Response(
      `Accès refusé à la fonctionnalité ${feature}`,
      { status: 403 }
    );
  }

  return session;
}

// ============================================================
// Multi-tenant — Scoping des events par Espace (Organization)
// ============================================================

/** Valeur spéciale renvoyée par les helpers quand l'utilisateur a accès à tout
 * (typiquement un SUPER_ADMIN). Les appelants doivent skip le filtre
 * `where: { eventId: { in: ... } }` dans ce cas. */
export type AccessibleIds = string[] | "ALL";

/** Utilitaire : renvoie true si l'utilisateur a accès à l'event donné. */
export function canAccessEvent(accessibleEventIds: AccessibleIds, eventId: string | null | undefined): boolean {
  if (accessibleEventIds === "ALL") return true;
  if (!eventId) return false;
  return accessibleEventIds.includes(eventId);
}

/**
 * Retourne la liste des eventIds auxquels l'utilisateur a accès.
 * - Un SUPER_ADMIN a accès à tout → "ALL".
 * - Sinon : union des events rattachés à ses Espaces + ses grants UserEvent.
 */
export async function getAccessibleEventIds(userId: string): Promise<AccessibleIds> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isActive: true,
      organizations: {
        select: {
          organization: {
            select: {
              events: { select: { id: true } },
            },
          },
        },
      },
      eventGrants: { select: { eventId: true } },
    },
  });

  if (!user || !user.isActive) return [];
  if (user.role === "SUPER_ADMIN") return "ALL";

  const fromOrgs = user.organizations.flatMap((link) =>
    link.organization.events.map((e) => e.id)
  );
  const fromGrants = user.eventGrants.map((g) => g.eventId);
  return Array.from(new Set([...fromOrgs, ...fromGrants]));
}

/**
 * Retourne la liste des organizationIds auxquels l'utilisateur a accès en
 * lecture. Un SUPER_ADMIN a accès à toutes les Organisations.
 */
export async function getAccessibleOrganizationIds(userId: string): Promise<AccessibleIds> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isActive: true,
      organizations: { select: { organizationId: true } },
    },
  });
  if (!user || !user.isActive) return [];
  if (user.role === "SUPER_ADMIN") return "ALL";
  return user.organizations.map((o) => o.organizationId);
}

/**
 * Version pratique : exige une auth active et retourne aussi les eventIds
 * accessibles. Combine `requireAuth` + `getAccessibleEventIds`.
 */
export async function requireAuthWithEvents(request: Request) {
  const { session, role } = await requireAuth(request);
  const accessibleEventIds = await getAccessibleEventIds(session.user.id);
  return { session, role, accessibleEventIds };
}

/**
 * Récupère toutes les permissions d'un utilisateur.
 */
export async function getUserPermissions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });

  if (!user || !user.isActive) return [];

  // Super admin a toutes les permissions
  if (user.role === "SUPER_ADMIN") {
    const allFeatures: Feature[] = [
      "LISTE",
      "CREER",
      "PLAQUE",
      "QR_CODE",
      "FLUX_VEHICULES",
      "BILAN_CARBONE",
      "GESTION_ZONES",
      "GESTION_DATES",
      "ARCHIVES",
      "GESTION_ESPACES",
    ];
    return allFeatures.map((feature) => ({
      feature,
      canRead: true,
      canWrite: true,
    }));
  }

  const permissions = await prisma.userPermission.findMany({
    where: { userId },
    select: { feature: true, canRead: true, canWrite: true },
  });

  return permissions;
}
