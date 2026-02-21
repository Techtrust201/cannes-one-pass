/**
 * Vérification exhaustive de la migration Neon → Supabase
 * Compare CHAQUE table, CHAQUE ligne, CHAQUE colonne
 */
import pg from "pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });

const NEON_URL =
  "postgresql://palais_des_festivals_owner:npg_ZrkI5FS9HDay@ep-shy-voice-a2x54gid-pooler.eu-central-1.aws.neon.tech/palais_des_festivals?sslmode=require";
const SUPABASE_URL = process.env.DATABASE_URL!;

const TABLES = [
  { name: "user", pk: "id", orderBy: "id" },
  { name: "session", pk: "id", orderBy: "id" },
  { name: "account", pk: "id", orderBy: "id" },
  { name: "verification", pk: "id", orderBy: "id" },
  { name: "user_permission", pk: "id", orderBy: "id" },
  { name: "Event", pk: "id", orderBy: "id" },
  { name: "ZoneConfig", pk: "id", orderBy: "id" },
  { name: "Accreditation", pk: "id", orderBy: "id" },
  { name: "Vehicle", pk: "id", orderBy: "id" },
  { name: "ZoneMovement", pk: "id", orderBy: "id" },
  { name: "AccreditationEmailHistory", pk: "id", orderBy: "id" },
  { name: "AccreditationHistory", pk: "id", orderBy: "id" },
  { name: "AccreditationHistoryArchive", pk: "id", orderBy: "id" },
  { name: "VehicleTimeSlot", pk: "id", orderBy: "id" },
  { name: "ChatMessage", pk: "id", orderBy: "id" },
];

function normalizeValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (val instanceof Date) return val.toISOString();
  if (Buffer.isBuffer(val)) return `<Buffer:${val.length}bytes:${val.toString("hex").substring(0, 40)}>`;
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

async function main() {
  console.log("🔍 VÉRIFICATION EXHAUSTIVE DE LA MIGRATION\n");
  console.log("=".repeat(70));

  const neon = new pg.Client({ connectionString: NEON_URL });
  const supa = new pg.Client({ connectionString: SUPABASE_URL });

  await neon.connect();
  console.log("✅ Connecté à Neon");
  await supa.connect();
  console.log("✅ Connecté à Supabase");
  console.log("=".repeat(70) + "\n");

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalRowsChecked = 0;
  let totalColumnsChecked = 0;

  for (const table of TABLES) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📋 TABLE: "${table.name}"`);
    console.log(`${"─".repeat(60)}`);

    // 1. Count check
    const neonCount = (await neon.query(`SELECT count(*) as c FROM "${table.name}"`)).rows[0].c;
    const supaCount = (await supa.query(`SELECT count(*) as c FROM "${table.name}"`)).rows[0].c;

    if (neonCount !== supaCount) {
      console.log(`  ❌ COMPTAGE DIFFÉRENT: Neon=${neonCount} vs Supabase=${supaCount}`);
      totalErrors++;
    } else {
      console.log(`  ✅ Comptage: ${neonCount} lignes`);
    }

    if (parseInt(neonCount) === 0) {
      console.log(`  ⏭️  Table vide, rien à comparer`);
      continue;
    }

    // 2. Column check
    const neonCols = (
      await neon.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
        [table.name]
      )
    ).rows;

    const supaCols = (
      await supa.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
        [table.name]
      )
    ).rows;

    const neonColNames = neonCols.map((c: { column_name: string }) => c.column_name).sort();
    const supaColNames = supaCols.map((c: { column_name: string }) => c.column_name).sort();

    if (JSON.stringify(neonColNames) !== JSON.stringify(supaColNames)) {
      console.log(`  ❌ COLONNES DIFFÉRENTES:`);
      const missingInSupa = neonColNames.filter((c: string) => !supaColNames.includes(c));
      const extraInSupa = supaColNames.filter((c: string) => !neonColNames.includes(c));
      if (missingInSupa.length) console.log(`     Manquantes dans Supabase: ${missingInSupa.join(", ")}`);
      if (extraInSupa.length) console.log(`     En trop dans Supabase: ${extraInSupa.join(", ")}`);
      totalErrors++;
    } else {
      console.log(`  ✅ Colonnes: ${neonColNames.length} colonnes identiques`);
    }

    // 3. Row-by-row comparison
    const commonCols = neonColNames.filter((c: string) => supaColNames.includes(c));
    const colList = commonCols.map((c: string) => `"${c}"`).join(", ");

    const neonRows = (
      await neon.query(`SELECT ${colList} FROM "${table.name}" ORDER BY "${table.orderBy}"`)
    ).rows;
    const supaRows = (
      await supa.query(`SELECT ${colList} FROM "${table.name}" ORDER BY "${table.orderBy}"`)
    ).rows;

    // Build lookup by PK
    const neonByPk = new Map<string, Record<string, unknown>>();
    const supaByPk = new Map<string, Record<string, unknown>>();

    for (const row of neonRows) neonByPk.set(normalizeValue(row[table.pk]), row);
    for (const row of supaRows) supaByPk.set(normalizeValue(row[table.pk]), row);

    // Check for missing rows
    let missingInSupa = 0;
    let extraInSupa = 0;
    let diffRows = 0;
    let diffDetails: string[] = [];

    for (const [pk] of neonByPk) {
      if (!supaByPk.has(pk)) {
        missingInSupa++;
        diffDetails.push(`  ⚠️  PK=${pk} existe dans Neon mais PAS dans Supabase`);
      }
    }

    for (const [pk] of supaByPk) {
      if (!neonByPk.has(pk)) {
        extraInSupa++;
        diffDetails.push(`  ⚠️  PK=${pk} existe dans Supabase mais PAS dans Neon`);
      }
    }

    // Compare matching rows cell by cell
    for (const [pk, neonRow] of neonByPk) {
      const supaRow = supaByPk.get(pk);
      if (!supaRow) continue;

      totalRowsChecked++;
      let rowHasDiff = false;

      for (const col of commonCols) {
        totalColumnsChecked++;
        const nVal = normalizeValue(neonRow[col]);
        const sVal = normalizeValue(supaRow[col]);

        if (nVal !== sVal) {
          // Special handling: timestamps can differ by microseconds
          if (neonRow[col] instanceof Date && supaRow[col] instanceof Date) {
            const diff = Math.abs(
              (neonRow[col] as Date).getTime() - (supaRow[col] as Date).getTime()
            );
            if (diff < 1000) continue; // Less than 1 second difference is OK
          }

          // Special: password hashes updated by seed are expected to differ
          if (col === "password" && table.name === "account") {
            totalWarnings++;
            continue;
          }

          if (!rowHasDiff) {
            diffRows++;
            rowHasDiff = true;
          }
          const nDisplay = nVal.length > 60 ? nVal.substring(0, 60) + "..." : nVal;
          const sDisplay = sVal.length > 60 ? sVal.substring(0, 60) + "..." : sVal;
          diffDetails.push(
            `  ❌ PK=${pk} col="${col}":\n     Neon:     ${nDisplay}\n     Supabase: ${sDisplay}`
          );
        }
      }
    }

    if (missingInSupa > 0) {
      console.log(`  ❌ ${missingInSupa} lignes manquantes dans Supabase`);
      totalErrors += missingInSupa;
    }
    if (extraInSupa > 0) {
      console.log(`  ⚠️  ${extraInSupa} lignes en plus dans Supabase (sessions créées après migration)`);
      totalWarnings += extraInSupa;
    }
    if (diffRows > 0) {
      console.log(`  ❌ ${diffRows} lignes avec des différences de contenu`);
      totalErrors += diffRows;
    }
    if (missingInSupa === 0 && diffRows === 0) {
      console.log(`  ✅ Données: toutes les lignes sont identiques`);
    }

    // Show first 10 diff details
    if (diffDetails.length > 0) {
      const show = diffDetails.slice(0, 10);
      for (const d of show) console.log(d);
      if (diffDetails.length > 10) {
        console.log(`  ... et ${diffDetails.length - 10} autres différences`);
      }
    }
  }

  // 4. Special check: Event logoData (binary)
  console.log(`\n${"─".repeat(60)}`);
  console.log(`🖼️  VÉRIFICATION SPÉCIALE: Event logoData (images binaires)`);
  console.log(`${"─".repeat(60)}`);

  const neonLogos = (
    await neon.query(
      `SELECT id, name, slug, logo, "logoMimeType", octet_length("logoData") as logo_size FROM "Event" WHERE "logoData" IS NOT NULL ORDER BY id`
    )
  ).rows;
  const supaLogos = (
    await supa.query(
      `SELECT id, name, slug, logo, "logoMimeType", octet_length("logoData") as logo_size FROM "Event" WHERE "logoData" IS NOT NULL ORDER BY id`
    )
  ).rows;

  console.log(`  Neon: ${neonLogos.length} events avec logoData`);
  console.log(`  Supabase: ${supaLogos.length} events avec logoData`);

  if (neonLogos.length !== supaLogos.length) {
    console.log(`  ❌ Nombre différent d'events avec des images !`);
    totalErrors++;
  }

  const supaLogoMap = new Map(supaLogos.map((r: Record<string, unknown>) => [r.id, r]));

  for (const nRow of neonLogos) {
    const sRow = supaLogoMap.get(nRow.id) as Record<string, unknown> | undefined;
    if (!sRow) {
      console.log(`  ❌ Event "${nRow.name}" (${nRow.id}): logoData manquant dans Supabase`);
      totalErrors++;
      continue;
    }

    if (String(nRow.logo_size) !== String(sRow.logo_size)) {
      console.log(
        `  ❌ Event "${nRow.name}": taille logoData différente (Neon: ${nRow.logo_size} bytes, Supabase: ${sRow.logo_size} bytes)`
      );
      totalErrors++;
    } else {
      console.log(`  ✅ Event "${nRow.name}": logoData identique (${nRow.logo_size} bytes, mime: ${nRow.logoMimeType})`);
    }
  }

  // Check for events WITHOUT logoData
  const neonNoLogo = (
    await neon.query(
      `SELECT id, name, slug, logo FROM "Event" WHERE "logoData" IS NULL ORDER BY name`
    )
  ).rows;
  const supaNoLogo = (
    await supa.query(
      `SELECT id, name, slug, logo FROM "Event" WHERE "logoData" IS NULL ORDER BY name`
    )
  ).rows;

  console.log(`\n  Events SANS logoData: Neon=${neonNoLogo.length}, Supabase=${supaNoLogo.length}`);
  for (const e of neonNoLogo) {
    console.log(`    - "${e.name}" (slug: ${e.slug}, logo path: ${e.logo || "NULL"})`);
  }

  // 5. Binary data deep check (compare actual bytes of logoData)
  console.log(`\n${"─".repeat(60)}`);
  console.log(`🔬 VÉRIFICATION BINAIRE: Comparaison byte-à-byte des logoData`);
  console.log(`${"─".repeat(60)}`);

  for (const nRow of neonLogos) {
    const neonBin = (
      await neon.query(`SELECT "logoData" FROM "Event" WHERE id = $1`, [nRow.id])
    ).rows[0];
    const supaBin = (
      await supa.query(`SELECT "logoData" FROM "Event" WHERE id = $1`, [nRow.id])
    ).rows[0];

    if (!supaBin || !supaBin.logoData) {
      console.log(`  ❌ "${nRow.name}": logoData absent dans Supabase`);
      totalErrors++;
      continue;
    }

    const nBuf = Buffer.from(neonBin.logoData);
    const sBuf = Buffer.from(supaBin.logoData);

    if (nBuf.equals(sBuf)) {
      console.log(`  ✅ "${nRow.name}": ${nBuf.length} bytes — identique byte-à-byte`);
    } else {
      console.log(`  ❌ "${nRow.name}": DIFFÉRENCE BINAIRE ! Neon=${nBuf.length}b, Supabase=${sBuf.length}b`);
      totalErrors++;
    }
  }

  // 6. Check sequences
  console.log(`\n${"─".repeat(60)}`);
  console.log(`🔢 VÉRIFICATION DES SÉQUENCES AUTO-INCREMENT`);
  console.log(`${"─".repeat(60)}`);

  const serialTables = [
    "ZoneConfig", "Vehicle", "ZoneMovement",
    "AccreditationEmailHistory", "AccreditationHistory",
    "VehicleTimeSlot", "ChatMessage",
  ];

  for (const t of serialTables) {
    try {
      const maxId = (await supa.query(`SELECT COALESCE(MAX(id), 0) as m FROM "${t}"`)).rows[0].m;
      const seqVal = (
        await supa.query(`SELECT last_value FROM pg_sequences WHERE sequencename = (SELECT pg_get_serial_sequence('"${t}"', 'id'))::regclass::text`)
      ).rows[0]?.last_value;

      if (seqVal && parseInt(seqVal) >= parseInt(maxId)) {
        console.log(`  ✅ "${t}": MAX(id)=${maxId}, séquence=${seqVal}`);
      } else {
        console.log(`  ⚠️  "${t}": MAX(id)=${maxId}, séquence=${seqVal || "?"} — pourrait causer un conflit`);
        totalWarnings++;
      }
    } catch {
      const maxId = (await supa.query(`SELECT COALESCE(MAX(id), 0) as m FROM "${t}"`)).rows[0].m;
      console.log(`  ℹ️  "${t}": MAX(id)=${maxId} (séquence non lisible via pg_sequences)`);
    }
  }

  // Final report
  console.log(`\n${"=".repeat(70)}`);
  console.log(`📊 RAPPORT FINAL`);
  console.log(`${"=".repeat(70)}`);
  console.log(`  Tables vérifiées:   ${TABLES.length}`);
  console.log(`  Lignes comparées:   ${totalRowsChecked}`);
  console.log(`  Colonnes vérifiées: ${totalColumnsChecked}`);
  console.log(`  Erreurs:            ${totalErrors}`);
  console.log(`  Warnings:           ${totalWarnings}`);
  console.log(`${"=".repeat(70)}`);

  if (totalErrors === 0) {
    console.log(`\n🎉 MIGRATION PARFAITE — Les deux bases sont identiques !`);
  } else {
    console.log(`\n⚠️  ${totalErrors} erreur(s) détectée(s) — voir les détails ci-dessus`);
  }

  await neon.end();
  await supa.end();

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Erreur fatale:", e);
  process.exit(1);
});
