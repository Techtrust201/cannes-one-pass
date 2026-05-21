import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Ajout de données de test pour le bilan carbone...");

  // Créer quelques accréditations avec véhicules pour tester
  const events = ["MIPM", "MIDEM", "Cannes Series", "Cannes Lions", "WORLD"];
  const companies = [
    "Techtrust",
    "Amazon",
    "Facebook",
    "Netflix",
    "Nomsuperlongalire",
  ];
  const vehicleTypes = [
    "VL",
    "PORTEUR_LEGER",
    "PORTEUR",
    "GROS_PORTEUR",
    "PORTEUR_ARTICULE",
    "SEMI_REMORQUE",
  ] as const;
  const countries = [
    "FRANCE",
    "ESPAGNE",
    "ITALIE",
    "ALLEMAGNE",
    "BELGIQUE",
  ] as const;

  for (let i = 0; i < 20; i++) {
    const event = events[Math.floor(Math.random() * events.length)];
    const company = companies[Math.floor(Math.random() * companies.length)];

    const accreditation = await prisma.accreditation.create({
      data: {
        company,
        stand: `Stand ${i + 1}`,
        unloading: "Zone A",
        event,
        message: `Message pour ${company}`,
        consent: true,
        status: "ENTREE",
        vehicles: {
          create: Array.from(
            { length: Math.floor(Math.random() * 3) + 1 },
            (_, j) => {
              const vehicleType =
                vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];
              const country =
                countries[Math.floor(Math.random() * countries.length)];
              const estimatedKms = Math.floor(Math.random() * 1500) + 200;

              // Générer des dates aléaoires dans les 12 derniers mois
              const now = new Date();
              const randomDate = new Date(
                now.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000
              );

              return {
                plate: `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(Math.random() * 900) + 100}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
                size: vehicleType,
                phoneCode: "+33",
                phoneNumber: `06${Math.floor(Math.random() * 90000000) + 10000000}`,
                date: randomDate.toLocaleDateString("fr-FR"),
                time: `${Math.floor(Math.random() * 12) + 8}:${Math.floor(
                  Math.random() * 60
                )
                  .toString()
                  .padStart(2, "0")}`,
                city: getRandomCity(country),
                unloading: JSON.stringify(["Zone A"]),
                kms: `${estimatedKms} km`,
                vehicleType,
                country,
                estimatedKms,
                arrivalDate: randomDate,
                departureDate: new Date(
                  randomDate.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000
                ),
              };
            }
          ),
        },
      },
    });

    console.log(`✅ Créé accréditation ${i + 1}/20: ${company} - ${event}`);
  }

  console.log("🎉 Données de test ajoutées avec succès !");
}

function getRandomCity(country: string): string {
  const cities = {
    FRANCE: ["Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Nantes"],
    ESPAGNE: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao"],
    ITALIE: ["Rome", "Milan", "Naples", "Turin", "Florence"],
    ALLEMAGNE: ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt"],
    BELGIQUE: ["Brussels", "Antwerp", "Ghent", "Liège", "Bruges"],
  };

  const countryCities = cities[country as keyof typeof cities] || cities.FRANCE;
  return countryCities[Math.floor(Math.random() * countryCities.length)];
}

main()
  .catch((e) => {
    console.error("❌ Erreur:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


