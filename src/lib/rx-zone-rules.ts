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

/** Zone cible d'un gabarit selon le port (table de routage configurable). */
export interface RxZoneRouting {
  /** Code ZoneConfig si l'exposant est au Port Canto (null = pas de règle). */
  canto: string | null;
  /** Code ZoneConfig si l'exposant est au Vieux Port (null = pas de règle). */
  vieuxPort: string | null;
}

/**
 * Construit la table de routage `code gabarit → { canto, vieuxPort }` à partir
 * des `VehicleTypeConfig` (champs `rxZoneCanto` / `rxZoneVieuxPort`). Les codes
 * sont normalisés en majuscules. Les entrées sans aucune zone sont ignorées
 * (repli legacy assuré par `suggestZone`).
 */
export function buildRxZoneRouting(
  types: Array<{
    code: string;
    rxZoneCanto?: string | null;
    rxZoneVieuxPort?: string | null;
  }>
): Map<string, RxZoneRouting> {
  const map = new Map<string, RxZoneRouting>();
  for (const t of types) {
    const canto = t.rxZoneCanto?.trim() || null;
    const vieuxPort = t.rxZoneVieuxPort?.trim() || null;
    if (!canto && !vieuxPort) continue;
    map.set(t.code.trim().toUpperCase(), { canto, vieuxPort });
  }
  return map;
}

/**
 * Suggère la zone de déchargement pour un véhicule RX.
 * Retourne `null` si le gabarit est inconnu (pas de suggestion → choix manuel).
 *
 * Ordre de résolution :
 *   1. Table de routage explicite (`routingMap`, configurée par gabarit × port
 *      depuis l'admin). Prioritaire dès qu'une zone est définie pour ce port.
 *   2. Repli legacy : flag `rxPalmBeachAtCanto` (Port Canto + petit gabarit →
 *      Palm Beach, sinon La Bocca).
 *
 * @param palmBeachAtCantoCodes codes où `rxPalmBeachAtCanto=true` en BDD
 * @param routingMap table de routage configurable (cf. `buildRxZoneRouting`)
 */
export function suggestZone(
  vehicleTypeCode: string | null | undefined,
  sector: string,
  palmBeachAtCantoCodes: Set<string> = DEFAULT_PALM_BEACH_AT_CANTO,
  routingMap?: Map<string, RxZoneRouting>
): string | null {
  const code = (vehicleTypeCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const port = portFromSector(sector);

  // 1. Table de routage configurable (prioritaire).
  const rule = routingMap?.get(code);
  if (rule) {
    const target = port === "CANTO" ? rule.canto : rule.vieuxPort;
    if (target) return target;
  }

  // 2. Repli legacy (flag rxPalmBeachAtCanto).
  if (port === "CANTO" && palmBeachAtCantoCodes.has(code)) {
    return ZONE_PALM_BEACH;
  }
  return ZONE_LA_BOCCA;
}
