/**
 * Seed de démonstration RX :
 *   1. Force `Organization(rx).formTemplate = "rx"` (sinon le formulaire RX
 *      n'est jamais utilisé).
 *   2. Injecte quelques exposants de test sur le 1er event RX, avec des
 *      secteurs variés couvrant la déduction d'espace (Palais Int/Ext,
 *      Vieux Port, Canto…).
 *
 * Idempotent : upsert sur (eventId, name, stand).
 * Usage : npx tsx scripts/seed-rx-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const EXHIBITORS = [
  { name: "AZIMUT BENETTI Spa", stand: "SYE 109", sector: "VIEUX PORT — SYE", zone: "SYE 109" },
  { name: "ABI TRAILERS S.R.L", stand: "PAN 127", sector: "VIEUX PORT — PANTIERO", zone: "PAN 127" },
  { name: "AD ASTRA YACHT", stand: "QSP 105", sector: "VIEUX PORT — QSP", zone: "QSP 105" },
  { name: "AUSTIN PARKER", stand: "QML 113", sector: "VIEUX PORT — QML", zone: "QML 113" },
  { name: "ANTONINI NAVI SRL", stand: "JETEE 163", sector: "VIEUX PORT — JETEE", zone: "JETEE 163" },
  { name: "BELLINI YACHT", stand: "PALAIS 106", sector: "PALAIS — PALAIS", zone: "PALAIS 106" },
  { name: "MARINEDI", stand: "PALAIS 049", sector: "PALAIS — PALAIS", zone: "PALAIS 049" },
  { name: "SUNSEEKER", stand: "POWER 12", sector: "CANTO — POWER", zone: "POWER 12" },
  { name: "LAGOON CATAMARANS", stand: "SAIL 138", sector: "CANTO — SAIL", zone: "SAIL 138" },
  { name: "BROKER TOYS CO", stand: "BROKER 5", sector: "CANTO — BROKER", zone: "BROKER 5" },
];

async function main() {
  const rx = await prisma.organization.findUnique({
    where: { slug: "rx" },
    select: { id: true, formTemplate: true },
  });
  if (!rx) throw new Error("Organisation RX introuvable (slug 'rx').");

  if (rx.formTemplate !== "rx") {
    await prisma.organization.update({
      where: { id: rx.id },
      data: { formTemplate: "rx" },
    });
    console.log("✓ Organization(rx).formTemplate → 'rx'");
  } else {
    console.log("• formTemplate déjà = 'rx'");
  }

  const event = await prisma.event.findFirst({
    where: { organizationId: rx.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true },
  });
  if (!event) throw new Error("Aucun event RX. Crée-en un via /logisticien/dates?espace=rx.");
  console.log(`• Event cible : ${event.name} (${event.slug})`);

  let created = 0;
  let updated = 0;
  for (const ex of EXHIBITORS) {
    const existing = await prisma.exhibitor.findFirst({
      where: { eventId: event.id, name: ex.name, stand: ex.stand },
      select: { id: true },
    });
    if (existing) {
      await prisma.exhibitor.update({
        where: { id: existing.id },
        data: { sector: ex.sector, zone: ex.zone, isActive: true },
      });
      updated++;
    } else {
      await prisma.exhibitor.create({
        data: {
          organizationId: rx.id,
          eventId: event.id,
          name: ex.name,
          stand: ex.stand,
          sector: ex.sector,
          zone: ex.zone,
          isActive: true,
        },
      });
      created++;
    }
  }
  console.log(`✓ Exposants : ${created} créés, ${updated} mis à jour (total ${EXHIBITORS.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
