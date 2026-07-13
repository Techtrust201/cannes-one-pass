/**
 * Outil de purge d'une organisation — Phase 7.
 *
 * Usage (DRY-RUN, comportement par défaut — LECTURE SEULE, aucune écriture) :
 *   npx tsx scripts/purge-organization.ts --org-id=<uuid> --org-slug=rx
 *
 * Usage (SUPPRESSION RÉELLE — nécessite TOUTES les protections) :
 *   ALLOW_ORGANIZATION_PURGE=YES npx tsx scripts/purge-organization.ts \
 *     --org-id=<uuid> --org-slug=rx --confirm-slug=rx \
 *     --execute --backup-confirmed
 *
 * ⚠️  Ce script ne supprime QUE les données métier de l'organisation ciblée
 *     (accréditations, exposants/emplacements, stands, capacités RX,
 *     planning logistique, lots d'import, tickets de support).
 *     Il NE TOUCHE JAMAIS à Organization, Event, User, aux permissions, aux
 *     liens utilisateur/organisation, ni à ZoneConfig/VehicleTypeConfig/
 *     UnloadingProvider.
 *
 * ⚠️  Le slug "palais" est refusé de manière absolue, quels que soient les
 *     arguments fournis. Seul le slug exact "rx" est autorisé.
 *
 * Toute la logique de garde/calcul vit dans `src/lib/purge-organization.ts`
 * (testée unitairement). Ce fichier ne fait que l'orchestration I/O.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import {
  parseArgs,
  validatePurgeGuards,
  computePurgeCounts,
  executeOrganizationPurge,
  formatPurgeCountsReport,
  type PurgeDb,
} from "../src/lib/purge-organization";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL non définie. Vérifiez votre .env.local");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter }) as any;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("🧹 === PURGE D'ORGANISATION (Phase 7) ===\n");

  if (!args.orgId) {
    console.error("❌ --org-id=<uuid> est obligatoire (même pour le dry-run).");
    console.error("   Usage : npx tsx scripts/purge-organization.ts --org-id=<uuid> --org-slug=rx");
    process.exit(1);
  }

  const organization = await prisma.organization.findUnique({
    where: { id: args.orgId },
    select: { id: true, slug: true, name: true },
  });

  if (!organization) {
    console.error(`❌ Organisation introuvable pour l'UUID fourni.`);
    process.exit(1);
  }

  console.log(`📌 Organisation résolue : slug="${organization.slug}" (id=${organization.id})\n`);

  const counts = await computePurgeCounts(prisma as PurgeDb, organization.id);
  console.log("📊 Compteurs (portée de la purge, lecture seule) :");
  for (const line of formatPurgeCountsReport(counts)) {
    console.log(`   • ${line}`);
  }

  if (!args.execute) {
    console.log("\n🟡 Mode DRY-RUN (par défaut) — aucune suppression effectuée.");
    console.log(
      "   Pour exécuter réellement, relire les protections requises en tête de ce fichier."
    );
    await prisma.$disconnect();
    return;
  }

  const envAllowed = process.env.ALLOW_ORGANIZATION_PURGE === "YES";
  const guard = validatePurgeGuards({
    args,
    envAllowed,
    organization: { id: organization.id, slug: organization.slug },
  });

  if (!guard.ok) {
    console.error(`\n❌ Suppression refusée [${guard.code}] : ${guard.reason}`);
    console.error("   Aucune transaction n'a été ouverte. Aucune donnée n'a été modifiée.");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("\n🔴 SUPPRESSION RÉELLE — ouverture d'une transaction unique...");
  const deleted = await prisma.$transaction(async (tx: PurgeDb) => {
    return executeOrganizationPurge(tx, organization.id);
  });

  console.log("✅ Purge terminée. Lignes supprimées :");
  for (const line of formatPurgeCountsReport(deleted)) {
    console.log(`   • ${line}`);
  }

  const postCounts = await computePurgeCounts(prisma as PurgeDb, organization.id);
  const stillPresent = Object.values(postCounts).some((n) => n > 0);
  if (stillPresent) {
    console.error("⚠️  Attention : des lignes subsistent après la purge, vérifier manuellement.");
  } else {
    console.log("🟢 Vérification post-purge : compteurs tous à zéro pour cette organisation.");
  }
}

main()
  .catch((error) => {
    console.error("❌ Erreur:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
