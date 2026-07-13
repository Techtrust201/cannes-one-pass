/**
 * Librairie de parsing CSV commune au Centre d'import generalise (Phase 3+).
 *
 * Objectifs (partages par tous les profils : Referentiel, Planning,
 * Accreditations, Zones, Gabarits, Capacites) :
 *  - auto-detection du delimiteur (`,` ou `;`) sur la ligne d'entete ;
 *  - suppression du BOM UTF-8 ;
 *  - entetes normalisees (trim, accents retires, MAJUSCULES, espaces
 *    multiples ramenes a un seul) pour un mapping d'alias fiable ;
 *  - trim systematique des valeurs de cellule ;
 *  - parsing tolerant de dates FR (`DD/MM/YYYY`) et ISO (`YYYY-MM-DD`) ;
 *  - parsing d'heures `HH:MM` (accepte `H:MM`, `HHhMM`, `HH:MM:SS`) ;
 *  - split de cellules multi-valeurs sur `/` ;
 *  - gardes MIME / taille / nombre de lignes.
 *
 * Ce module est PUR : aucune E/S, aucune dependance Prisma. Il ne fait que
 * transformer du texte en structures en memoire (compatible dry-run).
 */

import { parse } from "csv-parse/sync";

// ------------------------------------------------------------------
// Gardes de fichier
// ------------------------------------------------------------------

export const IMPORT_LIMITS = {
  /** Taille maximale du fichier importe (octets). */
  maxBytes: 5 * 1024 * 1024, // 5 Mo
  /** Nombre maximal de lignes de donnees (hors entete). */
  maxRows: 20_000,
  /**
   * Types MIME acceptes pour un CSV. Les navigateurs/OS sont incoherents
   * (Excel installe -> `application/vnd.ms-excel`, sinon `text/csv`, voire
   * `text/plain` ou vide). On reste permissif sur le MIME et strict au parsing.
   */
  allowedCsvMimeTypes: [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
    "",
  ] as const,
  /** Types MIME acceptes pour un classeur XLSX. */
  allowedXlsxMimeTypes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
    "",
  ] as const,
} as const;

export type ImportFileKind = "csv" | "xlsx" | "unknown";

export interface CsvGuardError {
  code: "FILE_TOO_LARGE" | "UNSUPPORTED_MIME" | "TOO_MANY_ROWS" | "EMPTY_FILE";
  message: string;
}

export interface UploadDescriptor {
  size: number;
  type: string;
  name: string;
}

/**
 * Determine la nature du fichier a partir de l'extension (prioritaire, fiable)
 * puis du MIME. `.csv` -> csv, `.xlsx`/`.xls` -> xlsx.
 */
export function detectFileKind(file: { name: string; type: string }): ImportFileKind {
  const name = (file.name ?? "").toLowerCase();
  if (/\.csv$/.test(name)) return "csv";
  if (/\.(xlsx|xlsm|xls)$/.test(name)) return "xlsx";

  const mime = (file.type ?? "").toLowerCase();
  if ((IMPORT_LIMITS.allowedXlsxMimeTypes as readonly string[]).includes(mime) && mime !== "") {
    return "xlsx";
  }
  if ((IMPORT_LIMITS.allowedCsvMimeTypes as readonly string[]).includes(mime) && mime !== "") {
    return "csv";
  }
  return "unknown";
}

/**
 * Verifie taille + MIME + extension avant tout parsing (CSV ou XLSX). Retourne
 * la liste des erreurs bloquantes (vide si le fichier passe les gardes).
 */
export function checkUploadGuards(file: UploadDescriptor): CsvGuardError[] {
  const errors: CsvGuardError[] = [];

  if (file.size <= 0) {
    errors.push({ code: "EMPTY_FILE", message: "Fichier vide." });
  }
  if (file.size > IMPORT_LIMITS.maxBytes) {
    errors.push({
      code: "FILE_TOO_LARGE",
      message: `Fichier trop volumineux (${file.size} octets, max ${IMPORT_LIMITS.maxBytes}).`,
    });
  }

  if (detectFileKind(file) === "unknown") {
    errors.push({
      code: "UNSUPPORTED_MIME",
      message: `Type de fichier non supporte (${file.type || "inconnu"}). Attendu : CSV ou XLSX.`,
    });
  }

  return errors;
}

/** Garde post-parsing sur le nombre de lignes de donnees. */
export function checkRowCountGuard(rowCount: number): CsvGuardError | null {
  if (rowCount > IMPORT_LIMITS.maxRows) {
    return {
      code: "TOO_MANY_ROWS",
      message: `Trop de lignes (${rowCount}, max ${IMPORT_LIMITS.maxRows}).`,
    };
  }
  return null;
}

// ------------------------------------------------------------------
// Normalisation texte
// ------------------------------------------------------------------

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

/**
 * Cle canonique d'entete : accents retires, trim, espaces multiples ramenes a
 * un seul, MAJUSCULES. Ex : "  Zone  T-T " -> "ZONE T-T".
 * Les separateurs `-`/`_` sont conserves (une entete peut porter du sens).
 */
export function normalizeHeaderKey(raw: string): string {
  return stripAccents(stripBom(raw ?? ""))
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

// ------------------------------------------------------------------
// Parsing CSV
// ------------------------------------------------------------------

export interface ParseCsvOptions {
  /** Force un delimiteur ; sinon auto-detection sur la ligne d'entete. */
  delimiter?: "," | ";";
}

/**
 * Table normalisee, format pivot commun a tous les parseurs de fichiers
 * (CSV et XLSX). Les cles des enregistrements sont les entetes normalisees.
 */
export interface ParsedTable {
  /** Entetes normalisees (MAJUSCULES, accents retires), dans l'ordre. */
  headers: string[];
  /** Entetes brutes telles que dans le fichier (pour messages d'erreur). */
  rawHeaders: string[];
  /** Enregistrements, cles = entetes normalisees, valeurs trimmees. */
  records: Record<string, string>[];
}

export interface ParseCsvResult extends ParsedTable {
  /** Delimiteur retenu. */
  delimiter: "," | ";";
}

/**
 * Convertit une matrice de cellules brutes (1re ligne = entete) en table
 * normalisee. Partage entre CSV et XLSX pour garantir un comportement
 * identique en aval. Les cellules sont converties en chaine puis trimmees.
 */
export function rowsToTable(rows: unknown[][]): ParsedTable {
  if (rows.length === 0) {
    return { headers: [], rawHeaders: [], records: [] };
  }
  const rawHeaders = (rows[0] ?? []).map((h) => String(h ?? ""));
  const headers = rawHeaders.map(normalizeHeaderKey);
  const records: Record<string, string>[] = rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = String(cells[index] ?? "").trim();
    });
    return record;
  });
  return { headers, rawHeaders, records };
}

/**
 * Auto-detection du delimiteur : compare le nombre de `;` et de `,` sur la
 * premiere ligne (entete). `;` l'emporte s'il est strictement plus frequent
 * (CSV Excel FR). Par defaut `,`.
 */
export function detectDelimiter(headerLine: string): "," | ";" {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

/**
 * Parse un CSV texte en enregistrements dont les cles sont les entetes
 * normalisees. Le parsing lui-meme est strict (guillemets, comptage de
 * colonnes tolere) ; la validation metier est deleguee aux profils.
 */
export function parseCsv(input: string, options: ParseCsvOptions = {}): ParseCsvResult {
  const text = stripBom(input ?? "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = options.delimiter ?? detectDelimiter(firstLine);

  const rows = parse(text, {
    columns: false,
    skip_empty_lines: true,
    trim: false,
    bom: true,
    delimiter,
    relax_column_count: true,
    relax_quotes: true,
  }) as string[][];

  return { ...rowsToTable(rows), delimiter };
}

/**
 * Resout le nom d'entete normalisee reel correspondant a une liste d'alias
 * (deja normalises MAJUSCULES). Retourne la premiere entete presente, ou null.
 */
export function resolveHeader(headers: string[], aliases: string[]): string | null {
  const present = new Set(headers);
  for (const alias of aliases) {
    if (present.has(alias)) return alias;
  }
  return null;
}

// ------------------------------------------------------------------
// Parsing de valeurs
// ------------------------------------------------------------------

/**
 * Parse une date FR (`DD/MM/YYYY`, `D/M/YYYY`) ou ISO (`YYYY-MM-DD`) et
 * retourne une chaine ISO `YYYY-MM-DD` valide, ou null. Les separateurs
 * acceptes sont `/`, `-` et `.` cote FR. Valide que la date existe reellement
 * (ex: 31/02 est rejete).
 */
export function parseFlexibleDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  // ISO : YYYY-MM-DD
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return buildIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  // FR : DD/MM/YYYY, D-M-YYYY, DD.MM.YYYY
  const fr = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (fr) {
    return buildIsoDate(Number(fr[3]), Number(fr[2]), Number(fr[1]));
  }

  return null;
}

function buildIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null; // date inexistante (ex: 2026-02-31)
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Parse une heure et la normalise en `HH:MM` (24h). Accepte `H:MM`, `HH:MM`,
 * `HHhMM`, `HHh`, `HH:MM:SS`. Retourne null si invalide.
 */
export function parseTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  const match = value.match(/^(\d{1,2})[:h](\d{1,2})?(?::\d{1,2})?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = match[2] !== undefined && match[2] !== "" ? Number(match[2]) : 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Compare deux heures `HH:MM`. Retourne <0, 0 ou >0. */
export function compareTimes(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Split d'une cellule multi-valeurs sur `/`. Trim chaque element, ignore les
 * vides. Ex : "PAN 023 / PAN 024" -> ["PAN 023", "PAN 024"].
 */
export function splitMultiValues(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Enumere toutes les dates ISO `YYYY-MM-DD` entre `startIso` et `endIso`
 * inclus. Retourne null si l'intervalle est invalide (fin avant debut) ou
 * depasse `maxDays` (garde anti-explosion). Une date seule (end == start ou
 * end absent) renvoie un tableau d'un element.
 */
export function enumerateDates(
  startIso: string,
  endIso: string | null | undefined,
  maxDays = 366
): string[] | null {
  const end = endIso && endIso.trim() ? endIso : startIso;
  const start = new Date(`${startIso}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(stop.getTime())) return null;
  if (stop.getTime() < start.getTime()) return null;

  const dates: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= stop.getTime()) {
    if (dates.length >= maxDays) return null;
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// ------------------------------------------------------------------
// Types partages de rapport
// ------------------------------------------------------------------

export interface ImportRowIssue {
  /** Ligne du CSV, 1-indexee (entete = ligne 1). */
  line: number;
  /** Entete normalisee concernee, ou `_row` pour une erreur de ligne. */
  column?: string;
  /** Valeur brute fautive ou code emplacement concerne (facultatif). */
  value?: string;
  /** Code ou message lisible (ex. `RX_LEGACY_PORT_NORMALIZED`). */
  reason: string;
  /** Port source avant normalisation RX legacy (trace import, pas Prisma). */
  sourcePort?: string;
  /** Zone/secteur source avant normalisation RX legacy. */
  sourceSector?: string;
  /** Port canonique apres normalisation. */
  normalizedPortCode?: string | null;
  /** Secteur canonique apres normalisation. */
  normalizedSectorCode?: string | null;
}
