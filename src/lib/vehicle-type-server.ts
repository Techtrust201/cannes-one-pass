import type { VehicleTypeData } from "@/lib/vehicle-utils";
import { getDefaultVehicleTypesForScope } from "@/lib/vehicle-type-defaults";
import { getColorHex } from "@/lib/color-palette";
import type { VehicleTypeConfig } from "@prisma/client";

export {
  resolveVehicleTypeLabelFromList,
  resolveVehicleTypeShortLabelFromList,
  resolveVehicleTypeCodeFromList,
} from "@/lib/vehicle-type-resolve";

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
    rxPalmBeachAtCanto: type.rxPalmBeachAtCanto,
    rxZoneCanto: (type as unknown as { rxZoneCanto?: string | null }).rxZoneCanto ?? null,
    rxZoneVieuxPort: (type as unknown as { rxZoneVieuxPort?: string | null }).rxZoneVieuxPort ?? null,
    sortOrder: type.sortOrder,
    isActive: type.isActive,
  };
}

export function mapDefaultVehicleTypes(orgSlug?: string | null): VehicleTypeData[] {
  return getDefaultVehicleTypesForScope(orgSlug).map((t, index) => ({
    id: index + 1,
    ...t,
    rxPalmBeachAtCanto: t.rxPalmBeachAtCanto ?? false,
    rxZoneCanto: t.rxZoneCanto ?? null,
    rxZoneVieuxPort: t.rxZoneVieuxPort ?? null,
    isActive: true,
  }));
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
