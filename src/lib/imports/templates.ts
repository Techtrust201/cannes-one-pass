/**
 * Modeles de fichiers d'import (Phase 3) : templates CSV reellement
 * telechargeables via `GET /api/admin/import/template`. Chaque profil fournit
 * un modele VIDE (entetes seules) et un EXEMPLE rempli.
 *
 * Le format canonique est volontairement compatible CSV et XLSX (memes
 * entetes). Le classeur RX matriciel officiel n'a pas de "template" : il est
 * consomme tel quel via l'adaptateur (`format=rx`).
 */

export type TemplateProfile =
  | "referential"
  | "planning"
  | "accreditations"
  | "zones"
  | "vehicle-types"
  | "capacities";
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

const ACCREDITATIONS_HEADERS = [
  "EXHIBITOR EXTERNAL REFERENCE", "EXHIBITOR NAME", "LOCATION CODE", "LOCATION TYPE", "COMPANY",
  "STAND", "EMAIL", "LANGUAGE", "MESSAGE", "CATEGORY", "UNLOADING", "PLATE", "TRAILER PLATE",
  "VEHICLE TYPE", "SIZE", "PHONE CODE", "PHONE NUMBER", "DATE", "TIME", "CITY", "COUNTRY",
  "CONTACT FIRST NAME", "CONTACT LAST NAME", "CONTACT EMAIL", "CONTACT PHONE CODE",
  "CONTACT PHONE NUMBER", "SPACE", "CATEGORY ID", "LIV DATE", "LIV TIME", "REP DATE", "REP TIME",
  "REP SAME AS DELIVERY", "REP VEHICLE TYPE", "REP PLATE", "REP PHONE CODE", "REP PHONE NUMBER",
  "REP INTERVENING COMPANY", "REP CITY", "REP COUNTRY", "INTERVENING COMPANY", "SCALES ASSIGNED",
  "MANUTENTION PROVIDER", "MANUTENTION PROVIDER OTHER", "SKIP MONTAGE", "SKIP DEMONTAGE",
];

const ACCREDITATIONS_EXAMPLE_ROWS: string[][] = [
  [
    "", "ACME Decoration", "", "", "ACME Decoration", "A12", "contact@acme-exemple.test", "fr",
    "Livraison le matin uniquement", "stand_nu", "lat", "AB-123-CD", "", "", "20m3", "+33",
    "600000000", "2026-09-10", "08:00", "Cannes", "", "", "", "", "", "", "", "", "", "", "", "",
    "", "", "", "", "", "", "", "", "", "", "", "", "", "",
  ],
  [
    "REF-RX-042", "Marina Yachting Group", "PAN 023", "FLOT", "", "", "", "", "", "", "", "", "",
    "VL", "", "+33", "611111111", "", "", "", "", "Jean", "Dupont", "jean.dupont@marina-exemple.test",
    "+33", "622222222", "POWER", "CAT-1", "2026-09-16", "08:00", "2026-09-19", "10:00", "non",
    "Fourgon", "CD-456-EF", "+33", "633333333", "Transport Exemple", "Cannes", "FR",
    "Transport Exemple", "oui", "PRESTATAIRE_A", "", "non", "non",
  ],
];

const ZONES_HEADERS = [
  "CODE", "LABEL", "ADDRESS", "LATITUDE", "LONGITUDE", "IS FINAL DESTINATION", "COLOR",
  "IS ACTIVE", "READER NAME", "READER URL", "READER ACTIVE",
];

const ZONES_EXAMPLE_ROWS: string[][] = [
  ["LA_BOCCA", "La Bocca", "12 Avenue de la Bocca, Cannes", "43.5461", "7.0128", "false", "orange", "true", "", "", "false"],
  ["PALAIS", "Palais des Festivals", "1 Bd de la Croisette, Cannes", "43.5497", "7.0174", "true", "purple", "true", "Lecteur entree Palais", "https://reader.exemple.test/palais", "true"],
];

const VEHICLE_TYPES_HEADERS = [
  "CODE", "LABEL", "GABARIT", "TONNAGE MINI", "TONNAGE MOYEN", "TONNAGE MAXI", "CO2 COEFFICIENT",
  "PDF CODE", "COLOR", "SHOW TRAILER PLATE", "VEHICLE FAMILY", "RX ZONE CANTO",
  "RX ZONE VIEUX PORT", "SORT ORDER", "IS ACTIVE",
];

const VEHICLE_TYPES_EXAMPLE_ROWS: string[][] = [
  ["VL", "Vehicule leger", "VL", "0", "1.5", "3.5", "0.2", "A", "green", "false", "LIGHT", "", "", "1", "true"],
  ["PORTEUR", "Porteur", "Porteur", "3.5", "12", "19", "0.9", "C", "blue", "true", "HEAVY", "", "", "2", "true"],
];

const CAPACITIES_HEADERS = ["ZONE", "DATE", "START TIME", "END TIME", "VEHICLE FAMILY", "PHASE", "CAPACITY"];

const CAPACITIES_EXAMPLE_ROWS: string[][] = [
  ["LA_BOCCA", "2026-09-16", "08:00", "12:00", "LIGHT", "MONTAGE", "10"],
  ["LA_BOCCA", "2026-09-16", "12:00", "23:00", "HEAVY", "MONTAGE", "4"],
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

export function buildAccreditationsTemplate(kind: TemplateKind): string {
  return toCsv(ACCREDITATIONS_HEADERS, kind === "example" ? ACCREDITATIONS_EXAMPLE_ROWS : []);
}

export function buildZonesTemplate(kind: TemplateKind): string {
  return toCsv(ZONES_HEADERS, kind === "example" ? ZONES_EXAMPLE_ROWS : []);
}

export function buildVehicleTypesTemplate(kind: TemplateKind): string {
  return toCsv(VEHICLE_TYPES_HEADERS, kind === "example" ? VEHICLE_TYPES_EXAMPLE_ROWS : []);
}

export function buildCapacitiesTemplate(kind: TemplateKind): string {
  return toCsv(CAPACITIES_HEADERS, kind === "example" ? CAPACITIES_EXAMPLE_ROWS : []);
}

export function buildTemplate(profile: TemplateProfile, kind: TemplateKind): string {
  switch (profile) {
    case "planning":
      return buildPlanningTemplate(kind);
    case "accreditations":
      return buildAccreditationsTemplate(kind);
    case "zones":
      return buildZonesTemplate(kind);
    case "vehicle-types":
      return buildVehicleTypesTemplate(kind);
    case "capacities":
      return buildCapacitiesTemplate(kind);
    case "referential":
    default:
      return buildReferentialTemplate(kind);
  }
}

export function templateFileName(profile: TemplateProfile, kind: TemplateKind): string {
  return `import-${profile}-${kind}.csv`;
}
