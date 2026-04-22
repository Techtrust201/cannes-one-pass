import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { assertAccreditationAccess } from "@/lib/rbac";

/* POST - Transférer une accréditation vers une autre zone
 * Crée aussi les TimeSlots nécessaires pour tracer le déplacement dans le bilan carbone :
 *   1. Clôture le TimeSlot ouvert dans la zone de départ (exitAt)
 *   2. Crée un nouveau TimeSlot dans la zone d'arrivée (entryAt)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "LISTE", "write");
    currentUserId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;

  try {
    await assertAccreditationAccess(currentUserId!, id);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const body = await req.json();
  const { targetZone, reason, version } = body;

  // Validation dynamique de la zone
  if (!targetZone) {
    return new Response("Invalid targetZone", { status: 400 });
  }
  const validZone = await prisma.zoneConfig.findUnique({ where: { zone: targetZone } });
  if (!validZone || !validZone.isActive) {
    return new Response("Invalid targetZone", { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Lire avec vérification
      const acc = await tx.accreditation.findUnique({ where: { id } });
      if (!acc) throw new Error("NOT_FOUND");

      // 2. Optimistic lock
      if (version !== undefined && version !== null && acc.version !== version) {
        throw new Error("CONFLICT");
      }

      // 3. Vérifier le statut SORTIE
      if (acc.status !== "SORTIE") {
        throw new Error("BAD_STATUS");
      }

      // 4. Vérifier qu'on ne transfère pas vers la même zone
      if (acc.currentZone === targetZone) {
        throw new Error("SAME_ZONE");
      }

      const fromZone = acc.currentZone;

      // 5. Créer le mouvement de transfert
      await tx.zoneMovement.create({
        data: {
          accreditationId: id,
          fromZone,
          toZone: targetZone,
          action: "TRANSFER",
        },
      });

      // 5b. TimeSlots pour le bilan carbone — tracer le déplacement zone→zone
      const accWithVehicles = await tx.accreditation.findUnique({
        where: { id },
        include: { vehicles: true },
      });
      if (accWithVehicles && accWithVehicles.vehicles.length > 0) {
        const targetVehicle = accWithVehicles.vehicles[0];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const now = new Date();

        // Clôturer le TimeSlot ouvert dans l'ancienne zone
        const openSlot = await tx.vehicleTimeSlot.findFirst({
          where: {
            accreditationId: id,
            vehicleId: targetVehicle.id,
            exitAt: null,
          },
          orderBy: { stepNumber: "desc" },
        });
        if (openSlot) {
          await tx.vehicleTimeSlot.update({
            where: { id: openSlot.id },
            data: { exitAt: now },
          });
        }

        // Créer un nouveau TimeSlot dans la zone d'arrivée
        const lastSlot = await tx.vehicleTimeSlot.findFirst({
          where: {
            accreditationId: id,
            vehicleId: targetVehicle.id,
            date: today,
          },
          orderBy: { stepNumber: "desc" },
        });
        const nextStep = lastSlot ? lastSlot.stepNumber + 1 : 1;
        await tx.vehicleTimeSlot.create({
          data: {
            accreditationId: id,
            vehicleId: targetVehicle.id,
            date: today,
            stepNumber: nextStep,
            zone: targetZone,
            entryAt: now,
          },
        });
      }

      // 6. Mettre à jour l'accréditation avec incrémentation de version
      await tx.accreditation.update({
        where: { id, version: acc.version },
        data: {
          currentZone: targetZone,
          status: "ATTENTE",
          version: acc.version + 1,
        },
      });

      // 7. Historique dans la transaction
      await tx.accreditationHistory.create({
        data: {
          accreditationId: id,
          action: "ZONE_TRANSFER",
          field: "currentZone",
          oldValue: fromZone ?? undefined,
          newValue: targetZone,
          description: `Transféré de ${fromZone ?? "N/A"} vers ${targetZone}${reason ? ` - ${reason}` : ""}`,
        },
      });

      return true;
    });

    // Relire après transaction
    const updated = await prisma.accreditation.findUnique({
      where: { id },
      include: { vehicles: true },
    });

    return Response.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return new Response("Not found", { status: 404 });
      }
      if (error.message === "CONFLICT") {
        return Response.json(
          { error: "Cette accréditation a été modifiée par un autre utilisateur. Veuillez rafraîchir." },
          { status: 409 }
        );
      }
      if (error.message === "BAD_STATUS") {
        return new Response(
          "Le véhicule doit être en statut SORTIE pour être transféré",
          { status: 400 }
        );
      }
      if (error.message === "SAME_ZONE") {
        return new Response("Le véhicule est déjà dans cette zone", { status: 400 });
      }
    }
    console.error("POST /api/accreditations/[id]/transfer error:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
