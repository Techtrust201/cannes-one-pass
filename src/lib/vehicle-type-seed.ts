import { prisma } from "@/lib/prisma";
import { DEFAULT_VEHICLE_TYPES } from "@/lib/vehicle-type-defaults";

/**
 * Seed des gabarits de véhicules. Insère les entrées par défaut comme
 * configurations "globales" (organizationId = null), héritées par toutes
 * les organisations. Une organisation peut ensuite créer ses propres
 * surcharges via l'admin.
 */
export async function seedVehicleTypes() {
  const results = [];
  for (const t of DEFAULT_VEHICLE_TYPES) {
    const existing = await prisma.vehicleTypeConfig.findFirst({
      where: { code: t.code, organizationId: null },
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
            isActive: true,
          },
        })
      );
    }
  }
  return results;
}
