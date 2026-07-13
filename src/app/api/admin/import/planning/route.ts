import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { parseImportRequest } from "@/lib/imports/import-request";
import { checkRowCountGuard } from "@/lib/imports/csv";
import { parseImportFile, UnsupportedImportFileError } from "@/lib/imports/file-parse";
import { parsePlanningTable, type PlanningParseResult } from "@/lib/imports/planning";
import { parseRxPlanningWorkbook } from "@/lib/imports/planning-rx-adapter";
import { applyPlanningCommit, type PlanningCommitTx } from "@/lib/imports/planning-commit";
import {
  computeFileHashSha256,
  startImportBatch,
  completeImportBatch,
  failImportBatch,
  type ImportBatchDb,
} from "@/lib/imports/import-batch";

/**
 * POST /api/admin/import/planning
 *
 * Multipart : `file` (CSV/XLSX), `organizationId`, `eventId`.
 * Query : `commit=true` (defaut dry-run), `mode=FUSION` (defaut ; REPLACE
 * refuse en Phase 3), `format=canonical|rx` :
 *   - `canonical` : tableau plat CSV/XLSX (colonnes DATE_START/DATE_END...) ;
 *   - `rx` : classeur RX matriciel officiel via adaptateur isole.
 *
 * Les deux chemins produisent des lignes canoniques quotidiennes ; le commit
 * applique une FUSION complete (creation/mise a jour/inchange/conservation).
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await parseImportRequest(req, "GESTION_DATES");
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response("Non autorise", { status: 401 });
  }

  if (ctx.mode === "REPLACE") {
    return Response.json(
      {
        ok: false,
        error:
          "Mode REPLACE indisponible pour le profil Planning en Phase 3 (FUSION uniquement, aucune desactivation).",
      },
      { status: 400 }
    );
  }

  let parsed: PlanningParseResult;
  try {
    if (ctx.format === "rx") {
      // Adaptateur isole : classeur RX matriciel (XLSX) -> lignes canoniques.
      parsed = parseRxPlanningWorkbook(ctx.fileBuffer);
    } else {
      const table = parseImportFile({
        buffer: ctx.fileBuffer,
        fileName: ctx.fileName,
        mimeType: ctx.mimeType,
      });
      parsed = parsePlanningTable(table);
    }
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
    dailyRows: parsed.rows.length,
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
    sourceProfile: "PLANNING",
    fileName: ctx.fileName,
    fileHashSha256,
  });

  try {
    const result = await prisma.$transaction(async (tx) =>
      applyPlanningCommit(tx as unknown as PlanningCommitTx, parsed.rows, {
        organizationId: ctx.organizationId,
        eventId: ctx.eventId,
        importBatchId: batch.id,
        source: "import",
      })
    );

    await completeImportBatch(batchDb, batch.id, result.counters, {
      warnings: [...parsed.warnings, ...result.warnings],
    });

    return Response.json({
      ok: true,
      mode: "commit",
      batchId: batch.id,
      totalRows: parsed.totalRows,
      warnings: [...parsed.warnings, ...result.warnings],
      imported: result,
    });
  } catch (err) {
    console.error("Import planning — transaction en echec:", err);
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
