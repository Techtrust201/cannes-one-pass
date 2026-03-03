import { NextRequest } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";
import { requireAuth, requirePermission } from "@/lib/auth-helpers";

/**
 * GET /api/unloading-providers — Liste des prestataires de déchargement
 * Accessible à tout utilisateur authentifié (les selects en ont besoin)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const includeAll = searchParams.get("all") === "true";

    const providers = await withRetry(() => prisma.unloadingProvider.findMany({
      where: includeAll ? {} : { isActive: true },
      orderBy: { name: "asc" },
    }));
    return Response.json(providers);
  } catch (error) {
    console.error("GET /api/unloading-providers error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "Erreur serveur", detail: message }, { status: 500 });
  }
}

/**
 * POST /api/unloading-providers — Créer un prestataire
 * Requiert FLUX_VEHICULES write
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "FLUX_VEHICULES", "write");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  try {
    const body = await req.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return Response.json(
        { error: "Le nom du prestataire est requis" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    const existing = await prisma.unloadingProvider.findUnique({
      where: { name: trimmedName },
    });
    if (existing) {
      if (!existing.isActive) {
        const reactivated = await prisma.unloadingProvider.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
        return Response.json(reactivated, { status: 200 });
      }
      return Response.json(
        { error: "Ce prestataire existe déjà" },
        { status: 409 }
      );
    }

    const created = await prisma.unloadingProvider.create({
      data: { name: trimmedName },
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/unloading-providers error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "Erreur serveur", detail: message }, { status: 500 });
  }
}
