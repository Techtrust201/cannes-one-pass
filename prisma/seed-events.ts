import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const EVENTS = [
  {
    name: "WAICF",
    slug: "waicf",
    logo: "/accreditation/pict_page1/palais-des-festivals.png",
    color: "#3498DB",
    startDate: new Date("2026-02-12"),
    endDate: new Date("2026-02-14"),
    setupStartDate: new Date("2026-02-09"),
    setupEndDate: new Date("2026-02-11"),
    teardownStartDate: new Date("2026-02-15"),
    teardownEndDate: new Date("2026-02-16"),
    activationDays: 14,
  },
  {
    name: "Festival du Film",
    slug: "festival",
    logo: "/accreditation/pict_page1/festival.png",
    color: "#E74C3C",
    startDate: new Date("2026-05-13"),
    endDate: new Date("2026-05-24"),
    setupStartDate: new Date("2026-05-05"),
    setupEndDate: new Date("2026-05-12"),
    teardownStartDate: new Date("2026-05-25"),
    teardownEndDate: new Date("2026-05-28"),
    activationDays: 14,
  },
  {
    name: "MIPTV",
    slug: "miptv",
    logo: "/accreditation/pict_page1/miptv.jpg",
    color: "#2ECC71",
    startDate: new Date("2026-04-13"),
    endDate: new Date("2026-04-16"),
    setupStartDate: new Date("2026-04-10"),
    setupEndDate: new Date("2026-04-12"),
    teardownStartDate: new Date("2026-04-17"),
    teardownEndDate: new Date("2026-04-18"),
    activationDays: 7,
  },
  {
    name: "MIPCOM",
    slug: "mipcom",
    logo: "/accreditation/pict_page1/mipcom.jpg",
    color: "#F39C12",
    startDate: new Date("2026-10-19"),
    endDate: new Date("2026-10-22"),
    setupStartDate: new Date("2026-10-16"),
    setupEndDate: new Date("2026-10-18"),
    teardownStartDate: new Date("2026-10-23"),
    teardownEndDate: new Date("2026-10-24"),
    activationDays: 7,
  },
  {
    name: "Plages Électroniques",
    slug: "plages-electro",
    logo: "/accreditation/pict_page1/plages-electro.png",
    color: "#9B59B6",
    startDate: new Date("2026-08-07"),
    endDate: new Date("2026-08-09"),
    setupStartDate: new Date("2026-08-05"),
    setupEndDate: new Date("2026-08-06"),
    teardownStartDate: new Date("2026-08-10"),
    teardownEndDate: new Date("2026-08-10"),
    activationDays: 7,
  },
  {
    name: "Palais des Festivals",
    slug: "palais-des-festivals",
    logo: "/accreditation/pict_page1/palais-des-festivals.png",
    color: "#3DAAA4",
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: new Date("2026-12-31T23:59:59Z"),
    activationDays: 30,
  },
];

async function main() {
  console.log("Seeding events...");

  for (const evt of EVENTS) {
    const existing = await prisma.event.findUnique({
      where: { slug: evt.slug },
    });

    if (existing) {
      console.log(`  → ${evt.name} already exists, skipping.`);
      continue;
    }

    await prisma.event.create({ data: evt });
    console.log(`  ✓ ${evt.name} created.`);
  }

  const events = await prisma.event.findMany();
  for (const evt of events) {
    const count = await prisma.accreditation.updateMany({
      where: { event: evt.slug, eventId: null },
      data: { eventId: evt.id },
    });
    if (count.count > 0) {
      console.log(`  → Linked ${count.count} accreditations to ${evt.name}`);
    }
  }

  const legacyMapping: Record<string, string> = {
    "plages électro": "plages-electro",
    "palais des festivals": "palais-des-festivals",
  };

  for (const [oldKey, newSlug] of Object.entries(legacyMapping)) {
    const evt = events.find((e) => e.slug === newSlug);
    if (!evt) continue;
    const count = await prisma.accreditation.updateMany({
      where: { event: oldKey, eventId: null },
      data: { eventId: evt.id, event: newSlug },
    });
    if (count.count > 0) {
      console.log(
        `  → Migrated ${count.count} accreditations from "${oldKey}" to "${newSlug}"`
      );
    }
  }

  console.log("Done!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
