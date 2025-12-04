#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Fonction pour calculer la distance routière avec la nouvelle logique
async function calculateDistanceForCity(city: string): Promise<number> {
  try {
    console.log(`🔍 Calcul distance pour: "${city}"`);

    // CAS SPÉCIAL : Cannes
    const cityLower = city.toLowerCase();
    if (cityLower.includes("cannes")) {
      console.log(`  ✅ Cannes détecté → 0km`);
      return 0;
    }

    // CAS SPÉCIAL : Nice et région
    if (cityLower.includes("nice")) {
      console.log(`  ✅ Nice détecté → 34km`);
      return 34;
    }

    // CAS SPÉCIAL : Grasse et environs
    if (
      cityLower.includes("grasse") ||
      cityLower.includes("vidauban") ||
      cityLower.includes("draguignan")
    ) {
      console.log(`  ✅ Région PACA détecté → 80km`);
      return 80;
    }

    // CAS SPÉCIAL : Paris
    if (cityLower.includes("paris") || cityLower.includes("île-de-france")) {
      console.log(`  ✅ Paris détecté → 937km`);
      return 937;
    }

    // CAS SPÉCIAL : Pologne (Pieńki)
    if (
      cityLower.includes("pienki") ||
      cityLower.includes("barglów") ||
      cityLower.includes("koscielny")
    ) {
      console.log(`  ✅ Pologne détecté → 1847km`);
      return 1847; // Distance réelle calculée
    }

    // Pour les autres villes, essayer l'API distance
    const response = await fetch(
      `http://localhost:3000/api/distance?city=${encodeURIComponent(city)}`
    );
    if (response.ok) {
      const data = await response.json();
      console.log(`  ✅ API distance → ${data.distance}km`);
      return data.distance;
    }

    // Fallback avec une distance plus réaliste selon les indices
    let fallbackDistance = 500;
    if (cityLower.includes("espagne") || cityLower.includes("spain"))
      fallbackDistance = 800;
    if (cityLower.includes("italie") || cityLower.includes("italy"))
      fallbackDistance = 600;
    if (cityLower.includes("allemagne") || cityLower.includes("germany"))
      fallbackDistance = 1100;
    if (cityLower.includes("pologne") || cityLower.includes("poland"))
      fallbackDistance = 1800;

    console.log(`  ⚠️  Fallback → ${fallbackDistance}km`);
    return fallbackDistance;
  } catch (error) {
    console.error(`  ❌ Erreur pour "${city}":`, error);
    return 500; // Fallback sécurisé
  }
}

async function recalculateAllDistances() {
  console.log("🚀 === RECALCUL DES DISTANCES POUR TOUS LES VÉHICULES ===\n");

  // Récupérer tous les véhicules avec accréditations ENTREE/SORTIE
  const vehicles = await prisma.vehicle.findMany({
    where: {
      accreditation: {
        status: {
          in: ["ENTREE", "SORTIE"],
        },
      },
    },
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

  console.log(`📊 Trouvé ${vehicles.length} véhicules à traiter\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [index, vehicle] of vehicles.entries()) {
    console.log(
      `\n🚗 [${index + 1}/${vehicles.length}] ${vehicle.plate} (${vehicle.accreditation.company})`
    );
    console.log(`   📍 Ville: "${vehicle.city || "Non renseignée"}"`);
    console.log(
      `   🎯 EstimatedKms actuel: ${(vehicle as any).estimatedKms || "Non défini"}`
    );

    // Si pas de ville, skip
    if (!vehicle.city) {
      console.log(`   ⏭️  Aucune ville → skip`);
      skipped++;
      continue;
    }

    // Si déjà calculé et cohérent, skip (sauf si incohérent)
    const currentEstimated = (vehicle as any).estimatedKms;
    if (currentEstimated && currentEstimated > 0) {
      // Vérifier la cohérence
      const cityLower = vehicle.city.toLowerCase();
      const isInconsistent =
        (cityLower.includes("cannes") && currentEstimated > 50) ||
        (cityLower.includes("pienki") && currentEstimated < 1000);

      if (!isInconsistent) {
        console.log(`   ✅ Déjà calculé et cohérent → skip`);
        skipped++;
        continue;
      } else {
        console.log(`   🚨 Incohérent → recalcul nécessaire`);
      }
    }

    try {
      // Calculer la nouvelle distance
      const newDistance = await calculateDistanceForCity(vehicle.city);

      // Mettre à jour en base
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { estimatedKms: newDistance },
      });

      console.log(`   ✅ Mis à jour: ${newDistance}km`);
      updated++;

      // Petite pause pour ne pas surcharger l'API
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`   ❌ Erreur mise à jour:`, error);
      errors++;
    }
  }

  console.log(`\n🎯 === RÉSUMÉ ===`);
  console.log(`✅ Mis à jour: ${updated} véhicules`);
  console.log(`⏭️  Ignorés: ${skipped} véhicules`);
  console.log(`❌ Erreurs: ${errors} véhicules`);
  console.log(`📊 Total traité: ${vehicles.length} véhicules`);

  if (updated > 0) {
    console.log(`\n🔄 Redémarrez le serveur pour voir les nouveaux calculs !`);
  }
}

async function main() {
  try {
    await recalculateAllDistances();
  } catch (error) {
    console.error("❌ Erreur globale:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();







