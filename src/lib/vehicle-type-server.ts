import type { VehicleTypeData } from "@/lib/vehicle-utils";
import { getDefaultVehicleTypesForScope } from "@/lib/vehicle-type-defaults";
import { getColorHex } from "@/lib/color-palette";
import { parseVehicleTypeDbTranslations } from "@/lib/vehicle-type-i18n";
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
    displayLabels: parseVehicleTypeDbTranslations(
      (type as unknown as { displayLabels?: unknown }).displayLabels
    ),
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
    displayLabels: {},
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

/**
 * Lot 3 (RX) — Résout le coefficient CO₂ d'un véhicule en privilégiant le
 * **code technique** (robuste aux libellés traduits / personnalisés en
 * back-office), avec repli par libellé pour les données legacy (lignes dont
 * seul le `size`/libellé était connu). Empêche qu'un libellé administrable
 * fausse le bilan carbone.
 */
export function getCo2CoefficientFromList(
  types: VehicleTypeData[],
  opts: { code?: string | null; label?: string | null }
): number {
  const code = opts.code?.trim();
  const byCode = code ? types.find((t) => t.code === code) : undefined;
  if (byCode) return byCode.co2Coefficient;
  const label = opts.label?.trim();
  const byLabel = label ? types.find((t) => t.label === label) : undefined;
  return byLabel?.co2Coefficient ?? 0.22;
}

/** Idem `getCo2CoefficientFromList` pour le pdfCode (catégorie A/B/C/D). */
export function getPdfCodeFromList(
  types: VehicleTypeData[],
  opts: { code?: string | null; label?: string | null }
): string {
  const code = opts.code?.trim();
  const byCode = code ? types.find((t) => t.code === code) : undefined;
  if (byCode) return byCode.pdfCode;
  const label = opts.label?.trim();
  const byLabel = label ? types.find((t) => t.label === label) : undefined;
  return byLabel?.pdfCode ?? "C";
}
