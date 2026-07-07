/**
 * GET/POST/PATCH/DELETE /api/capacities
 *
 * Gestion des quotas de capacité (modèle Prisma RxCapacity, conservé en
 * interne pour cette phase). L'API est générique : elle fonctionne pour
 * toutes les organisations, les zones proviennent de ZoneConfig et il n'y a
 * aucun hardcode LA_BOCCA/PALM_BEACH.
 *
 * Protégée par FLUX_VEHICULES (read pour GET, write pour POST/PATCH/DELETE).
 * PATCH et DELETE sont scopés à l'organisation de l'espace courant.
 *
 * @see docs/rx/RX_CAPACITY_CONTRACT.md
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, resolveEspaceOrgId } from "@/lib/auth-helpers";
import { getRxAvailability } from "@/lib/rx-capacity-service";
import type { RxCapacityKey } from "@/lib/rx-capacity";
import type { VehicleFamily, RxPhase } from "@prisma/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

function handleAuthError(error: unknown): Response {
  if (error instanceof Response)
    return new Response(error.body, {
      status: error.status,
      statusText: error.statusText,
    });
  return new Response("Non autorisé", { status: 401 });
}

const VALID_FAMILIES = new Set<VehicleFamily>(["LIGHT", "HEAVY"]);
const VALID_PHASES = new Set<RxPhase>(["MONTAGE", "DEMONTAGE"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Convertit "HH:MM" en minutes depuis minuit (comparaison horaire fiable). */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Charge les zones actives de l'organisation et retourne une map
 * `code -> label` (source de vérité ZoneConfig, aucune duplication).
 */
async function loadZoneLabelMap(orgId: string): Promise<Map<string, string>> {
  const zones = await prisma.zoneConfig.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { zone: true, label: true },
    orderBy: { label: "asc" },
  });
  return new Map(zones.map((z) => [z.zone, z.label]));
}

/** Calcule remaining/isFull pour un quota via getRxAvailability. */
async function enrichQuota(
  row: {
    id: number;
    organizationId: string;
    eventId: string;
    zone: string;
    date: string;
    startTime: string;
    endTime: string;
    vehicleFamily: VehicleFamily;
    phase: RxPhase;
    capacity: number;
    event: { id: string; name: string; slug: string };
  },
  zoneLabelByCode: Map<string, string>
) {
  const key: RxCapacityKey = {
    organizationId: row.organizationId,
    eventId: row.eventId,
    zone: row.zone as RxCapacityKey["zone"],
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    vehicleFamily: row.vehicleFamily as unknown as RxCapacityKey["vehicleFamily"],
    phase: row.phase as unknown as RxCapacityKey["phase"],
  };
  const avail = await getRxAvailability(key);
  return {
    id: row.id,
    organizationId: row.organizationId,
    eventId: row.eventId,
    eventName: row.event.name,
    eventSlug: row.event.slug,
    zone: row.zone,
    zoneLabel: zoneLabelByCode.get(row.zone) ?? row.zone,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    vehicleFamily: row.vehicleFamily,
    phase: row.phase,
    capacity: row.capacity,
    remaining: avail.remaining,
    isFull: avail.isFull,
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

/**
 * GET /api/capacities?espace=<slug>
 * Retourne { quotas, events, zones } pour l'organisation de l'espace.
 * remaining/isFull calculés via getRxAvailability.
 * zones = zones actives de ZoneConfig ({ code, label }).
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "FLUX_VEHICULES", "read");
  } catch (error) {
    return handleAuthError(error);
  }

  try {
    const espace = req.nextUrl.searchParams.get("espace")?.trim() || null;
    const orgId = await resolveEspaceOrgId(espace);

    if (!orgId) {
      return Response.json({ quotas: [], events: [], zones: [] });
    }

    const [rows, allEvents, zoneRows] = await Promise.all([
      prisma.rxCapacity.findMany({
        where: { organizationId: orgId },
        include: { event: { select: { id: true, name: true, slug: true } } },
        orderBy: [
          { eventId: "asc" },
          { phase: "asc" },
          { zone: "asc" },
          { date: "asc" },
          { startTime: "asc" },
          { vehicleFamily: "asc" },
        ],
      }),
      prisma.event.findMany({
        where: { organizationId: orgId, isArchived: false },
        select: { id: true, name: true, slug: true },
        orderBy: { startDate: "desc" },
      }),
      prisma.zoneConfig.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { zone: true, label: true },
        orderBy: { label: "asc" },
      }),
    ]);

    const zoneLabelByCode = new Map(zoneRows.map((z) => [z.zone, z.label]));
    const zones = zoneRows.map((z) => ({ code: z.zone, label: z.label }));

    const quotas = await Promise.all(
      rows.map((row) => enrichQuota(row, zoneLabelByCode))
    );

    return Response.json({ quotas, events: allEvents, zones });
  } catch (error) {
    console.error("GET /api/capacities error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/capacities?espace=<slug>
 * Crée ou met à jour un quota (upsert sur la clé logique).
 * organizationId résolu côté serveur depuis l'espace.
 * La zone doit exister et être active dans ZoneConfig pour l'organisation.
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "FLUX_VEHICULES", "write");
  } catch (error) {
    return handleAuthError(error);
  }

  try {
    const espace = req.nextUrl.searchParams.get("espace")?.trim() || null;
    const orgId = await resolveEspaceOrgId(espace);

    if (!orgId) {
      return Response.json({ error: "Espace introuvable ou inactif" }, { status: 400 });
    }

    const body = await req.json();
    const { eventId, zone, date, startTime, endTime, vehicleFamily, phase, capacity } = body;

    // Validation stricte
    if (!eventId || typeof eventId !== "string")
      return Response.json({ error: "eventId requis" }, { status: 400 });
    if (!zone || typeof zone !== "string")
      return Response.json({ error: "zone requise" }, { status: 400 });
    if (!DATE_RE.test(date))
      return Response.json({ error: "date invalide (attendu: YYYY-MM-DD)" }, { status: 400 });
    if (!TIME_RE.test(startTime))
      return Response.json({ error: "startTime invalide (attendu: HH:MM)" }, { status: 400 });
    if (!TIME_RE.test(endTime))
      return Response.json({ error: "endTime invalide (attendu: HH:MM)" }, { status: 400 });
    if (timeToMinutes(endTime) <= timeToMinutes(startTime))
      return Response.json({ error: "endTime doit être strictement après startTime" }, { status: 400 });
    if (!VALID_FAMILIES.has(vehicleFamily))
      return Response.json({ error: "vehicleFamily invalide (LIGHT ou HEAVY)" }, { status: 400 });
    if (!VALID_PHASES.has(phase))
      return Response.json({ error: "phase invalide (MONTAGE ou DEMONTAGE)" }, { status: 400 });
    // Refus explicite des décimales (pas de Math.round silencieux).
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 1)
      return Response.json({ error: "capacity doit être un entier >= 1" }, { status: 400 });

    // Vérifier que l'event appartient bien à l'org
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, slug: true, organizationId: true },
    });
    if (!event || event.organizationId !== orgId)
      return Response.json({ error: "Événement introuvable pour cet espace" }, { status: 400 });

    // Vérifier que la zone existe et est active dans ZoneConfig pour l'org.
    const zoneRow = await prisma.zoneConfig.findFirst({
      where: { organizationId: orgId, zone, isActive: true },
      select: { zone: true, label: true },
    });
    if (!zoneRow)
      return Response.json({ error: "zone invalide ou inactive pour cet espace" }, { status: 400 });

    const row = await prisma.rxCapacity.upsert({
      where: {
        organizationId_eventId_zone_date_startTime_endTime_vehicleFamily_phase: {
          organizationId: orgId,
          eventId,
          zone,
          date,
          startTime,
          endTime,
          vehicleFamily,
          phase,
        },
      },
      create: { organizationId: orgId, eventId, zone, date, startTime, endTime, vehicleFamily, phase, capacity: cap },
      update: { capacity: cap },
      include: { event: { select: { id: true, name: true, slug: true } } },
    });

    const zoneLabelByCode = new Map([[zoneRow.zone, zoneRow.label]]);
    const result = await enrichQuota(row, zoneLabelByCode);
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("POST /api/capacities error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/capacities?espace=<slug>
 * Modifie uniquement le champ capacity d'un quota existant identifié par id.
 * Scopé à l'organisation de l'espace : refuse un quota d'une autre org.
 * Body : { id: number, capacity: number }
 */
export async function PATCH(req: NextRequest) {
  try {
    await requirePermission(req, "FLUX_VEHICULES", "write");
  } catch (error) {
    return handleAuthError(error);
  }

  try {
    const espace = req.nextUrl.searchParams.get("espace")?.trim() || null;
    const orgId = await resolveEspaceOrgId(espace);

    if (!orgId) {
      return Response.json({ error: "Espace introuvable ou inactif" }, { status: 400 });
    }

    const body = await req.json();
    const id = Number(body.id);
    // Refus explicite des décimales (pas de Math.round silencieux).
    const cap = Number(body.capacity);

    if (!Number.isInteger(id) || id < 1)
      return Response.json({ error: "id invalide" }, { status: 400 });
    if (!Number.isInteger(cap) || cap < 1)
      return Response.json({ error: "capacity doit être un entier >= 1" }, { status: 400 });

    // Scoping org : ne pas révéler l'existence d'un quota d'une autre org.
    const existing = await prisma.rxCapacity.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!existing || existing.organizationId !== orgId)
      return Response.json({ error: "Quota introuvable" }, { status: 404 });

    const row = await prisma.rxCapacity.update({
      where: { id },
      data: { capacity: cap },
      include: { event: { select: { id: true, name: true, slug: true } } },
    });

    const zoneLabelByCode = await loadZoneLabelMap(orgId);
    const result = await enrichQuota(row, zoneLabelByCode);
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/capacities error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/capacities?espace=<slug>
 * Supprime la ligne de quota identifiée par id (scopée à l'organisation).
 * Supprimer un quota = hasQuota devient false : le créneau n'est plus limité et
 * ne bloque plus les demandes. Aucune accréditation n'est supprimée.
 * Body : { id: number }
 */
export async function DELETE(req: NextRequest) {
  try {
    await requirePermission(req, "FLUX_VEHICULES", "write");
  } catch (error) {
    return handleAuthError(error);
  }

  try {
    const espace = req.nextUrl.searchParams.get("espace")?.trim() || null;
    const orgId = await resolveEspaceOrgId(espace);

    if (!orgId) {
      return Response.json({ error: "Espace introuvable ou inactif" }, { status: 400 });
    }

    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1)
      return Response.json({ error: "id invalide" }, { status: 400 });

    // Scoping org : ne pas révéler l'existence d'un quota d'une autre org.
    const existing = await prisma.rxCapacity.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!existing || existing.organizationId !== orgId)
      return Response.json({ error: "Quota introuvable" }, { status: 404 });

    await prisma.rxCapacity.delete({ where: { id } });

    return Response.json({ ok: true, id }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/capacities error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
