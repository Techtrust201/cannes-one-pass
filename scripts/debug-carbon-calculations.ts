#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function debugCarbonCalculations() {
  console.log("🔍 === DIAGNOSTIC DES CALCULS CARBONE ===\n");

  // Récupérer les accréditations avec statut ENTREE/SORTIE
  const accreditations = await prisma.accreditation.findMany({
    where: {
      status: {
        in: ["ENTREE", "SORTIE"],
      },
    },
    include: {
      vehicles: true,
    },
    orderBy: {
      company: "asc",
    },
  });

  console.log(
    `📊 Trouvé ${accreditations.length} accréditations avec statut ENTREE/SORTIE\n`
  );

  // Analyser chaque véhicule individuellement
  let totalVehicles = 0;
  const analysisResults: Array<{
    company: string;
    event: string;
    plate: string;
    city: string;
    kms?: string;
    estimatedKms?: number;
    calculatedDistance: number;
    distanceSource: string;
    vehicleType: string;
    emissions: number;
    issues: string[];
  }> = [];

  for (const acc of accreditations) {
    console.log(`🏢 === ${acc.company} - ${acc.event} (${acc.status}) ===`);
    console.log(`   📍 Stand: ${acc.stand || "Non renseigné"}`);
    console.log(`   🚗 Véhicules: ${acc.vehicles.length}`);

    for (const vehicle of acc.vehicles) {
      totalVehicles++;
      const issues: string[] = [];

      console.log(`\n   🚗 Véhicule #${totalVehicles}: ${vehicle.plate}`);
      console.log(`      📍 Ville: "${vehicle.city || "Non renseignée"}"`);
      console.log(`      📏 Kms saisis: "${vehicle.kms || "Non renseigné"}"`);
      console.log(
        `      🎯 EstimatedKms: ${(vehicle as any).estimatedKms || "Non défini"}`
      );
      console.log(`      📅 Date: ${vehicle.date}`);
      console.log(`      📦 Size: ${vehicle.size || "Non renseigné"}`);
      console.log(
        `      🚛 VehicleType: ${(vehicle as any).vehicleType || "Non défini"}`
      );

      // 1. ANALYSE DE LA DISTANCE
      let calculatedDistance = 0;
      let distanceSource = "inconnue";

      // Priorité 1: estimatedKms
      if ((vehicle as any).estimatedKms && (vehicle as any).estimatedKms > 0) {
        calculatedDistance = (vehicle as any).estimatedKms;
        distanceSource = "estimatedKms (calculé automatiquement)";
      }
      // Priorité 2: kms (parsé)
      else if (vehicle.kms) {
        const parsed = parseInt(vehicle.kms.replace(/[^\d]/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          calculatedDistance = parsed;
          distanceSource = "kms (saisi manuellement)";
        } else {
          issues.push(`Kms "${vehicle.kms}" non parsable`);
        }
      }
      // Priorité 3: Calcul depuis la ville
      else if (vehicle.city) {
        // Logique de calcul simplifié pour le diagnostic
        const city = vehicle.city.toLowerCase();
        if (city.includes("cannes")) {
          calculatedDistance = 0;
          distanceSource = "Ville = Cannes → 0km";
        } else if (city.includes("nice")) {
          calculatedDistance = 34;
          distanceSource = "Ville = Nice → 34km";
        } else if (city.includes("pienki") || city.includes("barglów")) {
          calculatedDistance = 1800; // Pologne, très loin
          distanceSource = "Ville = Pologne → ~1800km";
        } else {
          calculatedDistance = 500; // Défaut
          distanceSource = "Ville inconnue → 500km par défaut";
        }
        issues.push("Distance calculée depuis ville (peut être imprécise)");
      } else {
        calculatedDistance = 0;
        distanceSource = "Aucune donnée de distance";
        issues.push("Aucune donnée de distance disponible");
      }

      // 2. ANALYSE DU TYPE DE VÉHICULE
      let vehicleType = "10-15m3"; // Défaut
      if ((vehicle as any).vehicleType) {
        // Mapping depuis nouveau champ
        const mapping: { [key: string]: string } = {
          PETIT: "<10m3",
          MOYEN: "10-15m3",
          GRAND: "15-20m3",
          TRES_GRAND: ">20m3",
        };
        vehicleType = mapping[(vehicle as any).vehicleType] || "10-15m3";
        distanceSource += " + vehicleType";
      } else if (vehicle.size) {
        vehicleType = vehicle.size;
        issues.push("Type déduit du champ 'size' legacy");
      } else {
        issues.push("Type par défaut (10-15m3)");
      }

      // 3. CALCUL DES ÉMISSIONS
      const co2Coefficients = {
        "<10m3": 0.185,
        "10-15m3": 0.265,
        "15-20m3": 0.385,
        ">20m3": 0.485,
      };
      const emissions = Math.round(
        calculatedDistance *
          co2Coefficients[vehicleType as keyof typeof co2Coefficients]
      );

      console.log(
        `      ✅ Distance calculée: ${calculatedDistance}km (${distanceSource})`
      );
      console.log(`      🚛 Type final: ${vehicleType}`);
      console.log(`      💨 Émissions: ${emissions}kg CO2`);

      if (issues.length > 0) {
        console.log(`      ⚠️  Problèmes: ${issues.join(", ")}`);
      }

      // DÉTECTION D'INCOHÉRENCES FLAGRANTES
      if (
        vehicle.city?.toLowerCase().includes("cannes") &&
        calculatedDistance > 50
      ) {
        issues.push(`🚨 INCOHÉRENCE: Cannes avec ${calculatedDistance}km !`);
      }
      if (
        vehicle.city?.toLowerCase().includes("pienki") &&
        calculatedDistance < 1000
      ) {
        issues.push(
          `🚨 INCOHÉRENCE: Pologne avec seulement ${calculatedDistance}km !`
        );
      }

      analysisResults.push({
        company: acc.company,
        event: acc.event,
        plate: vehicle.plate,
        city: vehicle.city || "Non renseignée",
        kms: vehicle.kms || undefined,
        estimatedKms: (vehicle as { estimatedKms?: number }).estimatedKms,
        calculatedDistance,
        distanceSource,
        vehicleType,
        emissions,
        issues,
      });
    }
    console.log("");
  }

  // RÉSUMÉ DES INCOHÉRENCES
  console.log("\n🚨 === INCOHÉRENCES DÉTECTÉES ===");
  const problematicVehicles = analysisResults.filter((v) =>
    v.issues.some((issue) => issue.includes("INCOHÉRENCE"))
  );

  if (problematicVehicles.length > 0) {
    console.log(
      `⚠️  ${problematicVehicles.length} véhicules avec des incohérences flagrantes :\n`
    );
    problematicVehicles.forEach((vehicle, i) => {
      console.log(`${i + 1}. ${vehicle.plate} (${vehicle.company})`);
      console.log(`   📍 Ville: "${vehicle.city}"`);
      console.log(`   📏 Distance: ${vehicle.calculatedDistance}km`);
      console.log(
        `   🚨 Problèmes: ${vehicle.issues.filter((i) => i.includes("INCOHÉRENCE")).join(", ")}`
      );
      console.log("");
    });
  } else {
    console.log("✅ Aucune incohérence majeure détectée");
  }

  // STATISTIQUES PAR VILLE
  console.log("\n📊 === STATISTIQUES PAR VILLE ===");
  const cityStats = analysisResults.reduce(
    (acc, vehicle) => {
      const city = vehicle.city;
      if (!acc[city]) {
        acc[city] = { count: 0, totalDistance: 0, totalEmissions: 0 };
      }
      acc[city].count++;
      acc[city].totalDistance += vehicle.calculatedDistance;
      acc[city].totalEmissions += vehicle.emissions;
      return acc;
    },
    {} as {
      [city: string]: {
        count: number;
        totalDistance: number;
        totalEmissions: number;
      };
    }
  );

  Object.entries(cityStats)
    .sort((a, b) => b[1].totalEmissions - a[1].totalEmissions)
    .forEach(([city, stats]) => {
      const avgDistance = Math.round(stats.totalDistance / stats.count);
      console.log(`📍 ${city}:`);
      console.log(`   🚗 ${stats.count} véhicules`);
      console.log(
        `   📏 ${stats.totalDistance}km total (${avgDistance}km/véhicule)`
      );
      console.log(`   💨 ${stats.totalEmissions}kg CO2 total`);
      console.log("");
    });

  // RECOMMANDATIONS
  console.log("\n💡 === RECOMMANDATIONS ===");
  console.log("1. ✅ Mettre à jour les coefficients CO2 (fait)");
  console.log("2. ✅ Améliorer l'API de distance (en cours)");
  console.log("3. 🔄 Recalculer les estimatedKms pour tous les véhicules");
  console.log("4. 🔄 Vérifier et corriger les données incohérentes");
  console.log("5. 📝 Améliorer la saisie dans le formulaire d'accréditation");
}

async function main() {
  try {
    await debugCarbonCalculations();
  } catch (error) {
    console.error("❌ Erreur:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();







