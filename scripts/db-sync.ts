/**
 * Synchronisation bidirectionnelle entre bases de données PostgreSQL
 *
 * Usage:
 *   npm run db:sync                          # Supabase (primaire) → Neon (backup)
 *   npm run db:sync -- --direction=neon2supa # Neon → Supabase
 *   npm run db:sync -- --direction=supa2neon # Supabase → Neon (défaut)
 *   npm run db:sync -- --verify              # Vérification seule, pas de sync
 *   npm run db:sync -- --force               # Écrase la destination (TRUNCATE + COPY)
 *
 * Ce script :
 *  1. Compare les deux bases table par table
 *  2. Copie les lignes manquantes de la source vers la destination
 *  3. Réinitialise les séquences auto-increment
 *  4. Affiche un rapport de vérification
 */
import pg from "pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const NEON_URL =
  "postgresql://palais_des_festivals_owner:npg_ZrkI5FS9HDay@ep-shy-voice-a2x54gid-pooler.eu-central-1.aws.neon.tech/palais_des_festivals?sslmode=require";
const SUPABASE_URL = process.env.DATABASE_URL!;

if (!SUPABASE_URL) {
  console.error("❌ DATABASE_URL non définie dans .env.local");
  process.exit(1);
}

const TABLES_ORDERED = [
  { name: "user", pk: "id", serial: false },
  { name: "account", pk: "id", serial: false },
  { name: "verification", pk: "id", serial: false },
  { name: "user_permission", pk: "id", serial: false },
  { name: "Event", pk: "id", serial: false },
  { name: "ZoneConfig", pk: "id", serial: true },
  { name: "Accreditation", pk: "id", serial: false },
  { name: "Vehicle", pk: "id", serial: true },
  { name: "ZoneMovement", pk: "id", serial: true },
  { name: "AccreditationEmailHistory", pk: "id", serial: true },
  { name: "AccreditationHistory", pk: "id", serial: true },
  { name: "AccreditationHistoryArchive", pk: "id", serial: false },
  { name: "VehicleTimeSlot", pk: "id", serial: true },
  { name: "ChatMessage", pk: "id", serial: true },
];

const SKIP_TABLES = ["session"];

function escapeLiteral(client: pg.Client, val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return client.escapeLiteral(val.toISOString());
  if (Buffer.isBuffer(val)) return `'\\x${val.toString("hex")}'`;
  if (typeof val === "object") return client.escapeLiteral(JSON.stringify(val));
  return client.escapeLiteral(String(val));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let direction: "supa2neon" | "neon2supa" = "supa2neon";
  let verify = false;
  let force = false;

  for (const arg of args) {
    if (arg === "--verify") verify = true;
    if (arg === "--force") force = true;
    if (arg === "--direction=neon2supa") direction = "neon2supa";
    if (arg === "--direction=supa2neon") direction = "supa2neon";
  }

  return { direction, verify, force };
}

async function getColumnNames(client: pg.Client, table: string): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((r: { column_name: string }) => r.column_name);
}

async function resetSequence(client: pg.Client, table: string) {
  try {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX("id") FROM "${table}"), 0) + 1, false)`
    );
  } catch {
    // no serial sequence
  }
}

async function main() {
  const { direction, verify, force } = parseArgs();

  const srcLabel = direction === "supa2neon" ? "Supabase" : "Neon";
  const dstLabel = direction === "supa2neon" ? "Neon" : "Supabase";
  const srcUrl = direction === "supa2neon" ? SUPABASE_URL : NEON_URL;
  const dstUrl = direction === "supa2neon" ? NEON_URL : SUPABASE_URL;

  console.log(`\n🔄 SYNCHRONISATION DB: ${srcLabel} → ${dstLabel}`);
  if (verify) console.log("   Mode: VÉRIFICATION SEULE");
  if (force) console.log("   Mode: FORCE (TRUNCATE + COPY)");
  console.log("=".repeat(60));

  const src = new pg.Client({ connectionString: srcUrl });
  const dst = new pg.Client({ connectionString: dstUrl });

  try {
    await src.connect();
    console.log(`✅ Source (${srcLabel}) connectée`);
    await dst.connect();
    console.log(`✅ Destination (${dstLabel}) connectée\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Erreur de connexion: ${msg}`);
    console.error(
      "\n💡 Si Neon est bloqué (quota compute), attendez le 1er du mois pour la réinitialisation."
    );
    process.exit(1);
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  try {
    // Disable FK on destination
    try {
      await dst.query("SET session_replication_role = 'replica';");
    } catch {
      console.log("  ℹ️  session_replication_role non supporté, on continue sans");
    }

    for (const table of TABLES_ORDERED) {
      if (SKIP_TABLES.includes(table.name)) {
        console.log(`⏭️  "${table.name}" — ignorée (sessions éphémères)`);
        continue;
      }

      const srcCount = parseInt(
        (await src.query(`SELECT count(*) as c FROM "${table.name}"`)).rows[0].c
      );
      const dstCount = parseInt(
        (await dst.query(`SELECT count(*) as c FROM "${table.name}"`)).rows[0].c
      );

      if (srcCount === 0 && dstCount === 0) {
        console.log(`⏭️  "${table.name}" — vide des deux côtés`);
        continue;
      }

      if (srcCount === dstCount && !force) {
        // Quick check: compare PKs
        const srcPKs = (
          await src.query(`SELECT "${table.pk}" FROM "${table.name}" ORDER BY "${table.pk}"`)
        ).rows.map((r) => String(r[table.pk]));
        const dstPKs = (
          await dst.query(`SELECT "${table.pk}" FROM "${table.name}" ORDER BY "${table.pk}"`)
        ).rows.map((r) => String(r[table.pk]));

        if (JSON.stringify(srcPKs) === JSON.stringify(dstPKs)) {
          console.log(`✅ "${table.name}" — ${srcCount} lignes synchronisées`);
          continue;
        }
      }

      console.log(
        `📊 "${table.name}" — Source: ${srcCount}, Destination: ${dstCount}`
      );

      if (verify) {
        if (srcCount !== dstCount) {
          console.log(`   ⚠️  Différence de ${srcCount - dstCount} lignes`);
        }
        continue;
      }

      if (force) {
        // TRUNCATE and re-copy everything
        await dst.query(`TRUNCATE "${table.name}" CASCADE`);
        console.log(`   🗑️  Table vidée`);
      }

      // Get column info from source
      const cols = await getColumnNames(src, table.name);
      const colList = cols.map((c) => `"${c}"`).join(", ");

      // Get existing PKs in destination
      const existingPKs = new Set(
        (
          await dst.query(`SELECT "${table.pk}" FROM "${table.name}"`)
        ).rows.map((r) => String(r[table.pk]))
      );

      // Read all source rows
      const { rows: srcRows } = await src.query(
        `SELECT ${colList} FROM "${table.name}" ORDER BY "${table.pk}"`
      );

      let inserted = 0;
      const batchSize = 50;

      // Filter rows not in destination
      const newRows = srcRows.filter(
        (r) => !existingPKs.has(String(r[table.pk]))
      );

      if (newRows.length === 0 && !force) {
        console.log(`   ✅ Aucune nouvelle ligne à insérer`);
        continue;
      }

      const rowsToInsert = force ? srcRows : newRows;

      for (let i = 0; i < rowsToInsert.length; i += batchSize) {
        const batch = rowsToInsert.slice(i, i + batchSize);
        const valueRows = batch.map(
          (row) =>
            `(${cols.map((c) => escapeLiteral(dst, row[c])).join(", ")})`
        );

        try {
          const sql = `INSERT INTO "${table.name}" (${colList}) VALUES ${valueRows.join(",\n")} ON CONFLICT DO NOTHING`;
          const result = await dst.query(sql);
          inserted += result.rowCount || 0;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`   ❌ Erreur batch: ${msg.substring(0, 120)}`);
          totalErrors++;
          // Try row by row
          for (const row of batch) {
            try {
              const singleValues = `(${cols.map((c) => escapeLiteral(dst, row[c])).join(", ")})`;
              await dst.query(
                `INSERT INTO "${table.name}" (${colList}) VALUES ${singleValues} ON CONFLICT DO NOTHING`
              );
              inserted++;
            } catch {
              totalErrors++;
            }
          }
        }
      }

      console.log(`   ✅ ${inserted} lignes insérées`);
      totalInserted += inserted;

      if (table.serial) {
        await resetSequence(dst, table.name);
      }
    }

    // Re-enable FK
    try {
      await dst.query("SET session_replication_role = 'origin';");
    } catch { /* ignore */ }

    // Final counts
    console.log("\n" + "=".repeat(60));
    console.log("📊 RÉSUMÉ");
    console.log("=".repeat(60));

    for (const table of TABLES_ORDERED) {
      if (SKIP_TABLES.includes(table.name)) continue;
      const sc = (await src.query(`SELECT count(*) as c FROM "${table.name}"`)).rows[0].c;
      const dc = (await dst.query(`SELECT count(*) as c FROM "${table.name}"`)).rows[0].c;
      const status = sc === dc ? "✅" : "⚠️ ";
      console.log(`  ${status} "${table.name}": ${srcLabel}=${sc} | ${dstLabel}=${dc}`);
    }

    console.log(`\n  Lignes insérées: ${totalInserted}`);
    console.log(`  Erreurs: ${totalErrors}`);

    if (totalErrors === 0 && !verify) {
      console.log(`\n🎉 Synchronisation ${srcLabel} → ${dstLabel} terminée !`);
    } else if (verify) {
      console.log(`\n📋 Vérification terminée.`);
    } else {
      console.log(`\n⚠️  Synchronisation terminée avec ${totalErrors} erreur(s).`);
    }
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((e) => {
  console.error("Erreur fatale:", e);
  process.exit(1);
});
