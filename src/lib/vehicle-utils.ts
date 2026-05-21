import { DEFAULT_VEHICLE_TYPES } from "@/lib/vehicle-type-defaults";
import { getColorHex } from "@/lib/color-palette";

export interface VehicleTypeData {
  id: number;
  code: string;
  label: string;
  gabarit: string;
  tonnageMini: number;
  tonnageMoyen: number;
  tonnageMaxi: number;
  co2Coefficient: number;
  pdfCode: "A" | "B" | "C" | "D";
  color: string;
  showTrailerPlate: boolean;
  sortOrder: number;
  isActive: boolean;
}

const DEFAULT_VEHICLE_TYPES_DATA: VehicleTypeData[] = DEFAULT_VEHICLE_TYPES.map(
  (t, index) => ({
    id: index + 1,
    ...t,
    isActive: true,
  })
);

let _types: VehicleTypeData[] = DEFAULT_VEHICLE_TYPES_DATA;
let _loaded = false;
let _loadingPromise: Promise<void> | null = null;

function normalizeVehicleType(raw: unknown): VehicleTypeData {
  const item = raw as Record<string, unknown>;
  return {
    id: Number(item.id),
    code: String(item.code),
    label: String(item.label),
    gabarit: String(item.gabarit),
    tonnageMini: Number(item.tonnageMini),
    tonnageMoyen: Number(item.tonnageMoyen),
    tonnageMaxi: Number(item.tonnageMaxi),
    co2Coefficient: Number(item.co2Coefficient),
    pdfCode: (item.pdfCode as VehicleTypeData["pdfCode"]) ?? "C",
    color: String(item.color ?? "gray"),
    showTrailerPlate: Boolean(item.showTrailerPlate),
    sortOrder: Number(item.sortOrder ?? 0),
    isActive: Boolean(item.isActive ?? true),
  };
}

export async function loadVehicleTypes(force = false): Promise<VehicleTypeData[]> {
  if (_loaded && !force) return _types;
  if (_loadingPromise && !force) {
    await _loadingPromise;
    return _types;
  }

  _loadingPromise = (async () => {
    try {
      const res = await fetch("/api/vehicle-types");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          _types = data.map(normalizeVehicleType).filter((t) => t.isActive);
          _loaded = true;
        }
      }
    } catch (error) {
      console.error("Erreur chargement gabarits véhicules:", error);
      if (_types.length === 0) {
        _types = DEFAULT_VEHICLE_TYPES_DATA;
        _loaded = true;
      }
    }
  })();

  await _loadingPromise;
  _loadingPromise = null;
  return _types;
}

export function getVehicleTypesSync(): VehicleTypeData[] {
  return _loaded ? _types : DEFAULT_VEHICLE_TYPES_DATA;
}

export function invalidateVehicleTypeCache(): void {
  _loaded = false;
  _loadingPromise = null;
}

export function getVehicleType(code: string): VehicleTypeData | undefined {
  return getVehicleTypesSync().find(
    (t) => t.code === code || t.code === code.toUpperCase()
  );
}

export function getVehicleWeightLimits(code: string): {
  emptyWeight: number;
  maxWeight: number;
} {
  const type = getVehicleType(code);
  if (!type) return { emptyWeight: 12, maxWeight: 19 };
  return { emptyWeight: type.tonnageMini, maxWeight: type.tonnageMaxi };
}

export function validateVehicleWeight(currentWeight: number, code: string): boolean {
  const limits = getVehicleWeightLimits(code);
  return currentWeight >= limits.emptyWeight && currentWeight <= limits.maxWeight;
}

export function getVehicleTypeLabel(code: string): string {
  return getVehicleType(code)?.label ?? code.replace(/_/g, " ");
}

export function getAverageWeight(code: string): number {
  const type = getVehicleType(code);
  if (!type) return 15;
  return Math.round((type.tonnageMini + type.tonnageMaxi) / 2);
}

export function getAllVehicleTypeCodes(): string[] {
  return getVehicleTypesSync().map((t) => t.code);
}

/** @deprecated Alias pour compatibilité */
export function getAllVehicleTypes(): string[] {
  return getAllVehicleTypeCodes();
}

export function needsTrailerPlate(code: string): boolean {
  return getVehicleType(code)?.showTrailerPlate ?? false;
}

export function getVehicleTypeColors(): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const t of getVehicleTypesSync()) {
    colors[t.label] = getColorHex(t.color);
  }
  return colors;
}

export function getPdfCodeForLabel(label: string): string {
  const type = getVehicleTypesSync().find((t) => t.label === label);
  return type?.pdfCode ?? "C";
}

export function buildEmptyTypeBreakdown(): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const t of getVehicleTypesSync()) {
    breakdown[t.label] = 0;
  }
  return breakdown;
}

export function buildTypeBreakdown(
  entries: Array<{ type: string }>
): Record<string, number> {
  const breakdown = buildEmptyTypeBreakdown();
  for (const entry of entries) {
    if (breakdown[entry.type] !== undefined) {
      breakdown[entry.type] += 1;
    } else {
      breakdown[entry.type] = (breakdown[entry.type] ?? 0) + 1;
    }
  }
  return breakdown;
}

export function resolveVehicleTypeLabel(
  vehicleType: string | null | undefined,
  fallbackSize?: string | null
): string {
  if (vehicleType) {
    const fromCode = getVehicleType(vehicleType);
    if (fromCode) return fromCode.label;
  }

  if (fallbackSize) {
    const fromSize = getVehicleType(fallbackSize);
    if (fromSize) return fromSize.label;

    const s = fallbackSize.toUpperCase();
    if (s.includes("SEMI")) return getVehicleTypeLabel("SEMI_REMORQUE");
    if (s.includes("ARTICUL")) return getVehicleTypeLabel("PORTEUR_ARTICULE");
    if (s.includes("GROS") || s.includes("20")) return getVehicleTypeLabel("GROS_PORTEUR");
    if (s.includes("LEGER") || s.includes("10")) return getVehicleTypeLabel("PORTEUR_LEGER");
    if (s.includes("VL") || s.includes("FOURGON")) return getVehicleTypeLabel("VL");
    if (s.includes("PORTEUR")) return getVehicleTypeLabel("PORTEUR");
  }

  return getVehicleTypeLabel("PORTEUR");
}

export function resolveVehicleTypeCode(
  vehicleType: string | null | undefined,
  fallbackSize?: string | null
): string {
  if (vehicleType && getVehicleType(vehicleType)) return vehicleType;
  if (fallbackSize && getVehicleType(fallbackSize)) return fallbackSize;

  if (fallbackSize) {
    const s = fallbackSize.toUpperCase();
    if (s.includes("SEMI")) return "SEMI_REMORQUE";
    if (s.includes("ARTICUL")) return "PORTEUR_ARTICULE";
    if (s.includes("GROS") || s.includes("20")) return "GROS_PORTEUR";
    if (s.includes("LEGER") || s.includes("10")) return "PORTEUR_LEGER";
    if (s.includes("VL") || s.includes("FOURGON")) return "VL";
    if (s.includes("PORTEUR")) return "PORTEUR";
  }

  return "PORTEUR";
}

export function getCo2CoefficientForLabel(label: string): number {
  const type = getVehicleTypesSync().find((t) => t.label === label);
  return type?.co2Coefficient ?? getVehicleType("PORTEUR")?.co2Coefficient ?? 0.22;
}

export function getCo2CoefficientForCode(code: string): number {
  return getVehicleType(code)?.co2Coefficient ?? 0.22;
}
