/**
 * Pré-assignation automatique de la zone de déchargement (RX uniquement).
 *
 * Règle métier fournie par RX (mail Mathieu §8.4) : la zone dépend du type de
 * véhicule (gabarit) et du port d'accueil de l'exposant.
 *
 *   Type de véhicule   | Vieux Port | Port Canto
 *   -------------------|------------|-----------
 *   VL                 | La Bocca   | Palm Beach
 *   10 m³              | La Bocca   | Palm Beach
 *   20 m³              | La Bocca   | Palm Beach
 *   Porteur (15 m³)    | La Bocca   | La Bocca
 *   Porteur articulé   | La Bocca   | La Bocca
 *   Semi-remorque      | La Bocca   | La Bocca
 *
 * La suggestion est calculée à la soumission (stockée dans
 * `extension.suggestedZone`) puis **pré-sélectionnée** à la validation
 * back-office — le logisticien peut toujours la modifier manuellement.
 *
 * RX uniquement : le flux Palais conserve l'assignation 100 % manuelle.
 */

import { DEFAULT_PALM_BEACH_AT_CANTO_CODES } from "@/lib/vehicle-type-defaults";

export const ZONE_LA_BOCCA = "LA_BOCCA";
export const ZONE_PALM_BEACH = "PALM_BEACH";

export type RxZoneCode = typeof ZONE_LA_BOCCA | typeof ZONE_PALM_BEACH;

/** Fallback si la config BDD n'est pas fournie (tests, rétrocompat). */
export const DEFAULT_PALM_BEACH_AT_CANTO = DEFAULT_PALM_BEACH_AT_CANTO_CODES;

/** Déduit le port d'accueil à partir du secteur figé de l'exposant. */
export function portFromSector(sector: string): "CANTO" | "VIEUX_PORT" {
  const s = (sector ?? "").toUpperCase();
  return s.includes("CANTO") ? "CANTO" : "VIEUX_PORT";
}

/**
 * Suggère la zone de déchargement pour un véhicule RX.
 * Retourne `null` si le gabarit est inconnu (pas de suggestion → choix manuel).
 *
 * @param palmBeachAtCantoCodes codes où `rxPalmBeachAtCanto=true` en BDD
 */
export function suggestZone(
  vehicleTypeCode: string | null | undefined,
  sector: string,
  palmBeachAtCantoCodes: Set<string> = DEFAULT_PALM_BEACH_AT_CANTO
): RxZoneCode | null {
  const code = (vehicleTypeCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const port = portFromSector(sector);

  if (port === "CANTO" && palmBeachAtCantoCodes.has(code)) {
    return ZONE_PALM_BEACH;
  }
  return ZONE_LA_BOCCA;
}
