/**
 * Adaptateur ISOLE : classeur de planning RX officiel (matrice a 2 sections)
 * -> lignes canoniques `PlanningRow[]` (Phase 3).
 *
 * Le fichier RX (`CYF26-planning.xlsx`) n'est PAS un tableau plat. Structure
 * (cf. scripts/import-rx-planning.ts, source de verite reutilisee ici) :
 *   - deux sections successives : MONTAGE puis DEMONTAGE (marqueur dans une
 *     cellule de la ligne) ;
 *   - chaque section : marqueur + 2 lignes d'entete, puis des lignes de donnees
 *     `PORT | ZONE T-T | PONTON PRIVATIF(4 col) | TERRE(4 col) | BATEAUX A TERRE(4 col)` ;
 *   - chaque bloc de 4 colonnes = [Jour debut, Heure debut, Jour fin, Heure fin],
 *     dates en serie Excel, heures en fraction de jour ; `N/A`/vide = pas de plage.
 *
 * CLE CANONIQUE : chaque ligne est resolue au niveau SECTEUR via EXACTEMENT la
 * meme logique que le referentiel (`resolveReferentialGeography` ->
 * `parseLegacySector`), afin que `scopeKey` corresponde entre un emplacement
 * importe et sa regle de planning (ex : `SECTOR:PALAIS:PALAIS_INT_NU`). Les
 * secteurs distincts ne sont donc JAMAIS fusionnes (SAIL Multicoque !=
 * Monocoque, PALAIS int - NU != int - Equipe).
 *
 * EXCEPTION RX documentee : dans le planning officiel, les secteurs PALAIS sont
 * indiques sous `PORT = VIEUX PORT`, alors que le referentiel utilise
 * `PORT = PALAIS`. Pour garantir des cles identiques, ce port legacy est
 * normalise vers PALAIS UNIQUEMENT ici (warning `RX_LEGACY_PORT_NORMALIZED`).
 * Le parseur generique `parseLegacySector` conserve son comportement prudent.
 *
 * Cet adaptateur reste STRICTEMENT separe du moteur generique. Aucune ecriture
 * DB/Neon.
 */

import * as XLSX from "xlsx";
import { enumerateDates, parseFlexibleDate, parseTime, type ImportRowIssue } from "./csv";
import { resolveReferentialGeography } from "./referential";
import { RX_LEGACY_PORT_NORMALIZED } from "./referential-rx-geography";
import { buildScopeKey, type PlanningRow, type PlanningParseResult, type PhaseCode } from "./planning";

/** Categories des 3 blocs de 4 colonnes, dans l'ordre du fichier officiel. */
const BLOCK_CATEGORIES: { base: number; categoryCode: string }[] = [
  { base: 2, categoryCode: "PONTON_PRIVATIF" },
  { base: 6, categoryCode: "TERRE" },
  { base: 10, categoryCode: "BATEAUX_A_TERRE" },
];

/** Zones PALAIS pour lesquelles le port legacy VIEUX PORT est normalise en PALAIS. */
function isPalaisZone(zone: string): boolean {
  return /^palais\b/i.test(zone.trim());
}

/** Serie Excel (base 1899-12-30) -> date ISO `YYYY-MM-DD`. */
export function excelSerialToIsoDate(n: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Fraction de jour Excel -> `HH:MM` (precision minute). */
export function excelFractionToTime(n: number): string {
  const totalMinutes = Math.round(n * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function cellToIsoDate(v: unknown): string | null {
  if (typeof v === "number") return excelSerialToIsoDate(v);
  if (typeof v === "string") return parseFlexibleDate(v);
  return null;
}

function cellToTime(v: unknown): string | null {
  if (typeof v === "number") return excelFractionToTime(v);
  if (typeof v === "string") return parseTime(v);
  return null;
}

type Plage = { ds: string; hs: string; de: string; he: string } | null;

function isNA(v: unknown): boolean {
  return v === undefined || v === null || v === "" || String(v).trim().toUpperCase() === "N/A";
}

function readPlage(row: unknown[], base: number): Plage {
  const ds = row[base];
  const hs = row[base + 1];
  const de = row[base + 2];
  const he = row[base + 3];
  if (isNA(ds) || isNA(de)) return null;
  const dsIso = cellToIsoDate(ds);
  const deIso = cellToIsoDate(de);
  const hsStr = isNA(hs) ? "08:00" : cellToTime(hs);
  const heStr = isNA(he) ? "23:00" : cellToTime(he);
  if (!dsIso || !deIso || !hsStr || !heStr) return null;
  return { ds: dsIso, hs: hsStr, de: deIso, he: heStr };
}

/** Convention de decoupage quotidien RX (1er jour: hs->23:00 ; dernier: 08:00->he). */
function plageToDailySlots(p: Plage): { date: string; start: string; end: string }[] {
  if (!p) return [];
  const days = enumerateDates(p.ds, p.de);
  if (!days) return [];
  return days.map((date, i) => ({
    date,
    start: i === 0 ? p.hs : "08:00",
    end: i === days.length - 1 ? p.he : "23:00",
  }));
}

function rowHas(row: unknown[], label: string): boolean {
  return row.some((c) => String(c ?? "").trim().toUpperCase() === label);
}

/**
 * Convertit la matrice brute (cellules Excel) en `PlanningParseResult`
 * canonique (scope SECTOR). Fonction PURE : testable avec des lignes
 * construites a la main.
 */
export function buildRxPlanningRows(rows: unknown[][]): PlanningParseResult {
  const errors: ImportRowIssue[] = [];
  const warnings: ImportRowIssue[] = [];

  let montageStart = -1;
  let demontageStart = -1;
  rows.forEach((r, i) => {
    if (montageStart < 0 && rowHas(r, "MONTAGE")) montageStart = i;
    if (rowHas(r, "DEMONTAGE")) demontageStart = i;
  });
  if (montageStart < 0 || demontageStart < 0) {
    errors.push({
      line: 1,
      column: "_row",
      reason: "Sections MONTAGE / DEMONTAGE introuvables dans le classeur RX.",
    });
    return { rows: [], errors, warnings, totalRows: rows.length };
  }

  // Accumulateur : (scopeKey|category|phase|date) -> ligne (fusion min/max si
  // deux lignes du fichier partagent le meme SECTEUR le meme jour).
  const acc = new Map<string, PlanningRow>();

  const mergeInto = (
    base: {
      scopeKey: string;
      portCode: string | null;
      sectorCode: string | null;
      spaceCode: string | null;
      categoryCode: string;
      phase: PhaseCode;
      sourceLine: number;
    },
    slot: { date: string; start: string; end: string }
  ) => {
    const key = [base.scopeKey, base.categoryCode, base.phase, slot.date].join("|");
    const existing = acc.get(key);
    if (!existing) {
      acc.set(key, {
        scope: "SECTOR",
        scopeKey: base.scopeKey,
        portCode: base.portCode,
        sectorCode: base.sectorCode,
        spaceCode: base.spaceCode,
        categoryCode: base.categoryCode,
        phase: base.phase,
        date: slot.date,
        startTime: slot.start,
        endTime: slot.end,
        sourceLine: base.sourceLine,
      });
    } else {
      if (slot.start < existing.startTime) existing.startTime = slot.start;
      if (slot.end > existing.endTime) existing.endTime = slot.end;
    }
  };

  const parseSection = (start: number, end: number, phase: PhaseCode) => {
    // +3 : marqueur de section + 2 lignes d'entete.
    for (let i = start + 3; i < end; i++) {
      const r = rows[i];
      if (!r || isNA(r[0]) || isNA(r[1])) continue; // ligne espaceur/vide
      const rawPort = String(r[0]).trim();
      const zone = String(r[1]).trim();

      // Exception RX : PALAIS int/ext indiques sous VIEUX PORT dans le planning
      // alors que le referentiel utilise PORT = PALAIS -> normalisation ciblee.
      let port = rawPort;
      const rxPortNormalized =
        isPalaisZone(zone) && rawPort.toUpperCase() === "VIEUX PORT";
      if (rxPortNormalized) port = "PALAIS";

      const geo = resolveReferentialGeography(port, zone);
      if (rxPortNormalized) {
        warnings.push({
          line: i + 1,
          column: "_row",
          value: `${rawPort} | ${zone}`,
          reason: RX_LEGACY_PORT_NORMALIZED,
          sourcePort: rawPort,
          sourceSector: zone,
          normalizedPortCode: geo.portCode,
          normalizedSectorCode: geo.sectorCode,
        });
      }
      if (!geo.sectorCode) {
        warnings.push({
          line: i + 1,
          column: "_row",
          value: `${rawPort} | ${zone}`,
          reason: "Secteur non resolu : ligne de planning ignoree.",
        });
        continue;
      }
      const scopeKey = buildScopeKey("SECTOR", geo.portCode, geo.sectorCode, null);
      if (!scopeKey) {
        warnings.push({
          line: i + 1,
          column: "_row",
          value: `${rawPort} | ${zone}`,
          reason: "Cle de portee non calculable : ligne de planning ignoree.",
        });
        continue;
      }

      for (const block of BLOCK_CATEGORIES) {
        const plage = readPlage(r, block.base);
        for (const slot of plageToDailySlots(plage)) {
          mergeInto(
            {
              scopeKey,
              portCode: geo.portCode,
              sectorCode: geo.sectorCode,
              spaceCode: geo.logisticSpace,
              categoryCode: block.categoryCode,
              phase,
              sourceLine: i + 1,
            },
            slot
          );
        }
      }
    }
  };

  parseSection(montageStart, demontageStart, "MONTAGE");
  parseSection(demontageStart, rows.length, "DEMONTAGE");

  return { rows: [...acc.values()], errors, warnings, totalRows: rows.length };
}

/** Lit le classeur RX (1re feuille, series Excel brutes) et adapte la matrice. */
export function parseRxPlanningWorkbook(buffer: Uint8Array): PlanningParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      errors: [{ line: 1, column: "_row", reason: "Classeur vide." }],
      warnings: [],
      totalRows: 0,
    };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false });
  return buildRxPlanningRows(rows);
}
