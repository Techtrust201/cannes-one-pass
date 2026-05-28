/**
 * Backfill idempotent des affectations utilisateur → Espace par défaut.
 *
 * Règles :
 *   1. Tout user actif sans aucune `UserOrganization` est rattaché à Palais.
 *   2. Cas spécial Alicia (`alicia.gomez-ext@rxglobal.com`) :
 *      - assurée membre de RX
 *      - **détachée** de Palais si elle y était.
 *   3. Les users déjà rattachés (à au moins une org) ne sont pas touchés —
 *      les rattachements manuels précédents (super-admin, multi-org, etc.)
 *      sont préservés.
 *
 * Le script est sûr à relancer (idempotent) : il ne crée ni ne supprime
 * rien d'inutile à chaque exécution.
 *
 * Usage : npm run db:seed:default-espaces
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

const PALAIS_SLUG = "palais-des-festivals";
const RX_SLUG = "rx";
const ALICIA_EMAIL = "alicia.gomez-ext@rxglobal.com";

async function main() {
  const palais = await prisma.organization.findUnique({
    where: { slug: PALAIS_SLUG },
    select: { id: true, name: true },
  });
  const rx = await prisma.organization.findUnique({
    where: { slug: RX_SLUG },
    select: { id: true, name: true },
  });

  if (!palais) {
    throw new Error(
      `Organisation introuvable : slug "${PALAIS_SLUG}". Vérifie le seed des Espaces.`
    );
  }
  if (!rx) {
    throw new Error(
      `Organisation introuvable : slug "${RX_SLUG}". Crée-la dans /admin/espaces avant de relancer.`
    );
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      email: true,
      organizations: { select: { organizationId: true } },
    },
  });

  let attachedToPalais = 0;
  let aliciaCreated = 0;
  let aliciaDetachedFromPalais = 0;
  let untouched = 0;
  let aliciaMissing = true;

  for (const u of users) {
    const isAlicia = u.email.toLowerCase() === ALICIA_EMAIL.toLowerCase();
    const hasPalais = u.organizations.some((o) => o.organizationId === palais.id);
    const hasRx = u.organizations.some((o) => o.organizationId === rx.id);

    if (isAlicia) {
      aliciaMissing = false;
      if (!hasRx) {
        await prisma.userOrganization.create({
          data: { userId: u.id, organizationId: rx.id },
        });
        aliciaCreated++;
      }
      if (hasPalais) {
        await prisma.userOrganization.delete({
          where: {
            userId_organizationId: { userId: u.id, organizationId: palais.id },
          },
        });
        aliciaDetachedFromPalais++;
      }
      continue;
    }

    if (u.organizations.length === 0) {
      await prisma.userOrganization.create({
        data: { userId: u.id, organizationId: palais.id },
      });
      attachedToPalais++;
    } else {
      untouched++;
    }
  }

  console.log("─── Seed espaces par défaut ──────────────────────────────");
  console.log(`Users actifs scannés          : ${users.length}`);
  console.log(`→ rattachés à ${palais.name} : ${attachedToPalais}`);
  console.log(`→ déjà rattachés (ignorés)   : ${untouched}`);
  console.log(`Alicia (${ALICIA_EMAIL}) :`);
  if (aliciaMissing) {
    console.log("  ⚠ user inexistant en base — sera traité automatiquement");
    console.log("    à la prochaine exécution si le compte est créé.");
  } else {
    console.log(`  → rattachée à ${rx.name}            : ${aliciaCreated === 1 ? "créé" : "déjà OK"}`);
    console.log(`  → détachée de ${palais.name} : ${aliciaDetachedFromPalais === 1 ? "fait" : "déjà OK"}`);
  }
  console.log("──────────────────────────────────────────────────────────");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
