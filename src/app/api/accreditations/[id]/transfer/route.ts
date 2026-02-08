import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

const VALID_ZONES = ["LA_BOCCA", "PALAIS_DES_FESTIVALS", "PANTIERO", "MACE"] as const;

/* POST - Transférer une accréditation vers une autre zone */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { targetZone, reason } = body;

  // Validation
  if (!targetZone || !VALID_ZONES.includes(targetZone)) {
    return new Response("Invalid targetZone", { status: 400 });
  }

  const acc = await prisma.accreditation.findUnique({ where: { id } });
  if (!acc) return new Response("Not found", { status: 404 });

  // Vérifier que le véhicule est en SORTIE pour pouvoir être transféré
  if (acc.status !== "SORTIE") {
    return new Response(
      "Le véhicule doit être en statut SORTIE pour être transféré",
      { status: 400 }
    );
  }

  // Vérifier qu'on ne transfère pas vers la même zone
  if (acc.currentZone === targetZone) {
    return new Response("Le véhicule est déjà dans cette zone", { status: 400 });
  }

  const fromZone = acc.currentZone;

  // Créer le mouvement de transfert
  await prisma.zoneMovement.create({
    data: {
      accreditationId: id,
      fromZone,
      toZone: targetZone,
      action: "TRANSFER",
    },
  });

  // Mettre à jour l'accréditation
  await prisma.accreditation.update({
    where: { id },
    data: {
      currentZone: targetZone,
      status: "ATTENTE",
    },
  });

  // Historique
  await prisma.accreditationHistory.create({
    data: {
      accreditationId: id,
      action: "ZONE_TRANSFER",
      field: "currentZone",
      oldValue: fromZone ?? undefined,
      newValue: targetZone,
      description: `Transféré de ${fromZone ?? "N/A"} vers ${targetZone}${reason ? ` - ${reason}` : ""}`,
    },
  });

  const updated = await prisma.accreditation.findUnique({
    where: { id },
    include: { vehicles: true },
  });

  return Response.json(updated);
}
