/**
 * Endpoint de diagnostic pour identifier les crashs module-level sur Vercel.
 * À SUPPRIMER après résolution du problème.
 */
export async function GET() {
  const results: Record<string, string> = {};

  // Test 1: La fonction serverless de base fonctionne
  results["1_basic"] = "OK";

  // Test 2: Variables d'environnement
  results["2_DATABASE_URL"] = process.env.DATABASE_URL ? "SET" : "NOT SET";
  results["2_BETTER_AUTH_SECRET"] = process.env.BETTER_AUTH_SECRET
    ? "SET"
    : "NOT SET";
  results["2_BETTER_AUTH_URL"] = process.env.BETTER_AUTH_URL || "NOT SET";

  // Test 2b: Lister TOUTES les clés d'env qui contiennent "BETTER" ou "AUTH"
  const envKeys = Object.keys(process.env).filter(
    (k) => k.includes("BETTER") || k.includes("AUTH") || k.includes("DATABASE") || k.includes("VERCEL")
  );
  results["2b_matching_env_keys"] = envKeys.length > 0 ? envKeys.join(", ") : "NONE";
  results["2c_total_env_keys"] = String(Object.keys(process.env).length);

  // Test 3: Import dynamique de pg
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pg = require("pg") as { Pool: unknown };
    results["3_pg_import"] = `OK (Pool: ${typeof pg.Pool})`;
  } catch (e: unknown) {
    results["3_pg_import"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 4: Import dynamique de @prisma/adapter-pg
  try {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    results["4_prisma_pg_import"] = `OK (PrismaPg: ${typeof PrismaPg})`;
  } catch (e: unknown) {
    results["4_prisma_pg_import"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 5: Import dynamique de @prisma/client + connexion
  try {
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    const prisma = new PrismaClient({ adapter });
    const count = await prisma.user.count();
    results["5_prisma_query"] = `OK (${count} users)`;
    await prisma.$disconnect();
  } catch (e: unknown) {
    results["5_prisma_query"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 6: Import dynamique de better-auth
  try {
    const ba = await import("better-auth");
    results["6_better_auth_import"] = `OK (betterAuth: ${typeof ba.betterAuth})`;
  } catch (e: unknown) {
    results["6_better_auth_import"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 7: Import du module auth complet
  try {
    const authMod = await import("@/lib/auth");
    results["7_auth_module"] = `OK (auth: ${typeof authMod.auth})`;
  } catch (e: unknown) {
    results["7_auth_module"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  return Response.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
