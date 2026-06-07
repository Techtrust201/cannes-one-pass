/**
 * Génère `src/templates/accreditation/rx/planning-data.ts` à partir du
 * planning officiel RX `CYF26-planning.xlsx`.
 *
 * Le XLSX a deux sections (MONTAGE puis DEMONTAGE), chacune avec, par ligne :
 *   PORT | ZONE T-T | PONTON PRIVATIF(4 col) | TERRE(4 col) | BATEAUX A TERRE(4 col)
 * où chaque bloc de 4 colonnes = Jour début, Heure début, Jour fin, Heure fin.
 *
 * Usage :
 *   npx tsx scripts/import-rx-planning.ts /chemin/vers/CYF26-planning.xlsx
 *   (défaut : ~/Téléchargements/CYF26-planning.xlsx)
 *
 * Règles de découpage : cf. en-tête de planning-data.ts.
 */
import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

type Slots = Record<string, string>;
type CatId = "ponton-privatif" | "stand-tente" | "bateau-terre";
const CATS: CatId[] = ["ponton-privatif", "stand-tente", "bateau-terre"];

const SPACE_OF: Record<string, string> = {
  "PORT CANTO|SAIL Multicoque": "SAIL",
  "PORT CANTO|SAIL Monocoque": "SAIL",
  "PORT CANTO|POWER": "POWER",
  "PORT CANTO|BROKER & TOYS": "BROKER",
  "VIEUX PORT|QML": "QML",
  "VIEUX PORT|QSP": "QSP",
  "VIEUX PORT|PAN": "PANTIERO",
  "VIEUX PORT|JETEE": "JETEE",
  "VIEUX PORT|PALAIS int - NU": "INTERIEUR_PALAIS",
  "VIEUX PORT|PALAIS int - Equipe": "INTERIEUR_PALAIS",
  "VIEUX PORT|PALAIS ext": "EXTERIEUR_PALAIS",
};

const SPACE_ORDER = [
  "INTERIEUR_PALAIS", "EXTERIEUR_PALAIS", "QML", "QSP", "PANTIERO",
  "JETEE", "SYE", "TENDERS", "BROKER", "SAIL", "POWER",
];

function excelToDate(n: number): string {
  // Base Excel 1900 (avec correction du 30/12/1899).
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return d.toISOString().slice(0, 10);
}
function excelToHour(n: number): string {
  const h = Math.round(n * 24);
  return `${String(h).padStart(2, "0")}:00`;
}

type Plage = [string, string, string, string] | null;
function readPlage(row: unknown[], base: number): Plage {
  const ds = row[base], hs = row[base + 1], de = row[base + 2], he = row[base + 3];
  const isNA = (v: unknown) => v === undefined || v === "" || v === "N/A";
  if (isNA(ds) || isNA(de)) return null;
  return [
    excelToDate(Number(ds)),
    excelToHour(Number(hs)),
    excelToDate(Number(de)),
    excelToHour(Number(he)),
  ];
}

function dateRange(ds: string, de: string): string[] {
  const out: string[] = [];
  const a = new Date(`${ds}T00:00:00Z`);
  const b = new Date(`${de}T00:00:00Z`);
  for (let d = a; d <= b; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function plageToSlots(p: Plage): Slots {
  if (!p) return {};
  const [ds, hs, de, he] = p;
  const days = dateRange(ds, de);
  const out: Slots = {};
  days.forEach((day, i) => {
    const start = i === 0 ? hs : "08:00";
    const end = i === days.length - 1 ? he : "23:00";
    out[day] = `${start}-${end}`;
  });
  return out;
}

function mergeSlots(a: Slots, b: Slots): Slots {
  const out: Slots = { ...a };
  for (const [day, rng] of Object.entries(b)) {
    if (out[day]) {
      const [s1, e1] = out[day].split("-");
      const [s2, e2] = rng.split("-");
      out[day] = `${s1 < s2 ? s1 : s2}-${e1 > e2 ? e1 : e2}`;
    } else {
      out[day] = rng;
    }
  }
  return out;
}

function main() {
  const file =
    process.argv[2] ?? resolve(homedir(), "Téléchargements", "CYF26-planning.xlsx");
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });

  // Repère les sections : les marqueurs MONTAGE / DEMONTAGE peuvent se
  // trouver dans une cellule fusionnée (souvent colonne C), on scanne donc
  // toute la ligne.
  const rowHas = (r: unknown[], label: string) =>
    r.some((c) => String(c ?? "").trim().toUpperCase() === label);
  let montageStart = -1;
  let demontageStart = -1;
  rows.forEach((r, i) => {
    if (montageStart < 0 && rowHas(r, "MONTAGE")) montageStart = i;
    if (rowHas(r, "DEMONTAGE")) demontageStart = i;
  });
  if (montageStart < 0 || demontageStart < 0) {
    throw new Error("Sections MONTAGE / DEMONTAGE introuvables dans le XLSX.");
  }

  const data: Record<string, Record<CatId, { liv: Slots; rep: Slots }>> = {};
  const ensure = (sp: string) => {
    if (!data[sp]) {
      data[sp] = {
        "ponton-privatif": { liv: {}, rep: {} },
        "stand-tente": { liv: {}, rep: {} },
        "bateau-terre": { liv: {}, rep: {} },
      };
    }
    return data[sp];
  };

  const parseSection = (start: number, end: number, phase: "liv" | "rep") => {
    // +3 : marqueur de section + 2 lignes d'en-tête.
    for (let i = start + 3; i < end; i++) {
      const r = rows[i];
      if (!r || !r[0] || !r[1]) continue;
      const sp = SPACE_OF[`${String(r[0]).trim()}|${String(r[1]).trim()}`];
      if (!sp) continue;
      const target = ensure(sp);
      const plages: Plage[] = [readPlage(r, 2), readPlage(r, 6), readPlage(r, 10)];
      CATS.forEach((cat, idx) => {
        const slots = plageToSlots(plages[idx]);
        if (Object.keys(slots).length > 0) {
          target[cat][phase] = mergeSlots(target[cat][phase], slots);
        }
      });
    }
  };

  parseSection(montageStart, demontageStart, "liv");
  parseSection(demontageStart, rows.length, "rep");

  // SYE / TENDERS : pas dans le planning officiel → règles équivalentes à
  // l'Extérieur Palais (espaces proches du Palais).
  const ext = data["EXTERIEUR_PALAIS"];
  if (ext) {
    data["SYE"] = JSON.parse(JSON.stringify(ext));
    data["TENDERS"] = JSON.parse(JSON.stringify(ext));
  }

  // Émission du fichier TS.
  const emitSlots = (s: Slots) => {
    const keys = Object.keys(s).sort();
    if (keys.length === 0) return "{}";
    return `{ ${keys.map((k) => `"${k}": "${s[k]}"`).join(", ")} }`;
  };
  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * Planning CYF26 — données générées depuis `CYF26-planning.xlsx`.");
  lines.push(" *");
  lines.push(" * NE PAS ÉDITER À LA MAIN : régénéré par `scripts/import-rx-planning.ts`.");
  lines.push(" * Voir l'en-tête historique pour la convention de découpage.");
  lines.push(" */");
  lines.push("");
  lines.push('export type DateTimeSlots = Record<string, string>;');
  lines.push('export type RxCategoryId = "ponton-privatif" | "stand-tente" | "bateau-terre";');
  lines.push("");
  lines.push("export const RX_PLANNING: Record<");
  lines.push("  string,");
  lines.push("  Record<RxCategoryId, { liv: DateTimeSlots; rep: DateTimeSlots }>");
  lines.push("> = {");
  for (const sp of SPACE_ORDER) {
    const d = data[sp];
    if (!d) continue;
    lines.push(`  ${sp}: {`);
    for (const cat of CATS) {
      lines.push(
        `    "${cat}": { liv: ${emitSlots(d[cat].liv)}, rep: ${emitSlots(d[cat].rep)} },`
      );
    }
    lines.push("  },");
  }
  lines.push("};");
  lines.push("");

  const outPath = resolve(
    process.cwd(),
    "src/templates/accreditation/rx/planning-data.generated.ts"
  );
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`✓ Planning généré : ${outPath}`);
  console.log("  Reportez RX_PLANNING dans planning-data.ts après revue.");
}

main();
