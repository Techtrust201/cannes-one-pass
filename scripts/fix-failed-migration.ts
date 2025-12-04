#!/usr/bin/env tsx

/**
 * Script pour résoudre la migration failed dans Prisma
 * 
 * Ce script vérifie l'état de la base de données et marque la migration
 * comme résolue si les changements ont déjà été appliqués.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function checkDatabaseState() {
  console.log("🔍 Vérification de l'état de la base de données...\n");

  // Vérifier si les types existent
  const vehicleTypeExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_type WHERE typname = 'VehicleType'
    ) as exists;
  `;

  const countryRegionExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_type WHERE typname = 'CountryRegion'
    ) as exists;
  `;

  console.log(`✅ Type VehicleType existe: ${vehicleTypeExists[0]?.exists || false}`);
  console.log(`✅ Type CountryRegion existe: ${countryRegionExists[0]?.exists || false}`);

  // Vérifier si les colonnes existent
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'Vehicle' 
    AND column_name IN ('vehicleType', 'country', 'estimatedKms', 'arrivalDate', 'departureDate')
    ORDER BY column_name;
  `;

  console.log(`\n📊 Colonnes trouvées dans Vehicle:`);
  columns.forEach(col => {
    console.log(`   - ${col.column_name}`);
  });

  const expectedColumns = ['vehicleType', 'country', 'estimatedKms', 'arrivalDate', 'departureDate'];
  const foundColumns = columns.map(c => c.column_name);
  const missingColumns = expectedColumns.filter(col => !foundColumns.includes(col));

  if (missingColumns.length > 0) {
    console.log(`\n⚠️  Colonnes manquantes: ${missingColumns.join(', ')}`);
    return { needsMigration: true, partial: true };
  }

  if (vehicleTypeExists[0]?.exists && countryRegionExists[0]?.exists && foundColumns.length === 5) {
    console.log(`\n✅ Tous les changements de la migration sont déjà appliqués !`);
    return { needsMigration: false, partial: false };
  }

  return { needsMigration: true, partial: false };
}

async function resolveMigration() {
  console.log("\n🔧 Résolution de la migration failed...\n");

  try {
    // Marquer la migration comme rolled back pour pouvoir la réappliquer
    await prisma.$executeRaw`
      UPDATE "_prisma_migrations" 
      SET finished_at = NULL, 
          rolled_back_at = NOW()
      WHERE migration_name = '20250115000000_improve_carbon_tracking'
      AND finished_at IS NULL;
    `;

    console.log("✅ Migration marquée comme rolled back");
    console.log("\n💡 Vous pouvez maintenant réappliquer la migration avec:");
    console.log("   npx prisma migrate deploy");
    
  } catch (error) {
    console.error("❌ Erreur lors de la résolution:", error);
    throw error;
  }
}

async function main() {
  try {
    const state = await checkDatabaseState();

    if (!state.needsMigration) {
      console.log("\n✅ La migration peut être marquée comme appliquée manuellement.");
      console.log("   Utilisez: npx prisma migrate resolve --applied 20250115000000_improve_carbon_tracking");
      return;
    }

    if (state.partial) {
      console.log("\n⚠️  Migration partiellement appliquée.");
      console.log("   Il faut compléter manuellement ou rollback puis réappliquer.");
    } else {
      await resolveMigration();
    }

  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


