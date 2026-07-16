import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertE2eDatabaseSafe } from "./guards";

let prisma: PrismaClient | null = null;

export function getE2ePrisma(): PrismaClient {
  assertE2eDatabaseSafe();
  if (!prisma) {
    const connectionString = process.env.E2E_DATABASE_URL!;
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

/** Supprime uniquement les données portant le préfixe runId (E2E-…). */
export async function cleanupE2eRun(runId: string): Promise<void> {
  const db = getE2ePrisma();
  const marker = runId;

  await db.accreditation.deleteMany({
    where: {
      OR: [
        { company: { contains: marker } },
        { stand: { contains: marker } },
        { message: { contains: marker } },
        { unloading: { contains: marker } },
      ],
    },
  });

  await db.exhibitor.deleteMany({
    where: { name: { contains: marker } },
  });

  await db.exhibitorLocation.deleteMany({
    where: {
      OR: [{ code: { contains: marker } }, { codeNormalized: { contains: marker } }],
    },
  });
}

export async function disconnectE2ePrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
