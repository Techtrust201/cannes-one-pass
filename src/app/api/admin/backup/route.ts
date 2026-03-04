import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg = require("pg");

const TABLES_ORDERED = [
  { name: "user", pk: "id" },
  { name: "account", pk: "id" },
  { name: "verification", pk: "id" },
  { name: "user_permission", pk: "id" },
  { name: "Event", pk: "id" },
  { name: "ZoneConfig", pk: "id" },
  { name: "Accreditation", pk: "id" },
  { name: "Vehicle", pk: "id" },
  { name: "ZoneMovement", pk: "id" },
  { name: "AccreditationEmailHistory", pk: "id" },
  { name: "AccreditationHistory", pk: "id" },
  { name: "AccreditationHistoryArchive", pk: "id" },
  { name: "VehicleTimeSlot", pk: "id" },
  { name: "ChatMessage", pk: "id" },
  { name: "UnloadingProvider", pk: "id" },
];

const SKIP_TABLES = ["session"];
const BATCH_SIZE = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function escapeLiteral(client: any, val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return client.escapeLiteral(val.toISOString());
  if (Buffer.isBuffer(val)) return `'\\x${val.toString("hex")}'`;
  if (typeof val === "object") return client.escapeLiteral(JSON.stringify(val));
  return client.escapeLiteral(String(val));
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron) {
    try {
      await requireRole(req, "SUPER_ADMIN");
    } catch (error) {
      if (error instanceof Response) {
        return new Response(error.body, { status: error.status });
      }
      return new Response("Non autorisé", { status: 401 });
    }
  }

  const primaryUrl = process.env.DATABASE_URL;
  const backupUrl = process.env.BACKUP_DATABASE_URL;

  if (!primaryUrl || !backupUrl) {
    return Response.json(
      { success: false, error: "DATABASE_URL ou BACKUP_DATABASE_URL manquant" },
      { status: 500 }
    );
  }

  const src = new pg.Client({ connectionString: primaryUrl });
  const dst = new pg.Client({ connectionString: backupUrl });

  let totalInserted = 0;
  let totalErrors = 0;
  const tableReports: { table: string; src: number; dst: number; inserted: number }[] = [];

  try {
    await src.connect();
    await dst.connect();

    try {
      await dst.query("SET session_replication_role = 'replica';");
    } catch { /* ignore */ }

    for (const table of TABLES_ORDERED) {
      if (SKIP_TABLES.includes(table.name)) continue;

      let srcCount: number, dstCount: number;
      try {
        srcCount = parseInt((await src.query(`SELECT count(*) as c FROM "${table.name}"`)).rows[0].c);
        dstCount = parseInt((await dst.query(`SELECT count(*) as c FROM "${table.name}"`)).rows[0].c);
      } catch {
        continue;
      }

      if (srcCount === 0 && dstCount === 0) continue;
      if (srcCount === dstCount) {
        tableReports.push({ table: table.name, src: srcCount, dst: dstCount, inserted: 0 });
        continue;
      }

      const cols = (await src.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
        [table.name]
      )).rows.map((r: { column_name: string }) => r.column_name);
      const colList = cols.map((c: string) => `"${c}"`).join(", ");

      const existingPKs = new Set(
        (await dst.query(`SELECT "${table.pk}" FROM "${table.name}"`)).rows.map(
          (r: Record<string, unknown>) => String(r[table.pk])
        )
      );

      const { rows: srcRows } = await src.query(
        `SELECT ${colList} FROM "${table.name}" ORDER BY "${table.pk}"`
      );

      const newRows = srcRows.filter(
        (r: Record<string, unknown>) => !existingPKs.has(String(r[table.pk]))
      );

      let inserted = 0;
      for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
        const batch = newRows.slice(i, i + BATCH_SIZE);
        const valueRows = batch.map(
          (row: Record<string, unknown>) =>
            `(${cols.map((c: string) => escapeLiteral(dst, row[c])).join(", ")})`
        );

        try {
          const result = await dst.query(
            `INSERT INTO "${table.name}" (${colList}) VALUES ${valueRows.join(",\n")} ON CONFLICT DO NOTHING`
          );
          inserted += result.rowCount || 0;
        } catch {
          totalErrors++;
          for (const row of batch) {
            try {
              const singleValues = `(${cols.map((c: string) => escapeLiteral(dst, row[c])).join(", ")})`;
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

      totalInserted += inserted;
      const newDstCount = parseInt(
        (await dst.query(`SELECT count(*) as c FROM "${table.name}"`)).rows[0].c
      );
      tableReports.push({ table: table.name, src: srcCount, dst: newDstCount, inserted });
    }

    try {
      await dst.query("SET session_replication_role = 'origin';");
    } catch { /* ignore */ }

    const report = {
      success: true,
      totalInserted,
      totalErrors,
      tables: tableReports,
      timestamp: new Date().toISOString(),
    };

    console.log("[backup] Rapport :", JSON.stringify(report));
    return Response.json(report);
  } catch (error) {
    console.error("[backup] Erreur :", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 }
    );
  } finally {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  }
}
