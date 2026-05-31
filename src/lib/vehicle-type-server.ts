import type { VehicleTypeData } from "@/lib/vehicle-utils";
import { DEFAULT_VEHICLE_TYPES } from "@/lib/vehicle-type-defaults";
import { getColorHex } from "@/lib/color-palette";
import type { VehicleTypeConfig } from "@prisma/client";

export function mapDbVehicleType(type: VehicleTypeConfig): VehicleTypeData {
  return {
    id: type.id,
    code: type.code,
    label: type.label,
    gabarit: type.gabarit,
    tonnageMini: type.tonnageMini,
    tonnageMoyen: type.tonnageMoyen,
    tonnageMaxi: type.tonnageMaxi,
    co2Coefficient: type.co2Coefficient,
    pdfCode: type.pdfCode as VehicleTypeData["pdfCode"],
    color: type.color,
    showTrailerPlate: type.showTrailerPlate,
    sortOrder: type.sortOrder,
    isActive: type.isActive,
  };
}

export function mapDefaultVehicleTypes(): VehicleTypeData[] {
  return DEFAULT_VEHICLE_TYPES.map((t, index) => ({
    id: index + 1,
    ...t,
    isActive: true,
  }));
}

export function resolveVehicleTypeLabelFromList(
  types: VehicleTypeData[],
  vehicleType: string | null | undefined,
  fallbackSize?: string | null
): string {
  const byCode = (code: string) =>
    types.find((t) => t.code === code || t.code === code.toUpperCase());

  if (vehicleType) {
    const match = byCode(vehicleType);
    if (match) return match.label;
  }

  if (fallbackSize) {
    const match = byCode(fallbackSize);
    if (match) return match.label;

    const s = fallbackSize.toUpperCase();
    if (s.includes("SEMI")) return byCode("SEMI_REMORQUE")?.label ?? "Semi-remorque";
    if (s.includes("ARTICUL")) return byCode("PORTEUR_ARTICULE")?.label ?? "Porteur articulé";
    if (s.includes("GROS") || s.includes("20")) return byCode("GROS_PORTEUR")?.label ?? "Gros porteur (20 m³)";
    if (s.includes("LEGER") || s.includes("10")) return byCode("PORTEUR_LEGER")?.label ?? "Porteur léger (10 m³)";
    if (s.includes("VL") || s.includes("FOURGON")) return byCode("VL")?.label ?? "Fourgon / VL";
    if (s.includes("PORTEUR")) return byCode("PORTEUR")?.label ?? "Porteur moyen (15 m³)";
  }

  return byCode("PORTEUR")?.label ?? "Porteur moyen (15 m³)";
}

export function resolveVehicleTypeShortLabelFromList(
  types: VehicleTypeData[],
  vehicleType: string | null | undefined,
  fallbackSize?: string | null
): string {
  const byCode = (code: string) =>
    types.find((t) => t.code === code || t.code === code.toUpperCase());
  const type =
    (vehicleType ? byCode(vehicleType) : undefined) ??
    (fallbackSize ? byCode(fallbackSize) : undefined);
  if (type) {
    const gabarit = (type.gabarit ?? "").trim();
    if (gabarit === "VL") return "VL";
    if (/^\d+\s*m³$/.test(gabarit)) return gabarit;
    const label = (type.label ?? "").trim();
    return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label || gabarit;
  }
  return resolveVehicleTypeLabelFromList(types, vehicleType, fallbackSize);
}

export function resolveVehicleTypeCodeFromList(
  types: VehicleTypeData[],
  vehicleType: string | null | undefined,
  fallbackSize?: string | null
): string {
  const byCode = (code: string) =>
    types.find((t) => t.code === code || t.code === code.toUpperCase());

  if (vehicleType && byCode(vehicleType)) return vehicleType;
  if (fallbackSize && byCode(fallbackSize)) return fallbackSize;

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

export function buildEmptyTypeBreakdownFromList(
  types: VehicleTypeData[]
): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const t of types) breakdown[t.label] = 0;
  return breakdown;
}

export function buildTypeBreakdownFromList(
  types: VehicleTypeData[],
  entries: Array<{ type: string }>
): Record<string, number> {
  const breakdown = buildEmptyTypeBreakdownFromList(types);
  for (const entry of entries) {
    breakdown[entry.type] = (breakdown[entry.type] ?? 0) + 1;
  }
  return breakdown;
}

export function getVehicleTypeColorsFromList(
  types: VehicleTypeData[]
): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const t of types) colors[t.label] = getColorHex(t.color);
  return colors;
}

export function getCo2CoefficientForLabelFromList(
  types: VehicleTypeData[],
  label: string
): number {
  return types.find((t) => t.label === label)?.co2Coefficient ?? 0.22;
}

export function getPdfCodeForLabelFromList(
  types: VehicleTypeData[],
  label: string
): string {
  return types.find((t) => t.label === label)?.pdfCode ?? "C";
}
