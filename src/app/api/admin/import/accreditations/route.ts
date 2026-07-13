import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { parseImportRequest } from "@/lib/imports/import-request";
import { checkRowCountGuard } from "@/lib/imports/csv";
import { parseImportFile, UnsupportedImportFileError } from "@/lib/imports/file-parse";
import { parseAccreditationsTable, type AccreditationTemplate } from "@/lib/imports/accreditations";
import {
  previewAccreditationsBatch,
  type AvailabilityReader,
  type AccreditationsPreviewContext,
} from "@/lib/imports/accreditations-preview";
import type { ReferentialResolverDb } from "@/lib/imports/accreditations-referential-resolver";
import {
  computeFileHashSha256,
  findLastCompletedBatchByHash,
  type ImportBatchDb,
} from "@/lib/imports/import-batch";
import { commitAccreditationsBatch, type AccreditationsCommitDb } from "@/lib/imports/accreditations-commit";
import { getRxAvailability } from "@/lib/rx-capacity-service";

/**
 * POST /api/admin/import/accreditations
 *
 * NOUVELLE source de verite pour l'import generique d'accreditations
 * (Phase 4B-3) : toute accreditation importee passe par le MEME moteur
 * (`accreditation-service.ts`) que le formulaire public, le back-office et
 * la duplication — memes quotas, meme historique, memes tokens, memes
 * snapshots, meme e-mail post-commit.
 *
 * Multipart : `file` (CSV/XLSX), `organizationId`, `eventId` — l'organisation
 * et l'evenement viennent UNIQUEMENT du contexte serveur valide par
 * `parseImportRequest` (anti-IDOR), jamais du contenu du fichier (colonnes
 * sensibles rejetees en FORBIDDEN_COLUMN par le parseur, Phase 4B-1).
 *
 * Query :
 *  - `commit=true` (defaut dry-run) ;
 *  - `importMode=PENDING|VALIDATED` (defaut PENDING ; VALIDATED reserve aux
 *    SUPER_ADMIN — statut ATTENTE au lieu de NOUVEAU) ;
 *  - `confirmReimport=true` (reserve aux SUPER_ADMIN, debloque un reimport du
 *    meme fichier) ;
 *  - `confirmDuplicates=true` (debloque des lignes strictement identiques
 *    dans le meme fichier).
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await parseImportRequest(req, "CREER");
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response("Non autorise", { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { role: true },
  });
  const currentUserRole = user?.role;

  const importModeParam = (req.nextUrl.searchParams.get("importMode") ?? "PENDING").toUpperCase();
  const importMode: "PENDING" | "VALIDATED" = importModeParam === "VALIDATED" ? "VALIDATED" : "PENDING";
  if (importMode === "VALIDATED" && currentUserRole !== "SUPER_ADMIN") {
    return Response.json(
      {
        ok: false,
        code: "VALIDATED_IMPORT_FORBIDDEN",
        error:
          "importMode=VALIDATED (creation directe au statut ATTENTE) est reserve aux SUPER_ADMIN.",
      },
      { status: 403 }
    );
  }

  const confirmReimport = req.nextUrl.searchParams.get("confirmReimport") === "true";
  const confirmDuplicates = req.nextUrl.searchParams.get("confirmDuplicates") === "true";

  const organization = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { slug: true, formTemplate: true },
  });
  const event = await prisma.event.findUnique({
    where: { id: ctx.eventId },
    select: { slug: true },
  });
  if (!organization || !event) {
    return Response.json(
      { ok: false, error: "Organisation ou evenement introuvable." },
      { status: 400 }
    );
  }
  const template: AccreditationTemplate = organization.formTemplate === "rx" ? "rx" : "palais";

  let table;
  try {
    table = parseImportFile({
      buffer: ctx.fileBuffer,
      fileName: ctx.fileName,
      mimeType: ctx.mimeType,
    });
  } catch (err) {
    if (err instanceof UnsupportedImportFileError) {
      return Response.json({ ok: false, error: err.message }, { status: 400 });
    }
    throw err;
  }

  const parseResult = parseAccreditationsTable(table, { template });

  const rowGuard = checkRowCountGuard(parseResult.totalRows);
  if (rowGuard) {
    return Response.json(
      { ok: false, errors: [{ line: 1, column: "_row", reason: rowGuard.message }] },
      { status: 413 }
    );
  }

  const previewCtx: AccreditationsPreviewContext = {
    organizationId: ctx.organizationId,
    organizationSlug: organization.slug,
    eventId: ctx.eventId,
    eventSlug: event.slug,
    template,
    importMode,
    currentUserId: ctx.userId,
    currentUserRole,
  };
  const getAvailability: AvailabilityReader = (key) => getRxAvailability(key, prisma);

  const result = await previewAccreditationsBatch(
    prisma as unknown as ReferentialResolverDb,
    parseResult,
    previewCtx,
    getAvailability
  );

  const fileHashSha256 = computeFileHashSha256(ctx.fileBuffer);
  const batchDb = prisma as unknown as ImportBatchDb;
  const previousBatch = await findLastCompletedBatchByHash(batchDb, {
    organizationId: ctx.organizationId,
    sourceProfile: "ACCREDITATIONS",
    fileHashSha256,
  });
  const duplicateRowsDetected = parseResult.warnings.some((w) => w.reason.startsWith("DUPLICATE_ROWS"));

  if (!ctx.commit) {
    return Response.json({
      ok: result.public.ok,
      commit: false,
      importMode,
      fileHashSha256,
      previousBatchId: previousBatch?.id ?? null,
      duplicateRowsDetected,
      preview: result.public,
    });
  }

  // ── Blocages avant commit — reponses controlees, sans stack trace ──────
  const hasLineOrFileErrors =
    result.public.fileErrors.length > 0 || result.public.lines.some((l) => !l.valid);
  if (hasLineOrFileErrors) {
    return Response.json(
      {
        ok: false,
        code: "PREVIEW_INVALID",
        commit: true,
        importMode,
        fileHashSha256,
        preview: result.public,
      },
      { status: 400 }
    );
  }
  if (result.public.batchCapacityErrors.length > 0) {
    return Response.json(
      {
        ok: false,
        code: "BATCH_CAPACITY_EXCEEDED",
        commit: true,
        importMode,
        fileHashSha256,
        batchCapacityErrors: result.public.batchCapacityErrors,
        preview: result.public,
      },
      { status: 409 }
    );
  }
  if (previousBatch && !(confirmReimport && currentUserRole === "SUPER_ADMIN")) {
    return Response.json(
      {
        ok: false,
        code: "REIMPORT_CONFIRMATION_REQUIRED",
        commit: true,
        previousBatchId: previousBatch.id,
        error:
          "Ce fichier (empreinte identique) a deja ete importe. Reimport reserve aux SUPER_ADMIN avec confirmReimport=true.",
      },
      { status: 409 }
    );
  }
  if (duplicateRowsDetected && !confirmDuplicates) {
    return Response.json(
      {
        ok: false,
        code: "DUPLICATES_CONFIRMATION_REQUIRED",
        commit: true,
        error:
          "Des lignes strictement identiques existent dans ce fichier. Ajoutez confirmDuplicates=true pour les importer toutes.",
      },
      { status: 409 }
    );
  }

  const commitResult = await commitAccreditationsBatch(
    batchDb as unknown as AccreditationsCommitDb,
    result.internalLinePlans,
    {
      organizationId: ctx.organizationId,
      eventId: ctx.eventId,
      userId: ctx.userId,
      fileName: ctx.fileName,
      fileHashSha256,
      importMode,
    }
  );

  if (!commitResult.ok) {
    return Response.json(
      {
        ok: false,
        code: commitResult.code,
        commit: true,
        batchId: commitResult.batchId,
        error: commitResult.error,
        details: commitResult.details,
      },
      { status: commitResult.status }
    );
  }

  const sent = commitResult.emailResults.filter((r) => r.outcome === "sent").length;
  const failed = commitResult.emailResults.filter((r) => r.outcome === "failed").length;
  const skippedNoRecipient = commitResult.emailResults.filter(
    (r) => r.outcome === "skipped_no_recipient"
  ).length;
  const skippedDisabled = commitResult.emailResults.filter(
    (r) => r.outcome === "skipped_disabled"
  ).length;

  return Response.json(
    {
      ok: true,
      commit: true,
      importMode,
      batchId: commitResult.batchId,
      created: commitResult.created.length,
      accreditationIds: commitResult.created.map((c) => c.accreditationId),
      emailSummary: {
        total: commitResult.emailResults.length,
        sent,
        failed,
        skippedNoRecipient,
        skippedDisabled,
        allSucceeded: failed === 0,
        results: commitResult.emailResults,
      },
      warnings: {
        fileWarnings: parseResult.warnings,
        lineWarnings: result.public.lines.map((l) => ({ line: l.line, warnings: l.warnings })),
      },
    },
    { status: 201 }
  );
}
