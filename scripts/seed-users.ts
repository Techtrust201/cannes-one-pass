/**
 * Script de seed pour créer les comptes utilisateurs initiaux.
 *
 * Usage: npx tsx scripts/seed-users.ts
 *
 * Ce script crée :
 * - 3 comptes SUPER_ADMIN
 * - 2 comptes ADMIN (La Bocca, Le Palais des Festivals)
 * Avec toutes les permissions pour les super admins.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes } from "crypto";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { hashPassword } from "better-auth/crypto";

// Charger les variables d'environnement
dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL non définie. Vérifiez votre .env.local");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
// Note: Le cast est nécessaire car le plugin TS de Next.js interfère
// avec la résolution des types générés de Prisma dans les scripts externes.
// Le code compile correctement avec tsc (vérifié).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter }) as any;

// Générer un mot de passe aléatoire sécurisé
function generatePassword(length = 16): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

const ALL_FEATURES = [
  "LISTE",
  "CREER",
  "PLAQUE",
  "QR_CODE",
  "FLUX_VEHICULES",
  "BILAN_CARBONE",
  "GESTION_ZONES",
  "GESTION_DATES",
] as const;

// Comptes à créer
const SUPER_ADMINS = [
  {
    email: "chatelain@palaisdesfestivals.com",
    name: "Chatelain",
    password: "SuperAdmin2025!",
  },
  {
    email: "saez@palaisdesfestivals.com",
    name: "Saez",
    password: "SuperAdmin2025!",
  },
  {
    email: "desloques@palaisdesfestivals.com",
    name: "Desloques",
    password: "SuperAdmin2025!",
  },
];

const ADMIN_ACCOUNTS = [
  {
    email: "bocca@palaisdesfestivals.com",
    name: "La Bocca",
    password: generatePassword(),
  },
  {
    email: "palais@palaisdesfestivals.com",
    name: "Le Palais des Festivals",
    password: generatePassword(),
  },
];

async function createUserWithAuth(
  email: string,
  name: string,
  password: string,
  role: "SUPER_ADMIN" | "ADMIN" | "USER"
) {
  // Vérifier si l'utilisateur existe déjà
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    console.log(`  ⏭️  ${email} existe déjà (rôle: ${existing.role})`);
    return existing;
  }

  // Utilise la fonction hashPassword de Better Auth
  // pour garantir la compatibilité du format
  const hashedPassword = await hashPassword(password);

  // Créer l'utilisateur
  const user = await prisma.user.create({
    data: {
      name,
      email,
      emailVerified: true,
      role,
      isActive: true,
    },
  });

  // Créer le compte (Better Auth stocke les credentials dans la table account)
  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: hashedPassword,
    },
  });

  console.log(`  ✅ ${email} créé (rôle: ${role})`);
  return user;
}

async function assignAllPermissions(userId: string) {
  for (const feature of ALL_FEATURES) {
    await prisma.userPermission.upsert({
      where: {
        userId_feature: { userId, feature },
      },
      create: {
        userId,
        feature,
        canRead: true,
        canWrite: true,
      },
      update: {
        canRead: true,
        canWrite: true,
      },
    });
  }
}

async function main() {
  console.log("🚀 Seed des utilisateurs...\n");

  // Créer les super admins
  console.log("👑 Création des Super Admins:");
  for (const admin of SUPER_ADMINS) {
    const user = await createUserWithAuth(
      admin.email,
      admin.name,
      admin.password,
      "SUPER_ADMIN"
    );
    await assignAllPermissions(user.id);
  }

  // Créer les comptes admin
  console.log("\n🔑 Création des comptes Admin:");
  for (const account of ADMIN_ACCOUNTS) {
    const user = await createUserWithAuth(
      account.email,
      account.name,
      account.password,
      "ADMIN"
    );
    // Les admins n'ont pas de permissions par défaut
    // -> à configurer via l'interface super admin
    console.log(`     Email: ${account.email}`);
    console.log(`     Mot de passe: ${account.password}`);
    // On s'assure que l'user existe pour le log
    if (user) {
      console.log(`     ID: ${user.id}`);
    }
  }

  console.log("\n✨ Seed terminé avec succès!\n");
  console.log("📋 Récapitulatif des comptes:\n");

  console.log("Super Admins (mot de passe: SuperAdmin2025!):");
  for (const admin of SUPER_ADMINS) {
    console.log(`  - ${admin.email}`);
  }

  console.log("\nComptes Admin (mots de passe générés):");
  for (const account of ADMIN_ACCOUNTS) {
    console.log(`  - ${account.email} : ${account.password}`);
  }

  console.log(
    "\n⚠️  Changez les mots de passe dès que possible en production!"
  );
}

main()
  .catch((error) => {
    console.error("❌ Erreur:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
