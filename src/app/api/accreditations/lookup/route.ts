import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requirePermission, getAccessibleEventIdsForEspace } from "@/lib/auth-helpers";
import { normalizePlate } from "@/lib/plate-utils";
import { mapDbVehicleType, mapDefaultVehicleTypes } from "@/lib/vehicle-type-server";
import { resolveVehicleTypeShortLabelFromList } from "@/lib/vehicle-type-resolve";
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import type { AccreditationScanSummary } from "@/lib/scan-types";

/**
 * `GET /api/accreditations/lookup` — Résout une accréditation pour le module de
 * scan, par QR (`?id=`) ou par plaque (`?plate=`), strictement scopée aux
 * events accessibles (intersection avec l'Espace via `?espace=`).
 *
 * Gated par `GESTION_ZONES read` : les agents terrain peuvent l'utiliser sans
 * disposer de la permission `LISTE`.
 *
 * Réponse : `{ matches: AccreditationScanSummary[] }`
 *  - QR (`id`)   : 0 ou 1 résultat.
 *  - Plaque      : 0..N résultats (gère le cas multiple côté UI).
 */
export async function GET(req: NextRequest) {
  let userId: string;
  try {
    const session = await requirePermission(req, "GESTION_ZONES", "read");
    userId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const espace = searchParams.get("espace");
  const idParam = searchParams.get("id")?.trim();
  const plateParam = searchParams.get("plate");

  if (!idParam && !plateParam) {
    return Response.json(
      { error: "Paramètre requis : id (QR) ou plate (plaque)." },
      { status: 400 }
    );
  }

  const accessibleEventIds = await getAccessibleEventIdsForEspace(userId, espace);
  // Aucun event accessible dans ce périmètre → aucun résultat (jamais d'erreur
  // serveur, l'UI affiche "introuvable").
  if (Array.isArray(accessibleEventIds) && accessibleEventIds.length === 0) {
    return Response.json({ matches: [] });
  }

  // Filtre d'isolation multi-org/événement appliqué AVANT tout retour.
  const eventScope: Prisma.AccreditationWhereInput =
    accessibleEventIds === "ALL"
      ? {}
      : { eventId: { in: accessibleEventIds } };

  try {
    let accreditations;

    if (idParam) {
      const acc = await prisma.accreditation.findFirst({
        where: { id: idParam, ...eventScope },
        include: { vehicles: true, organization: { select: { slug: true } } },
      });
      accreditations = acc ? [acc] : [];
    } else {
      const normalized = normalizePlate(plateParam);
      if (!normalized) {
        return Response.json(
          { error: "Plaque invalide après normalisation." },
          { status: 400 }
        );
      }
      // Recherche INDEXÉE sur les colonnes normalisées (jamais de scan mémoire).
      accreditations = await prisma.accreditation.findMany({
        where: {
          isArchived: false,
          ...eventScope,
          vehicles: {
            some: {
              OR: [
                { plateNormalized: normalized },
                { trailerPlateNormalized: normalized },
              ],
            },
          },
        },
        include: { vehicles: true, organization: { select: { slug: true } } },
        take: 25,
        orderBy: { createdAt: "desc" },
      });
    }

    if (accreditations.length === 0) {
      return Response.json({ matches: [] });
    }

    // Charge les configs de gabarits par organisation (une seule fois par org)
    // pour résoudre les libellés véhicule côté serveur.
    const orgIds = Array.from(
      new Set(accreditations.map((a) => a.organizationId).filter(Boolean))
    ) as string[];
    const typesByOrg = new Map<string, VehicleTypeData[]>();
    for (const orgId of orgIds) {
      const dbTypes = await prisma.vehicleTypeConfig.findMany({
        where: { organizationId: orgId, isActive: true },
        orderBy: { sortOrder: "asc" },
      });
      typesByOrg.set(orgId, dbTypes.map(mapDbVehicleType));
    }

    const matches: AccreditationScanSummary[] = accreditations.map((acc) => {
      const types =
        (acc.organizationId && typesByOrg.get(acc.organizationId)) ||
        mapDefaultVehicleTypes(acc.organization?.slug);
      return {
        id: acc.id,
        company: acc.company,
        stand: acc.stand,
        status: acc.status,
        currentZone: acc.currentZone,
        version: acc.version,
        isArchived: acc.isArchived,
        entryAt: acc.entryAt ? acc.entryAt.toISOString() : null,
        exitAt: acc.exitAt ? acc.exitAt.toISOString() : null,
        vehicles: acc.vehicles.map((v) => ({
          id: v.id,
          plate: v.plate,
          trailerPlate: v.trailerPlate,
          vehicleLabel: resolveVehicleTypeShortLabelFromList(
            types,
            v.vehicleType,
            v.size
          ),
          phone:
            v.phoneCode || v.phoneNumber
              ? `${v.phoneCode ?? ""} ${v.phoneNumber ?? ""}`.trim()
              : null,
        })),
      };
    });

    return Response.json({ matches });
  } catch (error) {
    console.error("GET /api/accreditations/lookup error:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
