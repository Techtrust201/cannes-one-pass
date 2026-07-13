/**
 * Validation ponctuelle des fichiers Excel RX officiels (hors suite Vitest).
 *
 * Usage :
 *   npx tsx scripts/validate-rx-import-files.ts \
 *     --referential=/chemin/CYF26-listeTT-1007.xlsx \
 *     --planning=/chemin/CYF26-planning\ \(1\).xlsx
 *
 * Aucune ecriture DB / Neon. Parse uniquement en memoire et affiche les
 * compteurs attendus pour la recette RX.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { parseImportFile } from "../src/lib/imports/file-parse";
import { parseReferentialTable } from "../src/lib/imports/referential";
import { parseRxPlanningWorkbook } from "../src/lib/imports/planning-rx-adapter";
import { buildScopeKey } from "../src/lib/imports/planning";
import { RX_LEGACY_PORT_NORMALIZED } from "../src/lib/imports/referential-rx-geography";

function parseArgs() {
  const args = process.argv.slice(2);
  let referential: string | null = null;
  let planning: string | null = null;
  for (const a of args) {
    if (a.startsWith("--referential=")) referential = resolve(a.slice("--referential=".length));
    else if (a.startsWith("--planning=")) planning = resolve(a.slice("--planning=".length));
  }
  if (!referential || !planning) {
    console.error(
      "Usage: npx tsx scripts/validate-rx-import-files.ts --referential=<path.xlsx> --planning=<path.xlsx>"
    );
    process.exit(1);
  }
  return { referential, planning };
}

function validateReferential(path: string) {
  const buffer = new Uint8Array(readFileSync(path));
  const table = parseImportFile({
    buffer,
    fileName: path.split("/").pop() ?? "referential.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const res = parseReferentialTable(table, { rxProfile: true });
  const locations = res.exhibitors.flatMap((e) => e.locations);

  let terreOnly = 0,
    flotOnly = 0,
    both = 0,
    none = 0;
  for (const rec of table.records) {
    const t = (rec["NUM-TERRE"] ?? "").trim();
    const f = (rec["NUM-FLOT"] ?? "").trim();
    if (t && f) both++;
    else if (t) terreOnly++;
    else if (f) flotOnly++;
    else none++;
  }

  const rxNorm = res.warnings.filter((w) => w.reason === RX_LEGACY_PORT_NORMALIZED);
  const conflicts = res.warnings.filter((w) => w.reason.includes("PORT_SECTOR_CONFLICT"));

  console.log("=== REFERENTIEL ===");
  console.log({
    file: path,
    totalRows: res.totalRows,
    exhibitors: res.exhibitors.length,
    locations: locations.length,
    terre: locations.filter((l) => l.type === "TERRE").length,
    flot: locations.filter((l) => l.type === "FLOT").length,
    terreOnly,
    flotOnly,
    both,
    none,
    rxNorm: rxNorm.length,
    conflicts: conflicts.length,
    errors: res.errors.length,
  });

  return { res, locations };
}

function validatePlanning(path: string) {
  const buffer = new Uint8Array(readFileSync(path));
  const res = parseRxPlanningWorkbook(buffer);
  const byPhase: Record<string, number> = {};
  const byCat: Record<string, number> = {};
  const keys = new Set<string>();
  let dup = 0;
  for (const row of res.rows) {
    byPhase[row.phase] = (byPhase[row.phase] ?? 0) + 1;
    byCat[row.categoryCode] = (byCat[row.categoryCode] ?? 0) + 1;
    const k = [row.scopeKey, row.categoryCode, row.phase, row.date, row.startTime, row.endTime].join("|");
    if (keys.has(k)) dup++;
    keys.add(k);
  }

  console.log("=== PLANNING ===");
  console.log({
    file: path,
    rows: res.rows.length,
    byPhase,
    byCat,
    dup,
    warnings: res.warnings.length,
    errors: res.errors.length,
  });

  return res;
}

function validateRapprochement(
  refLocations: ReturnType<typeof validateReferential>["locations"],
  plan: ReturnType<typeof validatePlanning>
) {
  const refPalaisExt = refLocations.filter(
    (l) => l.sectorCode === "PALAIS_EXT" && l.portCode === "PALAIS"
  );
  const planKeys = new Set(
    plan.rows
      .filter((r) => r.sectorCode === "PALAIS_EXT" && r.portCode === "PALAIS")
      .map((r) => r.scopeKey)
  );
  console.log("=== RAPPROCHEMENT PALAIS ext ===");
  console.log({
    refPalaisExt: refPalaisExt.length,
    planHasScopeKey: planKeys.has("SECTOR:PALAIS:PALAIS_EXT"),
    allMatch: refPalaisExt.every((loc) => {
      const key = buildScopeKey("SECTOR", loc.portCode, loc.sectorCode, null);
      return key != null && plan.rows.some((r) => r.scopeKey === key);
    }),
  });
}

const { referential, planning } = parseArgs();
const { locations } = validateReferential(referential);
const plan = validatePlanning(planning);
validateRapprochement(locations, plan);
