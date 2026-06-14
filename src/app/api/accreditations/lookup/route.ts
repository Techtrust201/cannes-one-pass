import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requirePermission, getAccessibleEventIdsForEspace } from "@/lib/auth-helpers";
import { normalizePlate } from "@/lib/plate-utils";
import {
  buildScanSummaries,
  SCAN_SUMMARY_INCLUDE,
  type AccreditationWithScanRelations,
} from "@/lib/scan-summary-server";

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
    let accreditations: AccreditationWithScanRelations[];

    if (idParam) {
      const acc = await prisma.accreditation.findFirst({
        where: { id: idParam, ...eventScope },
        include: SCAN_SUMMARY_INCLUDE,
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
        include: SCAN_SUMMARY_INCLUDE,
        take: 25,
        orderBy: { createdAt: "desc" },
      });
    }

    const matches = await buildScanSummaries(accreditations);
    return Response.json({ matches });
  } catch (error) {
    console.error("GET /api/accreditations/lookup error:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
