import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🔄 MISE À JOUR POUR TEST BILAN CARBONE\n");

  // 1. Changer quelques accréditations SORTIE en ENTREE pour les tests
  const accreditationsToUpdate = await prisma.accreditation.findMany({
    where: {
      status: "SORTIE"
    },
    include: {
      vehicles: true
    },
    take: 5 // Prendre 5 accréditations pour les tests
  });

  console.log(`📝 Mise à jour de ${accreditationsToUpdate.length} accréditations en statut ENTREE...`);

  for (const acc of accreditationsToUpdate) {
    await prisma.accreditation.update({
      where: { id: acc.id },
      data: {
        status: "ENTREE",
        entryAt: new Date() // Marquer l'heure d'entrée
      }
    });

    console.log(`✅ ${acc.company} - ${acc.event} → ENTREE`);

    // 2. Calculer les distances manquantes pour les véhicules
    for (const vehicle of acc.vehicles) {
      let needsUpdate = false;
      const updates: any = {};

      // Calculer la distance si manquante
      if (!vehicle.kms && vehicle.city) {
        try {
          const response = await fetch(`http://localhost:3000/api/distance?city=${encodeURIComponent(vehicle.city)}`);
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data.distance > 0) {
              updates.kms = `${data.data.distance} km`;
              updates.estimatedKms = data.data.distance;
              updates.country = data.data.country;
              needsUpdate = true;
              console.log(`  🗺️  Véhicule ${vehicle.plate}: ${vehicle.city} → ${data.data.distance} km`);
            }
          }
        } catch (error) {
          console.log(`  ⚠️  Erreur calcul distance pour ${vehicle.city}`);
        }
      }

      // Standardiser le type de véhicule
      if (vehicle.size && !updates.vehicleType) {
        const sizeUpper = vehicle.size.toUpperCase();
        if (sizeUpper.includes("10-14") || sizeUpper.includes("MOYEN")) {
          updates.vehicleType = "MOYEN";
        } else if (sizeUpper.includes("15-20") || sizeUpper.includes("GRAND")) {
          updates.vehicleType = "GRAND";
        } else if (sizeUpper.includes("+20") || sizeUpper.includes("TRES")) {
          updates.vehicleType = "TRES_GRAND";
        } else {
          updates.vehicleType = "PETIT";
        }
        needsUpdate = true;
        console.log(`  🚗 Véhicule ${vehicle.plate}: ${vehicle.size} → ${updates.vehicleType}`);
      }

      // Mettre à jour le véhicule si nécessaire
      if (needsUpdate) {
        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: updates
        });
      }
    }
  }

  // 3. Vérifier les résultats
  console.log("\n📊 VÉRIFICATION POST-MISE À JOUR :");

  const vehiclesWithEntry = await prisma.vehicle.count({
    where: {
      accreditation: {
        status: "ENTREE"
      }
    }
  });

  const vehiclesWithDistance = await prisma.vehicle.count({
    where: {
      AND: [
        {
          accreditation: {
            status: "ENTREE"
          }
        },
        {
          OR: [
            { kms: { not: null } },
            { estimatedKms: { gt: 0 } }
          ]
        }
      ]
    }
  });

  console.log(`✅ Véhicules avec statut ENTREE : ${vehiclesWithEntry}`);
  console.log(`✅ Véhicules avec distance : ${vehiclesWithDistance}`);

  // 4. Test de l'API Carbon
  console.log("\n🧪 TEST DE L'API CARBON :");
  try {
    const response = await fetch("http://localhost:3000/api/carbon");
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ API répond : ${data.data.total} véhicules trouvés`);
      console.log(`✅ Événements : ${data.data.aggregations.evenement.length}`);
      console.log(`✅ Entreprises : ${data.data.aggregations.entreprise.length}`);
    } else {
      console.log("❌ Erreur API Carbon");
    }
  } catch (error) {
    console.log("❌ Erreur connexion API Carbon");
  }

  console.log("\n🎉 MISE À JOUR TERMINÉE !");
  console.log("   Vous pouvez maintenant tester le bilan carbone avec de vraies données !");
}

main()
  .catch((e) => {
    console.error("❌ Erreur:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });







