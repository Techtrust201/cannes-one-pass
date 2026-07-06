/**
 * GET/POST/PATCH /api/rx/capacities
 *
 * Gestion interne des quotas RxCapacity.
 * Protégée par FLUX_VEHICULES (read pour GET, write pour POST/PATCH).
 * Pas de DELETE dans cette V1.
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

const VALID_ZONES = new Set(["LA_BOCCA", "PALM_BEACH"]);
const VALID_FAMILIES = new Set<VehicleFamily>(["LIGHT", "HEAVY"]);
const VALID_PHASES = new Set<RxPhase>(["MONTAGE", "DEMONTAGE"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Calcule remaining/isFull pour un quota via getRxAvailability. */
async function enrichQuota(row: {
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
}) {
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
 * GET /api/rx/capacities?espace=<slug>
 * Retourne { quotas, events } pour l'organisation de l'espace.
 * remaining/isFull calculés via getRxAvailability.
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
      return Response.json({ quotas: [], events: [] });
    }

    const [rows, allEvents] = await Promise.all([
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
    ]);

    const quotas = await Promise.all(rows.map(enrichQuota));

    return Response.json({ quotas, events: allEvents });
  } catch (error) {
    console.error("GET /api/rx/capacities error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/rx/capacities?espace=<slug>
 * Crée ou met à jour un quota RxCapacity (upsert sur la clé logique).
 * organizationId résolu côté serveur depuis l'espace.
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
    if (!VALID_ZONES.has(zone))
      return Response.json({ error: `zone invalide (attendu: ${[...VALID_ZONES].join(", ")})` }, { status: 400 });
    if (!DATE_RE.test(date))
      return Response.json({ error: "date invalide (attendu: YYYY-MM-DD)" }, { status: 400 });
    if (!TIME_RE.test(startTime))
      return Response.json({ error: "startTime invalide (attendu: HH:MM)" }, { status: 400 });
    if (!TIME_RE.test(endTime))
      return Response.json({ error: "endTime invalide (attendu: HH:MM)" }, { status: 400 });
    if (!VALID_FAMILIES.has(vehicleFamily))
      return Response.json({ error: "vehicleFamily invalide (LIGHT ou HEAVY)" }, { status: 400 });
    if (!VALID_PHASES.has(phase))
      return Response.json({ error: "phase invalide (MONTAGE ou DEMONTAGE)" }, { status: 400 });
    const cap = Math.round(Number(capacity));
    if (!Number.isFinite(cap) || cap < 1)
      return Response.json({ error: "capacity doit être un entier >= 1" }, { status: 400 });

    // Vérifier que l'event appartient bien à l'org
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, slug: true, organizationId: true },
    });
    if (!event || event.organizationId !== orgId)
      return Response.json({ error: "Événement introuvable pour cet espace" }, { status: 400 });

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

    const result = await enrichQuota(row);
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("POST /api/rx/capacities error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/rx/capacities
 * Modifie uniquement le champ capacity d'un quota existant identifié par id.
 * Body : { id: number, capacity: number }
 */
export async function PATCH(req: NextRequest) {
  try {
    await requirePermission(req, "FLUX_VEHICULES", "write");
  } catch (error) {
    return handleAuthError(error);
  }

  try {
    const body = await req.json();
    const id = Math.round(Number(body.id));
    const cap = Math.round(Number(body.capacity));

    if (!Number.isFinite(id) || id < 1)
      return Response.json({ error: "id invalide" }, { status: 400 });
    if (!Number.isFinite(cap) || cap < 1)
      return Response.json({ error: "capacity doit être un entier >= 1" }, { status: 400 });

    const existing = await prisma.rxCapacity.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing)
      return Response.json({ error: "Quota introuvable" }, { status: 404 });

    const row = await prisma.rxCapacity.update({
      where: { id },
      data: { capacity: cap },
      include: { event: { select: { id: true, name: true, slug: true } } },
    });

    const result = await enrichQuota(row);
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/rx/capacities error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
