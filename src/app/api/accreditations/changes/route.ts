import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

/**
 * GET /api/accreditations/changes?since=ISO_TIMESTAMP&zone=ZONE
 * 
 * Retourne les entrées d'historique récentes depuis un timestamp donné.
 * Utilisé par le polling client pour détecter les changements.
 * Léger et rapide : une seule query.
 * 
 * Authentifié : nécessite une session active.
 */
export async function GET(req: NextRequest) {
  // Vérifier que l'utilisateur est authentifié
  try {
    await requireAuth(req);
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get("since");
  const filterZone = searchParams.get("zone");

  // Par défaut, les changements des 30 dernières secondes
  const since = sinceParam
    ? new Date(sinceParam)
    : new Date(Date.now() - 30_000);

  try {
    const recentHistory = await prisma.accreditationHistory.findMany({
      where: {
        createdAt: { gt: since },
      },
      orderBy: { createdAt: "asc" },
      include: {
        accreditation: {
          select: {
            id: true,
            status: true,
            currentZone: true,
            company: true,
          },
        },
      },
      take: 50, // Limiter pour éviter les réponses trop lourdes
    });

    // Filtrer par zone si spécifié
    const filtered = filterZone
      ? recentHistory.filter((entry) => entry.accreditation.currentZone === filterZone)
      : recentHistory;

    const events = filtered.map((entry) => ({
      type:
        entry.action === "ZONE_TRANSFER" ? "zone_transfer" :
        entry.action === "ZONE_CHANGED" ? "zone_change" :
        entry.action === "STATUS_CHANGED" ? "status_change" :
        entry.action === "CREATED" ? "created" :
        entry.action === "DELETED" ? "deleted" :
        entry.action === "VEHICLE_REMOVED" ? "vehicle_removed" :
        entry.action === "VEHICLE_ADDED" ? "vehicle_added" :
        entry.action === "VEHICLE_UPDATED" ? "vehicle_updated" :
        entry.action === "INFO_UPDATED" ? "info_updated" :
        entry.action === "VEHICLE_RETURN" ? "vehicle_return" :
        entry.action === "ARCHIVED" ? "archived" :
        entry.action === "CHAT_MESSAGE" ? "chat_message" : "update",
      accreditationId: entry.accreditationId,
      data: {
        action: entry.action,
        field: entry.field,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        description: entry.description,
        zone: entry.accreditation.currentZone,
        company: entry.accreditation.company,
        status: entry.accreditation.status,
      },
      timestamp: entry.createdAt.toISOString(),
    }));

    return Response.json(
      { events, serverTime: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("GET /api/accreditations/changes error:", error);
    return Response.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
