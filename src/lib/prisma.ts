import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Évite l'instanciation multiple en development (hot reload Next.js)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({
  connectionString,
  max: 5, // Max 5 connexions par instance Vercel (compatible Neon free tier)
  idleTimeoutMillis: 10_000, // Ferme les connexions idle après 10s
  connectionTimeoutMillis: 10_000, // Timeout si connexion impossible en 10s (cold start Vercel + Supabase)
});

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[prisma] Query failed (attempt ${attempt + 1}), retrying in ${delayMs}ms:`, err);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw new Error("unreachable");
}

export default prisma;
