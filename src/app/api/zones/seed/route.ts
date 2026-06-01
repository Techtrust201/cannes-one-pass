import { NextRequest } from "next/server";
import { requireRole, resolveEspaceOrgId } from "@/lib/auth-helpers";
import { seedZones } from "@/lib/zone-seed";

/**
 * POST /api/zones/seed — Initialise les zones par défaut pour l'org courante.
 * Réservé aux SUPER_ADMIN. Idempotent (upsert).
 *
 * `?espace=<slug>` : seed scopé à cette organisation. Sans slug, seed global
 * (legacy) — conservé pour rétrocompatibilité.
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
    const espace = req.nextUrl.searchParams.get("espace")?.trim() || null;
    const orgId = await resolveEspaceOrgId(espace);
    const results = await seedZones(orgId);
    return Response.json({ success: true, zones: results });
  } catch (error) {
    console.error("POST /api/zones/seed error:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
