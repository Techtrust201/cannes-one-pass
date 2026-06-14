import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { mapDbVehicleType, mapDefaultVehicleTypes } from "@/lib/vehicle-type-server";
import { resolveVehicleTypeShortLabelFromList } from "@/lib/vehicle-type-resolve";
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import type { AccreditationScanSummary } from "@/lib/scan-types";

/**
 * Accréditation chargée avec les relations nécessaires au résumé de scan.
 * Partagée par le lookup (QR/plaque exacte) et la recherche plaque dynamique.
 */
export type AccreditationWithScanRelations = Prisma.AccreditationGetPayload<{
  include: { vehicles: true; organization: { select: { slug: true } } };
}>;

/** `include` Prisma standard à réutiliser pour produire un `AccreditationScanSummary`. */
export const SCAN_SUMMARY_INCLUDE = {
  vehicles: true,
  organization: { select: { slug: true } },
} as const;

/**
 * Transforme des accréditations Prisma en `AccreditationScanSummary[]`.
 * Charge les configs de gabarits par organisation une seule fois par org afin de
 * résoudre les libellés véhicule côté serveur (jamais de scan mémoire inutile).
 */
export async function buildScanSummaries(
  accreditations: AccreditationWithScanRelations[]
): Promise<AccreditationScanSummary[]> {
  if (accreditations.length === 0) return [];

  const orgIds = Array.from(
    new Set(accreditations.map((a) => a.organizationId).filter(Boolean))
  ) as string[];

  const typesByOrg = new Map<string, VehicleTypeData[]>();
  for (const orgId of orgIds) {
    const dbTypes = await prisma.vehicleTypeConfig.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    typesByOrg.set(orgId, dbTypes.map(mapDbVehicleType));
  }

  return accreditations.map((acc) => {
    const types =
      (acc.organizationId && typesByOrg.get(acc.organizationId)) ||
      mapDefaultVehicleTypes(acc.organization?.slug);
    return {
      id: acc.id,
      company: acc.company,
      stand: acc.stand,
      status: acc.status,
      currentZone: acc.currentZone,
      version: acc.version,
      isArchived: acc.isArchived,
      entryAt: acc.entryAt ? acc.entryAt.toISOString() : null,
      exitAt: acc.exitAt ? acc.exitAt.toISOString() : null,
      vehicles: acc.vehicles.map((v) => ({
        id: v.id,
        plate: v.plate,
        trailerPlate: v.trailerPlate,
        vehicleLabel: resolveVehicleTypeShortLabelFromList(
          types,
          v.vehicleType,
          v.size
        ),
        phone:
          v.phoneCode || v.phoneNumber
            ? `${v.phoneCode ?? ""} ${v.phoneNumber ?? ""}`.trim()
            : null,
      })),
    };
  });
}
