import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

const DEFAULT_ZONES = [
  {
    zone: "LA_BOCCA",
    label: "La Bocca",
    address: "Zone de stockage La Bocca, Cannes",
    latitude: 43.5519,
    longitude: 6.9629,
    isFinalDestination: false,
    color: "orange",
  },
  {
    zone: "PALAIS_DES_FESTIVALS",
    label: "Palais des Festivals",
    address: "1 Bd de la Croisette, 06400 Cannes",
    latitude: 43.5506,
    longitude: 7.0175,
    isFinalDestination: true,
    color: "green",
  },
  {
    zone: "PANTIERO",
    label: "Pantiero",
    address: "Prom. de la Pantiero, 06400 Cannes",
    latitude: 43.5509,
    longitude: 7.0140,
    isFinalDestination: false,
    color: "blue",
  },
  {
    zone: "MACE",
    label: "Macé",
    address: "Plage Macé, Bd de la Croisette, 06400 Cannes",
    latitude: 43.5503,
    longitude: 7.0223,
    isFinalDestination: false,
    color: "purple",
  },
];

/**
 * POST /api/zones/seed — Initialise les zones par défaut
 * Réservé aux SUPER_ADMIN. Idempotent (upsert).
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(req, "SUPER_ADMIN");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  try {
    const results = await prisma.$transaction(
      DEFAULT_ZONES.map((z) =>
        prisma.zoneConfig.upsert({
          where: { zone: z.zone },
          update: {
            label: z.label,
            address: z.address,
            latitude: z.latitude,
            longitude: z.longitude,
            isFinalDestination: z.isFinalDestination,
            color: z.color,
          },
          create: z,
        })
      )
    );

    return Response.json({ success: true, zones: results });
  } catch (error) {
    console.error("POST /api/zones/seed error:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
