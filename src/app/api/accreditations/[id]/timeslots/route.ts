import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";

/**
 * GET /api/accreditations/[id]/timeslots — Lister les créneaux horaires par jour
 * Retourne les time slots groupés par date, triés par stepNumber.
 */
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
    const grouped: Record<string, {
      date: string;
      slots: {
        id: number;
        stepNumber: number;
        zone: string;
        entryAt: string;
        exitAt: string | null;
        duration: number | null; // en minutes
        vehiclePlate: string;
        vehicleSize: string;
      }[];
      totalMinutes: number;
    }> = {};

    for (const ts of timeSlots) {
      const dateKey = ts.date.toISOString().split("T")[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = { date: dateKey, slots: [], totalMinutes: 0 };
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

    return Response.json({
      days: Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date)),
    });
  } catch (error) {
    console.error("GET /api/accreditations/[id]/timeslots error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
