/**
 * Profil d'import "Zones" (Phase 5) : parsing + mapping + commit FUSION pour
 * le modele `ZoneConfig`.
 *
 * Meme architecture que les profils Phase 3 (Referentiel/Planning) :
 *  - `parseZonesTable` : PUR, aucune ecriture DB, aucune resolution ;
 *  - `applyZonesCommit` : ecritures DANS la transaction fournie (`tx` type
 *    structurellement, testable sans Neon).
 *
 * FUSION : cree les zones absentes, met a jour celles presentes si un champ
 * differe, laisse INTACTES celles non presentes dans le fichier (aucune
 * desactivation silencieuse — `isActive` n'est modifie QUE si la colonne est
 * explicitement fournie dans le fichier, jamais par omission).
 *
 * Securite : `organizationId` ne vient JAMAIS du fichier (colonne interdite,
 * comme tout identifiant interne) — uniquement du contexte serveur.
 */

import { resolveHeader, type ImportRowIssue, type ParsedTable } from "./csv";
import { EMPTY_COUNTERS, type ImportBatchCounters } from "./import-batch";
import { parseLocalizedNumber } from "@/lib/parse-localized-number";

// ── Parsing (pur) ─────────────────────────────────────────────────────────

export interface ParsedZoneRow {
  line: number;
  /** Code normalise (MAJUSCULES, non-alphanumeriques -> "_"), cle naturelle. */
  zone: string;
  zoneRaw: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  isFinalDestination: boolean | null;
  color: string | null;
  isActive: boolean | null;
  readerName: string | null;
  readerUrl: string | null;
  readerActive: boolean | null;
}

export interface ZonesParseResult {
  rows: ParsedZoneRow[];
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
  totalRows: number;
}

const ALIASES = {
  zone: ["CODE", "ZONE", "ZONE CODE", "CODE ZONE"],
  label: ["LABEL", "LIBELLE", "NOM"],
  address: ["ADDRESS", "ADRESSE"],
  latitude: ["LATITUDE", "LAT"],
  longitude: ["LONGITUDE", "LON", "LONG"],
  isFinalDestination: ["IS FINAL DESTINATION", "DESTINATION FINALE", "ISFINALDESTINATION"],
  color: ["COLOR", "COULEUR"],
  isActive: ["IS ACTIVE", "ACTIF", "ISACTIVE"],
  readerName: ["READER NAME", "NOM LECTEUR", "READERNAME"],
  readerUrl: ["READER URL", "URL LECTEUR", "READERURL"],
  readerActive: ["READER ACTIVE", "LECTEUR ACTIF", "READERACTIVE"],
} as const;

/** Colonnes interdites : identifiants internes que le fichier ne fournit jamais. */
export const ZONES_FORBIDDEN_COLUMNS: { code: string; headers: string[] }[] = [
  { code: "id", headers: ["ID", "ZONE ID", "ZONEID"] },
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

/** Normalisation identique a `POST /api/zones` (coherence stricte). */
export function normalizeZoneCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function parseZonesTable(table: ParsedTable): ZonesParseResult {
  const { headers, records } = table;
  const errors: ImportRowIssue[] = [];
  const warnings: ImportRowIssue[] = [];

  const present = new Set(headers);
  for (const forbidden of ZONES_FORBIDDEN_COLUMNS) {
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

  const rows: ParsedZoneRow[] = [];
  const seenCodes = new Map<string, number>();

  records.forEach((record, index) => {
    const line = index + 2;

    const zoneRaw = str(record, h.zone);
    const label = str(record, h.label);
    const address = str(record, h.address);
    const latitudeRaw = str(record, h.latitude);
    const longitudeRaw = str(record, h.longitude);
    const readerUrl = str(record, h.readerUrl);

    if (!zoneRaw) {
      errors.push({ line, column: h.zone ?? "CODE", reason: "MISSING_ZONE_CODE: le code de zone est obligatoire." });
      return;
    }
    if (!label) {
      errors.push({ line, column: h.label ?? "LABEL", reason: "MISSING_LABEL: le libelle est obligatoire." });
      return;
    }
    if (!address) {
      errors.push({ line, column: h.address ?? "ADDRESS", reason: "MISSING_ADDRESS: l'adresse est obligatoire." });
      return;
    }
    const latitude = parseLocalizedNumber(latitudeRaw);
    if (latitude === null) {
      errors.push({ line, column: h.latitude ?? "LATITUDE", value: latitudeRaw ?? "", reason: "INVALID_LATITUDE: latitude numerique obligatoire." });
      return;
    }
    const longitude = parseLocalizedNumber(longitudeRaw);
    if (longitude === null) {
      errors.push({ line, column: h.longitude ?? "LONGITUDE", value: longitudeRaw ?? "", reason: "INVALID_LONGITUDE: longitude numerique obligatoire." });
      return;
    }
    if (readerUrl && !/^https?:\/\//i.test(readerUrl)) {
      errors.push({ line, column: h.readerUrl ?? "READER URL", value: readerUrl, reason: "INVALID_READER_URL: l'URL du lecteur doit commencer par http:// ou https://." });
      return;
    }

    const zone = normalizeZoneCode(zoneRaw);
    const firstSeen = seenCodes.get(zone);
    if (firstSeen !== undefined) {
      warnings.push({
        line,
        column: "_row",
        value: zone,
        reason: `DUPLICATE_ZONE_CODE: code deja present a la ligne ${firstSeen} dans ce fichier (la derniere occurrence l'emportera au commit).`,
      });
    } else {
      seenCodes.set(zone, line);
    }

    rows.push({
      line,
      zone,
      zoneRaw,
      label,
      address,
      latitude,
      longitude,
      isFinalDestination: bool(str(record, h.isFinalDestination)),
      color: str(record, h.color),
      isActive: bool(str(record, h.isActive)),
      readerName: str(record, h.readerName),
      readerUrl,
      readerActive: bool(str(record, h.readerActive)),
    });
  });

  return { rows, errors, warnings, totalRows: records.length };
}

// ── Commit transactionnel (FUSION) ───────────────────────────────────────

interface ExistingZone {
  id: number;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  isFinalDestination: boolean;
  color: string;
  isActive: boolean;
  readerName: string | null;
  readerUrl: string | null;
  readerActive: boolean;
}

export interface ZonesCommitTx {
  zoneConfig: {
    findFirst(args: {
      where: { organizationId: string; zone: string };
      select?: Record<string, unknown>;
    }): Promise<ExistingZone | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: number }>;
    update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface ZonesCommitContext {
  organizationId: string;
}

export interface ZonesCommitResult {
  counters: ImportBatchCounters;
  created: number;
  updated: number;
  unchanged: number;
}

function zoneDiffers(existing: ExistingZone, parsed: ParsedZoneRow): boolean {
  return (
    existing.label !== parsed.label ||
    existing.address !== parsed.address ||
    existing.latitude !== parsed.latitude ||
    existing.longitude !== parsed.longitude ||
    (parsed.isFinalDestination !== null && existing.isFinalDestination !== parsed.isFinalDestination) ||
    (parsed.color !== null && existing.color !== parsed.color) ||
    (parsed.isActive !== null && existing.isActive !== parsed.isActive) ||
    (parsed.readerName !== null && existing.readerName !== parsed.readerName) ||
    (parsed.readerUrl !== null && existing.readerUrl !== parsed.readerUrl) ||
    (parsed.readerActive !== null && existing.readerActive !== parsed.readerActive)
  );
}

/**
 * Applique le plan Zones (deja parse/valide) dans la transaction fournie.
 * `isActive`/`readerActive`/`color`/`isFinalDestination` ne sont ecrits QUE
 * si explicitement fournis (jamais de reset silencieux d'une zone existante
 * a la valeur par defaut faute de colonne dans le fichier).
 */
export async function applyZonesCommit(
  tx: ZonesCommitTx,
  rows: ParsedZoneRow[],
  ctx: ZonesCommitContext
): Promise<ZonesCommitResult> {
  const result: ZonesCommitResult = { counters: { ...EMPTY_COUNTERS }, created: 0, updated: 0, unchanged: 0 };

  for (const row of rows) {
    const existing = await tx.zoneConfig.findFirst({
      where: { organizationId: ctx.organizationId, zone: row.zone },
      select: {
        id: true,
        label: true,
        address: true,
        latitude: true,
        longitude: true,
        isFinalDestination: true,
        color: true,
        isActive: true,
        readerName: true,
        readerUrl: true,
        readerActive: true,
      },
    });

    if (!existing) {
      await tx.zoneConfig.create({
        data: {
          organizationId: ctx.organizationId,
          zone: row.zone,
          label: row.label,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude,
          isFinalDestination: row.isFinalDestination ?? false,
          color: row.color ?? "gray",
          isActive: row.isActive ?? true,
          readerName: row.readerName,
          readerUrl: row.readerUrl,
          readerActive: row.readerActive ?? false,
        },
      });
      result.created += 1;
      continue;
    }

    if (zoneDiffers(existing, row)) {
      const patch: Record<string, unknown> = {
        label: row.label,
        address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
      };
      if (row.isFinalDestination !== null) patch.isFinalDestination = row.isFinalDestination;
      if (row.color !== null) patch.color = row.color;
      if (row.isActive !== null) patch.isActive = row.isActive;
      if (row.readerName !== null) patch.readerName = row.readerName;
      if (row.readerUrl !== null) patch.readerUrl = row.readerUrl;
      if (row.readerActive !== null) patch.readerActive = row.readerActive;
      await tx.zoneConfig.update({ where: { id: existing.id }, data: patch });
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
