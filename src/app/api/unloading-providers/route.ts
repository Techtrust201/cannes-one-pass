import { NextRequest } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";
import { requireAuth, requirePermission, resolveEspaceOrgId } from "@/lib/auth-helpers";

/**
 * GET /api/unloading-providers — Liste des prestataires de déchargement.
 *
 * - `?espace=<slug>` ou `?orgSlug=<slug>` : lecture **publique** (formulaire
 *   d'accréditation) — prestataires actifs de l'org + globaux (organizationId=null).
 * - Sans slug : réservé au back-office (session requise).
 *
 * `?all=true` (désactivés inclus) reste réservé à l'admin authentifié.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const includeAll = searchParams.get("all") === "true";
  const espace =
    searchParams.get("espace")?.trim() ||
    searchParams.get("orgSlug")?.trim() ||
    null;

  // Règles d'accès :
  // - `all=true` (inclut les désactivés) : toujours réservé à un utilisateur
  //   authentifié, qu'un espace soit fourni ou non (back-office admin).
  // - sans `espace` : back-office authentifié.
  // - `espace` + sans `all` : lecture publique (formulaire d'accréditation).
  if (includeAll || !espace) {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof Response) {
        return new Response(error.body, { status: error.status, statusText: error.statusText });
      }
      return new Response("Non autorisé", { status: 401 });
    }
  }

  try {
    const orgId = await resolveEspaceOrgId(espace);

    const scopeFilter = espace
      ? { OR: [{ organizationId: null }, { organizationId: orgId }] }
      : {};

    const providers = await withRetry(() =>
      prisma.unloadingProvider.findMany({
        where: { ...(includeAll ? {} : { isActive: true }), ...scopeFilter },
        orderBy: { name: "asc" },
      })
    );
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
    const espace = req.nextUrl.searchParams.get("espace")?.trim() || null;
    const orgId = await resolveEspaceOrgId(espace);

    const body = await req.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return Response.json(
        { error: "Le nom du prestataire est requis" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    const existing = await prisma.unloadingProvider.findFirst({
      where: { name: trimmedName, organizationId: orgId },
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
      data: { name: trimmedName, organizationId: orgId },
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/unloading-providers error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "Erreur serveur", detail: message }, { status: 500 });
  }
}
