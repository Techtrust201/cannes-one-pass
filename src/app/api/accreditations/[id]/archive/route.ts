import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { createArchivedEntry } from "@/lib/history";
import { writeHistoryDirect } from "@/lib/history-server";

/**
 * POST /api/accreditations/[id]/archive — Archiver ou désarchiver une accréditation
 * Body: { archive: boolean }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "ARCHIVES", "write");
    currentUserId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { archive } = body;

  if (typeof archive !== "boolean") {
    return Response.json({ error: "Le champ 'archive' (boolean) est requis" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const acc = await tx.accreditation.findUnique({ where: { id } });
      if (!acc) throw new Error("NOT_FOUND");

      await tx.accreditation.update({
        where: { id },
        data: {
          isArchived: archive,
          version: acc.version + 1,
        },
      });

      await writeHistoryDirect(
        createArchivedEntry(id, archive, currentUserId),
        tx
      );
    });

    return Response.json({ success: true, isArchived: archive });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return Response.json({ error: "Accréditation non trouvée" }, { status: 404 });
    }
    console.error("POST /api/accreditations/[id]/archive error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
