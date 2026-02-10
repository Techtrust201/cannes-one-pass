import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

/**
 * GET /api/admin/archive-history
 * 
 * Archive les entrées d'AccreditationHistory de plus de 13 mois
 * dans AccreditationHistoryArchive avec compression JSON.
 * 
 * Authentification :
 * - Via CRON_SECRET (header Authorization: Bearer <secret>) pour les crons Vercel
 * - Via session SUPER_ADMIN pour les appels manuels
 */
export async function GET(req: NextRequest) {
  // ─── Authentification ─────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron) {
    // Fallback : vérifier session SUPER_ADMIN
    try {
      await requireRole(req, "SUPER_ADMIN");
    } catch (error) {
      if (error instanceof Response) {
        return new Response(error.body, { status: error.status, statusText: error.statusText });
      }
      return new Response("Non autorisé", { status: 401 });
    }
  }

  // ─── Logique d'archivage ──────────────────────────────────────
  const MONTHS_TO_KEEP = 13;
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - MONTHS_TO_KEEP);

  const BATCH_SIZE = 500;
  let totalArchived = 0;
  let totalDeleted = 0;

  try {
    // Boucle de traitement par batch pour éviter les timeouts Vercel (10s)
    let hasMore = true;

    while (hasMore) {
      const oldEntries = await prisma.accreditationHistory.findMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
        take: BATCH_SIZE,
        orderBy: { id: "asc" },
      });

      if (oldEntries.length === 0) {
        hasMore = false;
        break;
      }

      // Compresser et insérer dans la table archive
      await prisma.$transaction(async (tx) => {
        // 1. Insérer dans l'archive avec JSON compact
        for (const entry of oldEntries) {
          const summary = JSON.stringify({
            f: entry.field ?? undefined,
            o: entry.oldValue ?? undefined,
            n: entry.newValue ?? undefined,
            d: entry.description,
            u: entry.userId ?? undefined,
            ua: entry.userAgent ?? undefined,
          });

          await tx.accreditationHistoryArchive.create({
            data: {
              id: entry.id,
              accreditationId: entry.accreditationId,
              action: entry.action,
              summary,
              createdAt: entry.createdAt,
            },
          });
        }

        // 2. Supprimer les entrées originales
        const ids = oldEntries.map((e) => e.id);
        await tx.accreditationHistory.deleteMany({
          where: { id: { in: ids } },
        });
      });

      totalArchived += oldEntries.length;
      totalDeleted += oldEntries.length;

      // Si on a eu moins que BATCH_SIZE, c'est le dernier batch
      if (oldEntries.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    const report = {
      success: true,
      cutoffDate: cutoffDate.toISOString(),
      monthsKept: MONTHS_TO_KEEP,
      totalArchived,
      totalDeleted,
      timestamp: new Date().toISOString(),
    };

    console.log("[archive-history] Rapport :", report);

    return Response.json(report);
  } catch (error) {
    console.error("[archive-history] Erreur :", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erreur inconnue",
        totalArchived,
        totalDeleted,
      },
      { status: 500 }
    );
  }
}
