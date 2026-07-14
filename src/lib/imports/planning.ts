/**
 * Profil d'import "Planning logistique" (Phase 3).
 *
 * Transforme un CSV "format long" (une ligne par regle, plage de dates
 * possible) en lignes `LogisticsPlanning` QUOTIDIENNES en memoire (dry-run).
 * AUCUNE ecriture DB ici.
 *
 * Colonnes attendues :
 *   SCOPE | PORT | SECTOR | SPACE | CATEGORY | PHASE | DATE(_START) | DATE_END | START_TIME | END_TIME
 *
 * Le champ `scope` (EVENT|PORT|SECTOR|SPACE) determine quels codes sont
 * obligatoires et la forme de `scopeKey` (cle canonique alignee sur le schema
 * Prisma : "EVENT", "PORT:PORT_CANTO", "SECTOR:PORT_CANTO:POWER", "SPACE:POWER").
 *
 * Les codes RX sont canonicalises via les helpers deja valides
 * (`normalizeLegacyPortCode` / `normalizeLegacySectorCode`) afin que le
 * planning s'aligne EXACTEMENT sur les codes portes par `ExhibitorLocation`
 * (import Referentiel). Pour une organisation non-RX, les codes sont conserves
 * tels quels (normalises).
 */

import {
  parseCsv,
  resolveHeader,
  parseFlexibleDate,
  parseTime,
  compareTimes,
  enumerateDates,
  type ImportRowIssue,
  type ParsedTable,
} from "./csv";
import { normalizeOptionalCode } from "./normalization";
import { normalizeLegacyPortCode, normalizeLegacySectorCode } from "./legacy-sector";
import { mergeDailyRanges } from "@/lib/logistics-planning";

export type PlanningScopeCode = "EVENT" | "PORT" | "SECTOR" | "SPACE";
export type PhaseCode = "MONTAGE" | "DEMONTAGE";

export const DEFAULT_CATEGORY_CODE = "ALL";

export interface PlanningRow {
  scope: PlanningScopeCode;
  scopeKey: string;
  portCode: string | null;
  sectorCode: string | null;
  spaceCode: string | null;
  categoryCode: string;
  phase: PhaseCode;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  sourceLine: number;
}

export interface PlanningParseResult {
  rows: PlanningRow[];
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
  totalRows: number;
}

const SCOPE_ALIASES = ["SCOPE", "PORTEE"];
const PORT_ALIASES = ["PORT", "PORTCODE", "PORT CODE"];
const SECTOR_ALIASES = ["SECTOR", "SECTEUR", "SECTORCODE", "ZONE T-T", "ZONE"];
const SPACE_ALIASES = ["SPACE", "ESPACE", "SPACECODE", "ESPACE LOGISTIQUE"];
const CATEGORY_ALIASES = ["CATEGORY", "CATEGORIE", "CATEGORYCODE", "CATEGORIE CODE"];
const PHASE_ALIASES = ["PHASE"];
const DATE_START_ALIASES = [
  "DATE START",
  "DATE_START",
  "DATE DEBUT",
  "DATE_DEBUT",
  "DATE",
  "DEBUT",
  "JOUR",
  "JOUR DEBUT",
];
const DATE_END_ALIASES = ["DATE END", "DATE_END", "DATE FIN", "DATE_FIN", "FIN", "JOUR FIN"];
const START_TIME_ALIASES = [
  "START TIME",
  "START_TIME",
  "HEURE DEBUT",
  "HEURE_DEBUT",
  "HEURE DE DEBUT",
  "START",
  "DEBUT HEURE",
];
const END_TIME_ALIASES = [
  "END TIME",
  "END_TIME",
  "HEURE FIN",
  "HEURE_FIN",
  "HEURE DE FIN",
  "END",
  "FIN HEURE",
];

const VALID_SCOPES = new Set<PlanningScopeCode>(["EVENT", "PORT", "SECTOR", "SPACE"]);
const VALID_PHASES = new Set<PhaseCode>(["MONTAGE", "DEMONTAGE"]);

/** Canonicalise un port (RX -> code canonique ; sinon normalise tel quel). */
export function canonicalPortCode(raw: string | null | undefined): string | null {
  const norm = normalizeOptionalCode(raw);
  if (!norm) return null;
  return normalizeLegacyPortCode(norm) ?? norm;
}

/** Canonicalise un secteur (RX -> code canonique ; sinon normalise tel quel). */
export function canonicalSectorCode(raw: string | null | undefined): string | null {
  const norm = normalizeOptionalCode(raw);
  if (!norm) return null;
  return normalizeLegacySectorCode(norm) ?? norm;
}

/**
 * Construit la cle canonique `scopeKey` a partir du scope et des codes.
 * Retourne null si un code obligatoire pour ce scope est absent.
 */
export function buildScopeKey(
  scope: PlanningScopeCode,
  portCode: string | null,
  sectorCode: string | null,
  spaceCode: string | null
): string | null {
  switch (scope) {
    case "EVENT":
      return "EVENT";
    case "PORT":
      return portCode ? `PORT:${portCode}` : null;
    case "SECTOR":
      return portCode && sectorCode ? `SECTOR:${portCode}:${sectorCode}` : null;
    case "SPACE":
      return spaceCode ? `SPACE:${spaceCode}` : null;
  }
}

/** Variante CSV (texte) : delegue a `parsePlanningTable`. */
export function parsePlanningCsv(input: string): PlanningParseResult {
  return parsePlanningTable(parseCsv(input));
}

/**
 * Parse une table normalisee (CSV ou XLSX) au format canonique plat en lignes
 * de planning quotidiennes memoire.
 */
export function parsePlanningTable(table: ParsedTable): PlanningParseResult {
  const errors: ImportRowIssue[] = [];
  const { headers, records } = table;

  const scopeHeader = resolveHeader(headers, SCOPE_ALIASES);
  const phaseHeader = resolveHeader(headers, PHASE_ALIASES);
  const dateStartHeader = resolveHeader(headers, DATE_START_ALIASES);
  const startTimeHeader = resolveHeader(headers, START_TIME_ALIASES);
  const endTimeHeader = resolveHeader(headers, END_TIME_ALIASES);

  const missingColumns: string[] = [];
  if (!scopeHeader) missingColumns.push("SCOPE");
  if (!phaseHeader) missingColumns.push("PHASE");
  if (!dateStartHeader) missingColumns.push("DATE");
  if (!startTimeHeader) missingColumns.push("START TIME");
  if (!endTimeHeader) missingColumns.push("END TIME");
  if (missingColumns.length > 0) {
    errors.push({
      line: 1,
      column: "_row",
      reason: `Colonnes obligatoires manquantes : ${missingColumns.join(", ")}.`,
    });
    return { rows: [], errors, warnings: [], totalRows: records.length };
  }

  const portHeader = resolveHeader(headers, PORT_ALIASES);
  const sectorHeader = resolveHeader(headers, SECTOR_ALIASES);
  const spaceHeader = resolveHeader(headers, SPACE_ALIASES);
  const categoryHeader = resolveHeader(headers, CATEGORY_ALIASES);
  const dateEndHeader = resolveHeader(headers, DATE_END_ALIASES);

  const rows: PlanningRow[] = [];
  const seen = new Map<string, number>();

  records.forEach((record, index) => {
    const line = index + 2;

    const scopeRaw = (record[scopeHeader!] ?? "").trim().toUpperCase();
    if (!VALID_SCOPES.has(scopeRaw as PlanningScopeCode)) {
      errors.push({
        line,
        column: scopeHeader!,
        value: record[scopeHeader!],
        reason: `Scope invalide (attendu : ${[...VALID_SCOPES].join(", ")}).`,
      });
      return;
    }
    const scope = scopeRaw as PlanningScopeCode;

    const phaseRaw = (record[phaseHeader!] ?? "").trim().toUpperCase();
    if (!VALID_PHASES.has(phaseRaw as PhaseCode)) {
      errors.push({
        line,
        column: phaseHeader!,
        value: record[phaseHeader!],
        reason: `Phase invalide (attendu : ${[...VALID_PHASES].join(", ")}).`,
      });
      return;
    }
    const phase = phaseRaw as PhaseCode;

    const portCode = portHeader ? canonicalPortCode(record[portHeader]) : null;
    const sectorCode = sectorHeader ? canonicalSectorCode(record[sectorHeader]) : null;
    const spaceCode = spaceHeader ? normalizeOptionalCode(record[spaceHeader]) : null;
    const categoryCode = categoryHeader
      ? normalizeOptionalCode(record[categoryHeader]) ?? DEFAULT_CATEGORY_CODE
      : DEFAULT_CATEGORY_CODE;

    const scopeKey = buildScopeKey(scope, portCode, sectorCode, spaceCode);
    if (!scopeKey) {
      errors.push({
        line,
        column: "_row",
        reason: `Codes manquants pour le scope ${scope} (PORT/SECTOR/SPACE requis selon le scope).`,
      });
      return;
    }

    const dateStart = parseFlexibleDate(record[dateStartHeader!]);
    if (!dateStart) {
      errors.push({
        line,
        column: dateStartHeader!,
        value: record[dateStartHeader!],
        reason: "Date de debut invalide (attendu DD/MM/YYYY ou YYYY-MM-DD).",
      });
      return;
    }
    const dateEndRaw = dateEndHeader ? record[dateEndHeader] : "";
    const dateEnd = dateEndRaw && dateEndRaw.trim() ? parseFlexibleDate(dateEndRaw) : dateStart;
    if (!dateEnd) {
      errors.push({
        line,
        column: dateEndHeader ?? "_row",
        value: dateEndRaw,
        reason: "Date de fin invalide (attendu DD/MM/YYYY ou YYYY-MM-DD).",
      });
      return;
    }

    const startTime = parseTime(record[startTimeHeader!]);
    if (!startTime) {
      errors.push({
        line,
        column: startTimeHeader!,
        value: record[startTimeHeader!],
        reason: "Heure de debut invalide (attendu HH:MM).",
      });
      return;
    }
    const endTime = parseTime(record[endTimeHeader!]);
    if (!endTime) {
      errors.push({
        line,
        column: endTimeHeader!,
        value: record[endTimeHeader!],
        reason: "Heure de fin invalide (attendu HH:MM).",
      });
      return;
    }
    if (compareTimes(startTime, endTime) >= 0) {
      errors.push({
        line,
        column: "_row",
        value: `${startTime}-${endTime}`,
        reason: "L'heure de fin doit etre strictement posterieure a l'heure de debut.",
      });
      return;
    }

    const days = enumerateDates(dateStart, dateEnd);
    if (!days) {
      errors.push({
        line,
        column: "_row",
        value: `${dateStart}..${dateEnd}`,
        reason: "Plage de dates invalide (fin avant debut ou plage trop longue).",
      });
      return;
    }

    for (const date of days) {
      const dedupKey = [scopeKey, categoryCode, phase, date, startTime, endTime].join("|");
      const firstLine = seen.get(dedupKey);
      if (firstLine !== undefined) {
        errors.push({
          line,
          column: "_row",
          value: dedupKey,
          reason: `Doublon : regle identique deja definie a la ligne ${firstLine} (${date} ${startTime}-${endTime}).`,
        });
        continue;
      }
      seen.set(dedupKey, line);

      rows.push({
        scope,
        scopeKey,
        portCode: scope === "PORT" || scope === "SECTOR" ? portCode : null,
        sectorCode: scope === "SECTOR" ? sectorCode : null,
        spaceCode: scope === "SPACE" ? spaceCode : null,
        categoryCode,
        phase,
        date,
        startTime,
        endTime,
        sourceLine: line,
      });
    }
  });

  // Phase 6C-A (F7) — Détection des plages disjointes pour une même clé
  // (scope + catégorie + phase + jour). Même règle que le moteur runtime
  // (`mergeDailyRanges`, partagée) : fusion si chevauchement/contact, erreur
  // bloquante sinon — jamais de `min(start)-max(end)` artificiel dans un
  // trou. Bloque le commit (ajouté à `errors`), aucune écriture n'a lieu ici.
  const byGroup = new Map<string, PlanningRow[]>();
  for (const r of rows) {
    const key = `${r.scopeKey}|${r.categoryCode}|${r.phase}|${r.date}`;
    const list = byGroup.get(key);
    if (list) list.push(r);
    else byGroup.set(key, [r]);
  }
  for (const [, group] of byGroup) {
    if (group.length < 2) continue;
    const merged = mergeDailyRanges(group.map((r) => ({ start: r.startTime, end: r.endTime })));
    if (!merged.ok) {
      const lines = group.map((r) => r.sourceLine).sort((a, b) => a - b);
      errors.push({
        line: lines[0]!,
        column: "_row",
        value: merged.conflicts.join(", "),
        reason: `PLANNING_DISJOINT_RANGES : plages horaires disjointes pour ${group[0]!.scopeKey} / ${group[0]!.categoryCode} / ${group[0]!.phase} / ${group[0]!.date} (lignes ${lines.join(", ")}) : ${merged.conflicts.join(", ")}. Fusion impossible sans créer un créneau artificiel.`,
      });
    }
  }

  return { rows, errors, warnings: [], totalRows: records.length };
}
