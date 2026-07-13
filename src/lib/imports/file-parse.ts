/**
 * Abstraction de lecture de fichier d'import (Phase 3) : dispatch CSV / XLSX
 * vers une table normalisee commune (`ParsedTable`).
 *
 * - CSV  : parseur `csv-parse/sync` (via `parseCsv`).
 * - XLSX : classeur lu avec la dependance `xlsx` DEJA presente (aucune
 *   nouvelle dependance). La 1re feuille est convertie en matrice de cellules
 *   puis normalisee par `rowsToTable`, garantissant un comportement identique
 *   a celui du CSV en aval.
 *
 * Ce module reste generique (format "plat" a entete unique). Le classeur RX
 * planning matriciel a 2 sections est traite par un ADAPTATEUR dedie et isole
 * (`planning-rx-adapter.ts`), pas ici.
 */

import * as XLSX from "xlsx";
import {
  parseCsv,
  rowsToTable,
  detectFileKind,
  type ParsedTable,
  type ImportFileKind,
} from "./csv";

export interface ImportFileInput {
  /** Contenu binaire du fichier (Buffer/Uint8Array), source de verite. */
  buffer: Uint8Array;
  fileName: string;
  mimeType: string;
}

export class UnsupportedImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImportFileError";
  }
}

/** Lit un classeur XLSX (1re feuille) en table normalisee. */
export function parseXlsxBuffer(buffer: Uint8Array): ParsedTable {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rawHeaders: [], records: [] };
  const sheet = wb.Sheets[sheetName];
  // header:1 -> matrice de cellules ; raw:false -> valeurs formatees (texte) ;
  // defval:"" -> cellules vides preservees pour l'alignement des colonnes.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return rowsToTable(rows);
}

/** Decode un buffer en texte UTF-8 (pour le chemin CSV). */
function decodeUtf8(buffer: Uint8Array): string {
  return new TextDecoder("utf-8").decode(buffer);
}

/**
 * Parse un fichier d'import (CSV ou XLSX) en table normalisee generique.
 * Leve `UnsupportedImportFileError` si le type n'est ni CSV ni XLSX.
 */
export function parseImportFile(input: ImportFileInput): ParsedTable {
  const kind: ImportFileKind = detectFileKind({ name: input.fileName, type: input.mimeType });
  if (kind === "xlsx") {
    return parseXlsxBuffer(input.buffer);
  }
  if (kind === "csv") {
    return parseCsv(decodeUtf8(input.buffer));
  }
  throw new UnsupportedImportFileError(
    `Type de fichier non supporte (${input.mimeType || "inconnu"}, ${input.fileName}). Attendu : CSV ou XLSX.`
  );
}
