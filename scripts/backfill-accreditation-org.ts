/**
 * Backfill idempotent : remplit `Accreditation.organizationId` à partir
 * de `Event.organizationId` pour toutes les accréditations existantes.
 *
 * À exécuter une seule fois après application de la migration
 * `20260528120000_multi_org_extensions`. Le script est sûr à relancer.
 *
 * Usage : npx tsx scripts/backfill-accreditation-org.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const total = await prisma.accreditation.count();
  const before = await prisma.accreditation.count({
    where: { organizationId: null },
  });

  console.log(`[backfill] ${before}/${total} accréditations sans organizationId`);

  const result = await prisma.$executeRawUnsafe(`
    UPDATE "Accreditation" AS a
    SET "organizationId" = e."organizationId"
    FROM "Event" AS e
    WHERE a."eventId" = e."id"
      AND a."organizationId" IS NULL
      AND e."organizationId" IS NOT NULL
  `);

  const after = await prisma.accreditation.count({
    where: { organizationId: null },
  });

  console.log(`[backfill] ${result} lignes mises à jour`);
  console.log(`[backfill] ${after}/${total} accréditations sans organizationId restantes`);

  // Statistiques par organisation
  const stats = await prisma.accreditation.groupBy({
    by: ["organizationId"],
    _count: { _all: true },
  });
  console.log("[backfill] répartition par organizationId :");
  for (const s of stats) {
    const orgName = s.organizationId
      ? (await prisma.organization.findUnique({ where: { id: s.organizationId } }))?.name
      : "(null)";
    console.log(`  ${orgName ?? s.organizationId} : ${s._count._all}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
