import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";

/**
 * PATCH /api/vehicle-types/[id] — Modifier un gabarit
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(req, "FLUX_VEHICULES", "write");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (Number.isNaN(numericId)) {
    return Response.json({ error: "ID invalide" }, { status: 400 });
  }

  try {
    const existing = await prisma.vehicleTypeConfig.findUnique({
      where: { id: numericId },
    });
    if (!existing) {
      return Response.json({ error: "Gabarit non trouvé" }, { status: 404 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.code !== undefined) {
      const newCode = String(body.code).trim();
      if (!newCode) {
        return Response.json({ error: "Le code ne peut pas être vide" }, { status: 400 });
      }
      if (newCode !== existing.code) {
        const inUse = await prisma.vehicle.count({
          where: { vehicleType: existing.code },
        });
        if (inUse > 0) {
          return Response.json(
            { error: "Impossible de renommer : des véhicules utilisent encore ce gabarit" },
            { status: 409 }
          );
        }
        const duplicate = await prisma.vehicleTypeConfig.findFirst({
          where: { code: newCode, organizationId: existing.organizationId ?? null },
        });
        if (duplicate && duplicate.id !== numericId) {
          return Response.json({ error: "Ce code existe déjà" }, { status: 409 });
        }
      }
      updates.code = newCode;
    }
    if (body.label !== undefined) updates.label = String(body.label).trim();
    if (body.gabarit !== undefined) {
      updates.gabarit = String(body.gabarit).trim();
      if (body.label === undefined) {
        updates.label = updates.gabarit;
      }
    }
    if (body.tonnageMini !== undefined) updates.tonnageMini = Number(body.tonnageMini);
    if (body.tonnageMoyen !== undefined) updates.tonnageMoyen = Number(body.tonnageMoyen);
    if (body.tonnageMaxi !== undefined) updates.tonnageMaxi = Number(body.tonnageMaxi);
    if (body.co2Coefficient !== undefined) updates.co2Coefficient = Number(body.co2Coefficient);
    if (body.pdfCode !== undefined) updates.pdfCode = String(body.pdfCode);
    if (body.color !== undefined) updates.color = String(body.color);
    if (body.showTrailerPlate !== undefined) updates.showTrailerPlate = Boolean(body.showTrailerPlate);
    if (body.rxPalmBeachAtCanto !== undefined) {
      updates.rxPalmBeachAtCanto = Boolean(body.rxPalmBeachAtCanto);
    }
    if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder);
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

    const updated = await prisma.vehicleTypeConfig.update({
      where: { id: numericId },
      data: updates,
    });

    return Response.json(updated);
  } catch (error) {
    console.error("PATCH /api/vehicle-types/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * DELETE /api/vehicle-types/[id] — Soft delete
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(req, "FLUX_VEHICULES", "write");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (Number.isNaN(numericId)) {
    return Response.json({ error: "ID invalide" }, { status: 400 });
  }

  try {
    const existing = await prisma.vehicleTypeConfig.findUnique({
      where: { id: numericId },
    });
    if (!existing) {
      return Response.json({ error: "Gabarit non trouvé" }, { status: 404 });
    }

    await prisma.vehicleTypeConfig.update({
      where: { id: numericId },
      data: { isActive: false },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/vehicle-types/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
