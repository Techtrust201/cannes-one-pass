import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";

/**
 * GET /api/zones/[id] — Récupérer une zone par ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(req, "GESTION_ZONES", "read");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;

  try {
    const zone = await prisma.zoneConfig.findUnique({
      where: { id: Number(id) },
    });
    if (!zone) {
      return Response.json({ error: "Zone non trouvée" }, { status: 404 });
    }
    return Response.json(zone);
  } catch (error) {
    console.error("GET /api/zones/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * PATCH /api/zones/[id] — Modifier une zone
 */
export async function PATCH(
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
  const { label, address, latitude, longitude, isActive } = body;

  try {
    const existing = await prisma.zoneConfig.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) {
      return Response.json({ error: "Zone non trouvée" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label;
    if (address !== undefined) updates.address = address;
    if (latitude !== undefined) updates.latitude = parseFloat(latitude);
    if (longitude !== undefined) updates.longitude = parseFloat(longitude);
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const updated = await prisma.zoneConfig.update({
      where: { id: Number(id) },
      data: updates,
    });

    return Response.json(updated);
  } catch (error) {
    console.error("PATCH /api/zones/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * DELETE /api/zones/[id] — Désactiver une zone (soft delete)
 */
export async function DELETE(
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

  try {
    const existing = await prisma.zoneConfig.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) {
      return Response.json({ error: "Zone non trouvée" }, { status: 404 });
    }

    // Soft delete
    await prisma.zoneConfig.update({
      where: { id: Number(id) },
      data: { isActive: false },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/zones/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
