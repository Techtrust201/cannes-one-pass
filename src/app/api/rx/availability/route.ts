export const dynamic = "force-dynamic";

/**
 * GET /api/rx/availability
 *
 * Retourne la disponibilité RX (read-only) pour un créneau identifié par
 * sa clé logique complète.
 *
 * Cette route ne bloque pas la création d'accréditations dans cette phase :
 * elle expose uniquement les statistiques de capacité pour affichage ou
 * audit futur.
 *
 * Paramètres requis (query string) :
 *   - organizationId : string
 *   - eventId        : string
 *   - zone           : string  (code ZoneConfig, ex : "LA_BOCCA")
 *   - date           : string  (YYYY-MM-DD)
 *   - startTime      : string  (HH:MM)
 *   - endTime        : string  (HH:MM)
 *   - vehicleFamily  : "LIGHT" | "HEAVY"
 *   - phase          : "MONTAGE" | "DEMONTAGE"
 *
 * Réponse : RxAvailabilityResult
 *   { hasQuota, capacity, provisionalUsed, confirmedUsed,
 *     inZoneUsed, totalUsed, remaining, isFull }
 *
 * @see docs/rx/RX_CAPACITY_CONTRACT.md
 * @see src/lib/rx-capacity-service.ts
 */
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-helpers";
import { getRxAvailability } from "@/lib/rx-capacity-service";
import type { RxCapacityKey, RxPhase } from "@/lib/rx-capacity";
import type { VehicleFamily } from "@/lib/vehicle-family";

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, "FLUX_VEHICULES", "read");
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response("Non autorisé", { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const organizationId = searchParams.get("organizationId")?.trim() ?? "";
  const eventId = searchParams.get("eventId")?.trim() ?? "";
  const zone = searchParams.get("zone")?.trim() ?? "";
  const date = searchParams.get("date")?.trim() ?? "";
  const startTime = searchParams.get("startTime")?.trim() ?? "";
  const endTime = searchParams.get("endTime")?.trim() ?? "";
  const vehicleFamilyRaw = searchParams.get("vehicleFamily")?.trim() ?? "";
  const phaseRaw = searchParams.get("phase")?.trim() ?? "";

  // Validation des paramètres requis
  const missingParams = [
    !organizationId && "organizationId",
    !eventId && "eventId",
    !zone && "zone",
    !date && "date",
    !startTime && "startTime",
    !endTime && "endTime",
    !vehicleFamilyRaw && "vehicleFamily",
    !phaseRaw && "phase",
  ].filter(Boolean);

  if (missingParams.length > 0) {
    return Response.json(
      { error: `Paramètres manquants : ${missingParams.join(", ")}` },
      { status: 400 }
    );
  }

  if (vehicleFamilyRaw !== "LIGHT" && vehicleFamilyRaw !== "HEAVY") {
    return Response.json(
      { error: 'vehicleFamily doit être "LIGHT" ou "HEAVY"' },
      { status: 400 }
    );
  }

  if (phaseRaw !== "MONTAGE" && phaseRaw !== "DEMONTAGE") {
    return Response.json(
      { error: 'phase doit être "MONTAGE" ou "DEMONTAGE"' },
      { status: 400 }
    );
  }

  const key: RxCapacityKey = {
    organizationId,
    eventId,
    zone,
    date,
    startTime,
    endTime,
    vehicleFamily: vehicleFamilyRaw as VehicleFamily,
    phase: phaseRaw as RxPhase,
  };

  const result = await getRxAvailability(key);
  return Response.json(result);
}
