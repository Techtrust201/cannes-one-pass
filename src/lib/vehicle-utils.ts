import { DEFAULT_VEHICLE_TYPES } from "@/lib/vehicle-type-defaults";
import { getColorHex } from "@/lib/color-palette";
import { withEspaceQuery } from "@/lib/url";

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

// ────────────────────────────────────────────────────────────────
// Cache local par Espace (chargé via loadVehicleTypes)
//
// Multi-tenant : les gabarits sont scopés par organisation. On garde un cache
// par slug d'Espace (clé "__global__" quand aucun espace n'est fourni) afin
// d'éviter de mélanger/dupliquer les gabarits de plusieurs organisations dans
// les helpers synchrones (tables, PDF, bilan carbone…).
// ────────────────────────────────────────────────────────────────
const GLOBAL_SCOPE = "__global__";
const _typesByScope = new Map<string, VehicleTypeData[]>();
const _loadingByScope = new Map<string, Promise<VehicleTypeData[]>>();
let _currentScope = GLOBAL_SCOPE;

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

export async function loadVehicleTypes(
  force = false,
  orgSlug?: string | null
): Promise<VehicleTypeData[]> {
  const scope = orgSlug?.trim() || GLOBAL_SCOPE;
  _currentScope = scope;

  if (!force && _typesByScope.has(scope)) return _typesByScope.get(scope)!;
  if (!force && _loadingByScope.has(scope)) return _loadingByScope.get(scope)!;

  const promise = (async () => {
    try {
      const url = withEspaceQuery("/api/vehicle-types", orgSlug);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const active = data
            .map(normalizeVehicleType)
            .filter((t) => t.isActive);
          _typesByScope.set(scope, active);
          return active;
        }
      }
    } catch (error) {
      console.error("Erreur chargement gabarits véhicules:", error);
    }
    // Fallback aux gabarits par défaut si rien n'est chargé pour ce scope.
    const fallback = _typesByScope.get(scope) ?? DEFAULT_VEHICLE_TYPES_DATA;
    _typesByScope.set(scope, fallback);
    return fallback;
  })();

  _loadingByScope.set(scope, promise);
  const result = await promise;
  _loadingByScope.delete(scope);
  return result;
}

export function getVehicleTypesSync(): VehicleTypeData[] {
  return (
    _typesByScope.get(_currentScope) ??
    _typesByScope.get(GLOBAL_SCOPE) ??
    DEFAULT_VEHICLE_TYPES_DATA
  );
}

export function invalidateVehicleTypeCache(): void {
  _typesByScope.clear();
  _loadingByScope.clear();
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

/**
 * Libellé compact d'un gabarit pour l'affichage en liste :
 * - VL → "VL" ; volumes "N m³" (10/15/20) → le gabarit tel quel ;
 * - autres (porteur, porteur articulé, semi-remorque…) → l'appellation seule
 *   (label sans la partie entre parenthèses).
 */
export function toShortVehicleLabel(type: {
  gabarit?: string | null;
  label?: string | null;
}): string {
  const gabarit = (type.gabarit ?? "").trim();
  if (gabarit === "VL") return "VL";
  if (/^\d+\s*m³$/.test(gabarit)) return gabarit;
  const label = (type.label ?? "").trim();
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label || gabarit;
}

export function resolveVehicleTypeShortLabel(
  vehicleType: string | null | undefined,
  fallbackSize?: string | null
): string {
  const type =
    (vehicleType ? getVehicleType(vehicleType) : undefined) ??
    (fallbackSize ? getVehicleType(fallbackSize) : undefined);
  if (type) return toShortVehicleLabel(type);
  // Pas de type résolu → repli sur le label complet (comportement historique).
  return resolveVehicleTypeLabel(vehicleType, fallbackSize);
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
