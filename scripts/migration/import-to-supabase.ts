/**
 * Script d'import des données Neon → Supabase
 *
 * Prérequis : les fichiers JSON exportés depuis Neon doivent être dans scripts/migration/data/
 * Usage : npx tsx scripts/migration/import-to-supabase.ts
 */
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import pg from "pg";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL non définie");
  process.exit(1);
}

const DATA_DIR = resolve(__dirname, "data");

function loadJson(filename: string): Record<string, unknown[]> | null {
  const path = resolve(DATA_DIR, filename);
  if (!existsSync(path)) {
    console.log(`  ⏭️  ${filename} non trouvé, skip`);
    return null;
  }
  const raw = readFileSync(path, "utf-8").trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed.export_data) return parsed.export_data;
    return parsed;
  } catch {
    console.error(`  ❌ Erreur de parsing JSON dans ${filename}`);
    return null;
  }
}

function escapeLiteral(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === "object") {
    if (Buffer.isBuffer(val)) return `'\\x${val.toString("hex")}'`;
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function buildInsert(table: string, rows: Record<string, unknown>[]): string[] {
  if (!rows || rows.length === 0) return [];
  const statements: string[] = [];
  for (const row of rows) {
    const cols = Object.keys(row);
    const colNames = cols.map((c) => `"${c}"`).join(", ");
    const values = cols.map((c) => escapeLiteral(row[c])).join(", ");
    statements.push(`INSERT INTO "${table}" (${colNames}) VALUES (${values}) ON CONFLICT DO NOTHING;`);
  }
  return statements;
}

async function resetSequences(client: pg.Client) {
  const seqTables = [
    { table: "Vehicle", column: "id" },
    { table: "ZoneMovement", column: "id" },
    { table: "AccreditationEmailHistory", column: "id" },
    { table: "AccreditationHistory", column: "id" },
    { table: "AccreditationHistoryArchive", column: "id" },
    { table: "VehicleTimeSlot", column: "id" },
    { table: "ChatMessage", column: "id" },
    { table: "ZoneConfig", column: "id" },
  ];

  for (const { table, column } of seqTables) {
    try {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('"${table}"', '${column}'), COALESCE((SELECT MAX("${column}") FROM "${table}"), 0) + 1, false)`
      );
    } catch {
      // sequence might not exist
    }
  }
}

async function main() {
  console.log("🚀 Import des données vers Supabase...\n");

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("✅ Connecté à Supabase\n");

  try {
    // Désactiver les contraintes FK temporairement
    await client.query("SET session_replication_role = 'replica';");

    // ========== Fichier 1 : Users ==========
    const users = loadJson("01-users.json");
    if (users) {
      console.log("📥 Import users...");

      const userRows = (users.users || []) as Record<string, unknown>[];
      const accountRows = (users.accounts || []) as Record<string, unknown>[];
      const permRows = (users.user_permissions || []) as Record<string, unknown>[];
      const verifRows = (users.verifications || []) as Record<string, unknown>[];

      for (const stmt of buildInsert("user", userRows)) await client.query(stmt);
      console.log(`  ✅ ${userRows.length} users`);

      for (const stmt of buildInsert("account", accountRows)) await client.query(stmt);
      console.log(`  ✅ ${accountRows.length} accounts`);

      for (const stmt of buildInsert("user_permission", permRows)) await client.query(stmt);
      console.log(`  ✅ ${permRows.length} permissions`);

      for (const stmt of buildInsert("verification", verifRows)) await client.query(stmt);
      console.log(`  ✅ ${verifRows.length} verifications`);
    }

    // ========== Fichier 2 : Config ==========
    const config = loadJson("02-config.json");
    if (config) {
      console.log("\n📥 Import events & zones...");

      const eventRows = (config.events || []) as Record<string, unknown>[];
      const zoneRows = (config.zone_configs || []) as Record<string, unknown>[];

      for (const stmt of buildInsert("Event", eventRows)) await client.query(stmt);
      console.log(`  ✅ ${eventRows.length} events`);

      for (const stmt of buildInsert("ZoneConfig", zoneRows)) await client.query(stmt);
      console.log(`  ✅ ${zoneRows.length} zones`);
    }

    // ========== Fichier 3 : Accreditations ==========
    const accreds = loadJson("03-accreditations.json");
    if (accreds) {
      console.log("\n📥 Import accreditations...");

      const rows = (accreds.accreditations || []) as Record<string, unknown>[];
      for (const stmt of buildInsert("Accreditation", rows)) await client.query(stmt);
      console.log(`  ✅ ${rows.length} accreditations`);
    }

    // ========== Fichier 4 : Vehicles ==========
    const vehicles = loadJson("04-vehicles.json");
    if (vehicles) {
      console.log("\n📥 Import vehicles...");

      const vRows = (vehicles.vehicles || []) as Record<string, unknown>[];
      const tsRows = (vehicles.vehicle_time_slots || []) as Record<string, unknown>[];

      for (const stmt of buildInsert("Vehicle", vRows)) await client.query(stmt);
      console.log(`  ✅ ${vRows.length} vehicles`);

      for (const stmt of buildInsert("VehicleTimeSlot", tsRows)) await client.query(stmt);
      console.log(`  ✅ ${tsRows.length} time slots`);
    }

    // ========== Fichier 5 : History ==========
    const history = loadJson("05-history.json");
    if (history) {
      console.log("\n📥 Import historique...");

      const histRows = (history.accreditation_history || []) as Record<string, unknown>[];
      const emailRows = (history.accreditation_email_history || []) as Record<string, unknown>[];
      const zoneRows = (history.zone_movements || []) as Record<string, unknown>[];
      const chatRows = (history.chat_messages || []) as Record<string, unknown>[];
      const archRows = (history.history_archives || []) as Record<string, unknown>[];

      for (const stmt of buildInsert("AccreditationHistory", histRows)) await client.query(stmt);
      console.log(`  ✅ ${histRows.length} history entries`);

      for (const stmt of buildInsert("AccreditationEmailHistory", emailRows)) await client.query(stmt);
      console.log(`  ✅ ${emailRows.length} email history`);

      for (const stmt of buildInsert("ZoneMovement", zoneRows)) await client.query(stmt);
      console.log(`  ✅ ${zoneRows.length} zone movements`);

      for (const stmt of buildInsert("ChatMessage", chatRows)) await client.query(stmt);
      console.log(`  ✅ ${chatRows.length} chat messages`);

      for (const stmt of buildInsert("AccreditationHistoryArchive", archRows)) await client.query(stmt);
      console.log(`  ✅ ${archRows.length} archives`);
    }

    // Réactiver les contraintes FK
    await client.query("SET session_replication_role = 'origin';");

    // Resync des séquences auto-increment
    console.log("\n🔄 Synchronisation des séquences...");
    await resetSequences(client);

    console.log("\n🎉 Import terminé avec succès !");
  } catch (error) {
    await client.query("SET session_replication_role = 'origin';");
    console.error("\n❌ Erreur:", error);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
