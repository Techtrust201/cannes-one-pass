import type { VehicleType } from "@/types";

/** Limites de poids par type de véhicule (en tonnes) */
const WEIGHT_LIMITS: Record<VehicleType, { emptyWeight: number; maxWeight: number }> = {
  PORTEUR: { emptyWeight: 12, maxWeight: 26 },
  PORTEUR_ARTICULE: { emptyWeight: 12, maxWeight: 26 },
  SEMI_REMORQUE: { emptyWeight: 15, maxWeight: 44 },
};

/** Retourne les limites de poids pour un type de véhicule */
export function getVehicleWeightLimits(vehicleType: VehicleType): { emptyWeight: number; maxWeight: number } {
  return WEIGHT_LIMITS[vehicleType];
}

/** Valide qu'un poids actuel est dans les limites */
export function validateVehicleWeight(currentWeight: number, vehicleType: VehicleType): boolean {
  const limits = WEIGHT_LIMITS[vehicleType];
  return currentWeight >= limits.emptyWeight && currentWeight <= limits.maxWeight;
}

/** Retourne le libellé français d'un type de véhicule */
export function getVehicleTypeLabel(vehicleType: VehicleType): string {
  const labels: Record<VehicleType, string> = {
    PORTEUR: "Porteur",
    PORTEUR_ARTICULE: "Porteur articulé",
    SEMI_REMORQUE: "Semi-remorque",
  };
  return labels[vehicleType];
}

/** Retourne le poids moyen pour un type de véhicule (moyenne entre poids à vide et poids max en charge) */
export function getAverageWeight(vehicleType: VehicleType): number {
  const limits = WEIGHT_LIMITS[vehicleType];
  return Math.round((limits.emptyWeight + limits.maxWeight) / 2);
}

/** Tous les types de véhicules disponibles pour la phase pilote */
export function getAllVehicleTypes(): VehicleType[] {
  return ["PORTEUR", "PORTEUR_ARTICULE", "SEMI_REMORQUE"];
}
