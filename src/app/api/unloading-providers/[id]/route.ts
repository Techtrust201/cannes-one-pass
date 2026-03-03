import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";

/**
 * PATCH /api/unloading-providers/[id] — Modifier un prestataire (nom, isActive)
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
  const body = await req.json();
  const { name, isActive } = body;

  try {
    const existing = await prisma.unloadingProvider.findUnique({
      where: { id },
    });
    if (!existing) {
      return Response.json({ error: "Prestataire non trouvé" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return Response.json({ error: "Le nom ne peut pas être vide" }, { status: 400 });
      }
      const duplicate = await prisma.unloadingProvider.findFirst({
        where: { name: trimmedName, id: { not: id } },
      });
      if (duplicate) {
        return Response.json({ error: "Ce nom existe déjà" }, { status: 409 });
      }
      updates.name = trimmedName;
    }
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const updated = await prisma.unloadingProvider.update({
      where: { id },
      data: updates,
    });

    return Response.json(updated);
  } catch (error) {
    console.error("PATCH /api/unloading-providers/[id] error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "Erreur serveur", detail: message }, { status: 500 });
  }
}

/**
 * DELETE /api/unloading-providers/[id] — Désactiver un prestataire (soft delete)
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

  try {
    const existing = await prisma.unloadingProvider.findUnique({
      where: { id },
    });
    if (!existing) {
      return Response.json({ error: "Prestataire non trouvé" }, { status: 404 });
    }

    await prisma.unloadingProvider.update({
      where: { id },
      data: { isActive: false },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/unloading-providers/[id] error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "Erreur serveur", detail: message }, { status: 500 });
  }
}
