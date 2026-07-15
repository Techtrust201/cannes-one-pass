/**
 * Profil d'import "Capacites" (Phase 5) : parsing + mapping + commit FUSION
 * pour le modele `RxCapacity`.
 *
 * `organizationId` et `eventId` proviennent EXCLUSIVEMENT du contexte serveur
 * (jamais du fichier). La zone doit exister et etre active dans
 * l'organisation — verification faite en amont (route) et injectee ici via
 * `validZoneCodes` (le module de parsing reste pur, aucun acces Prisma).
 *
 * Cle naturelle (identique a `RxCapacity.@@unique`) :
 * organizationId + eventId + zone + date + startTime + endTime +
 * vehicleFamily + phase.
 *
 * Aucune suppression de capacite ni d'accreditation n'est jamais realisee
 * par cet import (FUSION uniquement : creation/mise a jour de la valeur
 * `capacity`).
 */

import { resolveHeader, type ImportRowIssue, type ParsedTable } from "./csv";
import { EMPTY_COUNTERS, type ImportBatchCounters } from "./import-batch";
import { resolveCapacityScopeKey } from "@/lib/rx-capacity-scope";

export type VehicleFamilyValue = "LIGHT" | "HEAVY";
export type PhaseValue = "MONTAGE" | "DEMONTAGE";

export interface ParsedCapacityRow {
  line: number;
  scopeKey: string;
  zone: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: VehicleFamilyValue;
  phase: PhaseValue;
  capacity: number;
}

export interface CapacitiesParseResult {
  rows: ParsedCapacityRow[];
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
  totalRows: number;
}

const ALIASES = {
  scopeKey: ["SCOPE KEY", "SCOPEKEY", "SCOPE", "PORTEE"],
  zone: ["ZONE", "CODE ZONE", "ZONE CODE"],
  date: ["DATE"],
  startTime: ["START TIME", "STARTTIME", "DEBUT", "HEURE DEBUT"],
  endTime: ["END TIME", "ENDTIME", "FIN", "HEURE FIN"],
  vehicleFamily: ["VEHICLE FAMILY", "FAMILLE", "VEHICLEFAMILY"],
  phase: ["PHASE"],
  capacity: ["CAPACITY", "CAPACITE"],
} as const;

export const CAPACITIES_FORBIDDEN_COLUMNS: { code: string; headers: string[] }[] = [
  { code: "id", headers: ["ID", "CAPACITY ID"] },
  { code: "organizationId", headers: ["ORGANIZATIONID", "ORGANIZATION ID", "ORGANIZATION_ID", "ORG ID", "ORGID"] },
  { code: "eventId", headers: ["EVENTID", "EVENT ID", "EVENT_ID"] },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const VALID_FAMILIES = new Set<VehicleFamilyValue>(["LIGHT", "HEAVY"]);
const VALID_PHASES = new Set<PhaseValue>(["MONTAGE", "DEMONTAGE"]);

function str(record: Record<string, string>, header: string | null): string | null {
  if (!header) return null;
  const value = (record[header] ?? "").trim();
  return value === "" ? null : value;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export interface ParseCapacitiesOptions {
  /** Codes de zones actives dans l'organisation (verifiees en amont, hors module pur). */
  validZoneCodes: Set<string>;
}

export function parseCapacitiesTable(
  table: ParsedTable,
  options: ParseCapacitiesOptions
): CapacitiesParseResult {
  const { headers, records } = table;
  const errors: ImportRowIssue[] = [];
  const warnings: ImportRowIssue[] = [];

  const present = new Set(headers);
  for (const forbidden of CAPACITIES_FORBIDDEN_COLUMNS) {
    const hit = forbidden.headers.find((hd) => present.has(hd));
    if (hit) {
      errors.push({
        line: 1,
        column: hit,
        reason: `FORBIDDEN_COLUMN: la colonne "${hit}" (${forbidden.code}) est interdite. L'organisation et l'evenement proviennent du contexte serveur, jamais du fichier.`,
      });
    }
  }

  const h = Object.fromEntries(
    Object.entries(ALIASES).map(([key, aliases]) => [key, resolveHeader(headers, [...aliases])])
  ) as Record<keyof typeof ALIASES, string | null>;

  const rows: ParsedCapacityRow[] = [];
  const seenKeys = new Map<string, number>();

  records.forEach((record, index) => {
    const line = index + 2;

    const scopeRaw = str(record, h.scopeKey);
    const zoneRaw = str(record, h.zone);
    const dateRaw = str(record, h.date);
    const startTimeRaw = str(record, h.startTime);
    const endTimeRaw = str(record, h.endTime);
    const familyRaw = str(record, h.vehicleFamily);
    const phaseRaw = str(record, h.phase);
    const capacityRaw = str(record, h.capacity);

    if (!zoneRaw) {
      errors.push({ line, column: h.zone ?? "ZONE", reason: "MISSING_ZONE: la zone est obligatoire." });
      return;
    }
    if (!options.validZoneCodes.has(zoneRaw)) {
      errors.push({ line, column: h.zone ?? "ZONE", value: zoneRaw, reason: "UNKNOWN_ZONE: zone inexistante ou inactive pour cette organisation." });
      return;
    }
    if (!dateRaw || !DATE_RE.test(dateRaw)) {
      errors.push({ line, column: h.date ?? "DATE", value: dateRaw ?? "", reason: "INVALID_DATE: format attendu YYYY-MM-DD." });
      return;
    }
    if (!startTimeRaw || !TIME_RE.test(startTimeRaw)) {
      errors.push({ line, column: h.startTime ?? "START TIME", value: startTimeRaw ?? "", reason: "INVALID_START_TIME: format attendu HH:MM." });
      return;
    }
    if (!endTimeRaw || !TIME_RE.test(endTimeRaw)) {
      errors.push({ line, column: h.endTime ?? "END TIME", value: endTimeRaw ?? "", reason: "INVALID_END_TIME: format attendu HH:MM." });
      return;
    }
    if (timeToMinutes(endTimeRaw) <= timeToMinutes(startTimeRaw)) {
      errors.push({ line, column: h.endTime ?? "END TIME", value: endTimeRaw, reason: "INVALID_TIME_RANGE: endTime doit etre strictement apres startTime." });
      return;
    }
    const familyToken = (familyRaw ?? "").toUpperCase();
    if (!VALID_FAMILIES.has(familyToken as VehicleFamilyValue)) {
      errors.push({ line, column: h.vehicleFamily ?? "VEHICLE FAMILY", value: familyRaw ?? "", reason: "INVALID_VEHICLE_FAMILY: doit etre LIGHT ou HEAVY." });
      return;
    }
    const phaseToken = (phaseRaw ?? "").toUpperCase();
    if (!VALID_PHASES.has(phaseToken as PhaseValue)) {
      errors.push({ line, column: h.phase ?? "PHASE", value: phaseRaw ?? "", reason: "INVALID_PHASE: doit etre MONTAGE ou DEMONTAGE." });
      return;
    }
    const capacity = Number(capacityRaw);
    if (!capacityRaw || !Number.isInteger(capacity) || capacity < 1) {
      errors.push({ line, column: h.capacity ?? "CAPACITY", value: capacityRaw ?? "", reason: "INVALID_CAPACITY: entier >= 1 obligatoire." });
      return;
    }

    const scopeKey = resolveCapacityScopeKey(scopeRaw, zoneRaw);
    const key = [scopeKey, zoneRaw, dateRaw, startTimeRaw, endTimeRaw, familyToken, phaseToken].join("|");
    const firstSeen = seenKeys.get(key);
    if (firstSeen !== undefined) {
      warnings.push({
        line,
        column: "_row",
        value: key,
        reason: `DUPLICATE_CAPACITY_KEY: meme creneau deja present a la ligne ${firstSeen} dans ce fichier (la derniere occurrence l'emportera au commit).`,
      });
    } else {
      seenKeys.set(key, line);
    }

    rows.push({
      line,
      scopeKey,
      zone: zoneRaw,
      date: dateRaw,
      startTime: startTimeRaw,
      endTime: endTimeRaw,
      vehicleFamily: familyToken as VehicleFamilyValue,
      phase: phaseToken as PhaseValue,
      capacity,
    });
  });

  return { rows, errors, warnings, totalRows: records.length };
}

// ── Commit transactionnel (FUSION / upsert) ──────────────────────────────

export interface CapacitiesCommitTx {
  rxCapacity: {
    findFirst(args: {
      where: {
        organizationId: string;
        eventId: string;
        scopeKey: string;
        date: string;
        startTime: string;
        endTime: string;
        vehicleFamily: VehicleFamilyValue;
        phase: PhaseValue;
      };
      select?: Record<string, unknown>;
    }): Promise<{ id: number; capacity: number } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: number }>;
    update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface CapacitiesCommitContext {
  organizationId: string;
  eventId: string;
}

export interface CapacitiesCommitResult {
  counters: ImportBatchCounters;
  created: number;
  updated: number;
  unchanged: number;
}

export async function applyCapacitiesCommit(
  tx: CapacitiesCommitTx,
  rows: ParsedCapacityRow[],
  ctx: CapacitiesCommitContext
): Promise<CapacitiesCommitResult> {
  const result: CapacitiesCommitResult = { counters: { ...EMPTY_COUNTERS }, created: 0, updated: 0, unchanged: 0 };

  for (const row of rows) {
    const existing = await tx.rxCapacity.findFirst({
      where: {
        organizationId: ctx.organizationId,
        eventId: ctx.eventId,
        scopeKey: row.scopeKey,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        vehicleFamily: row.vehicleFamily,
        phase: row.phase,
      },
      select: { id: true, capacity: true },
    });

    if (!existing) {
      await tx.rxCapacity.create({
        data: {
          organizationId: ctx.organizationId,
          eventId: ctx.eventId,
          scopeKey: row.scopeKey,
          zone: row.zone,
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          vehicleFamily: row.vehicleFamily,
          phase: row.phase,
          capacity: row.capacity,
        },
      });
      result.created += 1;
      continue;
    }

    if (existing.capacity !== row.capacity) {
      await tx.rxCapacity.update({ where: { id: existing.id }, data: { capacity: row.capacity } });
      result.updated += 1;
    } else {
      result.unchanged += 1;
    }
  }

  result.counters = {
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    deactivated: 0,
    errorCount: 0,
  };
  return result;
}
