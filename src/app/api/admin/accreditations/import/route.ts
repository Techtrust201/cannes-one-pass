import { NextRequest } from "next/server";
import { parse } from "csv-parse/sync";
import prisma from "@/lib/prisma";
import { requirePermission, getAccessibleEventIds } from "@/lib/auth-helpers";
import { validateCsvRecords, type CsvRowError, type CsvValidRow } from "@/lib/csv-import";
import { writeHistoryDirect } from "@/lib/history-server";
import { CSV_TO_ENUM, deriveCategory } from "@/lib/category-rules";

function handleAuthError(error: unknown) {
  if (error instanceof Response)
    return new Response(error.body, {
      status: error.status,
      statusText: error.statusText,
    });
  return new Response("Non autorisé", { status: 401 });
}

/**
 * POST /api/admin/accreditations/import
 *
 * Multipart : field "file" contient le CSV à importer.
 * Query param "commit=true" pour appliquer réellement l'import (sinon dry-run).
 *
 * Réponse :
 * - 200 { ok: true, mode: "dry-run"|"commit", preview, imported, errors }
 * - 422 { ok: false, errors, totalLines, preview: [] } si validation échoue
 *
 * L'import est ATOMIQUE : si une seule erreur, aucune ligne n'est créée
 * (transaction rollback).
 */
export async function POST(req: NextRequest) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "CREER", "write");
    currentUserId = session.user.id;
  } catch (err) {
    return handleAuthError(err);
  }

  const commit = req.nextUrl.searchParams.get("commit") === "true";

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "Champ 'file' manquant" }, { status: 400 });
  }

  const text = await file.text();

  // csv-parse strict : header sur la première ligne, pas de trim auto sur les valeurs
  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: false,
      bom: true,
      relax_quotes: false,
      relax_column_count: false,
    }) as Record<string, string>[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur de parsing CSV";
    return Response.json(
      {
        ok: false,
        totalLines: 0,
        errors: [
          {
            line: 1,
            column: "_row" as const,
            reason: `Format CSV invalide : ${msg}. Téléchargez le template pour vérifier.`,
          },
        ] satisfies CsvRowError[],
        preview: [],
      },
      { status: 422 }
    );
  }

  // Slugs d'events accessibles
  const accessibleIds = await getAccessibleEventIds(currentUserId!);
  const accessibleEvents =
    accessibleIds === "ALL"
      ? await prisma.event.findMany({ select: { slug: true, id: true } })
      : await prisma.event.findMany({
          where: { id: { in: accessibleIds } },
          select: { slug: true, id: true },
        });
  const slugToId = new Map(accessibleEvents.map((e) => [e.slug, e.id]));
  const accessibleSlugs = new Set(slugToId.keys());

  const report = validateCsvRecords(records, accessibleSlugs);

  if (report.errors.length > 0) {
    return Response.json(
      {
        ok: false,
        totalLines: report.totalLines,
        errors: report.errors,
        preview: report.rows.slice(0, 10),
      },
      { status: 422 }
    );
  }

  if (!commit) {
    return Response.json({
      ok: true,
      mode: "dry-run",
      totalLines: report.totalLines,
      preview: report.rows.slice(0, 10),
      imported: 0,
      errors: [],
    });
  }

  // Commit en transaction : toutes les accréditations ou aucune
  let imported = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const row of report.rows) {
        await createAccreditationFromCsvRow(tx, row, slugToId, currentUserId!);
        imported++;
      }
    });
  } catch (err) {
    console.error("CSV import transaction failed:", err);
    return Response.json(
      {
        ok: false,
        totalLines: report.totalLines,
        errors: [
          {
            line: 0,
            column: "_row" as const,
            reason: `Échec de la transaction : ${err instanceof Error ? err.message : "erreur inconnue"}`,
          },
        ],
        preview: [],
      },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    mode: "commit",
    totalLines: report.totalLines,
    imported,
    errors: [],
  });
}

async function createAccreditationFromCsvRow(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  row: CsvValidRow,
  slugToId: Map<string, string>,
  userId: string
) {
  const eventId = slugToId.get(row.eventSlug)!;

  // Catégorie : override CSV si fournie, sinon déduction auto, sinon null
  let category = row.category ? CSV_TO_ENUM[row.category] ?? null : null;
  let categorySource: "CSV_IMPORT" | "AUTO_DEDUCTION" | null = category
    ? "CSV_IMPORT"
    : null;
  if (!category) {
    const derived = deriveCategory({ stand: row.stand });
    if (derived) {
      category = derived;
      categorySource = "AUTO_DEDUCTION";
    }
  }

  const created = await tx.accreditation.create({
    data: {
      company: row.company,
      stand: row.stand,
      event: row.eventSlug,
      eventId,
      unloading: row.unloading.length === 2 ? "lat+rear" : row.unloading[0],
      email: row.email,
      status: "NOUVEAU",
      consent: true,
      category,
      categorySource,
      vehicles: {
        create: [
          {
            plate: row.vehiclePlate,
            size: row.vehicleSize,
            phoneCode: row.phoneCode,
            phoneNumber: row.phoneNumber,
            date: row.date,
            time: row.time,
            city: row.city,
            unloading: JSON.stringify(row.unloading),
            vehicleType: row.vehicleSize,
          },
        ],
      },
    },
  });

  await writeHistoryDirect(
    {
      accreditationId: created.id,
      action: "CREATED",
      description: `Accréditation créée via import CSV (ligne ${row.line})`,
      userId,
      actorSource: "CSV_IMPORT",
      changeReason: `Import CSV, ligne ${row.line}`,
      diff: { after: { ...row } },
    },
    tx as unknown as typeof prisma
  );

  return created;
}
