/**
 * Adaptateur ISOLE — geographie du referentiel RX officiel (Phase 3).
 *
 * Exception documentee : 9 lignes du fichier `CYF26-listeTT` indiquent
 * `PORT = VIEUX PORT` avec `ZONE T-T = PALAIS ext`. Le parseur generique
 * produit `PORT_SECTOR_CONFLICT`, alors que le planning RX normalise vers
 * `portCode = PALAIS`. Cet adaptateur detecte ce cas et delegue la resolution
 * canonique au moteur generique avec `PORT = PALAIS`.
 *
 * Ne modifie PAS `parseLegacySector`.
 */

/** Motif de warning specifique au profil RX (distinct de PORT_SECTOR_CONFLICT). */
export const RX_LEGACY_PORT_NORMALIZED = "RX_LEGACY_PORT_NORMALIZED" as const;

export type RxReferentialWarningReason = typeof RX_LEGACY_PORT_NORMALIZED | "PORT_SECTOR_CONFLICT";

/** Resultat d'une normalisation RX : port cible + valeurs brutes conservees. */
export interface RxReferentialPortNormalization {
  /** Port canonique a utiliser pour la resolution generique. */
  normalizedPort: "PALAIS";
  /** Port tel qu'indique dans le fichier source (ex. "VIEUX PORT"). */
  sourcePort: string;
  /** Zone telle qu'indiquee dans le fichier source (ex. "PALAIS ext"). */
  sourceSector: string;
}

function isVieuxPort(port: string): boolean {
  return port.trim().toUpperCase() === "VIEUX PORT";
}

/** Zone PALAIS ext du referentiel RX (9 lignes officielles concernees). */
export function isRxReferentialPalaisExtZone(zone: string): boolean {
  return /^palais\s+ext\b/i.test(zone.trim());
}

/**
 * Detecte et prepare la normalisation RX : VIEUX PORT + PALAIS ext.
 * Retourne null si la ligne ne releve pas de cette exception.
 */
export function tryRxReferentialPortNormalization(
  port: string | null | undefined,
  zone: string | null | undefined
): RxReferentialPortNormalization | null {
  const portTrim = (port ?? "").trim();
  const zoneTrim = (zone ?? "").trim();
  if (!portTrim || !zoneTrim) return null;
  if (isVieuxPort(portTrim) && isRxReferentialPalaisExtZone(zoneTrim)) {
    return { normalizedPort: "PALAIS", sourcePort: portTrim, sourceSector: zoneTrim };
  }
  return null;
}
