import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

/* GET - Calculer le temps passé par zone pour une accréditation */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const filterZone = searchParams.get("zone");

  const movements = await prisma.zoneMovement.findMany({
    where: { accreditationId: id },
    orderBy: { timestamp: "asc" },
  });

  if (movements.length === 0) {
    return Response.json({});
  }

  // Calculer le temps par zone
  const timeByZone: Record<string, number> = {};
  const now = new Date();

  for (let i = 0; i < movements.length; i++) {
    const movement = movements[i];
    const zone = movement.toZone;
    const entryTime = movement.timestamp;

    // Trouver le prochain mouvement qui quitte cette zone
    let exitTime: Date = now; // Par défaut, maintenant (toujours en zone)
    for (let j = i + 1; j < movements.length; j++) {
      if (movements[j].fromZone === zone || movements[j].action === "TRANSFER") {
        exitTime = movements[j].timestamp;
        break;
      }
    }

    const duration = exitTime.getTime() - entryTime.getTime();
    if (duration > 0) {
      timeByZone[zone] = (timeByZone[zone] || 0) + duration;
    }
  }

  // Filtrer par zone si demandé
  if (filterZone && timeByZone[filterZone] !== undefined) {
    return Response.json({ [filterZone]: timeByZone[filterZone] });
  }

  return Response.json(timeByZone);
}
