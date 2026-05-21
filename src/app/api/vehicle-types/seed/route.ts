import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-helpers";
import { seedVehicleTypes } from "@/lib/vehicle-type-seed";

/**
 * POST /api/vehicle-types/seed — Initialise les gabarits par défaut (idempotent)
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
    const types = await seedVehicleTypes();
    return Response.json({ success: true, types });
  } catch (error) {
    console.error("POST /api/vehicle-types/seed error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
