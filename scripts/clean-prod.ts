/**
 * Script de nettoyage complet de la base de production.
 *
 * Usage: npx tsx scripts/clean-prod.ts
 *
 * Ce script :
 * 1. Supprime toutes les accréditations et données liées
 * 2. Supprime toutes les sessions Better Auth
 * 3. Supprime tous les comptes (account) et utilisateurs
 * 4. Supprime toutes les permissions
 * 5. Supprime les verifications Better Auth
 *
 * ⚠️  ATTENTION : Ce script VIDE ENTIÈREMENT la base.
 *     Relancez le seed après pour recréer les comptes.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

// Charger les variables d'environnement
dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL non définie. Vérifiez votre .env.local");
  process.exit(1);
}

console.log("🔗 Connexion à la base de données...");
console.log(`   URL: ${connectionString.replace(/:[^:@]+@/, ":***@")}\n`);

const adapter = new PrismaPg({ connectionString });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter }) as any;

async function main() {
  console.log("🧹 === NETTOYAGE COMPLET DE LA BASE ===\n");

  // 1. Supprimer les données métier (ordre important à cause des FK)
  console.log("📦 Suppression des données métier...");

  const deletedZoneMovements = await prisma.zoneMovement.deleteMany({});
  console.log(`   ✅ ZoneMovements supprimés: ${deletedZoneMovements.count}`);

  const deletedEmailHistory = await prisma.accreditationEmailHistory.deleteMany({});
  console.log(`   ✅ AccreditationEmailHistory supprimés: ${deletedEmailHistory.count}`);

  const deletedHistory = await prisma.accreditationHistory.deleteMany({});
  console.log(`   ✅ AccreditationHistory supprimés: ${deletedHistory.count}`);

  const deletedVehicles = await prisma.vehicle.deleteMany({});
  console.log(`   ✅ Vehicles supprimés: ${deletedVehicles.count}`);

  const deletedAccreditations = await prisma.accreditation.deleteMany({});
  console.log(`   ✅ Accreditations supprimées: ${deletedAccreditations.count}`);

  // 2. Supprimer les données Better Auth
  console.log("\n🔐 Suppression des données d'authentification...");

  const deletedSessions = await prisma.session.deleteMany({});
  console.log(`   ✅ Sessions supprimées: ${deletedSessions.count}`);

  const deletedVerifications = await prisma.verification.deleteMany({});
  console.log(`   ✅ Verifications supprimées: ${deletedVerifications.count}`);

  const deletedAccounts = await prisma.account.deleteMany({});
  console.log(`   ✅ Accounts supprimés: ${deletedAccounts.count}`);

  // 3. Supprimer les permissions et utilisateurs
  console.log("\n👤 Suppression des utilisateurs et permissions...");

  const deletedPermissions = await prisma.userPermission.deleteMany({});
  console.log(`   ✅ UserPermissions supprimées: ${deletedPermissions.count}`);

  const deletedUsers = await prisma.user.deleteMany({});
  console.log(`   ✅ Users supprimés: ${deletedUsers.count}`);

  console.log("\n✨ Nettoyage terminé ! La base est vide.");
  console.log("👉 Exécutez maintenant : npx tsx scripts/seed-users.ts");
}

main()
  .catch((error) => {
    console.error("❌ Erreur:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
