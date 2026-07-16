/**
 * Profil d'import "Règles par stand / emplacement" (ImportProfile.ACCESS_RULES).
 *
 * Une ligne CSV (plage de dates possible) produit :
 *  - des lignes `LogisticsPlanning` quotidiennes en scope LOCATION ;
 *  - optionnellement des lignes `RxCapacity` (même scope LOCATION) si CAPACITY
 *    est renseignée.
 *
 * Atomicité : une capacité invalide rejette toute la ligne (aucun planning
 * partiel). CAPACITY vide → planning seul.
 *
 * Clés d'idempotence (FUSION, aucune désactivation des absents) :
 *  - planning : organizationId + eventId + scopeKey + categoryCode + phase
 *    + date + startTime + endTime (scopeKey = LOCATION:<exhibitorLocationId>) ;
 *  - capacité : organizationId + eventId + scopeKey + date + startTime
 *    + endTime + vehicleFamily + phase.
 *
 * Le parsing structurel est pur ; la résolution exposant/emplacement est
 * injectée (dry-run ou commit) via `resolveReferential` / lookup.
 */

import {
  parseCsv,
  resolveHeader,
  parseFlexibleDate,
  parseTime,
  compareTimes,
  enumerateDates,
  splitMultiValues,
  type ImportRowIssue,
  type ParsedTable,
} from "./csv";
import {
  normalizeExhibitorName,
  normalizeLocationCode,
  normalizeOptionalCode,
} from "./normalization";
import {
  buildScopeKey,
  canonicalPortCode,
  canonicalSectorCode,
  DEFAULT_CATEGORY_CODE,
  type PhaseCode,
} from "./planning";
import { locationScopeKey } from "@/lib/rx-capacity-scope";
import { EMPTY_COUNTERS, type ImportBatchCounters } from "./import-batch";
import {
  resolveReferential,
  type ReferentialResolverDb,
  type ReferentialResolverContext,
} from "./accreditations-referential-resolver";
import type { LocationTypeCode } from "./referential";

export type VehicleFamilyValue = "LIGHT" | "HEAVY";

export interface AccessRuleDraft {
  sourceLine: number;
  eventLabel: string | null;
  company: string;
  companyNormalized: string;
  locationType: LocationTypeCode | null;
  locationCode: string;
  locationCodeNormalized: string;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
  waitingZone: string | null;
  phase: PhaseCode;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: VehicleFamilyValue | null;
  allowedVehicleTypeCodes: string[] | null;
  /** null = planning seul (pas de RxCapacity). */
  capacity: number | null;
  comment: string | null;
  categoryCode: string;
}

export interface AccessRulePlanningRow {
  scope: "LOCATION";
  scopeKey: string;
  exhibitorId: string;
  exhibitorLocationId: string;
  portCode: string | null;
  sectorCode: string | null;
  spaceCode: string | null;
  categoryCode: string;
  phase: PhaseCode;
  date: string;
  startTime: string;
  endTime: string;
  zoneCode: string | null;
  allowedVehicleTypeCodes: string[] | null;
  comment: string | null;
  sourceLine: number;
}

export interface AccessRuleCapacityRow {
  line: number;
  scopeKey: string;
  zone: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: VehicleFamilyValue;
  phase: PhaseCode;
  capacity: number;
}

export interface AccessRulesParseResult {
  drafts: AccessRuleDraft[];
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
  totalRows: number;
}

export interface AccessRulesPrepareResult {
  planningRows: AccessRulePlanningRow[];
  capacityRows: AccessRuleCapacityRow[];
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
  totalRows: number;
}

const ALIASES = {
  event: ["EVENT", "EVENEMENT", "ÉVÉNEMENT", "EVENT NAME", "EVENEMENT NOM"],
  company: ["COMPANY", "COMPANY NAME", "SOCIETE", "SOCIÉTÉ", "EXPOSANT", "NOM", "RAISON SOCIALE"],
  locationType: ["LOCATION TYPE", "TYPE EMPLACEMENT", "TYPE LOCATION", "LOCATIONTYPE", "TYPE"],
  locationCode: [
    "LOCATION CODE",
    "CODE EMPLACEMENT",
    "EMPLACEMENT",
    "LOCATION",
    "STAND",
    "CODE LOCATION",
    "NUM EMPLACEMENT",
  ],
  port: ["PORT", "PORT CODE", "PORTCODE"],
  sector: ["SECTOR", "SECTEUR", "ZONE T-T", "ZONE TT"],
  logisticSpace: ["LOGISTIC SPACE", "ESPACE LOGISTIQUE", "SPACE", "ESPACE", "SPACECODE"],
  waitingZone: ["WAITING ZONE", "ZONE ATTENTE", "ZONE D ATTENTE", "ZONE D'ATTENTE", "ZONE"],
  phase: ["PHASE"],
  dateStart: [
    "DATE START",
    "DATE_START",
    "DATE DEBUT",
    "DATE DÉBUT",
    "DATE_DEBUT",
    "DATE",
    "DEBUT",
    "JOUR DEBUT",
  ],
  dateEnd: ["DATE END", "DATE_END", "DATE FIN", "DATE_FIN", "FIN", "JOUR FIN"],
  startTime: [
    "START TIME",
    "START_TIME",
    "HEURE DEBUT",
    "HEURE DÉBUT",
    "HEURE_DEBUT",
    "HORAIRE DEBUT",
    "START",
  ],
  endTime: [
    "END TIME",
    "END_TIME",
    "HEURE FIN",
    "HEURE_FIN",
    "HORAIRE FIN",
    "END",
  ],
  vehicleFamily: ["VEHICLE FAMILY", "FAMILLE", "FAMILLE VEHICULE", "VEHICLEFAMILY", "FAMILLE VÉHICULE"],
  allowedVehicleTypes: [
    "ALLOWED VEHICLE TYPES",
    "GABARITS AUTORISES",
    "GABARITS AUTORISÉS",
    "TYPES VEHICULES AUTORISES",
    "GABARITS",
    "ALLOWED VEHICLES",
  ],
  capacity: ["CAPACITY", "CAPACITE", "CAPACITÉ", "CAPACITE CRENEAU", "CAPACITÉ CRÉNEAU"],
  comment: ["COMMENT", "COMMENTAIRE", "NOTE", "NOTES"],
  category: ["CATEGORY", "CATEGORIE", "CATÉGORIE", "CATEGORY CODE", "CATEGORIE CODE"],
} as const;

const VALID_PHASES = new Set<PhaseCode>(["MONTAGE", "DEMONTAGE"]);
const VALID_FAMILIES = new Set<VehicleFamilyValue>(["LIGHT", "HEAVY"]);
const VALID_LOCATION_TYPES = new Set<LocationTypeCode>(["TERRE", "FLOT", "STAND"]);

function str(record: Record<string, string>, header: string | null): string | null {
  if (!header) return null;
  const value = (record[header] ?? "").trim();
  return value === "" ? null : value;
}

function parseAllowedVehicleTypes(raw: string | null): string[] | null {
  if (!raw) return null;
  const bySlash = splitMultiValues(raw);
  const tokens =
    bySlash.length > 1
      ? bySlash
      : raw
          .split(/[,;]/)
          .map((part) => part.trim())
          .filter(Boolean);
  const codes = tokens
    .map((token) => normalizeOptionalCode(token))
    .filter((code): code is string => !!code);
  return codes.length > 0 ? codes : null;
}

function parseLocationType(raw: string | null): LocationTypeCode | null | "invalid" {
  if (!raw) return null;
  const token = raw.trim().toUpperCase();
  if (VALID_LOCATION_TYPES.has(token as LocationTypeCode)) {
    return token as LocationTypeCode;
  }
  return "invalid";
}

/** Variante CSV (texte) : délègue à `parseAccessRulesTable`. */
export function parseAccessRulesCsv(input: string): AccessRulesParseResult {
  return parseAccessRulesTable(parseCsv(input));
}

/**
 * Parse structurel (pur) : valide colonnes/valeurs, split multi-jours,
 * atomicité capacité. Aucune résolution DB.
 */
export function parseAccessRulesTable(table: ParsedTable): AccessRulesParseResult {
  const { headers, records } = table;
  const errors: ImportRowIssue[] = [];
  const warnings: ImportRowIssue[] = [];

  const h = Object.fromEntries(
    Object.entries(ALIASES).map(([key, aliases]) => [key, resolveHeader(headers, [...aliases])])
  ) as Record<keyof typeof ALIASES, string | null>;

  const missingColumns: string[] = [];
  if (!h.company) missingColumns.push("COMPANY");
  if (!h.locationCode) missingColumns.push("LOCATION CODE");
  if (!h.phase) missingColumns.push("PHASE");
  if (!h.dateStart) missingColumns.push("DATE START");
  if (!h.startTime) missingColumns.push("START TIME");
  if (!h.endTime) missingColumns.push("END TIME");
  if (missingColumns.length > 0) {
    errors.push({
      line: 1,
      column: "_row",
      reason: `Colonnes obligatoires manquantes : ${missingColumns.join(", ")}.`,
    });
    return { drafts: [], errors, warnings, totalRows: records.length };
  }

  const drafts: AccessRuleDraft[] = [];
  const seenPlanning = new Map<string, number>();

  records.forEach((record, index) => {
    const line = index + 2;
    const rowErrors: ImportRowIssue[] = [];

    const companyRaw = str(record, h.company);
    const companyNormalized = normalizeExhibitorName(companyRaw);
    if (!companyRaw || !companyNormalized) {
      rowErrors.push({
        line,
        column: h.company!,
        value: companyRaw ?? "",
        reason: "MISSING_COMPANY: la société / exposant est obligatoire.",
      });
    }

    const locationCodeRaw = str(record, h.locationCode);
    const locationNormalized = normalizeLocationCode(locationCodeRaw);
    if (!locationCodeRaw || !locationNormalized) {
      rowErrors.push({
        line,
        column: h.locationCode!,
        value: locationCodeRaw ?? "",
        reason: "MISSING_LOCATION_CODE: le code d'emplacement est obligatoire.",
      });
    }

    const locationTypeParsed = parseLocationType(str(record, h.locationType));
    if (locationTypeParsed === "invalid") {
      rowErrors.push({
        line,
        column: h.locationType ?? "LOCATION TYPE",
        value: str(record, h.locationType) ?? "",
        reason: "INVALID_LOCATION_TYPE: attendu TERRE, FLOT ou STAND.",
      });
    }

    const phaseRaw = (str(record, h.phase) ?? "").toUpperCase();
    if (!VALID_PHASES.has(phaseRaw as PhaseCode)) {
      rowErrors.push({
        line,
        column: h.phase!,
        value: str(record, h.phase) ?? "",
        reason: "INVALID_PHASE: doit être MONTAGE ou DEMONTAGE.",
      });
    }

    const dateStart = parseFlexibleDate(str(record, h.dateStart));
    if (!dateStart) {
      rowErrors.push({
        line,
        column: h.dateStart!,
        value: str(record, h.dateStart) ?? "",
        reason: "INVALID_DATE_START: attendu DD/MM/YYYY ou YYYY-MM-DD.",
      });
    }
    const dateEndRaw = str(record, h.dateEnd);
    const dateEnd = dateEndRaw ? parseFlexibleDate(dateEndRaw) : dateStart;
    if (dateEndRaw && !dateEnd) {
      rowErrors.push({
        line,
        column: h.dateEnd ?? "DATE END",
        value: dateEndRaw,
        reason: "INVALID_DATE_END: attendu DD/MM/YYYY ou YYYY-MM-DD.",
      });
    }

    const startTime = parseTime(str(record, h.startTime));
    if (!startTime) {
      rowErrors.push({
        line,
        column: h.startTime!,
        value: str(record, h.startTime) ?? "",
        reason: "INVALID_START_TIME: format attendu HH:MM.",
      });
    }
    const endTime = parseTime(str(record, h.endTime));
    if (!endTime) {
      rowErrors.push({
        line,
        column: h.endTime!,
        value: str(record, h.endTime) ?? "",
        reason: "INVALID_END_TIME: format attendu HH:MM.",
      });
    }
    if (startTime && endTime && compareTimes(startTime, endTime) >= 0) {
      rowErrors.push({
        line,
        column: "_row",
        value: `${startTime}-${endTime}`,
        reason: "INVALID_TIME_RANGE: l'heure de fin doit être strictement postérieure à l'heure de début.",
      });
    }

    const capacityRaw = str(record, h.capacity);
    let capacity: number | null = null;
    if (capacityRaw) {
      const n = Number(capacityRaw);
      if (!Number.isInteger(n) || n < 1) {
        rowErrors.push({
          line,
          column: h.capacity ?? "CAPACITY",
          value: capacityRaw,
          reason:
            "INVALID_CAPACITY: entier >= 1 obligatoire si renseigné (ligne entière rejetée, aucun planning partiel).",
        });
      } else {
        capacity = n;
      }
    }

    const familyRaw = str(record, h.vehicleFamily);
    let vehicleFamily: VehicleFamilyValue | null = null;
    if (familyRaw) {
      const token = familyRaw.toUpperCase();
      if (!VALID_FAMILIES.has(token as VehicleFamilyValue)) {
        rowErrors.push({
          line,
          column: h.vehicleFamily ?? "VEHICLE FAMILY",
          value: familyRaw,
          reason: "INVALID_VEHICLE_FAMILY: doit être LIGHT ou HEAVY.",
        });
      } else {
        vehicleFamily = token as VehicleFamilyValue;
      }
    }
    if (capacity !== null && !vehicleFamily && !rowErrors.some((e) => e.reason.startsWith("INVALID_VEHICLE_FAMILY"))) {
      rowErrors.push({
        line,
        column: h.vehicleFamily ?? "VEHICLE FAMILY",
        value: familyRaw ?? "",
        reason:
          "MISSING_VEHICLE_FAMILY: obligatoire lorsque CAPACITY est renseignée (ligne entière rejetée).",
      });
    }
    if (capacity !== null) {
      const waitingZone = str(record, h.waitingZone);
      if (!waitingZone) {
        rowErrors.push({
          line,
          column: h.waitingZone ?? "WAITING ZONE",
          value: "",
          reason:
            "MISSING_WAITING_ZONE: obligatoire lorsque CAPACITY est renseignée (ligne entière rejetée).",
        });
      }
    }

    let days: string[] | null = null;
    if (dateStart && dateEnd && rowErrors.length === 0) {
      days = enumerateDates(dateStart, dateEnd);
      if (!days) {
        rowErrors.push({
          line,
          column: "_row",
          value: `${dateStart}..${dateEnd}`,
          reason: "INVALID_DATE_RANGE: fin avant début ou plage trop longue.",
        });
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    const categoryCode = h.category
      ? normalizeOptionalCode(str(record, h.category)) ?? DEFAULT_CATEGORY_CODE
      : DEFAULT_CATEGORY_CODE;

    const portCode = canonicalPortCode(str(record, h.port));
    const sectorCode = canonicalSectorCode(str(record, h.sector));
    const logisticSpace = normalizeOptionalCode(str(record, h.logisticSpace));
    const waitingZone = normalizeOptionalCode(str(record, h.waitingZone));
    const allowedVehicleTypeCodes = parseAllowedVehicleTypes(str(record, h.allowedVehicleTypes));
    const comment = str(record, h.comment);
    const eventLabel = str(record, h.event);

    for (const date of days!) {
      // Dédup fichier provisoire (avant résolution LOCATION) sur critères naturels.
      const dedupKey = [
        companyNormalized!,
        locationNormalized!.codeNormalized,
        locationTypeParsed ?? "",
        categoryCode,
        phaseRaw,
        date,
        startTime!,
        endTime!,
        vehicleFamily ?? "",
        capacity ?? "",
      ].join("|");
      const first = seenPlanning.get(dedupKey);
      if (first !== undefined) {
        errors.push({
          line,
          column: "_row",
          value: dedupKey,
          reason: `DUPLICATE_ACCESS_RULE: règle identique déjà définie à la ligne ${first}.`,
        });
        continue;
      }
      seenPlanning.set(dedupKey, line);

      drafts.push({
        sourceLine: line,
        eventLabel,
        company: companyRaw!,
        companyNormalized: companyNormalized!,
        locationType: locationTypeParsed as LocationTypeCode | null,
        locationCode: locationNormalized!.code,
        locationCodeNormalized: locationNormalized!.codeNormalized,
        portCode,
        sectorCode,
        logisticSpace,
        waitingZone,
        phase: phaseRaw as PhaseCode,
        date,
        startTime: startTime!,
        endTime: endTime!,
        vehicleFamily,
        allowedVehicleTypeCodes,
        capacity,
        comment,
        categoryCode,
      });
    }
  });

  return { drafts, errors, warnings, totalRows: records.length };
}

export interface PrepareAccessRulesOptions {
  organizationId: string;
  eventId: string;
  /** Zones actives de l'organisation (codes ZoneConfig). */
  validZoneCodes: Set<string>;
  /** Si fourni, valide les gabarits autorisés contre ce catalogue. */
  validVehicleTypeCodes?: Set<string>;
  db: ReferentialResolverDb;
}

/**
 * Résout exposant + emplacement (dry-run / commit), construit les lignes
 * planning LOCATION et capacités optionnelles. Aucune écriture.
 */
export async function prepareAccessRules(
  parseResult: AccessRulesParseResult,
  options: PrepareAccessRulesOptions
): Promise<AccessRulesPrepareResult> {
  const errors = [...parseResult.errors];
  const warnings = [...parseResult.warnings];
  const planningRows: AccessRulePlanningRow[] = [];
  const capacityRows: AccessRuleCapacityRow[] = [];

  const ctx: ReferentialResolverContext = {
    organizationId: options.organizationId,
    eventId: options.eventId,
  };

  type ResolvedLoc = { exhibitorId: string; exhibitorLocationId: string };
  const resolveCache = new Map<string, ResolvedLoc | ImportRowIssue>();

  async function resolveDraft(draft: AccessRuleDraft): Promise<ResolvedLoc | null> {
    const cacheKey = [
      draft.companyNormalized,
      draft.locationCodeNormalized,
      draft.locationType ?? "",
    ].join("|");
    const cached = resolveCache.get(cacheKey);
    if (cached) {
      if ("reason" in cached) {
        errors.push({ ...cached, line: draft.sourceLine });
        return null;
      }
      return cached;
    }

    const resolution = await resolveReferential(options.db, ctx, {
      name: draft.company,
      locationCode: draft.locationCode,
      locationType: draft.locationType,
    });

    if (!resolution.ok) {
      const issue: ImportRowIssue = {
        line: draft.sourceLine,
        column: "_row",
        value: `${draft.company} / ${draft.locationCode}`,
        reason: `${resolution.code}: ${resolution.message}`,
      };
      resolveCache.set(cacheKey, issue);
      errors.push(issue);
      return null;
    }

    if (!resolution.exhibitorLocationId) {
      const issue: ImportRowIssue = {
        line: draft.sourceLine,
        column: "LOCATION CODE",
        value: draft.locationCode,
        reason:
          "LOCATION_REQUIRED: un emplacement valide est obligatoire pour une règle LOCATION.",
      };
      resolveCache.set(cacheKey, issue);
      errors.push(issue);
      return null;
    }

    const ok: ResolvedLoc = {
      exhibitorId: resolution.exhibitorId,
      exhibitorLocationId: resolution.exhibitorLocationId,
    };
    resolveCache.set(cacheKey, ok);
    return ok;
  }

  const seenCapacity = new Map<string, number>();

  for (const draft of parseResult.drafts) {
    const resolved = await resolveDraft(draft);
    if (!resolved) continue;

    const scopeKey = buildScopeKey(
      "LOCATION",
      null,
      null,
      null,
      resolved.exhibitorLocationId
    );
    if (!scopeKey) {
      errors.push({
        line: draft.sourceLine,
        column: "_row",
        reason: "SCOPE_KEY_ERROR: impossible de construire LOCATION:<exhibitorLocationId>.",
      });
      continue;
    }

    if (draft.allowedVehicleTypeCodes && options.validVehicleTypeCodes) {
      const unknown = draft.allowedVehicleTypeCodes.filter(
        (code) => !options.validVehicleTypeCodes!.has(code)
      );
      if (unknown.length > 0) {
        errors.push({
          line: draft.sourceLine,
          column: "ALLOWED VEHICLE TYPES",
          value: unknown.join(", "),
          reason: `UNKNOWN_VEHICLE_TYPE: gabarit(s) inconnu(s) ou inactif(s) : ${unknown.join(", ")}.`,
        });
        continue;
      }
    }

    // Capacité présente → zone d'attente doit exister (atomicité déjà partiellement
    // validée au parse ; recontrôle catalogue ici).
    if (draft.capacity !== null) {
      const zone = draft.waitingZone;
      if (!zone || !options.validZoneCodes.has(zone)) {
        errors.push({
          line: draft.sourceLine,
          column: "WAITING ZONE",
          value: zone ?? "",
          reason:
            "UNKNOWN_ZONE: zone d'attente inexistante ou inactive (ligne entière rejetée, aucun planning partiel).",
        });
        continue;
      }
      if (!draft.vehicleFamily) {
        errors.push({
          line: draft.sourceLine,
          column: "VEHICLE FAMILY",
          reason: "MISSING_VEHICLE_FAMILY: obligatoire lorsque CAPACITY est renseignée.",
        });
        continue;
      }

      const capKey = [
        scopeKey,
        draft.date,
        draft.startTime,
        draft.endTime,
        draft.vehicleFamily,
        draft.phase,
      ].join("|");
      const firstCap = seenCapacity.get(capKey);
      if (firstCap !== undefined) {
        warnings.push({
          line: draft.sourceLine,
          column: "_row",
          value: capKey,
          reason: `DUPLICATE_CAPACITY_KEY: même créneau déjà présent à la ligne ${firstCap} (la dernière occurrence l'emportera au commit).`,
        });
      } else {
        seenCapacity.set(capKey, draft.sourceLine);
      }

      capacityRows.push({
        line: draft.sourceLine,
        scopeKey: locationScopeKey(resolved.exhibitorLocationId),
        zone,
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime,
        vehicleFamily: draft.vehicleFamily,
        phase: draft.phase,
        capacity: draft.capacity,
      });
    } else if (draft.waitingZone && !options.validZoneCodes.has(draft.waitingZone)) {
      warnings.push({
        line: draft.sourceLine,
        column: "WAITING ZONE",
        value: draft.waitingZone,
        reason:
          "UNKNOWN_ZONE_WARNING: zone d'attente inconnue — ignorée pour le planning (CAPACITY absente).",
      });
    }

    const zoneCode =
      draft.waitingZone && options.validZoneCodes.has(draft.waitingZone)
        ? draft.waitingZone
        : null;

    planningRows.push({
      scope: "LOCATION",
      scopeKey,
      exhibitorId: resolved.exhibitorId,
      exhibitorLocationId: resolved.exhibitorLocationId,
      portCode: draft.portCode,
      sectorCode: draft.sectorCode,
      spaceCode: draft.logisticSpace,
      categoryCode: draft.categoryCode,
      phase: draft.phase,
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      zoneCode,
      allowedVehicleTypeCodes: draft.allowedVehicleTypeCodes,
      comment: draft.comment,
      sourceLine: draft.sourceLine,
    });
  }

  return {
    planningRows,
    capacityRows,
    errors,
    warnings,
    totalRows: parseResult.totalRows,
  };
}

// ── Commit transactionnel (FUSION / upsert) ──────────────────────────────

export interface AccessRulesCommitTx {
  logisticsPlanning: {
    findFirst(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<{
      id: string;
      zoneCode: string | null;
      allowedVehicleTypeCodes: unknown;
      comment: string | null;
      portCode: string | null;
      sectorCode: string | null;
      spaceCode: string | null;
      exhibitorLocationId: string | null;
    } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  rxCapacity: {
    findFirst(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<{ id: number; capacity: number; zone: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: number }>;
    update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface AccessRulesCommitContext {
  organizationId: string;
  eventId: string;
  importBatchId?: string | null;
  source?: string;
}

export interface AccessRulesCommitResult {
  counters: ImportBatchCounters;
  created: number;
  updated: number;
  unchanged: number;
  planning: { created: number; updated: number; unchanged: number };
  capacities: { created: number; updated: number; unchanged: number };
}

function sameJsonCodes(a: unknown, b: string[] | null): boolean {
  const left = Array.isArray(a) ? [...a].map(String).sort() : [];
  const right = b ? [...b].sort() : [];
  if (left.length !== right.length) return false;
  return left.every((v, i) => v === right[i]);
}

/**
 * Applique planning LOCATION + capacités optionnelles dans une seule
 * transaction. FUSION : upsert par clé d'idempotence, jamais de désactivation.
 */
export async function applyAccessRulesCommit(
  tx: AccessRulesCommitTx,
  prepared: Pick<AccessRulesPrepareResult, "planningRows" | "capacityRows">,
  ctx: AccessRulesCommitContext
): Promise<AccessRulesCommitResult> {
  const planning = { created: 0, updated: 0, unchanged: 0 };
  const capacities = { created: 0, updated: 0, unchanged: 0 };

  for (const row of prepared.planningRows) {
    const existing = await tx.logisticsPlanning.findFirst({
      where: {
        organizationId: ctx.organizationId,
        eventId: ctx.eventId,
        scopeKey: row.scopeKey,
        categoryCode: row.categoryCode,
        phase: row.phase,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
      },
      select: {
        id: true,
        zoneCode: true,
        allowedVehicleTypeCodes: true,
        comment: true,
        portCode: true,
        sectorCode: true,
        spaceCode: true,
        exhibitorLocationId: true,
      },
    });

    const data = {
      scope: "LOCATION" as const,
      scopeKey: row.scopeKey,
      exhibitorLocationId: row.exhibitorLocationId,
      portCode: row.portCode,
      sectorCode: row.sectorCode,
      spaceCode: row.spaceCode,
      categoryCode: row.categoryCode,
      phase: row.phase,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      zoneCode: row.zoneCode,
      allowedVehicleTypeCodes: row.allowedVehicleTypeCodes,
      comment: row.comment,
      isActive: true,
      source: ctx.source ?? "import",
      importBatchId: ctx.importBatchId ?? null,
    };

    if (!existing) {
      await tx.logisticsPlanning.create({
        data: {
          organizationId: ctx.organizationId,
          eventId: ctx.eventId,
          ...data,
        },
      });
      planning.created += 1;
      continue;
    }

    const unchangedMeta =
      existing.zoneCode === row.zoneCode &&
      existing.comment === row.comment &&
      existing.portCode === row.portCode &&
      existing.sectorCode === row.sectorCode &&
      existing.spaceCode === row.spaceCode &&
      existing.exhibitorLocationId === row.exhibitorLocationId &&
      sameJsonCodes(existing.allowedVehicleTypeCodes, row.allowedVehicleTypeCodes);

    if (unchangedMeta) {
      planning.unchanged += 1;
    } else {
      await tx.logisticsPlanning.update({
        where: { id: existing.id },
        data: {
          zoneCode: row.zoneCode,
          allowedVehicleTypeCodes: row.allowedVehicleTypeCodes,
          comment: row.comment,
          portCode: row.portCode,
          sectorCode: row.sectorCode,
          spaceCode: row.spaceCode,
          exhibitorLocationId: row.exhibitorLocationId,
          isActive: true,
          source: ctx.source ?? "import",
          importBatchId: ctx.importBatchId ?? null,
        },
      });
      planning.updated += 1;
    }
  }

  for (const row of prepared.capacityRows) {
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
      select: { id: true, capacity: true, zone: true },
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
      capacities.created += 1;
      continue;
    }

    if (existing.capacity !== row.capacity || existing.zone !== row.zone) {
      await tx.rxCapacity.update({
        where: { id: existing.id },
        data: { capacity: row.capacity, zone: row.zone },
      });
      capacities.updated += 1;
    } else {
      capacities.unchanged += 1;
    }
  }

  const created = planning.created + capacities.created;
  const updated = planning.updated + capacities.updated;
  const unchanged = planning.unchanged + capacities.unchanged;

  return {
    counters: {
      ...EMPTY_COUNTERS,
      created,
      updated,
      unchanged,
    },
    created,
    updated,
    unchanged,
    planning,
    capacities,
  };
}
