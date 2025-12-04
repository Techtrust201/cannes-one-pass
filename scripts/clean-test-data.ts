import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🧹 Suppression des données de test uniquement...");

  // Supprimer les accréditations créées par le script de test
  // (celles avec des stands "Stand 1", "Stand 2", etc.)
  const testAccreditations = await prisma.accreditation.findMany({
    where: {
      stand: {
        startsWith: "Stand "
      }
    }
  });

  console.log(`Trouvé ${testAccreditations.length} accréditations de test à supprimer`);

  for (const acc of testAccreditations) {
    await prisma.accreditation.delete({
      where: { id: acc.id }
    });
    console.log(`✅ Supprimé accréditation de test: ${acc.company} - ${acc.event}`);
  }

  console.log("🎉 Données de test supprimées, vraies données conservées !");
  
  // Compter les vraies données restantes
  const realAccreditations = await prisma.accreditation.count();
  console.log(`📊 ${realAccreditations} vraies accréditations conservées`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


