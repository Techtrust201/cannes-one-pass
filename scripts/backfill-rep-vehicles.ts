/**
 * Crée les véhicules physiques de démontage manquants pour RX.
 *
 * Usage : npx tsx scripts/backfill-rep-vehicles.ts --event <slug|id> [--apply]
 * Sans --apply, aucune écriture n'est réalisée.
 */
import { PrismaClient, VehicleLogisticsRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL environment variable is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type VehicleContext = {
  repSameAsDelivery?: boolean;
  repDate?: string | null;
  repTime?: string | null;
  repVehicleType?: string | null;
  repPlate?: string | null;
  repPhoneCode?: string | null;
  repPhoneNumber?: string | null;
  repInterveningCompany?: string | null;
  repCity?: string | null;
  repEstimatedKms?: number | null;
};

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1]?.trim() : undefined;
}

async function main() {
  const eventRef = arg("--event");
  const apply = process.argv.includes("--apply");
  if (!eventRef) throw new Error("Usage : --event <slug|id> [--apply]");

  const rx = await prisma.organization.findUnique({ where: { slug: "rx" }, select: { id: true } });
  if (!rx) throw new Error("Organisation RX introuvable");
  const event = await prisma.event.findFirst({
    where: { organizationId: rx.id, OR: [{ id: eventRef }, { slug: eventRef }] },
    select: { id: true, slug: true },
  });
  if (!event) throw new Error("Événement RX introuvable pour --event");

  const accreditations = await prisma.accreditation.findMany({
    where: { organizationId: rx.id, eventId: event.id, isArchived: false },
    select: {
      id: true,
      extension: true,
      vehicles: { select: { logisticsRole: true, size: true, phoneCode: true, phoneNumber: true, unloading: true, city: true, country: true, plate: true, vehicleType: true, interveningCompany: true, estimatedKms: true } },
    },
  });

  let planned = 0;
  for (const accreditation of accreditations) {
    const context = (accreditation.extension as { vehicleContext?: VehicleContext } | null)?.vehicleContext;
    if (!context || context.repSameAsDelivery !== false || !context.repDate || !context.repTime) continue;
    if (accreditation.vehicles.some((vehicle) => vehicle.logisticsRole === VehicleLogisticsRole.DEMONTAGE)) continue;
    const delivery = accreditation.vehicles.find((vehicle) => vehicle.logisticsRole !== VehicleLogisticsRole.DEMONTAGE);
    if (!delivery) continue;
    planned += 1;
    console.log(`[${apply ? "apply" : "dry-run"}] ${accreditation.id}: ${context.repVehicleType ?? delivery.vehicleType ?? delivery.size} ${context.repDate} ${context.repTime}`);
    if (!apply) continue;
    await prisma.vehicle.create({
      data: {
        accreditationId: accreditation.id,
        logisticsRole: VehicleLogisticsRole.DEMONTAGE,
        plate: context.repPlate ?? null,
        size: context.repVehicleType ?? delivery.size,
        vehicleType: context.repVehicleType ?? delivery.vehicleType,
        phoneCode: context.repPhoneCode ?? delivery.phoneCode,
        phoneNumber: context.repPhoneNumber ?? delivery.phoneNumber,
        date: context.repDate,
        time: context.repTime,
        city: context.repCity ?? delivery.city,
        unloading: delivery.unloading,
        country: delivery.country,
        estimatedKms: context.repEstimatedKms ?? delivery.estimatedKms,
        interveningCompany: context.repInterveningCompany ?? delivery.interveningCompany,
      },
    });
  }
  console.log(`[backfill] ${planned} véhicule(s) de démontage ${apply ? "créé(s)" : "à créer"} pour ${event.slug}.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
