import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { createVehicleReturnEntry } from "@/lib/history";
import { writeHistoryDirect } from "@/lib/history-server";

/**
 * POST /api/accreditations/[id]/return — Retour véhicule au Palais
 * Body: { zone: Zone, vehicleId?: number }
 * 
 * Crée un nouveau créneau horaire (VehicleTimeSlot) avec stepNumber incrémenté,
 * passe le statut à ENTREE, enregistre l'heure d'entrée.
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
  const body = await req.json();
  const { zone, vehicleId } = body;

  if (!zone) {
    return Response.json({ error: "La zone est requise" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const acc = await tx.accreditation.findUnique({
        where: { id },
        include: { vehicles: true },
      });

      if (!acc) throw new Error("NOT_FOUND");

      if (acc.status !== "SORTIE") {
        throw new Error("Le véhicule doit être en statut SORTIE pour effectuer un retour");
      }

      // Déterminer le véhicule cible (premier si non spécifié)
      const targetVehicle = vehicleId
        ? acc.vehicles.find((v) => v.id === vehicleId)
        : acc.vehicles[0];

      if (!targetVehicle) throw new Error("VEHICLE_NOT_FOUND");

      // Déterminer la date du jour et le prochain numéro d'étape
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingSlots = await tx.vehicleTimeSlot.findMany({
        where: {
          accreditationId: id,
          vehicleId: targetVehicle.id,
          date: today,
        },
        orderBy: { stepNumber: "desc" },
        take: 1,
      });

      const nextStep = existingSlots.length > 0 ? existingSlots[0].stepNumber + 1 : 1;
      const now = new Date();

      // Créer le nouveau créneau horaire
      const timeSlot = await tx.vehicleTimeSlot.create({
        data: {
          accreditationId: id,
          vehicleId: targetVehicle.id,
          date: today,
          stepNumber: nextStep,
          zone,
          entryAt: now,
        },
      });

      // Mettre à jour le statut de l'accréditation
      await tx.accreditation.update({
        where: { id, version: acc.version },
        data: {
          status: "ENTREE",
          entryAt: now,
          exitAt: null, // Remettre à null car le véhicule est de retour
          currentZone: zone,
          version: acc.version + 1,
        },
      });

      // Créer le mouvement de zone
      await tx.zoneMovement.create({
        data: {
          accreditationId: id,
          fromZone: acc.currentZone,
          toZone: zone,
          action: "ENTRY",
          userId: currentUserId,
        },
      });

      // Écrire l'historique
      await writeHistoryDirect(
        createVehicleReturnEntry(id, zone, nextStep, currentUserId),
        tx
      );

      return { timeSlot, stepNumber: nextStep };
    });

    return Response.json({
      success: true,
      timeSlot: result.timeSlot,
      stepNumber: result.stepNumber,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return Response.json({ error: "Accréditation non trouvée" }, { status: 404 });
      }
      if (error.message === "VEHICLE_NOT_FOUND") {
        return Response.json({ error: "Véhicule non trouvé" }, { status: 404 });
      }
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("POST /api/accreditations/[id]/return error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
