/**
 * Script de seed pour les zones par défaut.
 * Usage: npx tsx scripts/seed-zones.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString, max: 2 });
const prisma = new PrismaClient({ adapter });

const DEFAULT_ZONES = [
  {
    zone: "LA_BOCCA" as const,
    label: "La Bocca",
    address: "Zone de stockage La Bocca, Cannes",
    latitude: 43.5519,
    longitude: 6.9629,
  },
  {
    zone: "PALAIS_DES_FESTIVALS" as const,
    label: "Palais des Festivals",
    address: "1 Bd de la Croisette, 06400 Cannes",
    latitude: 43.5506,
    longitude: 7.0175,
  },
  {
    zone: "PANTIERO" as const,
    label: "Pantiero",
    address: "Prom. de la Pantiero, 06400 Cannes",
    latitude: 43.5509,
    longitude: 7.0140,
  },
  {
    zone: "MACE" as const,
    label: "Macé",
    address: "Plage Macé, Bd de la Croisette, 06400 Cannes",
    latitude: 43.5503,
    longitude: 7.0223,
  },
];

async function main() {
  console.log("🌱 Seeding zones...");

  for (const z of DEFAULT_ZONES) {
    const result = await prisma.zoneConfig.upsert({
      where: { zone: z.zone },
      update: {
        label: z.label,
        address: z.address,
        latitude: z.latitude,
        longitude: z.longitude,
      },
      create: z,
    });
    console.log(`  ✅ ${result.label} (${result.zone})`);
  }

  console.log("✨ Done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
