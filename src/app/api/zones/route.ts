import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";

/**
 * GET /api/zones — Lister toutes les zones avec coordonnées
 * Authentifié avec permission GESTION_ZONES en lecture
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "GESTION_ZONES", "read");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  try {
    const zones = await prisma.zoneConfig.findMany({
      orderBy: { label: "asc" },
    });
    return Response.json(zones);
  } catch (error) {
    console.error("GET /api/zones error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/zones — Créer une nouvelle zone
 * Authentifié avec permission GESTION_ZONES en écriture
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "GESTION_ZONES", "write");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  try {
    const body = await req.json();
    const { zone, label, address, latitude, longitude } = body;

    if (!zone || !label || !address || latitude == null || longitude == null) {
      return Response.json(
        { error: "Tous les champs sont requis : zone, label, address, latitude, longitude" },
        { status: 400 }
      );
    }

    // Vérifier que la zone n'existe pas déjà
    const existing = await prisma.zoneConfig.findUnique({ where: { zone } });
    if (existing) {
      return Response.json(
        { error: "Cette zone existe déjà" },
        { status: 409 }
      );
    }

    const created = await prisma.zoneConfig.create({
      data: {
        zone,
        label,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/zones error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
