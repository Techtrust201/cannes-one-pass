import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermission } from "@/lib/auth-helpers";
import { generateVehicleTypeCode } from "@/lib/vehicle-type-defaults";

/**
 * GET /api/vehicle-types — Liste des gabarits véhicules
 * Auth requis. ?all=true pour inclure les désactivés (admin).
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

    const types = await prisma.vehicleTypeConfig.findMany({
      where: includeAll ? {} : { isActive: true },
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

    const existing = await prisma.vehicleTypeConfig.findUnique({
      where: { code: finalCode },
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
      },
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/vehicle-types error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
