/**
 * Fonctions pures de résolution des libellés de gabarits véhicules.
 * Sans dépendance Prisma ni cache global : utilisable côté client et serveur.
 */
import type { VehicleTypeData } from "@/lib/vehicle-utils";

export function resolveVehicleTypeLabelFromList(
  types: VehicleTypeData[],
  vehicleType: string | null | undefined,
  fallbackSize?: string | null
): string {
  const byCode = (code: string) =>
    types.find((t) => t.code === code || t.code === code.toUpperCase());

  if (vehicleType) {
    const match = byCode(vehicleType);
    if (match) return match.gabarit.trim() || match.label;
    // Code présent mais introuvable → humaniser plutôt que tomber sur PORTEUR.
    return vehicleType.replace(/_/g, " ");
  }

  if (fallbackSize) {
    const match = byCode(fallbackSize);
    if (match) return match.gabarit.trim() || match.label;

    const s = fallbackSize.toUpperCase();
    if (s.includes("SEMI")) return byCode("SEMI_REMORQUE")?.gabarit ?? "~90 m³";
    if (s.includes("ARTICUL")) return byCode("PORTEUR_ARTICULE")?.gabarit ?? "~100 m³";
    if (s.includes("GROS") || s.includes("20")) return byCode("GROS_PORTEUR")?.gabarit ?? "20 m³";
    if (s.includes("LEGER") || s.includes("10")) return byCode("PORTEUR_LEGER")?.gabarit ?? "10 m³";
    if (s.includes("VL") || s.includes("FOURGON")) return byCode("VL")?.gabarit ?? "VL";
    if (s.includes("PORTEUR")) return byCode("PORTEUR")?.gabarit ?? "15 m³";
  }

  return byCode("PORTEUR")?.gabarit ?? "15 m³";
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

/**
 * Poids moyen indicatif (tonnes) d'un gabarit, calculé sur une liste scopée.
 * Repli à 15 t si le code est introuvable dans la liste fournie.
 */
export function getAverageWeightFromList(
  types: VehicleTypeData[],
  code: string | null | undefined
): number {
  if (!code) return 15;
  const type = types.find(
    (t) => t.code === code || t.code === code.toUpperCase()
  );
  if (!type) return 15;
  return Math.round((type.tonnageMini + type.tonnageMaxi) / 2);
}
