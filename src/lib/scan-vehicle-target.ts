/**
 * Résolution pure du véhicule ciblé par un QR de scan (vehicleId + phase).
 * Utilisé par lookup et scan-action — jamais de confiance aveugle côté client.
 */

export type ScanPhase = "livraison" | "reprise";
export type VehicleLogisticsRole = "MONTAGE" | "DEMONTAGE" | "BOTH";

export type ScanTargetVehicle = {
  id: number;
  logisticsRole?: VehicleLogisticsRole | null;
  plate?: string | null;
  trailerPlate?: string | null;
  vehicleType?: string | null;
  size?: string | null;
  date?: string | null;
  time?: string | null;
  phoneCode?: string | null;
  phoneNumber?: string | null;
};

export type ResolveScanTargetOk = {
  ok: true;
  vehicle: ScanTargetVehicle;
  phase: ScanPhase | null;
};

export type ResolveScanTargetErr = {
  ok: false;
  code:
    | "VEHICLE_NOT_FOUND"
    | "VEHICLE_WRONG_ACCREDITATION"
    | "PHASE_INCOMPATIBLE";
  message: string;
};

export function roleMatchesPhase(
  role: VehicleLogisticsRole | null | undefined,
  phase: ScanPhase
): boolean {
  if (!role || role === "BOTH") return true;
  if (phase === "livraison") return role === "MONTAGE";
  return role === "DEMONTAGE";
}

export function logisticsRoleLabel(
  role: VehicleLogisticsRole | null | undefined
): string {
  switch (role) {
    case "MONTAGE":
      return "Montage";
    case "DEMONTAGE":
      return "Démontage";
    case "BOTH":
      return "Montage & Démontage";
    default:
      return "Véhicule";
  }
}

/**
 * Résout le véhicule ciblé parmi ceux de l'accréditation déjà chargée.
 * Sans vehicleId : compatibilité anciens QR (premier véhicule, phase optionnelle).
 */
export function resolveScanTargetVehicle(
  vehicles: ScanTargetVehicle[],
  opts: { vehicleId?: number | null; phase?: ScanPhase | null }
): ResolveScanTargetOk | ResolveScanTargetErr {
  const phase = opts.phase ?? null;
  const vehicleId =
    opts.vehicleId != null && Number.isFinite(opts.vehicleId) && opts.vehicleId > 0
      ? opts.vehicleId
      : null;

  if (vehicleId != null) {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) {
      return {
        ok: false,
        code: "VEHICLE_WRONG_ACCREDITATION",
        message:
          "Ce véhicule n'appartient pas à cette accréditation.",
      };
    }
    if (phase && !roleMatchesPhase(vehicle.logisticsRole, phase)) {
      return {
        ok: false,
        code: "PHASE_INCOMPATIBLE",
        message:
          "La phase du QR ne correspond pas au rôle logistique de ce véhicule.",
      };
    }
    return { ok: true, vehicle, phase };
  }

  if (vehicles.length === 0) {
    return {
      ok: false,
      code: "VEHICLE_NOT_FOUND",
      message: "Aucun véhicule sur cette accréditation.",
    };
  }

  // Ancien QR : phase seule peut encore orienter vers MONTAGE / DEMONTAGE.
  if (phase) {
    const byPhase = vehicles.find((v) =>
      roleMatchesPhase(v.logisticsRole, phase)
    );
    if (byPhase) return { ok: true, vehicle: byPhase, phase };
  }

  return { ok: true, vehicle: vehicles[0], phase };
}
