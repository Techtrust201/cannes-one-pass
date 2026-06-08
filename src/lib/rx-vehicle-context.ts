/** Contexte véhicule RX persisté dans `Accreditation.extension.vehicleContext`. */
export interface RxVehicleContext {
  categoryId?: string | null;
  livDate?: string | null;
  livTime?: string | null;
  repDate?: string | null;
  repTime?: string | null;
  repSameAsDelivery?: boolean;
  repPlate?: string | null;
  repVehicleType?: string | null;
  repPhoneCode?: string | null;
  repPhoneNumber?: string | null;
  interveningCompany?: string | null;
  repInterveningCompany?: string | null;
  repCity?: string | null;
  repCountry?: string | null;
  repEstimatedKms?: number | null;
}

export function parseRxVehicleContext(
  extension: unknown
): RxVehicleContext | null {
  if (!extension || typeof extension !== "object") return null;
  const ctx = (extension as { vehicleContext?: unknown }).vehicleContext;
  if (!ctx || typeof ctx !== "object") return null;
  return ctx as RxVehicleContext;
}
