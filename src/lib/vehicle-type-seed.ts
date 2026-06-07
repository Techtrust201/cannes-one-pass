import { prisma } from "@/lib/prisma";
import { DEFAULT_VEHICLE_TYPES } from "@/lib/vehicle-type-defaults";

/**
 * Seed des gabarits de véhicules pour une organisation donnée.
 *
 * @param orgId organisation cible. `null` = configuration globale (legacy).
 *   En multi-tenant, on passe l'`organizationId` pour que chaque org dispose
 *   de sa propre copie indépendante des gabarits par défaut.
 */
export async function seedVehicleTypes(orgId: string | null = null) {
  const results = [];
  for (const t of DEFAULT_VEHICLE_TYPES) {
    const existing = await prisma.vehicleTypeConfig.findFirst({
      where: { code: t.code, organizationId: orgId },
    });
    if (existing) {
      results.push(
        await prisma.vehicleTypeConfig.update({
          where: { id: existing.id },
          data: {
            label: t.label,
            gabarit: t.gabarit,
            tonnageMini: t.tonnageMini,
            tonnageMoyen: t.tonnageMoyen,
            tonnageMaxi: t.tonnageMaxi,
            co2Coefficient: t.co2Coefficient,
            pdfCode: t.pdfCode,
            color: t.color,
            showTrailerPlate: t.showTrailerPlate,
            sortOrder: t.sortOrder,
            rxPalmBeachAtCanto: t.rxPalmBeachAtCanto ?? false,
            isActive: true,
          },
        })
      );
    } else {
      results.push(
        await prisma.vehicleTypeConfig.create({
          data: {
            code: t.code,
            label: t.label,
            gabarit: t.gabarit,
            tonnageMini: t.tonnageMini,
            tonnageMoyen: t.tonnageMoyen,
            tonnageMaxi: t.tonnageMaxi,
            co2Coefficient: t.co2Coefficient,
            pdfCode: t.pdfCode,
            color: t.color,
            showTrailerPlate: t.showTrailerPlate,
            sortOrder: t.sortOrder,
            rxPalmBeachAtCanto: t.rxPalmBeachAtCanto ?? false,
            isActive: true,
            organizationId: orgId,
          },
        })
      );
    }
  }
  return results;
}
