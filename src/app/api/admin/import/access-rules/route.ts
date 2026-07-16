import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { parseImportRequest } from "@/lib/imports/import-request";
import { checkRowCountGuard } from "@/lib/imports/csv";
import { parseImportFile, UnsupportedImportFileError } from "@/lib/imports/file-parse";
import {
  parseAccessRulesTable,
  prepareAccessRules,
  applyAccessRulesCommit,
  type AccessRulesCommitTx,
} from "@/lib/imports/access-rules";
import {
  computeFileHashSha256,
  startImportBatch,
  completeImportBatch,
  failImportBatch,
  type ImportBatchDb,
} from "@/lib/imports/import-batch";
import { normalizeOptionalCode } from "@/lib/imports/normalization";

/**
 * POST /api/admin/import/access-rules
 *
 * Multipart : `file` (CSV/XLSX), `organizationId`, `eventId`.
 * Query : `commit=true` (défaut dry-run), `mode=FUSION` (REPLACE refusé).
 *
 * Feature d'écriture : `GESTION_DATES` (aligné planning).
 * FUSION uniquement : upsert planning LOCATION + RxCapacity optionnelles,
 * aucune désactivation silencieuse des règles absentes.
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
          "Mode REPLACE indisponible pour le profil Règles par stand / emplacement (FUSION uniquement, aucune désactivation).",
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
    parsed = parseAccessRulesTable(table);
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

  const [activeZones, activeVehicleTypes] = await Promise.all([
    prisma.zoneConfig.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { zone: true },
    }),
    prisma.vehicleTypeConfig.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { code: true },
    }),
  ]);

  const validZoneCodes = new Set(activeZones.map((z) => z.zone));
  const validVehicleTypeCodes = new Set(
    activeVehicleTypes
      .map((v) => normalizeOptionalCode(v.code))
      .filter((code): code is string => !!code)
  );

  const prepared = await prepareAccessRules(parsed, {
    organizationId: ctx.organizationId,
    eventId: ctx.eventId,
    validZoneCodes,
    validVehicleTypeCodes,
    db: prisma,
  });

  const preview = {
    planningRows: prepared.planningRows.length,
    capacityRows: prepared.capacityRows.length,
    sample: prepared.planningRows.slice(0, 10),
    sampleCapacities: prepared.capacityRows.slice(0, 5),
  };

  if (prepared.errors.length > 0) {
    return Response.json(
      {
        ok: false,
        totalRows: prepared.totalRows,
        errors: prepared.errors,
        warnings: prepared.warnings,
        preview,
      },
      { status: 422 }
    );
  }

  if (!ctx.commit) {
    return Response.json({
      ok: true,
      mode: "dry-run",
      totalRows: prepared.totalRows,
      warnings: prepared.warnings,
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
    sourceProfile: "ACCESS_RULES",
    fileName: ctx.fileName,
    fileHashSha256,
  });

  try {
    const result = await prisma.$transaction(async (tx) =>
      applyAccessRulesCommit(tx as unknown as AccessRulesCommitTx, prepared, {
        organizationId: ctx.organizationId,
        eventId: ctx.eventId,
        importBatchId: batch.id,
        source: "import",
      })
    );

    await completeImportBatch(batchDb, batch.id, result.counters, {
      warnings: prepared.warnings,
      planning: result.planning,
      capacities: result.capacities,
    });

    return Response.json({
      ok: true,
      mode: "commit",
      batchId: batch.id,
      totalRows: prepared.totalRows,
      warnings: prepared.warnings,
      imported: result,
    });
  } catch (err) {
    console.error("Import access-rules — transaction en echec:", err);
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
