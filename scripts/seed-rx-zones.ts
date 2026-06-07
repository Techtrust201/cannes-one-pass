/**
 * Seed des zones de déchargement RX (Cannes Yachting Festival).
 *
 * Crée / met à jour, **scopées à l'organisation RX** (jamais en global, pour
 * ne pas polluer les filtres du Palais) :
 *   - LA_BOCCA  (zone de stockage La Bocca)
 *   - PALM_BEACH (Pointe Croisette / Palm Beach)
 *
 * Ces zones alimentent la pré-assignation automatique (cf. rx-zone-rules.ts)
 * et l'affichage adresse + GPS sur le PDF d'accréditation.
 *
 * Usage : npx tsx scripts/seed-rx-zones.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RX_ZONES = [
  {
    zone: "LA_BOCCA",
    label: "La Bocca",
    address: "Zone de stockage La Bocca, 06150 Cannes",
    latitude: 43.5519,
    longitude: 6.9629,
    color: "orange",
    isFinalDestination: false,
  },
  {
    zone: "PALM_BEACH",
    label: "Palm Beach",
    address: "Pointe Croisette (Palm Beach), 06400 Cannes",
    latitude: 43.5436,
    longitude: 7.0295,
    color: "blue",
    isFinalDestination: false,
  },
];

async function main() {
  const rx = await prisma.organization.findUnique({
    where: { slug: "rx" },
    select: { id: true },
  });
  if (!rx) throw new Error("Organisation RX introuvable (slug 'rx').");

  for (const z of RX_ZONES) {
    const result = await prisma.zoneConfig.upsert({
      where: { zone_organizationId: { zone: z.zone, organizationId: rx.id } },
      update: {
        label: z.label,
        address: z.address,
        latitude: z.latitude,
        longitude: z.longitude,
        color: z.color,
        isFinalDestination: z.isFinalDestination,
        isActive: true,
      },
      create: { ...z, organizationId: rx.id, isActive: true },
    });
    console.log(`  ✅ ${result.label} (${result.zone}) — org RX`);
  }
  console.log("✨ Zones RX seedées.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
