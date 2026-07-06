/**
 * Service serveur — disponibilité RX par créneau (lecture seule).
 *
 * Orchestre :
 *   1. Lookup du quota RxCapacity (clé logique complète).
 *   2. Comptage des accréditations consommatrices pour ce créneau.
 *   3. Calcul via computeCapacityStats.
 *
 * Limites de cette phase : service read-only, ne bloque pas la création.
 *
 * @see docs/rx/RX_CAPACITY_CONTRACT.md
 * @see src/lib/rx-capacity.ts
 */
import { prisma } from "@/lib/prisma";
import { mapDbVehicleType } from "@/lib/vehicle-type-server";
import {
  resolveVehicleFamilyFromConfig,
  resolveVehicleFamilyFromText,
} from "@/lib/vehicle-family";
import { resolveVehicleTypeCodeFromList } from "@/lib/vehicle-type-resolve";
import {
  computeCapacityStats,
  RX_CONSUMER_STATUSES,
} from "@/lib/rx-capacity";
import type { RxCapacityKey, RxCapacityStats } from "@/lib/rx-capacity";
import type { VehicleFamily } from "@/lib/vehicle-family";
import type { AccreditationStatus, VehicleFamily as PrismaVehicleFamily, RxPhase as PrismaRxPhase } from "@prisma/client";

// ── Résultat public ───────────────────────────────────────────────────────────

export interface RxAvailabilityResult extends RxCapacityStats {
  /**
   * `true` si une ligne RxCapacity existe pour ce créneau.
   * `false` si aucun quota n'est configuré → pas de limite active,
   * isFull reste false même avec remaining=0.
   */
  hasQuota: boolean;
}

// ── Constante « pas de quota » ─────────────────────────────────────────────

const NO_QUOTA_RESULT: RxAvailabilityResult = {
  hasQuota: false,
  capacity: 0,
  provisionalUsed: 0,
  confirmedUsed: 0,
  inZoneUsed: 0,
  totalUsed: 0,
  remaining: 0,
  isFull: false,
};

// ── Résolution vehicleFamily d'un véhicule DB ─────────────────────────────

/**
 * Résout la famille véhicule (LIGHT | HEAVY) d'un enregistrement Vehicle
 * issu d'une requête Prisma select.
 * Réutilise les helpers centralisés sans dupliquer la logique métier.
 */
export function resolveDbVehicleFamily(
  vehicleType: string | null | undefined,
  size: string,
  vehicleTypes: ReturnType<typeof mapDbVehicleType>[]
): VehicleFamily {
  const code = resolveVehicleTypeCodeFromList(vehicleTypes, vehicleType, size);
  const matched = vehicleTypes.find(
    (t) => t.code === code || t.code === code.toUpperCase()
  );
  const fromConfig = resolveVehicleFamilyFromConfig(matched);
  return fromConfig ?? resolveVehicleFamilyFromText(vehicleType ?? size ?? code);
}

// ── Service principal ─────────────────────────────────────────────────────

/**
 * Retourne la disponibilité RX pour un créneau identifié par sa clé logique.
 *
 * La phase (MONTAGE / DEMONTAGE) est portée par la clé mais ne sert qu'à
 * identifier le bon quota RxCapacity. Le comptage des accréditations est
 * scopé par date + startTime (les dates montage/démontage ne se chevauchent
 * pas dans le planning Cannes, donc le filtre de date suffit à scoper la phase).
 *
 * Zone des accréditations NOUVEAU : `extension.suggestedZone` (pas encore
 * de currentZone avant validation). Pour ATTENTE / ENTREE : `currentZone`.
 * Zone effective retenue = `currentZone ?? extension.suggestedZone`.
 */
export async function getRxAvailability(
  key: RxCapacityKey
): Promise<RxAvailabilityResult> {
  // 1. Quota configuré pour ce créneau
  const quota = await prisma.rxCapacity.findUnique({
    where: {
      organizationId_eventId_zone_date_startTime_endTime_vehicleFamily_phase: {
        organizationId: key.organizationId,
        eventId: key.eventId,
        zone: key.zone,
        date: key.date,
        startTime: key.startTime,
        endTime: key.endTime,
        vehicleFamily: key.vehicleFamily as PrismaVehicleFamily,
        phase: key.phase as PrismaRxPhase,
      },
    },
    select: { capacity: true },
  });

  if (!quota) {
    return NO_QUOTA_RESULT;
  }

  // 2. Types de véhicules de l'organisation (pour résolution vehicleFamily)
  const dbVehicleTypeConfigs = await prisma.vehicleTypeConfig.findMany({
    where: { organizationId: key.organizationId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const vehicleTypes = dbVehicleTypeConfigs.map(mapDbVehicleType);

  // 3. Accréditations consommatrices ayant un véhicule sur ce créneau (date + heure)
  const accreditations = await prisma.accreditation.findMany({
    where: {
      organizationId: key.organizationId,
      eventId: key.eventId,
      isArchived: false,
      status: {
        in: RX_CONSUMER_STATUSES as unknown as AccreditationStatus[],
      },
      vehicles: {
        some: {
          date: key.date,
          time: key.startTime,
        },
      },
    },
    select: {
      status: true,
      currentZone: true,
      extension: true,
      vehicles: {
        where: { date: key.date, time: key.startTime },
        select: { vehicleType: true, size: true },
      },
    },
  });

  // 4. Filtrage par zone effective et famille véhicule
  const matchingStatuses: string[] = [];

  for (const acc of accreditations) {
    // Zone effective : currentZone prioritaire, sinon suggestedZone (cas NOUVEAU)
    const ext = acc.extension as { suggestedZone?: string } | null;
    const effectiveZone = acc.currentZone ?? ext?.suggestedZone ?? null;

    if (effectiveZone !== key.zone) continue;

    // Vérifie qu'au moins un véhicule du créneau appartient à la bonne famille
    const hasMatchingFamily = acc.vehicles.some(
      (v) =>
        resolveDbVehicleFamily(v.vehicleType, v.size, vehicleTypes) ===
        key.vehicleFamily
    );

    if (hasMatchingFamily) {
      matchingStatuses.push(acc.status);
    }
  }

  // 5. Calcul des stats de capacité
  const stats = computeCapacityStats(quota.capacity, matchingStatuses);
  return { hasQuota: true, ...stats };
}
