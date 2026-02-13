import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";

// Zones validées dynamiquement via la table ZoneConfig
const VALID_ACTIONS = ["ENTRY", "EXIT"] as const;

/* GET - Historique des mouvements de zone */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(_req, "GESTION_ZONES", "read");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const movements = await prisma.zoneMovement.findMany({
    where: { accreditationId: id },
    orderBy: { timestamp: "asc" },
  });
  return Response.json(movements);
}

/* POST - Enregistrer un mouvement de zone (entrée/sortie) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "GESTION_ZONES", "write");
    currentUserId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action, zone, version } = body;

  // Validation
  if (!action || !VALID_ACTIONS.includes(action)) {
    return new Response("Invalid action. Must be ENTRY or EXIT", { status: 400 });
  }
  if (!zone) {
    return new Response("Invalid zone", { status: 400 });
  }
  const validZone = await prisma.zoneConfig.findUnique({ where: { zone } });
  if (!validZone || !validZone.isActive) {
    return new Response("Invalid zone", { status: 400 });
  }

  try {
    const movement = await prisma.$transaction(async (tx) => {
      // 1. Lire l'accréditation AVEC les véhicules (nécessaire pour les time slots)
      const acc = await tx.accreditation.findUnique({
        where: { id },
        include: { vehicles: true },
      });
      if (!acc) throw new Error("NOT_FOUND");

      // 2. Optimistic lock
      if (version !== undefined && version !== null && acc.version !== version) {
        throw new Error("CONFLICT");
      }

      // 3. Créer le mouvement
      const mov = await tx.zoneMovement.create({
        data: {
          accreditationId: id,
          fromZone: acc.currentZone,
          toZone: zone,
          action,
        },
      });

      // 4. Mettre à jour la zone courante et le statut
      const updates: Record<string, unknown> = {
        currentZone: zone,
        version: acc.version + 1,
      };
      if (action === "ENTRY") {
        updates.status = "ENTREE";
        if (!acc.entryAt) updates.entryAt = new Date();
      } else if (action === "EXIT") {
        updates.status = "SORTIE";
        updates.exitAt = new Date();
      }

      await tx.accreditation.update({
        where: { id, version: acc.version },
        data: updates,
      });

      // 5. Gérer les VehicleTimeSlot (créneaux horaires)
      if (acc.vehicles.length > 0) {
        const targetVehicle = acc.vehicles[0];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (action === "ENTRY") {
          // Vérifier s'il n'y a pas déjà un time slot ouvert pour aujourd'hui
          const openSlot = await tx.vehicleTimeSlot.findFirst({
            where: {
              accreditationId: id,
              vehicleId: targetVehicle.id,
              date: today,
              exitAt: null,
            },
          });

          if (!openSlot) {
            // Déterminer le prochain numéro d'étape pour aujourd'hui
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
                zone,
                entryAt: new Date(),
              },
            });
          }
        } else if (action === "EXIT") {
          // Clôturer le time slot ouvert le plus récent
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
              data: { exitAt: new Date() },
            });
          }
        }
      }

      // 6. Label lisible de la zone (dynamique depuis ZoneConfig)
      const zoneLabel = validZone.label || zone;

      // 7. Historique dans la transaction
      await tx.accreditationHistory.create({
        data: {
          accreditationId: id,
          action: "ZONE_CHANGED",
          field: "currentZone",
          oldValue: acc.currentZone ?? undefined,
          newValue: zone,
          description: action === "ENTRY"
            ? `Entrée en zone ${zoneLabel}`
            : `Sortie de la zone ${zoneLabel}`,
          userId: currentUserId,
        },
      });

      return mov;
    });

    return Response.json(movement, { status: 201 });
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
    }
    console.error("POST /api/accreditations/[id]/zones error:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
