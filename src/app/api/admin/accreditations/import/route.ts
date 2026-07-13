import { NextRequest } from "next/server";
import { parse } from "csv-parse/sync";
import prisma from "@/lib/prisma";
import { requirePermission, getAccessibleEventIds } from "@/lib/auth-helpers";
import { validateCsvRecords, type CsvRowError, type CsvValidRow } from "@/lib/csv-import";
import { getDefaultVehicleTypesForScope } from "@/lib/vehicle-type-defaults";
import {
  previewAccreditation,
  createAccreditationInTransaction,
  type AccreditationCommand,
  type AccreditationServiceContext,
  type AccreditationDb,
  type PreviewAccreditationResult,
} from "@/lib/accreditation-service";

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
 * Route LEGACY (multi-événement par fichier, format historique — un
 * `eventSlug` par ligne). Conservée comme ADAPTATEUR : cette route ne crée
 * plus JAMAIS d'accréditation directement via Prisma. Chaque ligne passe par
 * le MÊME moteur unique (`previewAccreditation` + `createAccreditationInTransaction`)
 * que le formulaire public, le back-office, la duplication et le nouveau
 * centre d'import (`/api/admin/import/accreditations`).
 *
 * Contrairement à la nouvelle route, aucun e-mail n'est envoyé ici — ce
 * comportement (déjà celui de l'ancienne implémentation avant Phase 4B) est
 * préservé pour ne pas changer le contrat observable de cette route legacy.
 *
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

  // Slugs d'events accessibles (avec organisation pour le cloisonnement des
  // gabarits : chaque event valide ses tailles contre le catalogue de SON org).
  const accessibleIds = await getAccessibleEventIds(currentUserId!);
  const eventSelect = {
    slug: true,
    id: true,
    organizationId: true,
    organization: { select: { slug: true } },
  } as const;
  const accessibleEvents =
    accessibleIds === "ALL"
      ? await prisma.event.findMany({ select: eventSelect })
      : await prisma.event.findMany({
          where: { id: { in: accessibleIds } },
          select: eventSelect,
        });
  const slugToId = new Map(accessibleEvents.map((e) => [e.slug, e.id]));
  const accessibleSlugs = new Set(slugToId.keys());
  // Organisation (slug) propriétaire de chaque event — jamais lue depuis le
  // fichier : sert uniquement à sélectionner le bon template (Palais/RX)
  // pour le moteur unique.
  const orgSlugByEventSlug = new Map(
    accessibleEvents.map((e) => [e.slug, e.organization?.slug ?? "palais"])
  );

  // Codes de gabarits valides par organisation présente dans les events.
  const orgIds = Array.from(
    new Set(
      accessibleEvents
        .map((e) => e.organizationId)
        .filter((id): id is string => !!id)
    )
  );
  const activeVehicleTypes = orgIds.length
    ? await prisma.vehicleTypeConfig.findMany({
        where: { isActive: true, organizationId: { in: orgIds } },
        select: { code: true, organizationId: true },
      })
    : [];
  const codesByOrg = new Map<string, Set<string>>();
  for (const t of activeVehicleTypes) {
    if (!t.organizationId) continue;
    const set = codesByOrg.get(t.organizationId) ?? new Set<string>();
    set.add(t.code);
    codesByOrg.set(t.organizationId, set);
  }

  // Codes valides par slug d'event ; repli sur le catalogue par défaut de l'org
  // si aucun gabarit n'est encore configuré côté BDD.
  const sizesByEventSlug = new Map<string, Set<string>>();
  for (const e of accessibleEvents) {
    const fromDb = e.organizationId
      ? codesByOrg.get(e.organizationId)
      : undefined;
    const sizes =
      fromDb && fromDb.size > 0
        ? fromDb
        : new Set(
            getDefaultVehicleTypesForScope(e.organization?.slug).map(
              (t) => t.code
            )
          );
    sizesByEventSlug.set(e.slug, sizes);
  }
  const fallbackSizes = new Set(
    getDefaultVehicleTypesForScope(null).map((t) => t.code)
  );

  const report = validateCsvRecords(
    records,
    accessibleSlugs,
    (eventSlug) => sizesByEventSlug.get(eventSlug) ?? fallbackSizes
  );

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

  // ── Moteur unique : preview HORS transaction (lectures), puis écriture
  // dans UNE transaction partagée par toutes les lignes (comportement
  // atomique inchangé : tout ou rien). Aucun `tx.accreditation.create` ici.
  const plans: { row: CsvValidRow; preview: PreviewAccreditationResult; context: AccreditationServiceContext }[] = [];
  for (const row of report.rows) {
    const organizationSlug = orgSlugByEventSlug.get(row.eventSlug) ?? "palais";
    const command: AccreditationCommand = {
      organizationSlug,
      company: row.company,
      stand: row.stand,
      unloading: row.unloading.length === 2 ? "lat+rear" : row.unloading[0],
      event: row.eventSlug,
      email: row.email,
      consent: true,
      category: row.category ?? undefined,
      vehicles: [
        {
          plate: row.vehiclePlate,
          size: row.vehicleSize,
          phoneCode: row.phoneCode,
          phoneNumber: row.phoneNumber,
          date: row.date,
          time: row.time,
          city: row.city,
          unloading: row.unloading,
          vehicleType: row.vehicleSize,
        },
      ],
    };
    const context: AccreditationServiceContext = {
      channel: "CSV_IMPORT",
      importMode: "PENDING",
      currentUserId,
    };
    const preview = await previewAccreditation(command, context);
    plans.push({ row, preview, context });
  }

  const previewFailure = plans.find((p) => !p.preview.ok);
  if (previewFailure && !previewFailure.preview.ok) {
    return Response.json(
      {
        ok: false,
        totalLines: report.totalLines,
        errors: [
          {
            line: previewFailure.row.line,
            column: "_row" as const,
            reason: `${previewFailure.preview.code ?? "ENGINE_VALIDATION_ERROR"}: ${previewFailure.preview.error}`,
          },
        ],
        preview: [],
      },
      { status: 422 }
    );
  }

  let imported = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const plan of plans) {
        if (!plan.preview.ok) continue; // deja garde par le controle ci-dessus
        await createAccreditationInTransaction(tx as unknown as AccreditationDb, plan.preview, plan.context);
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
