import { prisma } from "@/lib/prisma";
import { DEFAULT_VEHICLE_TYPES } from "@/lib/vehicle-type-defaults";

export async function seedVehicleTypes() {
  return prisma.$transaction(
    DEFAULT_VEHICLE_TYPES.map((t) =>
      prisma.vehicleTypeConfig.upsert({
        where: { code: t.code },
        update: {
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
        create: {
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
    )
  );
}
