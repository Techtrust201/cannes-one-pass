import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  requirePermission,
  getAccessibleEventIdsForEspace,
} from "@/lib/auth-helpers";
import { normalizePlate } from "@/lib/plate-utils";
import {
  buildScanSummaries,
  SCAN_SUMMARY_INCLUDE,
} from "@/lib/scan-summary-server";

/**
 * `GET /api/accreditations/plate-search?q=GG&espace=palais-des-festivals`
 *
 * Recherche plaque DYNAMIQUE pour l'autocomplete du module de scan terrain.
 * Contrairement à `/lookup` (match exact normalisé), fait un `contains` sur les
 * colonnes normalisées (`plateNormalized`, `trailerPlateNormalized`) afin de
 * retrouver une plaque à partir d'un fragment (`GG`, `542`, `CM`, `GG-542`…).
 *
 * Sécurité : même périmètre que `/lookup` :
 *  - `GESTION_ZONES read` (agents terrain) ;
 *  - scope strict aux events accessibles (intersection avec l'Espace via
 *    `?espace=`) -> jamais d'accréditation d'une autre organisation/espace ;
 *  - exclut les accréditations archivées (comme le lookup plaque).
 *
 * Réponse : `{ matches: AccreditationScanSummary[] }` (même forme que `/lookup`,
 * pour réutiliser exactement la popup de résumé + actions Entrée/Sortie/Refuser).
 */
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    const session = await requirePermission(req, "GESTION_ZONES", "read");
    userId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const espace = searchParams.get("espace");
  const q = searchParams.get("q");

  // Normalisation identique au reste du projet (majuscules, sans espaces/tirets).
  const nq = normalizePlate(q);
  // Sous le seuil -> pas d'erreur, liste vide (l'UI n'affiche rien trop tôt).
  if (!nq || nq.length < MIN_QUERY_LENGTH) {
    return Response.json({ matches: [] });
  }

  const accessibleEventIds = await getAccessibleEventIdsForEspace(userId, espace);
  if (Array.isArray(accessibleEventIds) && accessibleEventIds.length === 0) {
    return Response.json({ matches: [] });
  }

  const eventScope: Prisma.AccreditationWhereInput =
    accessibleEventIds === "ALL"
      ? {}
      : { eventId: { in: accessibleEventIds } };

  try {
    const accreditations = await prisma.accreditation.findMany({
      where: {
        isArchived: false,
        ...eventScope,
        vehicles: {
          some: {
            OR: [
              { plateNormalized: { contains: nq } },
              { trailerPlateNormalized: { contains: nq } },
            ],
          },
        },
      },
      include: SCAN_SUMMARY_INCLUDE,
      take: MAX_RESULTS,
      orderBy: { createdAt: "desc" },
    });

    const matches = await buildScanSummaries(accreditations);
    return Response.json({ matches });
  } catch (error) {
    console.error("GET /api/accreditations/plate-search error:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
