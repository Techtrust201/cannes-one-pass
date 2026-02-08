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
