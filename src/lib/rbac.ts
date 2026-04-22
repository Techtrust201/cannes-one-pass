/**
 * Helpers RBAC pour le scoping multi-tenant par Espace/Event.
 *
 * Ces helpers s'utilisent dans les routes API qui manipulent des entités
 * métier rattachées à un Event (Accreditation, Vehicle, ZoneMovement, etc.).
 */
import type { Feature } from "@prisma/client";
import prisma from "./prisma";
import {
  getAccessibleEventIds,
  canAccessEvent,
  requirePermission,
  type AccessibleIds,
} from "./auth-helpers";

/**
 * Vérifie que l'utilisateur a accès à l'accréditation donnée (via l'event de
 * rattachement). Retourne les eventIds accessibles pour permettre un second
 * usage dans la même requête. Throw une Response si l'accès est refusé.
 */
export async function assertAccreditationAccess(
  userId: string,
  accreditationId: string
): Promise<{ accessibleEventIds: AccessibleIds; eventId: string | null }> {
  const accessibleEventIds = await getAccessibleEventIds(userId);

  if (accessibleEventIds === "ALL") {
    const acc = await prisma.accreditation.findUnique({
      where: { id: accreditationId },
      select: { eventId: true },
    });
    if (!acc) throw new Response("Not found", { status: 404 });
    return { accessibleEventIds, eventId: acc.eventId };
  }

  if (accessibleEventIds.length === 0) {
    throw new Response("Accès refusé", { status: 403 });
  }

  const acc = await prisma.accreditation.findUnique({
    where: { id: accreditationId },
    select: { eventId: true },
  });
  if (!acc) throw new Response("Not found", { status: 404 });

  if (!canAccessEvent(accessibleEventIds, acc.eventId)) {
    throw new Response("Accès refusé à cette accréditation", { status: 403 });
  }

  return { accessibleEventIds, eventId: acc.eventId };
}

/**
 * Vérifie que l'utilisateur a accès à l'event donné. Utilisé avant de lire
 * ou d'écrire des ressources directement rattachées à un event (ex: Event.logo).
 */
export async function assertEventAccess(
  userId: string,
  eventId: string
): Promise<AccessibleIds> {
  const accessibleEventIds = await getAccessibleEventIds(userId);
  if (!canAccessEvent(accessibleEventIds, eventId)) {
    throw new Response("Accès refusé à cet event", { status: 403 });
  }
  return accessibleEventIds;
}

/**
 * Vérifie l'accès à un Vehicle (par son id) via l'event de l'accréditation de
 * rattachement.
 */
export async function assertVehicleAccess(
  userId: string,
  vehicleId: number
): Promise<AccessibleIds> {
  const accessibleEventIds = await getAccessibleEventIds(userId);
  if (accessibleEventIds === "ALL") return accessibleEventIds;

  const v = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { accreditation: { select: { eventId: true } } },
  });
  if (!v) throw new Response("Not found", { status: 404 });
  if (!canAccessEvent(accessibleEventIds, v.accreditation.eventId)) {
    throw new Response("Accès refusé à ce véhicule", { status: 403 });
  }
  return accessibleEventIds;
}

/**
 * Combo fréquent : vérifier la permission + l'accès à une accréditation donnée.
 * Utile pour les sous-routes `/api/accreditations/[id]/*`.
 */
export async function requirePermissionForAccreditation(
  request: Request,
  feature: Feature,
  type: "read" | "write",
  accreditationId: string
): Promise<{ userId: string; accessibleEventIds: AccessibleIds }> {
  const session = await requirePermission(request, feature, type);
  const { accessibleEventIds } = await assertAccreditationAccess(
    session.user.id,
    accreditationId
  );
  return { userId: session.user.id, accessibleEventIds };
}
