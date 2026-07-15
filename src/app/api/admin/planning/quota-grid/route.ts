/**
 * GET/POST /api/admin/planning/quota-grid
 *
 * Grille unifiée planning ↔ quotas RxCapacity pour un scopeKey + phase.
 * Lecture : GESTION_DATES ou FLUX_VEHICULES (read).
 * Écriture masse : FLUX_VEHICULES (write), confirm:true obligatoire.
 */

import type { NextRequest } from "next/server";
import type { VehicleFamily } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertEventBelongsToOrg } from "@/lib/auth-helpers";
import { getRxAvailability } from "@/lib/rx-capacity-service";
import type { RxCapacityKey } from "@/lib/rx-capacity";
import {
  resolveCapacityScopeKey,
  zoneScopeKey,
} from "@/lib/rx-capacity-scope";
import {
  assertTimeRange,
  isSlotInsidePlanningRanges,
  isValidDateYmd,
  parsePlanningPhase,
  resolvePlanningAdminContext,
  responseFromError,
  scopeLabel,
} from "@/lib/planning-admin";

type QuotaStatus = "ok" | "hors_planning" | "illimite";

type Anomaly = {
  type: string;
  message: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  vehicleFamily?: string;
  quotaId?: number;
};

async function resolveReadContext(req: NextRequest) {
  const dates = await resolvePlanningAdminContext(req, "GESTION_DATES", "read");
  if (!(dates instanceof Response)) return dates;
  if (dates.status !== 401 && dates.status !== 403) return dates;
  return resolvePlanningAdminContext(req, "FLUX_VEHICULES", "read");
}

function defaultZoneFromScopeKey(scopeKey: string, zoneHint?: string | null): string {
  if (zoneHint?.trim()) return zoneHint.trim();
  if (scopeKey.startsWith("ZONE:")) return scopeKey.slice("ZONE:".length);
  return "LA_BOCCA";
}

export async function GET(req: NextRequest) {
  const context = await resolveReadContext(req);
  if (context instanceof Response) return context;

  try {
    const params = req.nextUrl.searchParams;
    const eventId = params.get("eventId")?.trim() || "";
    const scopeKeyRaw = params.get("scopeKey")?.trim() || "";
    const phaseRaw = params.get("phase")?.trim() || "";
    const zoneHint = params.get("zone")?.trim() || null;

    if (!eventId) {
      return Response.json({ error: "eventId requis" }, { status: 400 });
    }
    if (!scopeKeyRaw) {
      return Response.json({ error: "scopeKey requis" }, { status: 400 });
    }
    const phase = parsePlanningPhase(phaseRaw);
    if (!phase) {
      return Response.json({ error: "phase invalide (MONTAGE|DEMONTAGE)" }, { status: 400 });
    }

    await assertEventBelongsToOrg(eventId, context.orgId);

    const scopeKey = resolveCapacityScopeKey(scopeKeyRaw, defaultZoneFromScopeKey(scopeKeyRaw, zoneHint));
    const zone = defaultZoneFromScopeKey(scopeKey, zoneHint);

    const [planningRows, quotaRows] = await Promise.all([
      prisma.logisticsPlanning.findMany({
        where: {
          organizationId: context.orgId,
          eventId,
          scopeKey,
          phase,
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          categoryCode: true,
          isActive: true,
        },
      }),
      prisma.rxCapacity.findMany({
        where: {
          organizationId: context.orgId,
          eventId,
          scopeKey,
          phase,
        },
        orderBy: [
          { date: "asc" },
          { startTime: "asc" },
          { vehicleFamily: "asc" },
        ],
      }),
    ]);

    const activeRanges = planningRows.filter((r) => r.isActive);
    const planningRanges = planningRows.map((r) => ({
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      ruleId: r.id,
      categoryCode: r.categoryCode,
      isActive: r.isActive,
    }));

    const anomalies: Anomaly[] = [];
    const quotas = await Promise.all(
      quotaRows.map(async (row) => {
        const key: RxCapacityKey = {
          organizationId: row.organizationId,
          eventId: row.eventId,
          scopeKey: row.scopeKey,
          zone: row.zone as RxCapacityKey["zone"],
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          vehicleFamily: row.vehicleFamily as unknown as RxCapacityKey["vehicleFamily"],
          phase: row.phase as unknown as RxCapacityKey["phase"],
        };
        const avail = await getRxAvailability(key);
        const inside = isSlotInsidePlanningRanges(
          { date: row.date, startTime: row.startTime, endTime: row.endTime },
          activeRanges
        );
        const status: QuotaStatus = inside ? "ok" : "hors_planning";
        if (!inside) {
          anomalies.push({
            type: "hors_planning",
            message: `Quota ${row.vehicleFamily} ${row.date} ${row.startTime}-${row.endTime} hors de toute plage planning active`,
            date: row.date,
            startTime: row.startTime,
            endTime: row.endTime,
            vehicleFamily: row.vehicleFamily,
            quotaId: row.id,
          });
        }
        return {
          id: row.id,
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          vehicleFamily: row.vehicleFamily,
          capacity: row.capacity,
          remaining: avail.remaining,
          totalUsed: avail.totalUsed,
          hasQuota: true as const,
          status,
          zone: row.zone,
        };
      })
    );

    // Sous-plages planning sans quota → informatif « illimité »
    for (const range of activeRanges) {
      const hasAnyQuota = quotaRows.some(
        (q) =>
          q.date === range.date &&
          q.startTime >= range.startTime &&
          q.endTime <= range.endTime
      );
      if (!hasAnyQuota) {
        anomalies.push({
          type: "illimite",
          message: `Aucune capacité définie sur ${range.date} ${range.startTime}-${range.endTime} (illimité)`,
          date: range.date,
          startTime: range.startTime,
          endTime: range.endTime,
        });
      }
    }

    return Response.json({
      scopeKey,
      scopeLabel: scopeLabel(scopeKey),
      zone,
      phase,
      planningRanges,
      quotas,
      anomalies,
    });
  } catch (error) {
    return responseFromError(error, "GET /api/admin/planning/quota-grid");
  }
}

type SlotInput = {
  date: string;
  startTime: string;
  endTime: string;
  lightCapacity?: number;
  heavyCapacity?: number;
};

export async function POST(req: NextRequest) {
  const context = await resolvePlanningAdminContext(req, "FLUX_VEHICULES", "write");
  if (context instanceof Response) return context;

  try {
    const body = await req.json();
    if (body.confirm !== true) {
      return Response.json(
        { error: "confirm:true obligatoire pour générer des quotas" },
        { status: 400 }
      );
    }

    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    const scopeKeyRaw = typeof body.scopeKey === "string" ? body.scopeKey.trim() : "";
    const zoneRaw = typeof body.zone === "string" ? body.zone.trim() : "";
    const phase = parsePlanningPhase(body.phase);
    const allowOutOfPlanning = body.allowOutOfPlanning === true;
    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    if (!eventId) return Response.json({ error: "eventId requis" }, { status: 400 });
    if (!scopeKeyRaw) return Response.json({ error: "scopeKey requis" }, { status: 400 });
    if (!zoneRaw) return Response.json({ error: "zone requise" }, { status: 400 });
    if (!phase) {
      return Response.json({ error: "phase invalide (MONTAGE|DEMONTAGE)" }, { status: 400 });
    }
    if (!Array.isArray(body.slots) || body.slots.length === 0) {
      return Response.json({ error: "slots[] requis et non vide" }, { status: 400 });
    }

    await assertEventBelongsToOrg(eventId, context.orgId);

    const scopeKey = resolveCapacityScopeKey(scopeKeyRaw, zoneRaw);
    // Alignement rétrocompat zone ↔ scope ZONE:
    const normalizedScope =
      scopeKey.startsWith("ZONE:") ? scopeKey : scopeKey || zoneScopeKey(zoneRaw);

    const zoneRow = await prisma.zoneConfig.findFirst({
      where: { organizationId: context.orgId, zone: zoneRaw, isActive: true },
      select: { zone: true },
    });
    if (!zoneRow) {
      return Response.json({ error: "zone invalide ou inactive pour cet espace" }, { status: 400 });
    }

    const activeRanges = await prisma.logisticsPlanning.findMany({
      where: {
        organizationId: context.orgId,
        eventId,
        scopeKey: normalizedScope,
        phase,
        isActive: true,
      },
      select: { date: true, startTime: true, endTime: true, isActive: true },
    });

    const slots: SlotInput[] = body.slots;
    const toUpsert: Array<{
      date: string;
      startTime: string;
      endTime: string;
      vehicleFamily: VehicleFamily;
      capacity: number;
    }> = [];

    for (const slot of slots) {
      if (!isValidDateYmd(slot.date)) {
        return Response.json({ error: `date invalide: ${slot.date}` }, { status: 400 });
      }
      const times = assertTimeRange(String(slot.startTime ?? ""), String(slot.endTime ?? ""));
      if (!times.ok) {
        return Response.json({ error: times.error }, { status: 400 });
      }

      const inside = isSlotInsidePlanningRanges(
        { date: slot.date, startTime: times.startTime, endTime: times.endTime },
        activeRanges
      );
      if (!inside && !allowOutOfPlanning) {
        return Response.json(
          {
            error: `Créneau hors planning : ${slot.date} ${times.startTime}-${times.endTime}`,
            code: "HORS_PLANNING",
            date: slot.date,
            startTime: times.startTime,
            endTime: times.endTime,
          },
          { status: 400 }
        );
      }
      if (!inside && allowOutOfPlanning) {
        console.warn(
          `[quota-grid] dérogation hors planning event=${eventId} scope=${normalizedScope} ${slot.date} ${times.startTime}-${times.endTime} reason=${reason || "(none)"}`
        );
      }

      if (slot.lightCapacity !== undefined && slot.lightCapacity !== null) {
        const cap = Number(slot.lightCapacity);
        if (!Number.isInteger(cap) || cap < 1) {
          return Response.json({ error: "lightCapacity doit être un entier >= 1" }, { status: 400 });
        }
        toUpsert.push({
          date: slot.date,
          startTime: times.startTime,
          endTime: times.endTime,
          vehicleFamily: "LIGHT",
          capacity: cap,
        });
      }
      if (slot.heavyCapacity !== undefined && slot.heavyCapacity !== null) {
        const cap = Number(slot.heavyCapacity);
        if (!Number.isInteger(cap) || cap < 1) {
          return Response.json({ error: "heavyCapacity doit être un entier >= 1" }, { status: 400 });
        }
        toUpsert.push({
          date: slot.date,
          startTime: times.startTime,
          endTime: times.endTime,
          vehicleFamily: "HEAVY",
          capacity: cap,
        });
      }
    }

    if (toUpsert.length === 0) {
      return Response.json(
        { error: "Aucun quota à créer (renseigner lightCapacity et/ou heavyCapacity)" },
        { status: 400 }
      );
    }

    const results = [];
    for (const item of toUpsert) {
      const row = await prisma.rxCapacity.upsert({
        where: {
          organizationId_eventId_scopeKey_date_startTime_endTime_vehicleFamily_phase: {
            organizationId: context.orgId,
            eventId,
            scopeKey: normalizedScope,
            date: item.date,
            startTime: item.startTime,
            endTime: item.endTime,
            vehicleFamily: item.vehicleFamily,
            phase,
          },
        },
        create: {
          organizationId: context.orgId,
          eventId,
          scopeKey: normalizedScope,
          zone: zoneRaw,
          date: item.date,
          startTime: item.startTime,
          endTime: item.endTime,
          vehicleFamily: item.vehicleFamily,
          phase,
          capacity: item.capacity,
        },
        update: { capacity: item.capacity, zone: zoneRaw },
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          vehicleFamily: true,
          capacity: true,
          scopeKey: true,
          zone: true,
        },
      });
      results.push(row);
    }

    return Response.json({
      ok: true,
      created: results.length,
      items: results,
      scopeKey: normalizedScope,
      scopeLabel: scopeLabel(normalizedScope),
    });
  } catch (error) {
    return responseFromError(error, "POST /api/admin/planning/quota-grid");
  }
}
