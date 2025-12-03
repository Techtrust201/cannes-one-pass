import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("📅 ANALYSE DES DATES DES VÉHICULES\n");

  // Récupérer tous les véhicules avec statut ENTREE ou SORTIE
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

  console.log(
    `🚗 ${vehicles.length} véhicules avec statut ENTREE/SORTIE trouvés :\n`
  );

  vehicles.forEach((vehicle, i) => {
    console.log(
      `${i + 1}. ${vehicle.plate} (${vehicle.accreditation.company})`
    );
    console.log(`   Date : "${vehicle.date}"`);
    console.log(`   Statut : ${vehicle.accreditation.status}`);
    console.log(`   Événement : ${vehicle.accreditation.event}`);

    // Essayer de parser la date
    try {
      let parsedDate: Date | null = null;

      if (vehicle.date.includes("/")) {
        const [day, month, year] = vehicle.date.split("/").map(Number);
        parsedDate = new Date(year, month - 1, day);
      } else {
        parsedDate = new Date(vehicle.date);
      }

      if (parsedDate && !isNaN(parsedDate.getTime())) {
        console.log(
          `   Date parsée : ${parsedDate.toLocaleDateString("fr-FR")} (${parsedDate.getFullYear()})`
        );

        // Vérifier si dans la période 2024
        const in2024 = parsedDate.getFullYear() === 2024;
        console.log(`   Dans 2024 : ${in2024 ? "✅" : "❌"}`);
      } else {
        console.log(`   ❌ Date invalide`);
      }
    } catch (error) {
      console.log(`   ❌ Erreur parsing date`);
    }

    console.log("");
  });

  // Statistiques par année
  const datesByYear: { [year: string]: number } = {};

  vehicles.forEach((vehicle) => {
    try {
      let parsedDate: Date | null = null;

      if (vehicle.date.includes("/")) {
        const [day, month, year] = vehicle.date.split("/").map(Number);
        parsedDate = new Date(year, month - 1, day);
      } else {
        parsedDate = new Date(vehicle.date);
      }

      if (parsedDate && !isNaN(parsedDate.getTime())) {
        const year = parsedDate.getFullYear().toString();
        datesByYear[year] = (datesByYear[year] || 0) + 1;
      }
    } catch (error) {
      datesByYear["invalide"] = (datesByYear["invalide"] || 0) + 1;
    }
  });

  console.log("📊 RÉPARTITION PAR ANNÉE :");
  Object.entries(datesByYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([year, count]) => {
      console.log(`   ${year}: ${count} véhicules`);
    });

  console.log("\n🎯 RECOMMANDATION :");
  const vehiculesIn2024 = datesByYear["2024"] || 0;

  if (vehiculesIn2024 === 0) {
    console.log("   ❌ Aucun véhicule en 2024");
    console.log("   📝 Pour tester le bilan carbone 2024, il faut :");
    console.log("      1. Changer les dates des véhicules existants");
    console.log("      2. Ou élargir la période de recherche");
    console.log(
      "      3. Ou créer de nouvelles accréditations avec des dates 2024"
    );
  } else {
    console.log(
      `   ✅ ${vehiculesIn2024} véhicules en 2024 - le bilan carbone devrait fonctionner`
    );
  }
}

main()
  .catch((e) => {
    console.error("❌ Erreur:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });







