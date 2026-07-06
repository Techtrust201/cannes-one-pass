/**
 * Import idempotent de capacités RX depuis un fichier CSV.
 *
 * Format CSV attendu (avec en-tête) :
 *   organizationId,eventId,zone,date,startTime,endTime,vehicleFamily,phase,capacity
 *
 * Comportement :
 *   - Dry-run par défaut : aucune écriture BDD, affiche ce qui serait fait.
 *   - Mode apply (--apply) : upsert idempotent sur la clé métier unique.
 *   - Toute ligne invalide est ignorée et rapportée, n'arrête pas le traitement.
 *
 * Usage :
 *   npx tsx scripts/import-rx-capacities.ts <fichier.csv>
 *   npx tsx scripts/import-rx-capacities.ts <fichier.csv> --apply
 *
 * Voir : docs/rx/rx-capacities-example.csv pour le format.
 */
import { createReadStream } from "fs";
import { resolve } from "path";
import { createInterface } from "readline";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

// ── Types ─────────────────────────────────────────────────────────────────────

type VehicleFamily = "LIGHT" | "HEAVY";
type RxPhase = "MONTAGE" | "DEMONTAGE";

interface ParsedRow {
  organizationId: string;
  eventId: string;
  zone: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: VehicleFamily;
  phase: RxPhase;
  capacity: number;
}

interface RowError {
  lineNumber: number;
  raw: string;
  errors: string[];
}

interface ParseResult {
  valid: ParsedRow[];
  invalid: RowError[];
}

// ── Validation ────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const VEHICLE_FAMILIES: VehicleFamily[] = ["LIGHT", "HEAVY"];
const PHASES: RxPhase[] = ["MONTAGE", "DEMONTAGE"];

function validateRow(
  raw: Record<string, string>,
  lineNumber: number
): { row: ParsedRow; errors: never[] } | { row: null; errors: string[] } {
  const errors: string[] = [];

  const organizationId = raw["organizationId"]?.trim() ?? "";
  const eventId = raw["eventId"]?.trim() ?? "";
  const zone = raw["zone"]?.trim() ?? "";
  const date = raw["date"]?.trim() ?? "";
  const startTime = raw["startTime"]?.trim() ?? "";
  const endTime = raw["endTime"]?.trim() ?? "";
  const vehicleFamilyRaw = raw["vehicleFamily"]?.trim().toUpperCase() ?? "";
  const phaseRaw = raw["phase"]?.trim().toUpperCase() ?? "";
  const capacityRaw = raw["capacity"]?.trim() ?? "";

  if (!organizationId) errors.push("organizationId est obligatoire");
  if (!eventId) errors.push("eventId est obligatoire");
  if (!zone) errors.push("zone est obligatoire");

  if (!date) {
    errors.push("date est obligatoire");
  } else if (!DATE_RE.test(date)) {
    errors.push(`date invalide "${date}" (attendu YYYY-MM-DD)`);
  }

  if (!startTime) {
    errors.push("startTime est obligatoire");
  } else if (!TIME_RE.test(startTime)) {
    errors.push(`startTime invalide "${startTime}" (attendu HH:MM)`);
  }

  if (!endTime) {
    errors.push("endTime est obligatoire");
  } else if (!TIME_RE.test(endTime)) {
    errors.push(`endTime invalide "${endTime}" (attendu HH:MM)`);
  }

  if (startTime && endTime && TIME_RE.test(startTime) && TIME_RE.test(endTime)) {
    if (startTime === endTime) {
      errors.push(`startTime et endTime sont identiques ("${startTime}")`);
    }
  }

  if (!vehicleFamilyRaw) {
    errors.push("vehicleFamily est obligatoire");
  } else if (!(VEHICLE_FAMILIES as string[]).includes(vehicleFamilyRaw)) {
    errors.push(`vehicleFamily invalide "${vehicleFamilyRaw}" (attendu LIGHT ou HEAVY)`);
  }

  if (!phaseRaw) {
    errors.push("phase est obligatoire");
  } else if (!(PHASES as string[]).includes(phaseRaw)) {
    errors.push(`phase invalide "${phaseRaw}" (attendu MONTAGE ou DEMONTAGE)`);
  }

  const capacity = parseInt(capacityRaw, 10);
  if (!capacityRaw) {
    errors.push("capacity est obligatoire");
  } else if (isNaN(capacity) || capacity <= 0 || !Number.isInteger(capacity)) {
    errors.push(`capacity invalide "${capacityRaw}" (attendu entier strictement positif)`);
  }

  if (errors.length > 0) {
    return { row: null, errors };
  }

  return {
    row: {
      organizationId,
      eventId,
      zone,
      date,
      startTime,
      endTime,
      vehicleFamily: vehicleFamilyRaw as VehicleFamily,
      phase: phaseRaw as RxPhase,
      capacity,
    },
    errors: [],
  };
}

// ── Parsing CSV ───────────────────────────────────────────────────────────────

const EXPECTED_HEADERS = [
  "organizationId",
  "eventId",
  "zone",
  "date",
  "startTime",
  "endTime",
  "vehicleFamily",
  "phase",
  "capacity",
] as const;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function readCsv(filePath: string): Promise<ParseResult> {
  const valid: ParsedRow[] = [];
  const invalid: RowError[] = [];

  const rl = createInterface({
    input: createReadStream(filePath, "utf8"),
    crlfDelay: Infinity,
  });

  let headers: string[] = [];
  let lineNumber = 0;
  let headerFound = false;

  for await (const line of rl) {
    lineNumber++;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const cells = parseCsvLine(trimmed);

    if (!headerFound) {
      headers = cells.map((h) => h.trim());
      const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        throw new Error(
          `En-tête CSV invalide — colonnes manquantes : ${missing.join(", ")}\n` +
            `Attendu : ${EXPECTED_HEADERS.join(",")}`
        );
      }
      headerFound = true;
      continue;
    }

    if (cells.every((c) => !c.trim())) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      raw[h] = cells[i] ?? "";
    });

    const result = validateRow(raw, lineNumber);
    if (result.row) {
      valid.push(result.row);
    } else {
      invalid.push({ lineNumber, raw: trimmed, errors: result.errors });
    }
  }

  return { valid, invalid };
}

// ── Détection creates / updates ───────────────────────────────────────────────

async function classifyRows(
  prisma: PrismaClient,
  rows: ParsedRow[]
): Promise<{ creates: ParsedRow[]; updates: ParsedRow[] }> {
  const creates: ParsedRow[] = [];
  const updates: ParsedRow[] = [];

  for (const row of rows) {
    const existing = await prisma.rxCapacity.findUnique({
      where: {
        organizationId_eventId_zone_date_startTime_endTime_vehicleFamily_phase: {
          organizationId: row.organizationId,
          eventId: row.eventId,
          zone: row.zone,
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          vehicleFamily: row.vehicleFamily,
          phase: row.phase,
        },
      },
      select: { id: true },
    });
    if (existing) {
      updates.push(row);
    } else {
      creates.push(row);
    }
  }

  return { creates, updates };
}

// ── Apply (upsert) ────────────────────────────────────────────────────────────

async function applyRows(prisma: PrismaClient, rows: ParsedRow[]): Promise<void> {
  for (const row of rows) {
    await prisma.rxCapacity.upsert({
      where: {
        organizationId_eventId_zone_date_startTime_endTime_vehicleFamily_phase: {
          organizationId: row.organizationId,
          eventId: row.eventId,
          zone: row.zone,
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          vehicleFamily: row.vehicleFamily,
          phase: row.phase,
        },
      },
      update: { capacity: row.capacity },
      create: {
        organizationId: row.organizationId,
        eventId: row.eventId,
        zone: row.zone,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        vehicleFamily: row.vehicleFamily,
        phase: row.phase,
        capacity: row.capacity,
      },
    });
  }
}

// ── Rapport ───────────────────────────────────────────────────────────────────

function printReport(opts: {
  totalRead: number;
  validCount: number;
  invalidCount: number;
  creates: ParsedRow[];
  updates: ParsedRow[];
  invalid: RowError[];
  dryRun: boolean;
  applied: boolean;
}): void {
  const { totalRead, validCount, invalidCount, creates, updates, invalid, dryRun, applied } = opts;

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log(
    dryRun
      ? "  RAPPORT D'IMPORT RX CAPACITÉS — DRY-RUN (aucune écriture)"
      : "  RAPPORT D'IMPORT RX CAPACITÉS — APPLY"
  );
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Lignes lues (hors en-tête) : ${totalRead}`);
  console.log(`  Lignes valides             : ${validCount}`);
  console.log(`  Lignes invalides           : ${invalidCount}`);
  console.log(`  Créations ${applied ? "effectuées" : "prévues"}          : ${creates.length}`);
  console.log(`  Mises à jour ${applied ? "effectuées" : "prévues"}       : ${updates.length}`);
  console.log("───────────────────────────────────────────────────────");

  if (invalid.length > 0) {
    console.log("  LIGNES INVALIDES :");
    for (const e of invalid) {
      console.log(`    ligne ${e.lineNumber} : ${e.errors.join(" | ")}`);
    }
    console.log("───────────────────────────────────────────────────────");
  }

  if (dryRun) {
    console.log("  → Mode dry-run : aucune écriture effectuée.");
    console.log("  → Relancez avec --apply pour appliquer.");
  } else if (applied) {
    console.log(`  ✓ Import terminé (${creates.length + updates.length} lignes écrites).`);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const applyMode = args.includes("--apply");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error(
      "Usage : npx tsx scripts/import-rx-capacities.ts <fichier.csv> [--apply]"
    );
    console.error("  Exemple : npx tsx scripts/import-rx-capacities.ts docs/rx/rx-capacities-example.csv");
    process.exit(1);
  }

  const resolvedPath = resolve(process.cwd(), filePath);
  console.log(`\nFichier CSV : ${resolvedPath}`);
  console.log(`Mode        : ${applyMode ? "APPLY (écriture BDD)" : "DRY-RUN (aucune écriture)"}\n`);

  // Parse CSV
  let parseResult: ParseResult;
  try {
    parseResult = await readCsv(resolvedPath);
  } catch (err) {
    console.error(`Erreur lecture CSV : ${(err as Error).message}`);
    process.exit(1);
  }

  const { valid, invalid } = parseResult;
  const totalRead = valid.length + invalid.length;

  if (totalRead === 0) {
    console.log("Le fichier CSV ne contient aucune ligne de données.");
    process.exit(0);
  }

  // Connexion Prisma
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    // Classement creates / updates
    const { creates, updates } = await classifyRows(prisma, valid);

    if (applyMode && valid.length > 0) {
      console.log(`Écriture de ${valid.length} lignes en cours…`);
      await applyRows(prisma, valid);

      printReport({
        totalRead,
        validCount: valid.length,
        invalidCount: invalid.length,
        creates,
        updates,
        invalid,
        dryRun: false,
        applied: true,
      });
    } else {
      printReport({
        totalRead,
        validCount: valid.length,
        invalidCount: invalid.length,
        creates,
        updates,
        invalid,
        dryRun: true,
        applied: false,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
