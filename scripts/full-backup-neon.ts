/**
 * Backup complet : Primaire → Backup
 *
 * TRUNCATE toutes les tables sur la base de backup puis recopie
 * intégralement depuis la base primaire. Vérifie l'intégrité à la fin.
 *
 * Usage : npx tsx scripts/full-backup-neon.ts
 *
 * Variables d'environnement :
 *   DATABASE_URL        = base primaire (source)
 *   BACKUP_DATABASE_URL = base de backup (destination)
 */
import pg from "pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const PRIMARY_URL = process.env.DATABASE_URL;
const BACKUP_URL = process.env.BACKUP_DATABASE_URL;

if (!PRIMARY_URL) {
  console.error("❌ DATABASE_URL non définie");
  process.exit(1);
}
if (!BACKUP_URL) {
  console.error("❌ BACKUP_DATABASE_URL non définie");
  process.exit(1);
}

function extractHost(url: string): string {
  try {
    const match = url.match(/@([^:/]+)/);
    return match ? match[1] : url;
  } catch {
    return url;
  }
}

const srcLabel = extractHost(PRIMARY_URL);
const dstLabel = extractHost(BACKUP_URL);

const TABLES_ORDERED = [
  { name: "_prisma_migrations", pk: "id", serial: false },
  { name: "user", pk: "id", serial: false },
  { name: "account", pk: "id", serial: false },
  { name: "verification", pk: "id", serial: false },
  { name: "user_permission", pk: "id", serial: false },
  { name: "Event", pk: "id", serial: false },
  { name: "ZoneConfig", pk: "id", serial: true },
  { name: "UnloadingProvider", pk: "id", serial: false },
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
const BATCH_SIZE = 50;

function escapeLiteral(client: pg.Client, val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return client.escapeLiteral(val.toISOString());
  if (Buffer.isBuffer(val)) return `'\\x${val.toString("hex")}'`;
  if (typeof val === "object") return client.escapeLiteral(JSON.stringify(val));
  return client.escapeLiteral(String(val));
}

async function getColumnNames(
  client: pg.Client,
  table: string
): Promise<string[]> {
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
    // pas de séquence serial
  }
}

async function main() {
  const startTime = Date.now();

  console.log("\n" + "=".repeat(60));
  console.log("  BACKUP COMPLET : Primaire → Backup");
  console.log("  " + new Date().toISOString());
  console.log(`  Source  : ${srcLabel}`);
  console.log(`  Dest    : ${dstLabel}`);
  console.log("=".repeat(60));

  const src = new pg.Client({ connectionString: PRIMARY_URL });
  const dst = new pg.Client({ connectionString: BACKUP_URL });

  try {
    await src.connect();
    console.log(`\n✅ Source (${srcLabel}) connectée`);
    await dst.connect();
    console.log(`✅ Destination (${dstLabel}) connectée`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Erreur de connexion: ${msg}`);
    process.exit(1);
  }

  // ─── Phase 1 : Pré-vérification des schémas ───────────────────

  console.log("\n" + "─".repeat(60));
  console.log("  PHASE 1 : Vérification des schémas");
  console.log("─".repeat(60));

  for (const table of TABLES_ORDERED) {
    const srcCols = await getColumnNames(src, table.name);
    const dstCols = await getColumnNames(dst, table.name);

    if (srcCols.length === 0) {
      console.log(`⚠️  "${table.name}" n'existe pas sur la source — ignorée`);
      continue;
    }
    if (dstCols.length === 0) {
      console.error(
        `❌ "${table.name}" n'existe pas sur la destination ! Lancez prisma migrate deploy d'abord.`
      );
      process.exit(1);
    }

    const missingSrc = srcCols.filter((c) => !dstCols.includes(c));
    if (missingSrc.length > 0) {
      console.error(
        `❌ "${table.name}" : colonnes manquantes sur la destination : ${missingSrc.join(", ")}`
      );
      process.exit(1);
    }

    console.log(
      `✅ "${table.name}" — ${srcCols.length} colonnes, schéma OK`
    );
  }

  // ─── Phase 2 : Backup (TRUNCATE + COPY) ───────────────────────

  console.log("\n" + "─".repeat(60));
  console.log("  PHASE 2 : Backup des données");
  console.log("─".repeat(60));

  let totalRows = 0;
  let totalInserted = 0;
  let totalErrors = 0;

  const tableReport: {
    name: string;
    srcCount: number;
    inserted: number;
    dstCount: number;
    status: string;
  }[] = [];

  try {
    await dst.query("SET session_replication_role = 'replica';");
    console.log("🔓 Contraintes FK désactivées sur la destination\n");
  } catch {
    console.log(
      "ℹ️  session_replication_role non supporté, on continue\n"
    );
  }

  for (const table of TABLES_ORDERED) {
    if (SKIP_TABLES.includes(table.name)) {
      console.log(`⏭️  "${table.name}" — ignorée (sessions éphémères)`);
      continue;
    }

    const srcCountRes = await src.query(
      `SELECT count(*) as c FROM "${table.name}"`
    );
    const srcCount = parseInt(srcCountRes.rows[0].c);
    totalRows += srcCount;

    if (srcCount === 0) {
      await dst.query(`TRUNCATE "${table.name}" CASCADE`);
      console.log(`⏭️  "${table.name}" — vide, destination vidée aussi`);
      tableReport.push({
        name: table.name,
        srcCount: 0,
        inserted: 0,
        dstCount: 0,
        status: "OK",
      });
      continue;
    }

    console.log(`📋 "${table.name}" — ${srcCount} lignes à copier...`);

    await dst.query(`TRUNCATE "${table.name}" CASCADE`);

    const cols = await getColumnNames(src, table.name);
    const colList = cols.map((c) => `"${c}"`).join(", ");

    const { rows: srcRows } = await src.query(
      `SELECT ${colList} FROM "${table.name}" ORDER BY "${table.pk}"`
    );

    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < srcRows.length; i += BATCH_SIZE) {
      const batch = srcRows.slice(i, i + BATCH_SIZE);
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
        console.error(`   ❌ Erreur batch: ${msg.substring(0, 150)}`);
        errors++;
        for (const row of batch) {
          try {
            const singleValues = `(${cols.map((c) => escapeLiteral(dst, row[c])).join(", ")})`;
            await dst.query(
              `INSERT INTO "${table.name}" (${colList}) VALUES ${singleValues} ON CONFLICT DO NOTHING`
            );
            inserted++;
          } catch (rowErr: unknown) {
            const rowMsg =
              rowErr instanceof Error ? rowErr.message : String(rowErr);
            console.error(
              `   ❌ Erreur ligne: ${rowMsg.substring(0, 150)}`
            );
            errors++;
          }
        }
      }
    }

    if (table.serial) {
      await resetSequence(dst, table.name);
    }

    const dstCountRes = await dst.query(
      `SELECT count(*) as c FROM "${table.name}"`
    );
    const dstCount = parseInt(dstCountRes.rows[0].c);

    const status = dstCount === srcCount ? "OK" : "MISMATCH";
    const icon = status === "OK" ? "✅" : "❌";
    console.log(
      `   ${icon} ${inserted} insérées, Backup=${dstCount}/${srcCount} ${status !== "OK" ? "⚠️  DIFFÉRENCE !" : ""}`
    );

    totalInserted += inserted;
    totalErrors += errors;

    tableReport.push({
      name: table.name,
      srcCount,
      inserted,
      dstCount,
      status,
    });
  }

  try {
    await dst.query("SET session_replication_role = 'origin';");
    console.log("\n🔒 Contraintes FK réactivées sur la destination");
  } catch {
    /* ignore */
  }

  // ─── Phase 3 : Vérification d'intégrité ───────────────────────

  console.log("\n" + "─".repeat(60));
  console.log("  PHASE 3 : Vérification d'intégrité");
  console.log("─".repeat(60) + "\n");

  let allGood = true;

  for (const table of TABLES_ORDERED) {
    if (SKIP_TABLES.includes(table.name)) continue;

    const srcRes = await src.query(
      `SELECT count(*) as c FROM "${table.name}"`
    );
    const dstRes = await dst.query(
      `SELECT count(*) as c FROM "${table.name}"`
    );
    const sc = parseInt(srcRes.rows[0].c);
    const dc = parseInt(dstRes.rows[0].c);

    if (sc !== dc) {
      console.log(
        `❌ "${table.name}" : Source=${sc}, Backup=${dc} — DIFFÉRENCE DE ${sc - dc} LIGNES`
      );
      allGood = false;
    } else {
      console.log(`✅ "${table.name}" : ${sc} lignes — OK`);
    }

    if (sc > 0 && dc > 0) {
      const srcPKs = (
        await src.query(
          `SELECT "${table.pk}" FROM "${table.name}" ORDER BY "${table.pk}" LIMIT 5`
        )
      ).rows.map((r: Record<string, unknown>) => String(r[table.pk]));
      const dstPKs = (
        await dst.query(
          `SELECT "${table.pk}" FROM "${table.name}" ORDER BY "${table.pk}" LIMIT 5`
        )
      ).rows.map((r: Record<string, unknown>) => String(r[table.pk]));

      if (JSON.stringify(srcPKs) !== JSON.stringify(dstPKs)) {
        console.log(`   ⚠️  Les premières PKs diffèrent !`);
        allGood = false;
      }

      const srcLastPKs = (
        await src.query(
          `SELECT "${table.pk}" FROM "${table.name}" ORDER BY "${table.pk}" DESC LIMIT 5`
        )
      ).rows.map((r: Record<string, unknown>) => String(r[table.pk]));
      const dstLastPKs = (
        await dst.query(
          `SELECT "${table.pk}" FROM "${table.name}" ORDER BY "${table.pk}" DESC LIMIT 5`
        )
      ).rows.map((r: Record<string, unknown>) => String(r[table.pk]));

      if (JSON.stringify(srcLastPKs) !== JSON.stringify(dstLastPKs)) {
        console.log(`   ⚠️  Les dernières PKs diffèrent !`);
        allGood = false;
      }
    }
  }

  // Vérification spéciale : archives
  console.log("\n--- Vérification des archives ---");
  try {
    const srcArchEvents = await src.query(
      `SELECT count(*) as c FROM "Event" WHERE "isArchived" = true`
    );
    const dstArchEvents = await dst.query(
      `SELECT count(*) as c FROM "Event" WHERE "isArchived" = true`
    );
    const se = parseInt(srcArchEvents.rows[0].c);
    const de = parseInt(dstArchEvents.rows[0].c);
    console.log(
      `${se === de ? "✅" : "❌"} Events archivés : Source=${se}, Backup=${de}`
    );
    if (se !== de) allGood = false;
  } catch {
    /* ignore */
  }

  try {
    const srcArchAccred = await src.query(
      `SELECT count(*) as c FROM "Accreditation" WHERE "isArchived" = true`
    );
    const dstArchAccred = await dst.query(
      `SELECT count(*) as c FROM "Accreditation" WHERE "isArchived" = true`
    );
    const sa = parseInt(srcArchAccred.rows[0].c);
    const da = parseInt(dstArchAccred.rows[0].c);
    console.log(
      `${sa === da ? "✅" : "❌"} Accreditations archivées : Source=${sa}, Backup=${da}`
    );
    if (sa !== da) allGood = false;
  } catch {
    /* ignore */
  }

  // Vérification séquences
  console.log("\n--- Vérification des séquences ---");
  for (const table of TABLES_ORDERED) {
    if (!table.serial) continue;
    try {
      const srcSeq = await src.query(
        `SELECT currval(pg_get_serial_sequence('"${table.name}"', 'id')) as v`
      );
      const dstSeq = await dst.query(
        `SELECT currval(pg_get_serial_sequence('"${table.name}"', 'id')) as v`
      );
      const sv = srcSeq.rows[0]?.v;
      const dv = dstSeq.rows[0]?.v;
      if (sv && dv) {
        console.log(
          `${sv === dv ? "✅" : "⚠️ "} "${table.name}" seq: Source=${sv}, Backup=${dv}`
        );
      }
    } catch {
      // currval pas encore appelé dans cette session
    }
  }

  // ─── Rapport final ────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(60));
  console.log("  RAPPORT FINAL");
  console.log("=".repeat(60));
  console.log("");

  for (const r of tableReport) {
    const icon = r.status === "OK" ? "✅" : "❌";
    console.log(
      `  ${icon} ${r.name.padEnd(35)} Source=${String(r.srcCount).padStart(5)} → Backup=${String(r.dstCount).padStart(5)}  (+${r.inserted})`
    );
  }

  console.log("");
  console.log(`  Total lignes source  : ${totalRows}`);
  console.log(`  Total insérées       : ${totalInserted}`);
  console.log(`  Erreurs              : ${totalErrors}`);
  console.log(`  Durée                : ${elapsed}s`);
  console.log("");

  if (allGood && totalErrors === 0) {
    console.log("🎉 BACKUP COMPLET RÉUSSI — Toutes les tables sont identiques !");
  } else {
    console.log("⚠️  BACKUP TERMINÉ AVEC DES PROBLÈMES — Vérifiez les erreurs ci-dessus");
  }

  console.log("=".repeat(60) + "\n");

  await src.end();
  await dst.end();

  process.exit(allGood && totalErrors === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("❌ Erreur fatale:", e);
  process.exit(1);
});
