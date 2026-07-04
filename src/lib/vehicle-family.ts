/**
 * Résolution centralisée de la famille véhicule LIGHT / HEAVY (RX + dashboard).
 *
 * Source de vérité : `VehicleTypeConfig.pdfCode` quand une config est disponible.
 * Fallback texte uniquement si aucune config exploitable n'existe.
 *
 * @see docs/rx/RX_CAPACITY_CONTRACT.md
 */
import type { Vehicle } from "@/types";
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import { resolveVehicleTypeCodeFromList } from "@/lib/vehicle-type-resolve";

export type VehicleFamily = "LIGHT" | "HEAVY";

/** pdfCode C ou D = poids lourd. */
export function isHeavyPdfCode(pdfCode: string | undefined | null): boolean {
  return pdfCode === "C" || pdfCode === "D";
}

export function resolveVehicleFamilyFromPdfCode(
  pdfCode: string | undefined | null
): VehicleFamily {
  return isHeavyPdfCode(pdfCode) ? "HEAVY" : "LIGHT";
}

/**
 * Fallback métier RX lorsqu'aucune config VehicleTypeConfig n'est résolue.
 * LIGHT = VL, 10 m³, 15 m³, 20 m³ ; HEAVY = Porteur, Porteur articulé, Semi-remorque.
 */
export function resolveVehicleFamilyFromText(
  text: string | null | undefined
): VehicleFamily {
  const raw = String(text ?? "").trim();
  if (!raw) return "LIGHT";

  const s = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/semi[\s-]?remorque/.test(s)) return "HEAVY";
  if (/porteur\s+articul/.test(s) || /\barticul/.test(s)) return "HEAVY";

  if (/\bvl\b/.test(s) || /fourgon/.test(s)) return "LIGHT";
  if (/\b10\s*m/.test(s)) return "LIGHT";
  if (/\b15\s*m/.test(s)) return "LIGHT";
  if (/\b20\s*m/.test(s)) return "LIGHT";

  if (/porteur/.test(s)) return "HEAVY";

  return "LIGHT";
}

export function resolveVehicleFamilyFromConfig(
  config: Pick<VehicleTypeData, "pdfCode"> & { vehicleFamily?: string | null } | null | undefined
): VehicleFamily | null {
  if (!config) return null;
  // Priorité 1 : surcharge explicite admin (vehicleFamily sur VehicleTypeConfig).
  if (config.vehicleFamily === "HEAVY") return "HEAVY";
  if (config.vehicleFamily === "LIGHT") return "LIGHT";
  // Priorité 2 : pdfCode.
  if (!config.pdfCode) return null;
  return resolveVehicleFamilyFromPdfCode(config.pdfCode);
}

/** Un véhicule est-il poids lourd selon pdfCode config ou fallback texte ? */
export function vehicleIsHeavy(
  types: VehicleTypeData[],
  v: Vehicle
): boolean {
  const code = resolveVehicleTypeCodeFromList(types, v.vehicleType, v.size);
  const matched = types.find(
    (t) => t.code === code || t.code === code.toUpperCase()
  );
  const fromConfig = resolveVehicleFamilyFromConfig(matched);
  if (fromConfig) return fromConfig === "HEAVY";
  return (
    resolveVehicleFamilyFromText(v.vehicleType ?? v.size ?? code) === "HEAVY"
  );
}

/** Famille d'un gabarit configuré (pdfCode obligatoire côté catalogue). */
export function isHeavyFromVehicleType(
  type: Pick<VehicleTypeData, "pdfCode">
): boolean {
  return isHeavyPdfCode(type.pdfCode);
}
