import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { parseImportRequest } from "@/lib/imports/import-request";
import { checkRowCountGuard } from "@/lib/imports/csv";
import { parseImportFile, UnsupportedImportFileError } from "@/lib/imports/file-parse";
import { parseReferentialTable } from "@/lib/imports/referential";
import {
  applyReferentialCommit,
  type ReferentialCommitTx,
} from "@/lib/imports/referential-commit";
import {
  computeFileHashSha256,
  startImportBatch,
  completeImportBatch,
  failImportBatch,
  type ImportBatchDb,
} from "@/lib/imports/import-batch";

/**
 * POST /api/admin/import/referential
 *
 * Multipart : `file` (CSV/XLSX), `organizationId`, `eventId`.
 * Query : `commit=true` (defaut dry-run), `mode=FUSION` (defaut ; REPLACE
 * refuse en Phase 3), `format=canonical|rx` (defaut canonical ; `rx` active
 * l'adaptateur geographique du referentiel RX officiel).
 *
 * - Dry-run : parse + valide + apercu, AUCUNE ecriture DB.
 * - Commit : ImportBatch (PROCESSING, hors tx) -> transaction FUSION ->
 *   COMPLETED ; en cas d'echec, rollback des donnees + ImportBatch FAILED.
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await parseImportRequest(req, "GESTION_ESPACES");
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response("Non autorise", { status: 401 });
  }

  if (ctx.mode === "REPLACE") {
    return Response.json(
      {
        ok: false,
        error:
          "Mode REPLACE indisponible pour le profil Referentiel en Phase 3 (FUSION uniquement, aucune desactivation).",
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
    parsed = parseReferentialTable(table, { rxProfile: ctx.format === "rx" });
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

  const locationsCount = parsed.exhibitors.reduce((n, e) => n + e.locations.length, 0);
  const preview = {
    exhibitors: parsed.exhibitors.length,
    locations: locationsCount,
    sample: parsed.exhibitors.slice(0, 10),
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
    sourceProfile: "REFERENTIAL",
    fileName: ctx.fileName,
    fileHashSha256,
  });

  try {
    const result = await prisma.$transaction(async (tx) =>
      applyReferentialCommit(tx as unknown as ReferentialCommitTx, parsed.exhibitors, {
        organizationId: ctx.organizationId,
        eventId: ctx.eventId,
      })
    );

    await completeImportBatch(batchDb, batch.id, result.counters, {
      warnings: parsed.warnings,
      exhibitors: {
        created: result.exhibitorsCreated,
        updated: result.exhibitorsUpdated,
        unchanged: result.exhibitorsUnchanged,
      },
      locations: {
        created: result.locationsCreated,
        updated: result.locationsUpdated,
        unchanged: result.locationsUnchanged,
      },
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
    console.error("Import referentiel — transaction en echec:", err);
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
