/**
 * Profil d'import "Referentiel exposants / emplacements" (Phase 3).
 *
 * Transforme un CSV en un plan d'import EN MEMOIRE (dry-run) : liste
 * d'exposants et de leurs emplacements, plus les erreurs/avertissements par
 * ligne. AUCUNE ecriture DB ici — le commit (diff FUSION + transaction) est
 * traite dans une couche superieure (API, Phase 3B/5).
 *
 * Colonnes RX de reference : `PLAN | PORT | ZONE T-T | NUM-TERRE | NUM-FLOT`.
 * Colonnes generiques supportees : `NAME`, `STAND`, `EXTERNAL REFERENCE`.
 *
 * Reutilise strictement les helpers deja valides en Phase 1B :
 *  - `normalizeExhibitorName` / `normalizeLocationCode` (normalisation) ;
 *  - `parseLegacySector` (canonicalisation port/secteur/espace + conflits),
 *    en reconstruisant la chaine legacy `"{PORT} — {ZONE}"` : les emplacements
 *    importes portent donc EXACTEMENT les memes codes canoniques que ceux
 *    crees par le backfill, garantissant l'alignement avec le planning.
 */

import {
  parseCsv,
  resolveHeader,
  splitMultiValues,
  type ImportRowIssue,
  type ParsedTable,
} from "./csv";
import { normalizeExhibitorName, normalizeLocationCode } from "./normalization";
import { parseLegacySector, type LegacySectorWarningReason } from "./legacy-sector";
import {
  tryRxReferentialPortNormalization,
  RX_LEGACY_PORT_NORMALIZED,
  type RxReferentialWarningReason,
} from "./referential-rx-geography";

/** Type d'emplacement, aligne sur l'enum Prisma `LocationType`. */
export type LocationTypeCode = "TERRE" | "FLOT" | "STAND";

export interface ParsedLocation {
  type: LocationTypeCode;
  /** Libelle affiche (trim + espaces collapses). */
  code: string;
  /** Cle de comparaison (MAJUSCULES, sans separateurs). */
  codeNormalized: string;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
  /** Vrai si la geographie n'a pu etre resolue de maniere certaine. */
  ambiguous: boolean;
  /** Motif de diagnostic (ex: conflit port/secteur, normalisation RX). */
  warningReason?: RxReferentialWarningReason | null;
  /** Lignes CSV sources ayant produit cet emplacement. */
  sourceLines: number[];
}

export interface ParsedExhibitor {
  name: string;
  nameNormalized: string;
  externalReference: string | null;
  locations: ParsedLocation[];
  sourceLines: number[];
}

export interface ReferentialParseResult {
  exhibitors: ParsedExhibitor[];
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
  totalRows: number;
}

// Alias d'entetes (deja normalises MAJUSCULES) par champ logique.
// `COMPANY NAME` = entete du fichier RX officiel (cf. scripts/import-rx-exhibitors.ts).
const NAME_ALIASES = [
  "COMPANY NAME",
  "COMPANY",
  "PLAN",
  "NAME",
  "NOM",
  "SOCIETE",
  "EXPOSANT",
  "RAISON SOCIALE",
];
const EXTERNAL_REF_ALIASES = ["EXTERNAL REFERENCE", "REFERENCE", "REF", "REF EXTERNE", "ID EXTERNE"];
const PORT_ALIASES = ["PORT", "PORTCODE", "PORT CODE"];
const ZONE_ALIASES = ["ZONE T-T", "ZONE TT", "ZONE", "SECTEUR", "SECTOR"];
const TERRE_ALIASES = ["NUM-TERRE", "NUM TERRE", "N TERRE", "TERRE"];
const FLOT_ALIASES = ["NUM-FLOT", "NUM FLOT", "N FLOT", "FLOT"];
const STAND_ALIASES = ["STAND", "NUM-STAND", "NUM STAND", "N STAND", "NUMERO STAND"];

export interface ResolvedGeography {
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
  ambiguous: boolean;
  warningReason?: LegacySectorWarningReason | typeof RX_LEGACY_PORT_NORMALIZED | null;
  sourcePort?: string;
  sourceSector?: string;
}

export interface ReferentialParseOptions {
  /** Profil RX officiel : normalise VIEUX PORT + PALAIS ext (adaptateur isole). */
  rxProfile?: boolean;
}

const EMPTY_GEOGRAPHY: ResolvedGeography = {
  portCode: null,
  sectorCode: null,
  logisticSpace: null,
  ambiguous: false,
};

/**
 * Resout la geographie canonique (portCode/sectorCode/logisticSpace) a partir
 * des colonnes PORT et ZONE, en deleguant a `parseLegacySector`.
 *
 * On reconstruit la chaine legacy `"{PORT} — {ZONE}"` afin de reutiliser a
 * l'identique la canonicalisation validee en Phase 1B (dont la detection de
 * conflit port/secteur). Si un seul des deux champs est fourni, on le passe
 * seul (parseLegacySector gere le cas zone-seule, ex: "PALAIS int - NU").
 */
export function resolveReferentialGeography(
  port: string | null | undefined,
  zone: string | null | undefined
): ResolvedGeography {
  const portTrim = (port ?? "").trim();
  const zoneTrim = (zone ?? "").trim();

  if (!portTrim && !zoneTrim) return EMPTY_GEOGRAPHY;

  const combined = portTrim && zoneTrim ? `${portTrim} — ${zoneTrim}` : portTrim || zoneTrim;
  const parsed = parseLegacySector(combined);

  return {
    portCode: parsed.portCode,
    sectorCode: parsed.sectorCode,
    logisticSpace: parsed.logisticSpace,
    ambiguous: parsed.ambiguous,
    warningReason: parsed.warningReason ?? null,
  };
}

interface LocationSeed {
  type: LocationTypeCode;
  rawCode: string;
  line: number;
}

/** Variante CSV (texte) : delegue a `parseReferentialTable`. */
export function parseReferentialCsv(input: string): ReferentialParseResult {
  return parseReferentialTable(parseCsv(input));
}

/**
 * Parse une table normalisee (CSV ou XLSX) du referentiel exposants en plan
 * d'import memoire. Regroupe par `nameNormalized` (cle naturelle exposant) et
 * fusionne les emplacements ; dedoublonne par (type, codeNormalized).
 *
 * Regle metier : au moins un emplacement reel (TERRE/FLOT/STAND) est
 * OBLIGATOIRE par exposant ; une ligne sans emplacement est une ERREUR
 * bloquante (jamais importee silencieusement).
 */
export function parseReferentialTable(
  table: ParsedTable,
  options: ReferentialParseOptions = {}
): ReferentialParseResult {
  const errors: ImportRowIssue[] = [];
  const warnings: ImportRowIssue[] = [];

  const { headers, records } = table;

  const nameHeader = resolveHeader(headers, NAME_ALIASES);
  if (!nameHeader) {
    errors.push({
      line: 1,
      column: "_row",
      reason: `Colonne exposant manquante (attendu une entete parmi : ${NAME_ALIASES.join(", ")}).`,
    });
    return { exhibitors: [], errors, warnings, totalRows: records.length };
  }

  const externalRefHeader = resolveHeader(headers, EXTERNAL_REF_ALIASES);
  const portHeader = resolveHeader(headers, PORT_ALIASES);
  const zoneHeader = resolveHeader(headers, ZONE_ALIASES);
  const terreHeader = resolveHeader(headers, TERRE_ALIASES);
  const flotHeader = resolveHeader(headers, FLOT_ALIASES);
  const standHeader = resolveHeader(headers, STAND_ALIASES);

  const hasLocationColumn = Boolean(terreHeader || flotHeader || standHeader);
  if (!hasLocationColumn) {
    errors.push({
      line: 1,
      column: "_row",
      reason:
        "Aucune colonne d'emplacement (NUM-TERRE / NUM-FLOT / STAND) : au moins une est obligatoire.",
    });
    return { exhibitors: [], errors, warnings, totalRows: records.length };
  }

  // Regroupement par nameNormalized (cle naturelle exposant).
  const byName = new Map<string, ParsedExhibitor>();

  records.forEach((record, index) => {
    const line = index + 2; // entete = ligne 1

    const rawName = record[nameHeader] ?? "";
    const name = rawName.trim();
    if (!name) {
      errors.push({ line, column: nameHeader, value: rawName, reason: "Nom d'exposant vide." });
      return;
    }
    const nameNormalized = normalizeExhibitorName(name);
    if (!nameNormalized) {
      errors.push({
        line,
        column: nameHeader,
        value: rawName,
        reason: "Nom d'exposant non normalisable.",
      });
      return;
    }

    const externalReference = externalRefHeader
      ? normalizeExternalReference(record[externalRefHeader])
      : null;

    const rawPort = portHeader ? record[portHeader] : null;
    const rawZone = zoneHeader ? record[zoneHeader] : null;

    const rxNorm = options.rxProfile
      ? tryRxReferentialPortNormalization(rawPort, rawZone)
      : null;
    const baseGeo = resolveReferentialGeography(
      rxNorm ? rxNorm.normalizedPort : rawPort,
      rawZone
    );
    const geography = rxNorm
      ? {
          ...baseGeo,
          ambiguous: false,
          warningReason: RX_LEGACY_PORT_NORMALIZED as RxReferentialWarningReason,
          sourcePort: rxNorm.sourcePort,
          sourceSector: rxNorm.sourceSector,
        }
      : baseGeo;

    // Collecte des emplacements de la ligne (multi-valeurs sur "/").
    const seeds: LocationSeed[] = [];
    if (terreHeader) {
      for (const raw of splitMultiValues(record[terreHeader])) {
        seeds.push({ type: "TERRE", rawCode: raw, line });
      }
    }
    if (flotHeader) {
      for (const raw of splitMultiValues(record[flotHeader])) {
        seeds.push({ type: "FLOT", rawCode: raw, line });
      }
    }
    if (standHeader) {
      for (const raw of splitMultiValues(record[standHeader])) {
        seeds.push({ type: "STAND", rawCode: raw, line });
      }
    }

    // Exposant courant (fusion si deja vu sur une ligne precedente).
    let exhibitor = byName.get(nameNormalized);
    if (!exhibitor) {
      exhibitor = {
        name,
        nameNormalized,
        externalReference,
        locations: [],
        sourceLines: [],
      };
      byName.set(nameNormalized, exhibitor);
    } else if (externalReference && !exhibitor.externalReference) {
      exhibitor.externalReference = externalReference;
    }
    exhibitor.sourceLines.push(line);

    if (seeds.length === 0) {
      errors.push({
        line,
        column: "_row",
        value: name,
        reason:
          "Ligne sans emplacement (NUM-TERRE / NUM-FLOT / STAND) : au moins un est obligatoire.",
      });
    }

    for (const seed of seeds) {
      const normalized = normalizeLocationCode(seed.rawCode);
      if (!normalized) {
        warnings.push({
          line,
          column: locationColumnFor(seed.type, terreHeader, flotHeader, standHeader),
          value: seed.rawCode,
          reason: "Code d'emplacement non normalisable, ignore.",
        });
        continue;
      }

      const dedupKey = `${seed.type}|${normalized.codeNormalized}`;
      const existing = exhibitor.locations.find(
        (loc) => `${loc.type}|${loc.codeNormalized}` === dedupKey
      );
      if (existing) {
        existing.sourceLines.push(line);
        if (geographyDiffers(existing, geography)) {
          warnings.push({
            line,
            column: "_row",
            value: normalized.code,
            reason: `Emplacement ${seed.type} "${normalized.code}" deja vu avec une geographie differente : premiere valeur conservee.`,
          });
        }
        continue;
      }

      if (geography.warningReason === RX_LEGACY_PORT_NORMALIZED) {
        warnings.push({
          line,
          column: "_row",
          value: normalized.code,
          reason: RX_LEGACY_PORT_NORMALIZED,
          sourcePort: geography.sourcePort ?? rawPort ?? undefined,
          sourceSector: geography.sourceSector ?? rawZone ?? undefined,
          normalizedPortCode: geography.portCode,
          normalizedSectorCode: geography.sectorCode,
        });
      } else if (geography.warningReason) {
        warnings.push({
          line,
          column: "_row",
          value: normalized.code,
          reason: `Geographie ambigue (${geography.warningReason}) pour l'emplacement ${seed.type} "${normalized.code}".`,
        });
      }

      exhibitor.locations.push({
        type: seed.type,
        code: normalized.code,
        codeNormalized: normalized.codeNormalized,
        portCode: geography.portCode,
        sectorCode: geography.sectorCode,
        logisticSpace: geography.logisticSpace,
        ambiguous: geography.ambiguous,
        warningReason: geography.warningReason ?? null,
        sourceLines: [line],
      });
    }
  });

  return {
    exhibitors: [...byName.values()],
    errors,
    warnings,
    totalRows: records.length,
  };
}

function normalizeExternalReference(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function locationColumnFor(
  type: LocationTypeCode,
  terreHeader: string | null,
  flotHeader: string | null,
  standHeader: string | null
): string | undefined {
  if (type === "TERRE") return terreHeader ?? undefined;
  if (type === "FLOT") return flotHeader ?? undefined;
  return standHeader ?? undefined;
}

function geographyDiffers(loc: ParsedLocation, geography: ResolvedGeography): boolean {
  return (
    loc.portCode !== geography.portCode ||
    loc.sectorCode !== geography.sectorCode ||
    loc.logisticSpace !== geography.logisticSpace
  );
}
