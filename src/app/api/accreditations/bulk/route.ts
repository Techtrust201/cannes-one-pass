import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { createStatusChangeEntry, createArchivedEntry } from "@/lib/history";
import { writeHistoryDirect } from "@/lib/history-server";

const VALID_STATUSES = ["ATTENTE", "ENTREE", "SORTIE", "NOUVEAU", "REFUS", "ABSENT"];

/**
 * POST /api/accreditations/bulk — Actions groupées sur plusieurs accréditations
 * Body: { ids: string[], action: "ATTENTE" | "ENTREE" | "SORTIE" | "ARCHIVE" | "UNARCHIVE" }
 */
export async function POST(req: NextRequest) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "LISTE", "write");
    currentUserId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const body = await req.json();
  const { ids, action } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "Le champ 'ids' est requis et ne doit pas être vide" }, { status: 400 });
  }

  if (!action) {
    return Response.json({ error: "Le champ 'action' est requis" }, { status: 400 });
  }

  const isArchiveAction = action === "ARCHIVE" || action === "UNARCHIVE";
  if (!isArchiveAction && !VALID_STATUSES.includes(action)) {
    return Response.json({ error: "Action invalide" }, { status: 400 });
  }

  // Vérifier la permission ARCHIVES pour les actions d'archivage
  if (isArchiveAction) {
    try {
      await requirePermission(req, "ARCHIVES", "write");
    } catch {
      return Response.json({ error: "Permission ARCHIVES requise" }, { status: 403 });
    }
  }

  try {
    const results: { id: string; success: boolean; error?: string }[] = [];

    // Traiter chaque accréditation dans une transaction
    for (const accId of ids) {
      try {
        await prisma.$transaction(async (tx) => {
          const acc = await tx.accreditation.findUnique({ where: { id: accId } });
          if (!acc) throw new Error("NOT_FOUND");

          if (isArchiveAction) {
            const isArchive = action === "ARCHIVE";
            await tx.accreditation.update({
              where: { id: accId, version: acc.version },
              data: {
                isArchived: isArchive,
                version: acc.version + 1,
              },
            });
            await writeHistoryDirect(
              createArchivedEntry(accId, isArchive, currentUserId),
              tx
            );
          } else {
            const now = new Date();
            const updates: Record<string, unknown> = {
              status: action,
              version: acc.version + 1,
            };
            if (action === "ENTREE" && !acc.entryAt) updates.entryAt = now;
            if (action === "SORTIE") updates.exitAt = now;

            await tx.accreditation.update({
              where: { id: accId, version: acc.version },
              data: updates,
            });
            await writeHistoryDirect(
              createStatusChangeEntry(accId, acc.status, action, currentUserId),
              tx
            );
          }
        });
        results.push({ id: accId, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur";
        results.push({ id: accId, success: false, error: msg });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return Response.json({
      success: true,
      total: ids.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    console.error("POST /api/accreditations/bulk error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
