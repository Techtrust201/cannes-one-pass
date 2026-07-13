/**
 * Profil d'import "Types de vehicules / Gabarits" (Phase 5) : parsing +
 * mapping + commit FUSION pour le modele `VehicleTypeConfig`.
 *
 * Meme architecture que le profil Zones : `parseVehicleTypesTable` (pur) puis
 * `applyVehicleTypesCommit` (ecritures dans la transaction fournie).
 *
 * Champ `displayLabels` (Json, traductions admin) NON supporte par l'import :
 * trop risque de collision/ecrasement silencieux via CSV ; reste editable
 * uniquement via l'interface d'administration des gabarits.
 *
 * `vehicleFamily` n'est JAMAIS deduit automatiquement (pdfCode, texte...) —
 * seule une valeur EXPLICITE LIGHT/HEAVY dans le fichier est acceptee ; vide
 * = non renseigne (comportement identique a `POST /api/vehicle-types`).
 */

import { resolveHeader, type ImportRowIssue, type ParsedTable } from "./csv";
import { EMPTY_COUNTERS, type ImportBatchCounters } from "./import-batch";
import { parseLocalizedNumber } from "@/lib/parse-localized-number";

export type VehicleFamilyValue = "LIGHT" | "HEAVY" | null;

export interface ParsedVehicleTypeRow {
  line: number;
  code: string;
  codeRaw: string;
  label: string;
  gabarit: string;
  tonnageMini: number;
  tonnageMoyen: number;
  tonnageMaxi: number;
  co2Coefficient: number;
  pdfCode: string | null;
  color: string | null;
  showTrailerPlate: boolean | null;
  rxPalmBeachAtCanto: boolean | null;
  rxZoneCanto: string | null;
  rxZoneVieuxPort: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
  vehicleFamily: VehicleFamilyValue;
}

export interface VehicleTypesParseResult {
  rows: ParsedVehicleTypeRow[];
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
  totalRows: number;
}

const ALIASES = {
  code: ["CODE"],
  label: ["LABEL", "LIBELLE", "NOM"],
  gabarit: ["GABARIT", "SIZE", "TAILLE", "DIMENSIONS"],
  tonnageMini: ["TONNAGE MINI", "TONNAGEMINI", "TONNAGE MIN"],
  tonnageMoyen: ["TONNAGE MOYEN", "TONNAGEMOYEN"],
  tonnageMaxi: ["TONNAGE MAXI", "TONNAGEMAXI", "TONNAGE MAX"],
  co2Coefficient: ["CO2 COEFFICIENT", "CO2COEFFICIENT", "COEFFICIENT CO2"],
  pdfCode: ["PDF CODE", "PDFCODE"],
  color: ["COLOR", "COULEUR"],
  showTrailerPlate: ["SHOW TRAILER PLATE", "PLAQUE REMORQUE", "SHOWTRAILERPLATE"],
  rxPalmBeachAtCanto: ["RX PALM BEACH AT CANTO", "RXPALMBEACHATCANTO"],
  rxZoneCanto: ["RX ZONE CANTO", "RXZONECANTO"],
  rxZoneVieuxPort: ["RX ZONE VIEUX PORT", "RXZONEVIEUXPORT"],
  sortOrder: ["SORT ORDER", "ORDRE", "ORDRE AFFICHAGE", "SORTORDER"],
  isActive: ["IS ACTIVE", "ACTIF", "ISACTIVE"],
  vehicleFamily: ["VEHICLE FAMILY", "FAMILLE", "VEHICLEFAMILY"],
} as const;

export const VEHICLE_TYPES_FORBIDDEN_COLUMNS: { code: string; headers: string[] }[] = [
  { code: "id", headers: ["ID", "VEHICLE TYPE ID"] },
  { code: "organizationId", headers: ["ORGANIZATIONID", "ORGANIZATION ID", "ORGANIZATION_ID", "ORG ID", "ORGID"] },
];

function str(record: Record<string, string>, header: string | null): string | null {
  if (!header) return null;
  const value = (record[header] ?? "").trim();
  return value === "" ? null : value;
}

const TRUE_TOKENS = new Set(["TRUE", "1", "OUI", "YES", "VRAI", "X"]);
const FALSE_TOKENS = new Set(["FALSE", "0", "NON", "NO", "FAUX"]);

function bool(value: string | null): boolean | null {
  if (value == null) return null;
  const token = value.toUpperCase();
  if (TRUE_TOKENS.has(token)) return true;
  if (FALSE_TOKENS.has(token)) return false;
  return null;
}

/** Normalisation du code gabarit : MAJUSCULES, trim (aucune valeur inventee). */
export function normalizeVehicleTypeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function parseVehicleTypesTable(table: ParsedTable): VehicleTypesParseResult {
  const { headers, records } = table;
  const errors: ImportRowIssue[] = [];
  const warnings: ImportRowIssue[] = [];

  const present = new Set(headers);
  for (const forbidden of VEHICLE_TYPES_FORBIDDEN_COLUMNS) {
    const hit = forbidden.headers.find((h) => present.has(h));
    if (hit) {
      errors.push({
        line: 1,
        column: hit,
        reason: `FORBIDDEN_COLUMN: la colonne "${hit}" (${forbidden.code}) est interdite. L'organisation et les identifiants internes proviennent du contexte serveur, jamais du fichier.`,
      });
    }
  }

  const h = Object.fromEntries(
    Object.entries(ALIASES).map(([key, aliases]) => [key, resolveHeader(headers, [...aliases])])
  ) as Record<keyof typeof ALIASES, string | null>;

  const rows: ParsedVehicleTypeRow[] = [];
  const seenCodes = new Map<string, number>();

  records.forEach((record, index) => {
    const line = index + 2;

    const codeRaw = str(record, h.code);
    const label = str(record, h.label);
    const gabarit = str(record, h.gabarit);
    const tonnageMiniRaw = str(record, h.tonnageMini);
    const tonnageMoyenRaw = str(record, h.tonnageMoyen);
    const tonnageMaxiRaw = str(record, h.tonnageMaxi);
    const co2Raw = str(record, h.co2Coefficient);
    const familyRaw = str(record, h.vehicleFamily);

    if (!codeRaw) {
      errors.push({ line, column: h.code ?? "CODE", reason: "MISSING_CODE: le code du gabarit est obligatoire." });
      return;
    }
    if (!label) {
      errors.push({ line, column: h.label ?? "LABEL", reason: "MISSING_LABEL: le libelle est obligatoire." });
      return;
    }
    if (!gabarit) {
      errors.push({ line, column: h.gabarit ?? "GABARIT", reason: "MISSING_GABARIT: le gabarit/taille est obligatoire." });
      return;
    }
    const tonnageMini = parseLocalizedNumber(tonnageMiniRaw);
    if (tonnageMini === null) {
      errors.push({ line, column: h.tonnageMini ?? "TONNAGE MINI", value: tonnageMiniRaw ?? "", reason: "INVALID_TONNAGE_MINI: valeur numerique obligatoire." });
      return;
    }
    const tonnageMoyen = parseLocalizedNumber(tonnageMoyenRaw);
    if (tonnageMoyen === null) {
      errors.push({ line, column: h.tonnageMoyen ?? "TONNAGE MOYEN", value: tonnageMoyenRaw ?? "", reason: "INVALID_TONNAGE_MOYEN: valeur numerique obligatoire." });
      return;
    }
    const tonnageMaxi = parseLocalizedNumber(tonnageMaxiRaw);
    if (tonnageMaxi === null) {
      errors.push({ line, column: h.tonnageMaxi ?? "TONNAGE MAXI", value: tonnageMaxiRaw ?? "", reason: "INVALID_TONNAGE_MAXI: valeur numerique obligatoire." });
      return;
    }
    const co2Coefficient = parseLocalizedNumber(co2Raw);
    if (co2Coefficient === null) {
      errors.push({ line, column: h.co2Coefficient ?? "CO2 COEFFICIENT", value: co2Raw ?? "", reason: "INVALID_CO2_COEFFICIENT: valeur numerique obligatoire." });
      return;
    }
    let vehicleFamily: VehicleFamilyValue = null;
    if (familyRaw) {
      const token = familyRaw.toUpperCase();
      if (token !== "LIGHT" && token !== "HEAVY") {
        errors.push({ line, column: h.vehicleFamily ?? "VEHICLE FAMILY", value: familyRaw, reason: "INVALID_VEHICLE_FAMILY: doit etre LIGHT, HEAVY ou vide." });
        return;
      }
      vehicleFamily = token;
    }
    const sortOrderRaw = str(record, h.sortOrder);
    let sortOrder: number | null = null;
    if (sortOrderRaw) {
      const parsed = parseLocalizedNumber(sortOrderRaw);
      if (parsed === null || !Number.isInteger(parsed)) {
        errors.push({ line, column: h.sortOrder ?? "SORT ORDER", value: sortOrderRaw, reason: "INVALID_SORT_ORDER: entier obligatoire." });
        return;
      }
      sortOrder = parsed;
    }

    const code = normalizeVehicleTypeCode(codeRaw);
    const firstSeen = seenCodes.get(code);
    if (firstSeen !== undefined) {
      warnings.push({
        line,
        column: "_row",
        value: code,
        reason: `DUPLICATE_CODE: code deja present a la ligne ${firstSeen} dans ce fichier (la derniere occurrence l'emportera au commit).`,
      });
    } else {
      seenCodes.set(code, line);
    }

    rows.push({
      line,
      code,
      codeRaw,
      label,
      gabarit,
      tonnageMini,
      tonnageMoyen,
      tonnageMaxi,
      co2Coefficient,
      pdfCode: str(record, h.pdfCode),
      color: str(record, h.color),
      showTrailerPlate: bool(str(record, h.showTrailerPlate)),
      rxPalmBeachAtCanto: bool(str(record, h.rxPalmBeachAtCanto)),
      rxZoneCanto: str(record, h.rxZoneCanto),
      rxZoneVieuxPort: str(record, h.rxZoneVieuxPort),
      sortOrder,
      isActive: bool(str(record, h.isActive)),
      vehicleFamily,
    });
  });

  return { rows, errors, warnings, totalRows: records.length };
}

// ── Commit transactionnel (FUSION) ───────────────────────────────────────

interface ExistingVehicleType {
  id: number;
  label: string;
  gabarit: string;
  tonnageMini: number;
  tonnageMoyen: number;
  tonnageMaxi: number;
  co2Coefficient: number;
  pdfCode: string;
  color: string;
  showTrailerPlate: boolean;
  rxPalmBeachAtCanto: boolean;
  rxZoneCanto: string | null;
  rxZoneVieuxPort: string | null;
  sortOrder: number;
  isActive: boolean;
  vehicleFamily: "LIGHT" | "HEAVY" | null;
}

export interface VehicleTypesCommitTx {
  vehicleTypeConfig: {
    findFirst(args: {
      where: { organizationId: string; code: string };
      select?: Record<string, unknown>;
    }): Promise<ExistingVehicleType | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: number }>;
    update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface VehicleTypesCommitContext {
  organizationId: string;
}

export interface VehicleTypesCommitResult {
  counters: ImportBatchCounters;
  created: number;
  updated: number;
  unchanged: number;
}

function vehicleTypeDiffers(existing: ExistingVehicleType, parsed: ParsedVehicleTypeRow): boolean {
  return (
    existing.label !== parsed.label ||
    existing.gabarit !== parsed.gabarit ||
    existing.tonnageMini !== parsed.tonnageMini ||
    existing.tonnageMoyen !== parsed.tonnageMoyen ||
    existing.tonnageMaxi !== parsed.tonnageMaxi ||
    existing.co2Coefficient !== parsed.co2Coefficient ||
    (parsed.pdfCode !== null && existing.pdfCode !== parsed.pdfCode) ||
    (parsed.color !== null && existing.color !== parsed.color) ||
    (parsed.showTrailerPlate !== null && existing.showTrailerPlate !== parsed.showTrailerPlate) ||
    (parsed.rxPalmBeachAtCanto !== null && existing.rxPalmBeachAtCanto !== parsed.rxPalmBeachAtCanto) ||
    (parsed.rxZoneCanto !== null && existing.rxZoneCanto !== parsed.rxZoneCanto) ||
    (parsed.rxZoneVieuxPort !== null && existing.rxZoneVieuxPort !== parsed.rxZoneVieuxPort) ||
    (parsed.sortOrder !== null && existing.sortOrder !== parsed.sortOrder) ||
    (parsed.isActive !== null && existing.isActive !== parsed.isActive) ||
    (parsed.vehicleFamily !== null && existing.vehicleFamily !== parsed.vehicleFamily)
  );
}

/**
 * Applique le plan Gabarits (deja parse/valide) dans la transaction fournie.
 * Les champs facultatifs (pdfCode, color, isActive, vehicleFamily, ...) ne
 * sont ecrits QUE si explicitement fournis dans le fichier.
 */
export async function applyVehicleTypesCommit(
  tx: VehicleTypesCommitTx,
  rows: ParsedVehicleTypeRow[],
  ctx: VehicleTypesCommitContext
): Promise<VehicleTypesCommitResult> {
  const result: VehicleTypesCommitResult = { counters: { ...EMPTY_COUNTERS }, created: 0, updated: 0, unchanged: 0 };

  for (const row of rows) {
    const existing = await tx.vehicleTypeConfig.findFirst({
      where: { organizationId: ctx.organizationId, code: row.code },
      select: {
        id: true,
        label: true,
        gabarit: true,
        tonnageMini: true,
        tonnageMoyen: true,
        tonnageMaxi: true,
        co2Coefficient: true,
        pdfCode: true,
        color: true,
        showTrailerPlate: true,
        rxPalmBeachAtCanto: true,
        rxZoneCanto: true,
        rxZoneVieuxPort: true,
        sortOrder: true,
        isActive: true,
        vehicleFamily: true,
      },
    });

    if (!existing) {
      await tx.vehicleTypeConfig.create({
        data: {
          organizationId: ctx.organizationId,
          code: row.code,
          label: row.label,
          gabarit: row.gabarit,
          tonnageMini: row.tonnageMini,
          tonnageMoyen: row.tonnageMoyen,
          tonnageMaxi: row.tonnageMaxi,
          co2Coefficient: row.co2Coefficient,
          pdfCode: row.pdfCode ?? "C",
          color: row.color ?? "gray",
          showTrailerPlate: row.showTrailerPlate ?? false,
          rxPalmBeachAtCanto: row.rxPalmBeachAtCanto ?? false,
          rxZoneCanto: row.rxZoneCanto,
          rxZoneVieuxPort: row.rxZoneVieuxPort,
          sortOrder: row.sortOrder ?? 0,
          isActive: row.isActive ?? true,
          vehicleFamily: row.vehicleFamily,
        },
      });
      result.created += 1;
      continue;
    }

    if (vehicleTypeDiffers(existing, row)) {
      const patch: Record<string, unknown> = {
        label: row.label,
        gabarit: row.gabarit,
        tonnageMini: row.tonnageMini,
        tonnageMoyen: row.tonnageMoyen,
        tonnageMaxi: row.tonnageMaxi,
        co2Coefficient: row.co2Coefficient,
      };
      if (row.pdfCode !== null) patch.pdfCode = row.pdfCode;
      if (row.color !== null) patch.color = row.color;
      if (row.showTrailerPlate !== null) patch.showTrailerPlate = row.showTrailerPlate;
      if (row.rxPalmBeachAtCanto !== null) patch.rxPalmBeachAtCanto = row.rxPalmBeachAtCanto;
      if (row.rxZoneCanto !== null) patch.rxZoneCanto = row.rxZoneCanto;
      if (row.rxZoneVieuxPort !== null) patch.rxZoneVieuxPort = row.rxZoneVieuxPort;
      if (row.sortOrder !== null) patch.sortOrder = row.sortOrder;
      if (row.isActive !== null) patch.isActive = row.isActive;
      if (row.vehicleFamily !== null) patch.vehicleFamily = row.vehicleFamily;
      await tx.vehicleTypeConfig.update({ where: { id: existing.id }, data: patch });
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
