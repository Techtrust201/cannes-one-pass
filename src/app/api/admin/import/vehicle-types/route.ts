import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { parseImportRequest } from "@/lib/imports/import-request";
import { checkRowCountGuard } from "@/lib/imports/csv";
import { parseImportFile, UnsupportedImportFileError } from "@/lib/imports/file-parse";
import {
  parseVehicleTypesTable,
  applyVehicleTypesCommit,
  type VehicleTypesCommitTx,
} from "@/lib/imports/vehicle-types";
import {
  computeFileHashSha256,
  startImportBatch,
  completeImportBatch,
  failImportBatch,
  type ImportBatchDb,
} from "@/lib/imports/import-batch";

/**
 * POST /api/admin/import/vehicle-types
 *
 * Multipart : `file` (CSV/XLSX), `organizationId` (`eventId` facultatif — le
 * modele `VehicleTypeConfig` n'a pas de champ `eventId`).
 * Query : `commit=true` (defaut dry-run), `mode=FUSION` (defaut ; REPLACE refuse).
 *
 * Feature : `FLUX_VEHICULES` (identique a `POST /api/vehicle-types`, aucune
 * Feature Prisma inventee).
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await parseImportRequest(req, "FLUX_VEHICULES", { requireEvent: false });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response("Non autorise", { status: 401 });
  }

  if (ctx.mode === "REPLACE") {
    return Response.json(
      {
        ok: false,
        error:
          "Mode REPLACE indisponible pour le profil Gabarits (FUSION uniquement, aucune desactivation silencieuse).",
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
    parsed = parseVehicleTypesTable(table);
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
    vehicleTypes: parsed.rows.length,
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
    sourceProfile: "VEHICLE_TYPES",
    fileName: ctx.fileName,
    fileHashSha256,
  });

  try {
    const result = await prisma.$transaction(async (tx) =>
      applyVehicleTypesCommit(tx as unknown as VehicleTypesCommitTx, parsed.rows, {
        organizationId: ctx.organizationId,
      })
    );

    await completeImportBatch(batchDb, batch.id, result.counters, {
      warnings: parsed.warnings,
      vehicleTypes: { created: result.created, updated: result.updated, unchanged: result.unchanged },
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
    console.error("Import gabarits — transaction en echec:", err);
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
