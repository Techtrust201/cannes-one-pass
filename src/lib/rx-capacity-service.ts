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
import { suggestZone, buildRxZoneRouting } from "@/lib/rx-zone-rules";
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
 * Forme minimale de `extension` lue pour le comptage. Les autres champs
 * (contact, catégories…) ne sont pas nécessaires ici.
 */
interface RxExtensionShape {
  suggestedZone?: string;
  exhibitor?: { sector?: string } | null;
  vehicleContext?: {
    repDate?: string | null;
    repTime?: string | null;
    repVehicleType?: string | null;
  } | null;
}

/**
 * Créneaux véhicule acceptés pour un couple (startTime, endTime).
 *
 * Le formulaire RX stocke `Vehicle.time` sous forme de **plage complète**
 * (`"08:00-09:00"`), tandis que la clé de quota porte `startTime`/`endTime`
 * séparés. On accepte donc les deux représentations pour rester robuste :
 *   - `"08:00"`            (heure de début seule, rétrocompat)
 *   - `"08:00-09:00"`      (plage complète, format effectif en base)
 */
function acceptedSlotValues(startTime: string, endTime: string): Set<string> {
  return new Set([startTime, `${startTime}-${endTime}`]);
}

/**
 * Retourne la disponibilité RX pour un créneau identifié par sa clé logique.
 *
 * Le comptage dépend de la **phase** :
 *
 *   MONTAGE   → véhicule de livraison porté par `Vehicle.date` / `Vehicle.time`.
 *               Zone effective = `currentZone ?? extension.suggestedZone`.
 *
 *   DEMONTAGE → véhicule de reprise porté par
 *               `extension.vehicleContext.repDate` / `repTime` /
 *               `repVehicleType` (les colonnes `Vehicle.date` / `time`
 *               représentent le montage, pas la reprise). La zone de reprise
 *               est recalculée via `suggestZone(repVehicleType, sector)` —
 *               logique identique au blocage POST /api/accreditations.
 *
 * Source de vérité unique pour l'onglet Capacités RX, la route publique et le
 * blocage POST.
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

  // 2. Types de véhicules de l'organisation (résolution famille + routage zone)
  const dbVehicleTypeConfigs = await prisma.vehicleTypeConfig.findMany({
    where: { organizationId: key.organizationId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const vehicleTypes = dbVehicleTypeConfigs.map(mapDbVehicleType);

  const matchingStatuses =
    key.phase === "DEMONTAGE"
      ? await countDemontageStatuses(key, vehicleTypes, dbVehicleTypeConfigs)
      : await countMontageStatuses(key, vehicleTypes);

  const stats = computeCapacityStats(quota.capacity, matchingStatuses);
  return { hasQuota: true, ...stats };
}

// ── Comptage MONTAGE ──────────────────────────────────────────────────────

/**
 * Compte les accréditations consommatrices dont le véhicule de **livraison**
 * (montage) tombe sur le créneau de la clé.
 */
async function countMontageStatuses(
  key: RxCapacityKey,
  vehicleTypes: ReturnType<typeof mapDbVehicleType>[]
): Promise<string[]> {
  const accepted = acceptedSlotValues(key.startTime, key.endTime);

  // Pré-filtre DB par date (le format d'heure varie → filtrage fin en JS).
  const accreditations = await prisma.accreditation.findMany({
    where: {
      organizationId: key.organizationId,
      eventId: key.eventId,
      isArchived: false,
      status: {
        in: RX_CONSUMER_STATUSES as unknown as AccreditationStatus[],
      },
      vehicles: { some: { date: key.date } },
    },
    select: {
      status: true,
      currentZone: true,
      extension: true,
      vehicles: {
        where: { date: key.date },
        select: { vehicleType: true, size: true, time: true },
      },
    },
  });

  const statuses: string[] = [];
  for (const acc of accreditations) {
    // Zone effective : currentZone prioritaire, sinon suggestedZone (cas NOUVEAU)
    const ext = acc.extension as RxExtensionShape | null;
    const effectiveZone = acc.currentZone ?? ext?.suggestedZone ?? null;
    if (effectiveZone !== key.zone) continue;

    // Au moins un véhicule sur le bon créneau ET la bonne famille.
    const match = acc.vehicles.some(
      (v) =>
        accepted.has(v.time) &&
        resolveDbVehicleFamily(v.vehicleType, v.size, vehicleTypes) ===
          key.vehicleFamily
    );
    if (match) statuses.push(acc.status);
  }
  return statuses;
}

// ── Comptage DEMONTAGE ────────────────────────────────────────────────────

/**
 * Compte les accréditations consommatrices dont le véhicule de **reprise**
 * (démontage) tombe sur le créneau de la clé. Les infos de reprise vivent dans
 * `extension.vehicleContext` (les colonnes Vehicle portent le montage).
 */
async function countDemontageStatuses(
  key: RxCapacityKey,
  vehicleTypes: ReturnType<typeof mapDbVehicleType>[],
  dbVehicleTypeConfigs: Array<{
    code: string;
    rxPalmBeachAtCanto?: boolean | null;
    rxZoneCanto?: string | null;
    rxZoneVieuxPort?: string | null;
  }>
): Promise<string[]> {
  const accepted = acceptedSlotValues(key.startTime, key.endTime);

  // Table de routage + codes « Palm Beach au Canto » (mêmes règles que le POST).
  const palmBeachCodes = new Set(
    dbVehicleTypeConfigs
      .filter((c) => c.rxPalmBeachAtCanto)
      .map((c) => c.code.toUpperCase())
  );
  const routing = buildRxZoneRouting(dbVehicleTypeConfigs);

  // Le filtrage sur repDate/repTime porte sur un JSON (extension) → on charge
  // les accréditations consommatrices de l'event et on filtre en JS.
  const accreditations = await prisma.accreditation.findMany({
    where: {
      organizationId: key.organizationId,
      eventId: key.eventId,
      isArchived: false,
      status: {
        in: RX_CONSUMER_STATUSES as unknown as AccreditationStatus[],
      },
    },
    select: {
      status: true,
      extension: true,
      vehicles: { select: { vehicleType: true, size: true } },
    },
  });

  const statuses: string[] = [];
  for (const acc of accreditations) {
    const ext = acc.extension as RxExtensionShape | null;
    const vc = ext?.vehicleContext;
    if (!vc) continue;

    if (vc.repDate !== key.date) continue;
    if (!accepted.has(vc.repTime ?? "")) continue;

    // Véhicule de reprise réel : repVehicleType si présent, sinon le véhicule
    // de montage (reprise « même véhicule »).
    const repType =
      (vc.repVehicleType && vc.repVehicleType.trim()) ||
      acc.vehicles[0]?.vehicleType ||
      "";
    if (!repType) continue;

    const family = resolveDbVehicleFamily(repType, repType, vehicleTypes);
    if (family !== key.vehicleFamily) continue;

    const sector = ext?.exhibitor?.sector ?? "";
    const zone = suggestZone(repType, sector, palmBeachCodes, routing);
    if (zone !== key.zone) continue;

    statuses.push(acc.status);
  }
  return statuses;
}
