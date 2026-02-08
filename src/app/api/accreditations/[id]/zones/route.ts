import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";

const VALID_ZONES = ["LA_BOCCA", "PALAIS_DES_FESTIVALS", "PANTIERO", "MACE"] as const;
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
  try {
    await requirePermission(req, "GESTION_ZONES", "write");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action, zone } = body;

  // Validation
  if (!action || !VALID_ACTIONS.includes(action)) {
    return new Response("Invalid action. Must be ENTRY or EXIT", { status: 400 });
  }
  if (!zone || !VALID_ZONES.includes(zone)) {
    return new Response("Invalid zone", { status: 400 });
  }

  const acc = await prisma.accreditation.findUnique({ where: { id } });
  if (!acc) return new Response("Not found", { status: 404 });

  // Créer le mouvement
  const movement = await prisma.zoneMovement.create({
    data: {
      accreditationId: id,
      fromZone: acc.currentZone,
      toZone: zone,
      action,
    },
  });

  // Mettre à jour la zone courante et le statut
  const updates: Record<string, unknown> = { currentZone: zone };
  if (action === "ENTRY") {
    updates.status = "ENTREE";
    if (!acc.entryAt) updates.entryAt = new Date();
  } else if (action === "EXIT") {
    updates.status = "SORTIE";
    updates.exitAt = new Date();
  }

  await prisma.accreditation.update({
    where: { id },
    data: updates,
  });

  // Historique
  await prisma.accreditationHistory.create({
    data: {
      accreditationId: id,
      action: "ZONE_CHANGED",
      field: "currentZone",
      oldValue: acc.currentZone ?? undefined,
      newValue: zone,
      description: `${action === "ENTRY" ? "Entrée" : "Sortie"} zone ${zone}`,
    },
  });

  return Response.json(movement, { status: 201 });
}
