import { NextRequest } from "next/server";
import { parse } from "csv-parse/sync";
import prisma from "@/lib/prisma";
import { requireEspaceManagement, getAccessibleOrganizationIds } from "@/lib/auth-helpers";

/**
 * `POST /api/admin/exhibitors/import?orgSlug=<slug>&eventSlug=<slug>[&commit=true]`
 *
 * Multipart : field `file` = CSV des exposants.
 *
 * Format CSV attendu : colonnes (header obligatoire, casse libre)
 *   - `name`    : raison sociale exposant (obligatoire)
 *   - `stand`   : numéro de stand (obligatoire)
 *   - `sector`  : secteur logique (optionnel, alimente l'auto-déduction
 *                  d'espace côté template RX)
 *   - `zone`    : zone d'auto-déduction (optionnel)
 *
 * Import idempotent : un exposant existant (même `name` + `stand` pour
 * cet event) est mis à jour ; les nouveaux sont créés ; les anciens
 * absents du CSV sont désactivés (isActive=false) pour ne pas casser les
 * accréditations passées.
 *
 * `commit=false` (par défaut) = dry-run, retourne uniquement les stats.
 * `commit=true` applique réellement.
 */
function handleAuthError(error: unknown) {
  if (error instanceof Response) {
    return new Response(error.body, { status: error.status, statusText: error.statusText });
  }
  return new Response("Non autorisé", { status: 401 });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    const result = await requireEspaceManagement(req, "write");
    session = result.session;
  } catch (err) {
    return handleAuthError(err);
  }

  const orgSlug = req.nextUrl.searchParams.get("orgSlug")?.trim();
  const eventSlug = req.nextUrl.searchParams.get("eventSlug")?.trim();
  const commit = req.nextUrl.searchParams.get("commit") === "true";

  if (!orgSlug || !eventSlug) {
    return Response.json(
      { ok: false, error: "orgSlug et eventSlug sont requis" },
      { status: 400 }
    );
  }

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, isActive: true },
  });
  if (!org) {
    return Response.json({ ok: false, error: "Organisation inconnue" }, { status: 404 });
  }
  const accessibleOrgs = await getAccessibleOrganizationIds(session.user.id);
  if (accessibleOrgs !== "ALL" && !accessibleOrgs.includes(org.id)) {
    return Response.json({ ok: false, error: "Accès refusé à cet espace" }, { status: 403 });
  }

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    select: { id: true, organizationId: true },
  });
  if (!event || event.organizationId !== org.id) {
    return Response.json(
      { ok: false, error: "Event inconnu ou non rattaché à l'organisation" },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "Champ 'file' manquant" }, { status: 400 });
  }

  const text = await file.text();
  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: (h: string[]) => h.map((s) => s.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur de parsing CSV";
    return Response.json(
      { ok: false, error: `Format CSV invalide : ${msg}` },
      { status: 422 }
    );
  }

  type Row = { name: string; stand: string; sector?: string; zone?: string };
  const rows: Row[] = [];
  const errors: Array<{ line: number; reason: string }> = [];

  records.forEach((rec, idx) => {
    const line = idx + 2; // header = ligne 1
    const name = (rec.name ?? "").trim();
    const stand = (rec.stand ?? "").trim();
    if (!name) {
      errors.push({ line, reason: "Colonne 'name' manquante ou vide" });
      return;
    }
    if (!stand) {
      errors.push({ line, reason: "Colonne 'stand' manquante ou vide" });
      return;
    }
    rows.push({
      name,
      stand,
      sector: rec.sector ? rec.sector.trim() : undefined,
      zone: rec.zone ? rec.zone.trim() : undefined,
    });
  });

  if (errors.length > 0) {
    return Response.json(
      { ok: false, totalLines: records.length, errors, preview: [] },
      { status: 422 }
    );
  }

  if (!commit) {
    return Response.json({
      ok: true,
      mode: "dry-run",
      totalLines: rows.length,
      preview: rows.slice(0, 10),
      errors: [],
    });
  }

  // Commit : upsert atomique en transaction
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.exhibitor.findMany({
      where: { eventId: event.id },
      select: { id: true, name: true, stand: true },
    });
    const existingKey = new Map(existing.map((e) => [`${e.name}\u0000${e.stand}`, e.id]));
    const seenKeys = new Set<string>();

    let created = 0;
    let updated = 0;
    let deactivated = 0;

    for (const r of rows) {
      const key = `${r.name}\u0000${r.stand}`;
      seenKeys.add(key);
      const id = existingKey.get(key);
      if (id) {
        await tx.exhibitor.update({
          where: { id },
          data: {
            sector: r.sector ?? null,
            zone: r.zone ?? null,
            isActive: true,
          },
        });
        updated++;
      } else {
        await tx.exhibitor.create({
          data: {
            organizationId: org.id,
            eventId: event.id,
            name: r.name,
            stand: r.stand,
            sector: r.sector ?? null,
            zone: r.zone ?? null,
            isActive: true,
          },
        });
        created++;
      }
    }

    // Désactive les exposants absents du CSV courant (ne supprime pas
    // pour préserver les FK des accréditations historiques)
    const toDeactivate = existing
      .filter((e) => !seenKeys.has(`${e.name}\u0000${e.stand}`))
      .map((e) => e.id);
    if (toDeactivate.length > 0) {
      const res = await tx.exhibitor.updateMany({
        where: { id: { in: toDeactivate } },
        data: { isActive: false },
      });
      deactivated = res.count;
    }

    return { created, updated, deactivated };
  });

  return Response.json({ ok: true, mode: "commit", totalLines: rows.length, ...result });
}
