/**
 * Parsing des secteurs legacy stockes dans `Exhibitor.sector`.
 *
 * Format historique RX (cf. `scripts/import-rx-exhibitors.ts`) :
 *   "{PORT} — {ZONE T-T}"
 *
 * Ce module ne modifie jamais la valeur source : il calcule uniquement les
 * codes canoniques attendus par `ExhibitorLocation` et le futur planning.
 *
 * Principe :
 *   - sectorCode preserve la distinction metier exacte ;
 *   - logisticSpace regroupe les zones partageant les memes regles generales ;
 *   - en cas de conflit entre le port explicite (gauche) et le port implique
 *     par la zone (droite), le parser ne tranche jamais : portCode=null,
 *     ambiguous=true, warningReason=PORT_SECTOR_CONFLICT.
 */

import { deriveSpaceFromSector } from "@/templates/accreditation/rx/config";

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function upperAscii(value: string): string {
  return stripAccents(value).toUpperCase();
}

export const PORT_SECTOR_CONFLICT = "PORT_SECTOR_CONFLICT" as const;

export type LegacySectorWarningReason = typeof PORT_SECTOR_CONFLICT;

export interface ParsedLegacySector {
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
  ambiguous: boolean;
  /** Motif de diagnostic lorsque le parsing est partiel ou ambigu. */
  warningReason?: LegacySectorWarningReason | null;
}

const EMPTY_RESULT: ParsedLegacySector = {
  portCode: null,
  sectorCode: null,
  logisticSpace: null,
  ambiguous: false,
};

function withWarningReason(
  result: Omit<ParsedLegacySector, "warningReason">,
  warningReason?: LegacySectorWarningReason | null
): ParsedLegacySector {
  if (warningReason) return { ...result, warningReason };
  return result;
}

/** Separe port et zone sur un tiret cadrat/en cadratin entoure d'espaces. */
const PORT_ZONE_EM_DASH = /^(.+?)\s+[—–]\s+(.+)$/;

/**
 * Separe port et zone sur un tiret ASCII entoure d'espaces, uniquement si la
 * partie gauche correspond a un port connu (evite de couper "PALAIS int - NU").
 */
function splitPortAndZone(value: string): { portPart: string; zonePart: string } | null {
  const collapsed = collapseSpaces(value);

  const emMatch = collapsed.match(PORT_ZONE_EM_DASH);
  if (emMatch) {
    return { portPart: emMatch[1].trim(), zonePart: emMatch[2].trim() };
  }

  const hyphenMatch = collapsed.match(/^(.+?)\s+-\s+(.+)$/);
  if (hyphenMatch && normalizeLegacyPortCode(hyphenMatch[1])) {
    return { portPart: hyphenMatch[1].trim(), zonePart: hyphenMatch[2].trim() };
  }

  return null;
}

/** Port legacy -> code canonique. */
export function normalizeLegacyPortCode(portPart: string | null | undefined): string | null {
  if (!portPart) return null;
  const upper = upperAscii(collapseSpaces(portPart));
  if (upper === "PORT CANTO" || upper.startsWith("PORT CANTO ")) return "PORT_CANTO";
  if (upper === "VIEUX PORT" || upper.startsWith("VIEUX PORT ")) return "VIEUX_PORT";
  if (upper === "PALAIS") return "PALAIS";
  return null;
}

/**
 * Derive le sectorCode canonique depuis la partie zone (apres decoupage port/zone)
 * ou depuis une chaine zone seule ("PALAIS int - NU").
 */
export function normalizeLegacySectorCode(zonePart: string | null | undefined): string | null {
  if (!zonePart) return null;
  const upper = upperAscii(collapseSpaces(zonePart));

  if (upper === "PALAIS") return null;

  if (/PALAIS\s+EXT\b/.test(upper)) return "PALAIS_EXT";
  if (/PALAIS\s+INT\s*[-–—]\s*NU\b/.test(upper)) return "PALAIS_INT_NU";
  if (/PALAIS\s+INT\s*[-–—]\s*EQUIPE\b/.test(upper)) return "PALAIS_INT_EQUIPE";

  if (upper.includes("SAIL") && upper.includes("MULTICOQUE")) return "SAIL_MULTICOQUE";
  if (upper.includes("SAIL") && upper.includes("MONOCOQUE")) return "SAIL_MONOCOQUE";

  if (upper.includes("BROKER")) return "BROKER";
  if (upper.includes("TENDERS")) return "TENDERS";
  if (upper.includes("PANTIERO") || /\bPAN\b/.test(upper)) return "PANTIERO";
  if (upper.includes("JETEE")) return "JETEE";
  if (upper.includes("QML")) return "QML";
  if (upper.includes("QSP")) return "QSP";
  if (upper.includes("SYE")) return "SYE";
  if (upper.includes("POWER")) return "POWER";
  if (upper.includes("SAIL")) return "SAIL";

  return null;
}

/**
 * Port implique avec certitude par un sectorCode reconnu.
 * Aligné sur `scripts/import-rx-planning.ts` (SPACE_OF port|zone).
 */
export function impliedPortFromSectorCode(sectorCode: string | null | undefined): string | null {
  if (!sectorCode) return null;

  if (sectorCode.startsWith("PALAIS_")) return "PALAIS";

  switch (sectorCode) {
    case "POWER":
    case "BROKER":
    case "SAIL":
    case "SAIL_MULTICOQUE":
    case "SAIL_MONOCOQUE":
      return "PORT_CANTO";
    case "QML":
    case "QSP":
    case "PANTIERO":
    case "JETEE":
    case "SYE":
    case "TENDERS":
      return "VIEUX_PORT";
    default:
      return null;
  }
}

/** Vrai uniquement pour le cas ambigu exact "PALAIS — PALAIS" (sans sous-zone). */
function isPalaisPalaisAmbiguous(value: string): boolean {
  const split = splitPortAndZone(collapseSpaces(value));
  if (!split) return false;
  return upperAscii(split.portPart) === "PALAIS" && upperAscii(split.zonePart) === "PALAIS";
}

function isPalaisSectorCode(sectorCode: string | null): boolean {
  return sectorCode !== null && sectorCode.startsWith("PALAIS_");
}

function resolveLogisticSpace(fullSector: string, sectorCode: string | null): string | null {
  if (sectorCode === "PALAIS_EXT") return "EXTERIEUR_PALAIS";
  if (sectorCode === "PALAIS_INT_NU" || sectorCode === "PALAIS_INT_EQUIPE") {
    return "INTERIEUR_PALAIS";
  }

  const derived = deriveSpaceFromSector(fullSector);
  if (derived.requiresUserChoice) return null;
  return derived.space;
}

interface BuildParsedOptions {
  warningReason?: LegacySectorWarningReason | null;
  /** Conflit port/zone : sectorCode et logisticSpace conserves, portCode annule. */
  portSectorConflict?: boolean;
}

function buildParsedResult(
  fullSector: string,
  portCode: string | null,
  sectorCode: string | null,
  options: BuildParsedOptions = {}
): ParsedLegacySector {
  const logisticSpace = sectorCode ? resolveLogisticSpace(fullSector, sectorCode) : null;

  if (options.portSectorConflict) {
    return withWarningReason(
      {
        portCode: null,
        sectorCode: sectorCode ?? null,
        logisticSpace,
        ambiguous: true,
      },
      PORT_SECTOR_CONFLICT
    );
  }

  const ambiguous = !portCode || !sectorCode;

  if (ambiguous) {
    return {
      portCode: portCode ?? null,
      sectorCode: sectorCode ?? null,
      logisticSpace,
      ambiguous: true,
    };
  }

  return { portCode, sectorCode, logisticSpace, ambiguous: false };
}

/**
 * Detecte un conflit entre le port explicite (gauche) et le port implique par
 * la zone (droite). Retourne true uniquement lorsque les deux ports sont
 * connus avec certitude et divergent.
 */
export function hasPortSectorConflict(
  explicitPortCode: string | null,
  sectorCode: string | null
): boolean {
  if (!explicitPortCode || !sectorCode) return false;
  const impliedPort = impliedPortFromSectorCode(sectorCode);
  if (!impliedPort) return false;
  return explicitPortCode !== impliedPort;
}

/**
 * Parse une zone PALAIS seule (sans separateur port/zone explicite).
 */
function parsePalaisZoneOnly(value: string): ParsedLegacySector | null {
  const sectorCode = normalizeLegacySectorCode(value);
  if (!isPalaisSectorCode(sectorCode)) return null;
  return buildParsedResult(value, "PALAIS", sectorCode);
}

/**
 * Parse une valeur legacy `Exhibitor.sector` en codes canoniques.
 */
export function parseLegacySector(value: string | null | undefined): ParsedLegacySector {
  if (!value || !collapseSpaces(value)) return EMPTY_RESULT;

  const collapsed = collapseSpaces(value);

  if (isPalaisPalaisAmbiguous(collapsed)) {
    return { portCode: null, sectorCode: null, logisticSpace: null, ambiguous: true };
  }

  const zoneOnly = parsePalaisZoneOnly(collapsed);
  if (zoneOnly && !splitPortAndZone(collapsed)) {
    return zoneOnly;
  }

  const split = splitPortAndZone(collapsed);
  if (!split) {
    return { portCode: null, sectorCode: null, logisticSpace: null, ambiguous: true };
  }

  const sectorCode = normalizeLegacySectorCode(split.zonePart);
  const explicitPortCode = normalizeLegacyPortCode(split.portPart);

  if (hasPortSectorConflict(explicitPortCode, sectorCode)) {
    return buildParsedResult(collapsed, explicitPortCode, sectorCode, { portSectorConflict: true });
  }

  return buildParsedResult(collapsed, explicitPortCode, sectorCode);
}
