/**
 * Migration directe Neon → Supabase via Node.js
 * Lit toutes les tables de Neon et les insère dans Supabase
 */
import pg from "pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });

const NEON_URL = "postgresql://palais_des_festivals_owner:npg_ZrkI5FS9HDay@ep-shy-voice-a2x54gid-pooler.eu-central-1.aws.neon.tech/palais_des_festivals?sslmode=require";
const SUPABASE_URL = process.env.DATABASE_URL!;

const TABLES_IN_ORDER = [
  { name: "user", hasSerial: false },
  { name: "session", hasSerial: false },
  { name: "account", hasSerial: false },
  { name: "verification", hasSerial: false },
  { name: "user_permission", hasSerial: false },
  { name: "Event", hasSerial: false },
  { name: "ZoneConfig", hasSerial: true },
  { name: "Accreditation", hasSerial: false },
  { name: "Vehicle", hasSerial: true },
  { name: "ZoneMovement", hasSerial: true },
  { name: "AccreditationEmailHistory", hasSerial: true },
  { name: "AccreditationHistory", hasSerial: true },
  { name: "AccreditationHistoryArchive", hasSerial: false },
  { name: "VehicleTimeSlot", hasSerial: true },
  { name: "ChatMessage", hasSerial: true },
];

function escapeLiteral(client: pg.Client, val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return client.escapeLiteral(val.toISOString());
  if (Buffer.isBuffer(val)) return `'\\x${val.toString("hex")}'`;
  if (typeof val === "object") return client.escapeLiteral(JSON.stringify(val));
  return client.escapeLiteral(String(val));
}

async function main() {
  console.log("🚀 Migration directe Neon → Supabase\n");

  const neon = new pg.Client({ connectionString: NEON_URL });
  const supa = new pg.Client({ connectionString: SUPABASE_URL });

  await neon.connect();
  console.log("✅ Connecté à Neon");
  await supa.connect();
  console.log("✅ Connecté à Supabase\n");

  try {
    await neon.query("SET search_path TO public;");
    await supa.query("SET search_path TO public;");
    await supa.query("SET session_replication_role = 'replica';");

    let totalRows = 0;

    for (const table of TABLES_IN_ORDER) {
      const { rows } = await neon.query(`SELECT * FROM "${table.name}"`);

      if (rows.length === 0) {
        console.log(`  ⏭️  "${table.name}" — vide`);
        continue;
      }

      const cols = Object.keys(rows[0]);
      const colNames = cols.map((c) => `"${c}"`).join(", ");

      let inserted = 0;
      const batchSize = 50;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valueRows = batch.map(
          (row) => `(${cols.map((c) => escapeLiteral(supa, row[c])).join(", ")})`
        );

        const sql = `INSERT INTO "${table.name}" (${colNames}) VALUES ${valueRows.join(",\n")} ON CONFLICT DO NOTHING`;

        try {
          const result = await supa.query(sql);
          inserted += result.rowCount || 0;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ❌ Erreur sur "${table.name}" batch ${i}: ${msg}`);
          for (const row of batch) {
            const singleValues = `(${cols.map((c) => escapeLiteral(supa, row[c])).join(", ")})`;
            try {
              await supa.query(`INSERT INTO "${table.name}" (${colNames}) VALUES ${singleValues} ON CONFLICT DO NOTHING`);
              inserted++;
            } catch (e2: unknown) {
              const msg2 = e2 instanceof Error ? e2.message : String(e2);
              console.error(`    ⚠️  Row skip: ${msg2.substring(0, 100)}`);
            }
          }
        }
      }

      console.log(`  ✅ "${table.name}" — ${inserted}/${rows.length} lignes`);
      totalRows += inserted;

      if (table.hasSerial) {
        try {
          await supa.query(
            `SELECT setval(pg_get_serial_sequence('"${table.name}"', 'id'), COALESCE((SELECT MAX("id") FROM "${table.name}"), 0) + 1, false)`
          );
        } catch { /* seq might not exist */ }
      }
    }

    await supa.query("SET session_replication_role = 'origin';");

    console.log(`\n🎉 Migration terminée ! ${totalRows} lignes importées au total.`);
  } catch (error) {
    await supa.query("SET session_replication_role = 'origin';").catch(() => {});
    throw error;
  } finally {
    await neon.end();
    await supa.end();
  }
}

main().catch((e) => {
  console.error("❌ Erreur fatale:", e);
  process.exit(1);
});
