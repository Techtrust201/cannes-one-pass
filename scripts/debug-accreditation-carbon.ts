#!/usr/bin/env tsx

import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Charger les variables d'environnement
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const ACCREDITATION_ID = "c1b1b0bb-e1cb-4a15-bbd6-b683bb9cfac9";

async function debug() {
  const acc = await prisma.accreditation.findUnique({
    where: { id: ACCREDITATION_ID },
    include: { vehicles: true },
  });

  if (!acc) {
    console.log("❌ Accréditation non trouvée");
    await prisma.$disconnect();
    return;
  }

  console.log("📋 Accréditation trouvée:");
  console.log(`  ID: ${acc.id}`);
  console.log(`  Entreprise: ${acc.company}`);
  console.log(`  Événement: ${acc.event}`);
  console.log(`  Stand: ${acc.stand}`);
  console.log(`  Statut: ${acc.status}`);
  console.log(`  Date de création: ${acc.createdAt}`);
  console.log(`  EntryAt: ${acc.entryAt}`);
  console.log(`  ExitAt: ${acc.exitAt}`);
  console.log(`  Nombre de véhicules: ${acc.vehicles.length}`);

  // Vérifier le statut
  const validStatus = ["ENTREE", "SORTIE"].includes(acc.status);
  console.log(`\n✅ Statut valide pour bilan carbone: ${validStatus ? "OUI" : "NON"}`);
  if (!validStatus) {
    console.log(`   ⚠️  Le statut doit être "ENTREE" ou "SORTIE" pour apparaître dans le bilan carbone`);
    console.log(`   💡 Solution: Modifier le statut de "${acc.status}" vers "ENTREE" ou "SORTIE"`);
  }

  // Vérifier les véhicules
  if (acc.vehicles.length === 0) {
    console.log("\n⚠️  Aucun véhicule associé à cette accréditation");
    console.log("   💡 Solution: Ajouter au moins un véhicule à cette accréditation");
  } else {
    console.log("\n🚗 Détails des véhicules:");
    acc.vehicles.forEach((v, idx) => {
      console.log(`\n  Véhicule ${idx + 1}:`);
      console.log(`    ID: ${v.id}`);
      console.log(`    Plaque: ${v.plate}`);
      console.log(`    Ville: ${v.city || "(vide)"}`);
      console.log(`    Pays: ${v.country || "(vide)"}`);
      console.log(`    estimatedKms: ${v.estimatedKms || "(vide)"}`);
      console.log(`    kms: ${v.kms || "(vide)"}`);
      console.log(`    Date: ${v.date || "(vide)"}`);
      console.log(`    arrivalDate: ${v.arrivalDate || "(vide)"}`);
      console.log(`    vehicleType: ${v.vehicleType || "(vide)"}`);
      console.log(`    size: ${v.size || "(vide)"}`);
      
      // Vérifier si distance calculable
      let hasDistance = false;
      if (v.estimatedKms && v.estimatedKms > 0) {
        hasDistance = true;
        console.log(`    ✅ Distance depuis estimatedKms: ${v.estimatedKms} km`);
      } else if (v.kms) {
        const parsed = parseInt(v.kms.replace(/\D/g, "")) || 0;
        if (parsed > 0) {
          hasDistance = true;
          console.log(`    ✅ Distance depuis kms: ${parsed} km`);
        }
      } else if (v.city) {
        hasDistance = true;
        console.log(`    ✅ Distance calculable depuis ville: ${v.city}`);
      } else {
        console.log(`    ❌ Aucune distance calculable (pas de estimatedKms, kms, ni city)`);
        console.log(`    💡 Solution: Ajouter une ville de départ ou une distance manuelle`);
      }
    });
  }

  // Vérifier la date (période 12 mois)
  const endDate = new Date("2024-12-31");
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 11);
  startDate.setDate(1);
  
  console.log(`\n📅 Période de filtrage (12 derniers mois):`);
  console.log(`  Début: ${startDate.toISOString().split("T")[0]}`);
  console.log(`  Fin: ${endDate.toISOString().split("T")[0]}`);
  
  if (acc.vehicles.length > 0) {
    console.log(`\n📆 Vérification des dates des véhicules:`);
    acc.vehicles.forEach((v, idx) => {
      const vehicleDate = v.arrivalDate 
        ? new Date(v.arrivalDate)
        : v.date 
        ? new Date(v.date)
        : acc.createdAt;
      
      const dateStr = vehicleDate instanceof Date 
        ? vehicleDate.toISOString().split("T")[0]
        : vehicleDate;
      
      const inRange = vehicleDate >= startDate && vehicleDate <= endDate;
      console.log(`\n  Véhicule ${idx + 1} (${v.plate}):`);
      console.log(`    Date utilisée: ${dateStr}`);
      console.log(`    ${inRange ? "✅" : "❌"} Dans la période: ${inRange ? "OUI" : "NON"}`);
      if (!inRange) {
        console.log(`    💡 Solution: La date doit être entre ${startDate.toISOString().split("T")[0]} et ${endDate.toISOString().split("T")[0]}`);
      }
    });
  }

  // Résumé final
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 RÉSUMÉ:`);
  console.log(`  Statut valide: ${validStatus ? "✅" : "❌"}`);
  console.log(`  A des véhicules: ${acc.vehicles.length > 0 ? "✅" : "❌"}`);
  
  if (acc.vehicles.length > 0) {
    const vehiclesWithDistance = acc.vehicles.filter(v => {
      if (v.estimatedKms && v.estimatedKms > 0) return true;
      if (v.kms) {
        const parsed = parseInt(v.kms.replace(/\D/g, "")) || 0;
        if (parsed > 0) return true;
      }
      if (v.city) return true;
      return false;
    });
    console.log(`  Véhicules avec distance: ${vehiclesWithDistance.length}/${acc.vehicles.length} ${vehiclesWithDistance.length === acc.vehicles.length ? "✅" : "❌"}`);
  }

  if (!validStatus) {
    console.log(`\n🔧 ACTION REQUISE: Modifier le statut de "${acc.status}" vers "ENTREE" ou "SORTIE"`);
  }

  await prisma.$disconnect();
}

debug().catch(console.error);
