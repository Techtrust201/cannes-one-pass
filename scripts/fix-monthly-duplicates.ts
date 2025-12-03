#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Fonction pour tester l'API carbon et détecter les doublons
async function testCarbonAPI() {
  console.log("🔍 === TEST API CARBON - DÉTECTION DOUBLONS ===\n");

  try {
    const response = await fetch(
      "http://localhost:3000/api/carbon?start=01/01/2025&end=31/12/2025"
    );
    const result = await response.json();

    if (!result.success) {
      console.error("❌ Erreur API:", result.error);
      return;
    }

    const { data } = result;
    console.log(`📊 Total véhicules: ${data.total}`);
    console.log(`📊 Données détaillées: ${data.detailed.length}`);
    console.log(`📊 Données mensuelles: ${data.monthly.length}\n`);

    // Analyser les doublons dans les données mensuelles
    console.log("🔍 Analyse des données mensuelles:");
    const monthKeys = new Set();
    const duplicateMonths: string[] = [];

    data.monthly.forEach((month: any, index: number) => {
      const key = month.month;
      if (monthKeys.has(key)) {
        duplicateMonths.push(`${key} (index ${index})`);
        console.log(`❌ DOUBLON détecté: "${key}" à l'index ${index}`);
      } else {
        monthKeys.add(key);
        console.log(
          `✅ Mois unique: "${key}" (${month.nbVehicules} véhicules)`
        );
      }
    });

    if (duplicateMonths.length > 0) {
      console.log(`\n🚨 ${duplicateMonths.length} doublons détectés:`);
      duplicateMonths.forEach((dup) => console.log(`   - ${dup}`));
    } else {
      console.log("\n✅ Aucun doublon détecté dans les mois");
    }

    // Analyser la structure des données mensuelles
    console.log("\n📈 Structure des mois avec véhicules:");
    data.monthly
      .filter((m: any) => m.nbVehicules > 0)
      .forEach((month: any) => {
        console.log(`📅 ${month.month}:`);
        console.log(`   🚗 ${month.nbVehicules} véhicules`);
        console.log(
          `   📊 Types: <10m3=${month.typeBreakdown["<10m3"]}, 10-15m3=${month.typeBreakdown["10-15m3"]}, 15-20m3=${month.typeBreakdown["15-20m3"]}, >20m3=${month.typeBreakdown[">20m3"]}`
        );
      });
  } catch (error) {
    console.error("❌ Erreur test API:", error);
  }
}

// Fonction pour nettoyer les données de test si nécessaire
async function cleanDuplicateVehicles() {
  console.log("\n🧹 === NETTOYAGE DES DOUBLONS VÉHICULES ===\n");

  // Chercher les véhicules avec la même plaque
  const duplicatePlates = await prisma.vehicle.groupBy({
    by: ["plate"],
    having: {
      plate: {
        _count: {
          gt: 1,
        },
      },
    },
    _count: {
      plate: true,
    },
  });

  if (duplicatePlates.length > 0) {
    console.log(`🚨 ${duplicatePlates.length} plaques dupliquées détectées:`);

    for (const duplicate of duplicatePlates) {
      const vehicles = await prisma.vehicle.findMany({
        where: { plate: duplicate.plate },
        include: {
          accreditation: {
            select: {
              company: true,
              event: true,
              status: true,
            },
          },
        },
      });

      console.log(
        `\n🚗 Plaque "${duplicate.plate}" (${vehicles.length} occurrences):`
      );
      vehicles.forEach((v, i) => {
        console.log(
          `   ${i + 1}. ${v.accreditation.company} - ${v.accreditation.event} (${v.accreditation.status})`
        );
        console.log(
          `      Date: ${v.date}, Ville: ${v.city || "Non renseignée"}`
        );
      });

      // Garder seulement le premier véhicule (le plus ancien ID)
      const vehiclesToDelete = vehicles.slice(1);
      if (vehiclesToDelete.length > 0) {
        console.log(
          `   🗑️  Suppression de ${vehiclesToDelete.length} doublons...`
        );
        for (const vehicle of vehiclesToDelete) {
          await prisma.vehicle.delete({
            where: { id: vehicle.id },
          });
        }
      }
    }
  } else {
    console.log("✅ Aucun doublon de plaque détecté");
  }
}

async function main() {
  try {
    await testCarbonAPI();
    await cleanDuplicateVehicles();

    console.log("\n🔄 Retestez l'API après nettoyage...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await testCarbonAPI();
  } catch (error) {
    console.error("❌ Erreur:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();







