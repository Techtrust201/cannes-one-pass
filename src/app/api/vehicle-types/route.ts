import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  requirePermission,
  resolveEspaceOrgId,
  getAccessibleOrganizationIds,
} from "@/lib/auth-helpers";
import { generateVehicleTypeCode } from "@/lib/vehicle-type-defaults";

type VehicleTypeRow = { code: string };

/** Dé-duplique une liste de gabarits par `code` (garde la première occurrence,
 * l'ordre étant déjà déterministe via le `orderBy` de la requête). Filet de
 * sécurité pour ne jamais renvoyer de doublon cross-organisation. */
function dedupeByCode<T extends VehicleTypeRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.code) ? false : (seen.add(r.code), true)));
}

/**
 * GET /api/vehicle-types — Liste des gabarits véhicules accessibles.
 *
 * Cloisonnement strict par organisation (plus aucun gabarit « global ») :
 * - `?espace=<slug>` ou `?orgSlug=<slug>` : lecture **publique** (formulaire
 *   d'accréditation) — gabarits de cette organisation uniquement.
 * - Sans slug : back-office authentifié — gabarits des organisations
 *   accessibles à l'utilisateur (dé-dupliqués par code si plusieurs orgs).
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

  // Règles d'accès :
  // - `all=true` (inclut les désactivés) : toujours réservé à un utilisateur
  //   authentifié, qu'un espace soit fourni ou non (back-office admin).
  // - sans `espace` : back-office authentifié.
  // - `espace` + sans `all` : lecture publique (formulaire d'accréditation).
  let authed: Awaited<ReturnType<typeof requireAuth>> | null = null;
  if (includeAll || !orgSlug) {
    try {
      authed = await requireAuth(req);
    } catch (error) {
      if (error instanceof Response) {
        return new Response(error.body, { status: error.status, statusText: error.statusText });
      }
      return new Response("Non autorisé", { status: 401 });
    }
  }

  try {
    const activeFilter = includeAll ? {} : { isActive: true };
    const orderBy = [{ sortOrder: "asc" as const }, { label: "asc" as const }];

    // Cas 1 : espace fourni → scope strict à cette organisation.
    if (orgSlug) {
      const orgId = await resolveEspaceOrgId(orgSlug);
      if (!orgId) return Response.json([]);
      const types = await prisma.vehicleTypeConfig.findMany({
        where: { ...activeFilter, organizationId: orgId },
        orderBy,
      });
      return Response.json(types);
    }

    // Cas 2/3 : pas d'espace (back-office authentifié) → orgs accessibles.
    const accessible = authed
      ? await getAccessibleOrganizationIds(authed.session.user.id)
      : [];

    if (Array.isArray(accessible) && accessible.length > 0) {
      const types = await prisma.vehicleTypeConfig.findMany({
        where: { ...activeFilter, organizationId: { in: accessible } },
        orderBy,
      });
      // Mono-org → pas de doublon possible. Multi-org → dé-dup par code.
      return Response.json(accessible.length > 1 ? dedupeByCode(types) : types);
    }

    // Super-admin ("ALL") ou aucune org rattachée → tout, dé-dupliqué par code.
    const types = await prisma.vehicleTypeConfig.findMany({
      where: activeFilter,
      orderBy,
    });
    return Response.json(dedupeByCode(types));
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
      rxPalmBeachAtCanto,
      rxZoneCanto,
      rxZoneVieuxPort,
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

    const trimmedGabarit = String(gabarit).trim();
    const trimmedLabel =
      (typeof label === "string" && label.trim()) || trimmedGabarit;

    const created = await prisma.vehicleTypeConfig.create({
      data: {
        code: finalCode,
        label: trimmedLabel,
        gabarit: trimmedGabarit,
        tonnageMini: Number(tonnageMini ?? 0),
        tonnageMoyen: Number(tonnageMoyen ?? 0),
        tonnageMaxi: Number(tonnageMaxi ?? 0),
        co2Coefficient: Number(co2Coefficient ?? 0.22),
        pdfCode: typeof pdfCode === "string" ? pdfCode : "C",
        color: typeof color === "string" ? color : "gray",
        showTrailerPlate: Boolean(showTrailerPlate),
        rxPalmBeachAtCanto: Boolean(rxPalmBeachAtCanto ?? false),
        rxZoneCanto:
          typeof rxZoneCanto === "string" && rxZoneCanto.trim()
            ? rxZoneCanto.trim()
            : null,
        rxZoneVieuxPort:
          typeof rxZoneVieuxPort === "string" && rxZoneVieuxPort.trim()
            ? rxZoneVieuxPort.trim()
            : null,
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
