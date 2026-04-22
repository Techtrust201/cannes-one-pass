/**
 * Script one-shot de correction des numéros de téléphone dont le split
 * (phoneCode / phoneNumber) a été cassé par l'ancienne regex gloutonne dans
 * VehicleForm.tsx.
 *
 * Cas typique :
 *   phoneCode = "+3376"    (devait être "+33")
 *   phoneNumber = "0640775" (devait être "760640775")
 *
 * Symptôme utilisateur : le lien tel: compose "+33 7 66 40 77 5" alors que
 * l'affichage brut montre "+33 76 06 40 77 5" (un 0 manque au composer).
 *
 * Stratégie :
 * 1. Pour chaque Vehicle, recoller phoneCode + phoneNumber dans une chaîne
 *    E.164 continue (ex: "+33760640775").
 * 2. Utiliser libphonenumber-js pour re-parser correctement le numéro.
 * 3. Si le parsing réussit, re-découper en {phoneCode: "+<countryCallingCode>",
 *    phoneNumber: "<nationalNumberNumeric>"} et mettre à jour la ligne.
 * 4. Ne modifier que les lignes où le résultat DIFFÈRE de l'existant (on évite
 *    d'écrire pour rien les lignes déjà correctes) et où le parsing a produit
 *    un numéro jugé "valide" (pour éviter de casser des numéros exotiques).
 *
 * Usage :
 *   npx tsx scripts/fix-phone-split.ts            # mode dry-run (ne commit rien)
 *   npx tsx scripts/fix-phone-split.ts --commit   # applique réellement les changements
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { parsePhoneNumberFromString } from "libphonenumber-js";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL non définie. Vérifiez votre .env.local");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const COMMIT = process.argv.includes("--commit");

interface FixResult {
  vehicleId: number;
  oldCode: string;
  oldNumber: string;
  newCode: string;
  newNumber: string;
  e164: string;
  reason: string;
}

async function main() {
  console.log(`🔍 Recherche des véhicules avec numéros à recoller...`);
  console.log(`   Mode: ${COMMIT ? "💾 COMMIT (écriture réelle)" : "👀 DRY-RUN (simulation)"}`);

  const vehicles = await prisma.vehicle.findMany({
    select: { id: true, phoneCode: true, phoneNumber: true },
  });

  console.log(`   ${vehicles.length} véhicules à analyser.`);

  const fixes: FixResult[] = [];
  const skipped: { id: number; phoneCode: string; phoneNumber: string; reason: string }[] = [];

  for (const v of vehicles) {
    if (!v.phoneNumber || v.phoneNumber.trim() === "") {
      continue;
    }

    // 1. Reconstituer la chaîne continue en E.164.
    const cleanCode = (v.phoneCode || "+33").replace(/[^0-9]/g, "");
    const cleanNumber = v.phoneNumber.replace(/[^0-9]/g, "");
    if (!cleanCode || !cleanNumber) {
      skipped.push({ id: v.id, phoneCode: v.phoneCode, phoneNumber: v.phoneNumber, reason: "vide après nettoyage" });
      continue;
    }
    const raw = `+${cleanCode}${cleanNumber}`;

    // 2. Parse propre.
    const parsed = parsePhoneNumberFromString(raw);
    if (!parsed) {
      skipped.push({ id: v.id, phoneCode: v.phoneCode, phoneNumber: v.phoneNumber, reason: `parsing impossible (${raw})` });
      continue;
    }

    const newCode = `+${parsed.countryCallingCode}`;
    const newNumber = parsed.nationalNumber.toString();

    // 3. Sauter si déjà bien découpé.
    if (newCode === v.phoneCode && newNumber === v.phoneNumber) {
      continue;
    }

    // 4. Garde-fou : ne pas modifier si libphonenumber juge le numéro totalement invalide
    //    (on accepte "possible mais pas valide" pour ne pas casser des numéros exotiques
    //    de chauffeurs étrangers, tant que la reconstitution est cohérente).
    if (!parsed.isPossible()) {
      skipped.push({
        id: v.id,
        phoneCode: v.phoneCode,
        phoneNumber: v.phoneNumber,
        reason: `numéro non plausible après recollement (${raw})`,
      });
      continue;
    }

    fixes.push({
      vehicleId: v.id,
      oldCode: v.phoneCode,
      oldNumber: v.phoneNumber,
      newCode,
      newNumber,
      e164: parsed.number,
      reason: parsed.isValid() ? "valide" : "plausible (non strictement valide)",
    });
  }

  console.log(`\n📊 Résultats :`);
  console.log(`   ${fixes.length} véhicules à corriger`);
  console.log(`   ${skipped.length} véhicules ignorés`);

  if (fixes.length > 0) {
    console.log(`\n🔧 Corrections prévues :`);
    for (const f of fixes.slice(0, 20)) {
      console.log(`   #${f.vehicleId}: "${f.oldCode}" + "${f.oldNumber}" → "${f.newCode}" + "${f.newNumber}" (${f.e164}, ${f.reason})`);
    }
    if (fixes.length > 20) {
      console.log(`   ... et ${fixes.length - 20} autres.`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n⚠️  Ignorés (échantillon) :`);
    for (const s of skipped.slice(0, 10)) {
      console.log(`   #${s.id}: "${s.phoneCode}" + "${s.phoneNumber}" → ${s.reason}`);
    }
  }

  if (!COMMIT) {
    console.log(`\n💡 Relancer avec --commit pour appliquer les changements.`);
    await prisma.$disconnect();
    return;
  }

  if (fixes.length === 0) {
    console.log(`\n✅ Rien à mettre à jour.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\n💾 Application des ${fixes.length} corrections en base...`);
  let updated = 0;
  for (const f of fixes) {
    await prisma.vehicle.update({
      where: { id: f.vehicleId },
      data: { phoneCode: f.newCode, phoneNumber: f.newNumber },
    });
    updated++;
    if (updated % 50 === 0) {
      console.log(`   ${updated}/${fixes.length}...`);
    }
  }
  console.log(`✅ ${updated} véhicules mis à jour.`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌ Erreur:", err);
  await prisma.$disconnect();
  process.exit(1);
});
