/**
 * Modeles de fichiers d'import (Phase 3) : templates CSV reellement
 * telechargeables via `GET /api/admin/import/template`. Chaque profil fournit
 * un modele VIDE (entetes seules) et un EXEMPLE rempli.
 *
 * Le format canonique est volontairement compatible CSV et XLSX (memes
 * entetes). Le classeur RX matriciel officiel n'a pas de "template" : il est
 * consomme tel quel via l'adaptateur (`format=rx`).
 */

export type TemplateProfile = "referential" | "planning";
export type TemplateKind = "empty" | "example";

const REFERENTIAL_HEADERS = ["PORT", "ZONE T-T", "COMPANY NAME", "NUM-TERRE", "NUM-FLOT"];

const REFERENTIAL_EXAMPLE_ROWS: string[][] = [
  ["PORT CANTO", "POWER", "Sunseeker", "POWER 209", "POWER 210"],
  ["VIEUX PORT", "JETEE", "Ferretti Group", "JETEE 012", ""],
  ["VIEUX PORT", "PAN", "Multi Stand SARL", "PAN 023 / PAN 024", ""],
];

const PLANNING_HEADERS = [
  "SCOPE",
  "PORT",
  "SECTOR",
  "SPACE",
  "CATEGORY",
  "PHASE",
  "DATE START",
  "DATE END",
  "START TIME",
  "END TIME",
];

const PLANNING_EXAMPLE_ROWS: string[][] = [
  ["SPACE", "", "", "POWER", "BATEAU_TERRE", "DEMONTAGE", "2026-09-16", "2026-09-17", "12:00", "17:00"],
  ["SECTOR", "VIEUX PORT", "JETEE", "", "STAND_TENTE", "MONTAGE", "2026-09-01", "2026-09-01", "08:00", "18:00"],
  ["EVENT", "", "", "", "", "MONTAGE", "2026-09-05", "2026-09-05", "08:00", "20:00"],
];

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return lines.join("\n") + "\n";
}

export function buildReferentialTemplate(kind: TemplateKind): string {
  return toCsv(REFERENTIAL_HEADERS, kind === "example" ? REFERENTIAL_EXAMPLE_ROWS : []);
}

export function buildPlanningTemplate(kind: TemplateKind): string {
  return toCsv(PLANNING_HEADERS, kind === "example" ? PLANNING_EXAMPLE_ROWS : []);
}

export function buildTemplate(profile: TemplateProfile, kind: TemplateKind): string {
  return profile === "planning"
    ? buildPlanningTemplate(kind)
    : buildReferentialTemplate(kind);
}

export function templateFileName(profile: TemplateProfile, kind: TemplateKind): string {
  return `import-${profile}-${kind}.csv`;
}
