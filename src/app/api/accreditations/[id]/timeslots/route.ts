import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";

/**
 * GET /api/accreditations/[id]/timeslots — Lister les créneaux horaires par jour
 * Retourne les time slots groupés par date, triés par stepNumber,
 * avec les données de transfert entre les étapes consécutives.
 */

interface SlotResponse {
  id: number;
  stepNumber: number;
  zone: string;
  entryAt: string;
  exitAt: string | null;
  duration: number | null; // en minutes
  vehiclePlate: string;
  vehicleSize: string;
}

interface TransferResponse {
  fromZone: string;
  toZone: string;
  departureAt: string;     // Heure de sortie du site précédent
  arrivalAt: string;       // Heure d'entrée sur le site suivant
  transitMinutes: number;  // Temps de trajet calculé
}

interface DayGroupResponse {
  date: string;
  slots: SlotResponse[];
  transfers: TransferResponse[];  // Transferts entre étapes consécutives
  totalMinutes: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(req, "LISTE", "read");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;

  try {
    const timeSlots = await prisma.vehicleTimeSlot.findMany({
      where: { accreditationId: id },
      orderBy: [{ date: "desc" }, { stepNumber: "asc" }],
      include: {
        vehicle: {
          select: { plate: true, size: true },
        },
      },
    });

    // Grouper par date
    const grouped: Record<string, DayGroupResponse> = {};

    for (const ts of timeSlots) {
      const dateKey = ts.date.toISOString().split("T")[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = { date: dateKey, slots: [], transfers: [], totalMinutes: 0 };
      }

      let duration: number | null = null;
      if (ts.exitAt) {
        duration = Math.round((ts.exitAt.getTime() - ts.entryAt.getTime()) / 60000);
        grouped[dateKey].totalMinutes += duration;
      }

      grouped[dateKey].slots.push({
        id: ts.id,
        stepNumber: ts.stepNumber,
        zone: ts.zone,
        entryAt: ts.entryAt.toISOString(),
        exitAt: ts.exitAt ? ts.exitAt.toISOString() : null,
        duration,
        vehiclePlate: ts.vehicle.plate,
        vehicleSize: ts.vehicle.size,
      });
    }

    // Calculer les transferts entre étapes consécutives pour chaque jour
    for (const day of Object.values(grouped)) {
      // Les slots sont triés par stepNumber (asc)
      for (let i = 0; i < day.slots.length - 1; i++) {
        const current = day.slots[i];
        const next = day.slots[i + 1];

        // Un transfert existe si l'étape courante a une heure de sortie
        // et l'étape suivante a une heure d'entrée
        if (current.exitAt && next.entryAt) {
          const departureAt = current.exitAt;
          const arrivalAt = next.entryAt;
          const transitMs = new Date(arrivalAt).getTime() - new Date(departureAt).getTime();
          const transitMinutes = Math.max(0, Math.round(transitMs / 60000));

          day.transfers.push({
            fromZone: current.zone,
            toZone: next.zone,
            departureAt,
            arrivalAt,
            transitMinutes,
          });
        } else if (current.exitAt && !next.entryAt) {
          // Le véhicule est en transit (sorti du site précédent, pas encore arrivé au suivant)
          // Cas théorique — si le next slot existe, il a forcément une entryAt
          day.transfers.push({
            fromZone: current.zone,
            toZone: next.zone,
            departureAt: current.exitAt,
            arrivalAt: next.entryAt,
            transitMinutes: 0,
          });
        }
      }
    }

    const days = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
    const grandTotalMinutes = days.reduce((sum, d) => sum + d.totalMinutes, 0);

    return Response.json({
      days,
      grandTotalMinutes,
    });
  } catch (error) {
    console.error("GET /api/accreditations/[id]/timeslots error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
