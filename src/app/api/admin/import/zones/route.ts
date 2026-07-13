import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { parseImportRequest } from "@/lib/imports/import-request";
import { checkRowCountGuard } from "@/lib/imports/csv";
import { parseImportFile, UnsupportedImportFileError } from "@/lib/imports/file-parse";
import { parseZonesTable, applyZonesCommit, type ZonesCommitTx } from "@/lib/imports/zones";
import {
  computeFileHashSha256,
  startImportBatch,
  completeImportBatch,
  failImportBatch,
  type ImportBatchDb,
} from "@/lib/imports/import-batch";

/**
 * POST /api/admin/import/zones
 *
 * Multipart : `file` (CSV/XLSX), `organizationId` (`eventId` facultatif — le
 * modele `ZoneConfig` n'a pas de champ `eventId`, jamais exige artificiellement).
 * Query : `commit=true` (defaut dry-run), `mode=FUSION` (defaut ; REPLACE
 * refuse, comme les autres profils Phase 3/5).
 *
 * - Dry-run : parse + valide + apercu, AUCUNE ecriture DB.
 * - Commit : ImportBatch (PROCESSING, hors tx) -> transaction FUSION ->
 *   COMPLETED ; en cas d'echec, rollback des donnees + ImportBatch FAILED.
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await parseImportRequest(req, "GESTION_ZONES", { requireEvent: false });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response("Non autorise", { status: 401 });
  }

  if (ctx.mode === "REPLACE") {
    return Response.json(
      {
        ok: false,
        error:
          "Mode REPLACE indisponible pour le profil Zones (FUSION uniquement, aucune desactivation silencieuse).",
      },
      { status: 400 }
    );
  }

  let parsed;
  try {
    const table = parseImportFile({
      buffer: ctx.fileBuffer,
      fileName: ctx.fileName,
      mimeType: ctx.mimeType,
    });
    parsed = parseZonesTable(table);
  } catch (err) {
    if (err instanceof UnsupportedImportFileError) {
      return Response.json({ ok: false, error: err.message }, { status: 400 });
    }
    throw err;
  }

  const rowGuard = checkRowCountGuard(parsed.totalRows);
  if (rowGuard) {
    return Response.json(
      { ok: false, errors: [{ line: 1, column: "_row", reason: rowGuard.message }] },
      { status: 413 }
    );
  }

  const preview = {
    zones: parsed.rows.length,
    sample: parsed.rows.slice(0, 10),
  };

  if (parsed.errors.length > 0) {
    return Response.json(
      {
        ok: false,
        totalRows: parsed.totalRows,
        errors: parsed.errors,
        warnings: parsed.warnings,
        preview,
      },
      { status: 422 }
    );
  }

  if (!ctx.commit) {
    return Response.json({
      ok: true,
      mode: "dry-run",
      totalRows: parsed.totalRows,
      warnings: parsed.warnings,
      preview,
      imported: { created: 0, updated: 0, unchanged: 0 },
    });
  }

  const batchDb = prisma as unknown as ImportBatchDb;
  const fileHashSha256 = computeFileHashSha256(ctx.fileBuffer);
  const batch = await startImportBatch(batchDb, {
    organizationId: ctx.organizationId,
    eventId: ctx.eventId,
    userId: ctx.userId,
    sourceProfile: "ZONES",
    fileName: ctx.fileName,
    fileHashSha256,
  });

  try {
    const result = await prisma.$transaction(async (tx) =>
      applyZonesCommit(tx as unknown as ZonesCommitTx, parsed.rows, {
        organizationId: ctx.organizationId,
      })
    );

    await completeImportBatch(batchDb, batch.id, result.counters, {
      warnings: parsed.warnings,
      zones: { created: result.created, updated: result.updated, unchanged: result.unchanged },
    });

    return Response.json({
      ok: true,
      mode: "commit",
      batchId: batch.id,
      totalRows: parsed.totalRows,
      warnings: parsed.warnings,
      imported: result,
    });
  } catch (err) {
    console.error("Import zones — transaction en echec:", err);
    await failImportBatch(batchDb, batch.id, {
      errorCount: 1,
      summary: { reason: err instanceof Error ? err.message : "erreur inconnue" },
    });
    return Response.json(
      {
        ok: false,
        error: "Echec de l'import (aucune donnee ecrite : transaction annulee).",
        details: err instanceof Error ? err.message : "erreur inconnue",
      },
      { status: 500 }
    );
  }
}
