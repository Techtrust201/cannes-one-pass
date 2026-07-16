/**
 * Helpers rôle logistique véhicule (MONTAGE / DEMONTAGE / BOTH).
 */

import type { VehicleLogisticsRole } from "@prisma/client";

export type VehiclePhysicalDraft = {
  logisticsRole: VehicleLogisticsRole;
  size: string;
  plate?: string | null;
  trailerPlate?: string | null;
  phoneCode: string;
  phoneNumber: string;
  date: string;
  time: string;
  city: string;
  country?: string | null;
  kms?: string | null;
  interveningCompany?: string | null;
  unloading?: string | string[];
  vehicleType?: string | null;
};

/**
 * Détermine les véhicules physiques à créer à partir du contexte RX.
 * - même véhicule → 1 Vehicle BOTH (ou MONTAGE/DEMONTAGE si skip)
 * - véhicule différent → Vehicle MONTAGE + Vehicle DEMONTAGE
 */
export function buildPhysicalVehiclesFromRxContext(params: {
  skipMontage?: boolean;
  skipDemontage?: boolean;
  repSameAsDelivery?: boolean;
  montage: Omit<VehiclePhysicalDraft, "logisticsRole">;
  demontage?: Omit<VehiclePhysicalDraft, "logisticsRole"> | null;
}): VehiclePhysicalDraft[] {
  const skipMontage = params.skipMontage === true;
  const skipDemontage = params.skipDemontage === true;
  const same = params.repSameAsDelivery !== false;

  if (skipMontage && skipDemontage) return [];

  if (skipMontage) {
    const src = params.demontage ?? params.montage;
    return [{ ...src, logisticsRole: "DEMONTAGE" }];
  }
  if (skipDemontage) {
    return [{ ...params.montage, logisticsRole: "MONTAGE" }];
  }

  if (same) {
    return [{ ...params.montage, logisticsRole: "BOTH" }];
  }

  const demontage = params.demontage ?? params.montage;
  return [
    { ...params.montage, logisticsRole: "MONTAGE" },
    { ...demontage, logisticsRole: "DEMONTAGE" },
  ];
}

export function logisticsRoleLabel(role: VehicleLogisticsRole): string {
  switch (role) {
    case "MONTAGE":
      return "Montage";
    case "DEMONTAGE":
      return "Démontage";
    case "BOTH":
      return "Montage & démontage";
  }
}

/** Phase QR associée à un rôle (BOTH → les deux phases). */
export function phasesForLogisticsRole(
  role: VehicleLogisticsRole
): Array<"livraison" | "reprise"> {
  if (role === "MONTAGE") return ["livraison"];
  if (role === "DEMONTAGE") return ["reprise"];
  return ["livraison", "reprise"];
}
