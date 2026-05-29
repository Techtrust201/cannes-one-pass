import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermission, resolveEspaceOrgId } from "@/lib/auth-helpers";
import { generateVehicleTypeCode } from "@/lib/vehicle-type-defaults";

/**
 * GET /api/vehicle-types — Liste des gabarits véhicules accessibles.
 *
 * - `?espace=<slug>` ou `?orgSlug=<slug>` : lecture **publique** (formulaire
 *   d'accréditation) — gabarits actifs de l'org + globaux (organizationId=null).
 * - Sans slug : réservé au back-office (session requise).
 *
 * `?all=true` pour inclure les désactivés (admin uniquement, avec auth).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const includeAll = searchParams.get("all") === "true";
  const orgSlug =
    searchParams.get("espace")?.trim() ||
    searchParams.get("orgSlug")?.trim() ||
    null;

  if (!orgSlug) {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof Response) {
        return new Response(error.body, { status: error.status, statusText: error.statusText });
      }
      return new Response("Non autorisé", { status: 401 });
    }
  } else if (includeAll) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const orgId = await resolveEspaceOrgId(orgSlug);
    if (orgSlug && !orgId) {
      return Response.json([]);
    }

    const scopeFilter = orgSlug
      ? { OR: [{ organizationId: null }, { organizationId: orgId }] }
      : {};

    const types = await prisma.vehicleTypeConfig.findMany({
      where: {
        ...(includeAll ? {} : { isActive: true }),
        ...scopeFilter,
      },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });

    return Response.json(types);
  } catch (error) {
    console.error("GET /api/vehicle-types error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/vehicle-types — Créer un gabarit
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
    const {
      code,
      label,
      gabarit,
      tonnageMini,
      tonnageMoyen,
      tonnageMaxi,
      co2Coefficient,
      pdfCode,
      color,
      showTrailerPlate,
      sortOrder,
    } = body as Record<string, unknown>;

    if (!label || !gabarit) {
      return Response.json(
        { error: "Les champs label et gabarit sont requis" },
        { status: 400 }
      );
    }

    const finalCode =
      (typeof code === "string" && code.trim()) ||
      generateVehicleTypeCode(String(label));

    const existing = await prisma.vehicleTypeConfig.findFirst({
      where: { code: finalCode, organizationId: orgId },
    });
    if (existing) {
      return Response.json({ error: "Ce code gabarit existe déjà" }, { status: 409 });
    }

    const created = await prisma.vehicleTypeConfig.create({
      data: {
        code: finalCode,
        label: String(label).trim(),
        gabarit: String(gabarit).trim(),
        tonnageMini: Number(tonnageMini ?? 0),
        tonnageMoyen: Number(tonnageMoyen ?? 0),
        tonnageMaxi: Number(tonnageMaxi ?? 0),
        co2Coefficient: Number(co2Coefficient ?? 0.22),
        pdfCode: typeof pdfCode === "string" ? pdfCode : "C",
        color: typeof color === "string" ? color : "gray",
        showTrailerPlate: Boolean(showTrailerPlate),
        sortOrder: Number(sortOrder ?? 0),
        organizationId: orgId,
      },
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/vehicle-types error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
