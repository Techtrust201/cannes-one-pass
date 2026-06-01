import { NextRequest } from "next/server";
import { requirePermission, resolveEspaceOrgId } from "@/lib/auth-helpers";
import { seedVehicleTypes } from "@/lib/vehicle-type-seed";

/**
 * POST /api/vehicle-types/seed — Initialise les gabarits par défaut (idempotent).
 *
 * `?espace=<slug>` : seed scopé à cette organisation. Sans slug, seed global
 * (legacy) — conservé pour rétrocompatibilité.
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
    const types = await seedVehicleTypes(orgId);
    return Response.json({ success: true, types });
  } catch (error) {
    console.error("POST /api/vehicle-types/seed error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
