import { defineConfig } from "@prisma/config";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

// Charger explicitement les variables d'environnement depuis .env et .env.local
// Cela garantit que DATABASE_URL est disponible même si elle n'est pas dans l'environnement système
try {
  dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
  dotenvConfig({ path: resolve(process.cwd(), ".env") });
} catch {
  // dotenv n'est pas disponible, continuer sans (Prisma le charge automatiquement)
}

// Pour prisma generate, une URL factice suffit si DATABASE_URL n'est toujours pas définie
// (generate n'a pas besoin d'une connexion réelle à la base de données)
// La vraie connexion sera établie via l'adapter dans le code applicatif
// Pour les migrations (migrate deploy), DATABASE_URL doit être définie
// Sur Vercel, DATABASE_URL est automatiquement définie dans les variables d'environnement
const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://user:password@localhost:5432/dbname?schema=public";

export default defineConfig({
  datasource: {
    url: databaseUrl,
  },
});
