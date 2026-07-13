import { describe, it, expect } from "vitest";
import {
  buildRxPlanningRows,
  excelSerialToIsoDate,
  excelFractionToTime,
} from "./planning-rx-adapter";
import type { PlanningRow } from "./planning";

function isoToSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
function hourFraction(h: number, m = 0): number {
  return (h * 60 + m) / (24 * 60);
}

/** Construit une ligne de 14 colonnes : PORT, ZONE, 3 blocs de 4 colonnes. */
function dataRow(
  port: string,
  zone: string,
  blocks: {
    ponton?: [string, number, string, number];
    terre?: [string, number, string, number];
    bateau?: [string, number, string, number];
  }
): unknown[] {
  const row: unknown[] = new Array(14).fill("");
  row[0] = port;
  row[1] = zone;
  const put = (base: number, b?: [string, number, string, number]) => {
    if (!b) return;
    row[base] = isoToSerial(b[0]);
    row[base + 1] = hourFraction(b[1]);
    row[base + 2] = isoToSerial(b[2]);
    row[base + 3] = hourFraction(b[3]);
  };
  put(2, blocks.ponton);
  put(6, blocks.terre);
  put(10, blocks.bateau);
  return row;
}

const HEADER = ["", "", ""];

function find(rows: PlanningRow[], sector: string, cat: string, phase: string, date: string) {
  return rows.find(
    (r) => r.sectorCode === sector && r.categoryCode === cat && r.phase === phase && r.date === date
  );
}

describe("helpers Excel", () => {
  it("serie Excel -> date ISO", () => {
    expect(excelSerialToIsoDate(isoToSerial("2026-09-16"))).toBe("2026-09-16");
  });
  it("fraction Excel -> HH:MM", () => {
    expect(excelFractionToTime(hourFraction(12))).toBe("12:00");
    expect(excelFractionToTime(hourFraction(17))).toBe("17:00");
    expect(excelFractionToTime(hourFraction(8, 30))).toBe("08:30");
  });
});

describe("buildRxPlanningRows — cas reels RX (scope SECTEUR)", () => {
  it("POWER / BATEAUX A TERRE / DEMONTAGE 16-09 12:00 -> 17-09 17:00 (decoupe quotidienne)", () => {
    const rows: unknown[][] = [
      ["", "", "MONTAGE"],
      HEADER,
      HEADER,
      dataRow("PORT CANTO", "POWER", {}),
      ["", "", "DEMONTAGE"],
      HEADER,
      HEADER,
      dataRow("PORT CANTO", "POWER", {
        bateau: ["2026-09-16", 12, "2026-09-17", 17],
      }),
    ];
    const res = buildRxPlanningRows(rows);
    expect(res.errors).toEqual([]);

    const d16 = find(res.rows, "POWER", "BATEAUX_A_TERRE", "DEMONTAGE", "2026-09-16");
    const d17 = find(res.rows, "POWER", "BATEAUX_A_TERRE", "DEMONTAGE", "2026-09-17");
    expect(d16).toMatchObject({ startTime: "12:00", endTime: "23:00", scope: "SECTOR" });
    expect(d16!.scopeKey).toBe("SECTOR:PORT_CANTO:POWER");
    expect(d17).toMatchObject({ startTime: "08:00", endTime: "17:00" });
  });

  it("BROKER & TOYS / TERRE / DEMONTAGE 13-09 19:00 -> 14-09 12:00", () => {
    const rows: unknown[][] = [
      ["", "", "MONTAGE"],
      HEADER,
      HEADER,
      dataRow("PORT CANTO", "BROKER & TOYS", {}),
      ["", "", "DEMONTAGE"],
      HEADER,
      HEADER,
      dataRow("PORT CANTO", "BROKER & TOYS", {
        terre: ["2026-09-13", 19, "2026-09-14", 12],
      }),
    ];
    const res = buildRxPlanningRows(rows);
    const d13 = find(res.rows, "BROKER", "TERRE", "DEMONTAGE", "2026-09-13");
    const d14 = find(res.rows, "BROKER", "TERRE", "DEMONTAGE", "2026-09-14");
    expect(d13).toMatchObject({ startTime: "19:00", endTime: "23:00" });
    expect(d14).toMatchObject({ startTime: "08:00", endTime: "12:00" });
  });

  it("MONTAGE produit la phase MONTAGE", () => {
    const rows: unknown[][] = [
      ["", "", "MONTAGE"],
      HEADER,
      HEADER,
      dataRow("VIEUX PORT", "JETEE", { ponton: ["2026-09-01", 8, "2026-09-01", 18] }),
      ["", "", "DEMONTAGE"],
      HEADER,
      HEADER,
      dataRow("VIEUX PORT", "JETEE", {}),
    ];
    const res = buildRxPlanningRows(rows);
    const m = find(res.rows, "JETEE", "PONTON_PRIVATIF", "MONTAGE", "2026-09-01");
    expect(m).toMatchObject({ startTime: "08:00", endTime: "18:00", scope: "SECTOR" });
  });

  it("SAIL Multicoque et Monocoque NE fusionnent PAS (secteurs distincts)", () => {
    const rows: unknown[][] = [
      ["", "", "MONTAGE"],
      HEADER,
      HEADER,
      dataRow("PORT CANTO", "SAIL Multicoque", { ponton: ["2026-09-02", 9, "2026-09-02", 15] }),
      dataRow("PORT CANTO", "SAIL Monocoque", { ponton: ["2026-09-02", 7, "2026-09-02", 12] }),
      ["", "", "DEMONTAGE"],
      HEADER,
      HEADER,
      dataRow("PORT CANTO", "POWER", {}),
    ];
    const res = buildRxPlanningRows(rows);
    const sectors = new Set(res.rows.map((r) => r.sectorCode));
    expect(sectors.has("SAIL_MULTICOQUE")).toBe(true);
    expect(sectors.has("SAIL_MONOCOQUE")).toBe(true);
    expect(find(res.rows, "SAIL_MULTICOQUE", "PONTON_PRIVATIF", "MONTAGE", "2026-09-02")).toMatchObject({
      startTime: "09:00",
      endTime: "15:00",
    });
    expect(find(res.rows, "SAIL_MONOCOQUE", "PONTON_PRIVATIF", "MONTAGE", "2026-09-02")).toMatchObject({
      startTime: "07:00",
      endTime: "12:00",
    });
  });

  it("EXCEPTION RX : VIEUX PORT normalise vers PALAIS pour PALAIS int/ext (+warning)", () => {
    const rows: unknown[][] = [
      ["", "", "MONTAGE"],
      HEADER,
      HEADER,
      dataRow("VIEUX PORT", "PALAIS int - NU", { terre: ["2026-09-03", 8, "2026-09-03", 18] }),
      dataRow("VIEUX PORT", "PALAIS int - Equipe", { terre: ["2026-09-03", 8, "2026-09-03", 18] }),
      dataRow("VIEUX PORT", "PALAIS ext", { terre: ["2026-09-03", 8, "2026-09-03", 18] }),
      ["", "", "DEMONTAGE"],
      HEADER,
      HEADER,
      dataRow("PORT CANTO", "POWER", {}),
    ];
    const res = buildRxPlanningRows(rows);

    const nu = find(res.rows, "PALAIS_INT_NU", "TERRE", "MONTAGE", "2026-09-03");
    const eq = find(res.rows, "PALAIS_INT_EQUIPE", "TERRE", "MONTAGE", "2026-09-03");
    const ext = find(res.rows, "PALAIS_EXT", "TERRE", "MONTAGE", "2026-09-03");
    // Port normalise vers PALAIS => cle identique au referentiel.
    expect(nu).toMatchObject({ portCode: "PALAIS", scopeKey: "SECTOR:PALAIS:PALAIS_INT_NU" });
    expect(eq).toMatchObject({ portCode: "PALAIS", scopeKey: "SECTOR:PALAIS:PALAIS_INT_EQUIPE" });
    expect(ext).toMatchObject({ portCode: "PALAIS", scopeKey: "SECTOR:PALAIS:PALAIS_EXT" });
    // Trois warnings de normalisation.
    expect(res.warnings.filter((w) => w.reason.includes("RX_LEGACY_PORT_NORMALIZED"))).toHaveLength(3);
  });

  it("couple PORT|ZONE inconnu -> warning, pas d'erreur silencieuse", () => {
    const rows: unknown[][] = [
      ["", "", "MONTAGE"],
      HEADER,
      HEADER,
      dataRow("PORT INCONNU", "ZONE X", { ponton: ["2026-09-02", 9, "2026-09-02", 15] }),
      ["", "", "DEMONTAGE"],
      HEADER,
      HEADER,
      dataRow("PORT CANTO", "POWER", {}),
    ];
    const res = buildRxPlanningRows(rows);
    expect(res.rows).toEqual([]);
    expect(res.warnings.some((w) => w.reason.includes("non resolu"))).toBe(true);
  });

  it("sections manquantes -> erreur", () => {
    const res = buildRxPlanningRows([
      ["PORT CANTO", "POWER", ""],
      ["x", "y", "z"],
    ]);
    expect(res.errors.some((e) => e.reason.includes("MONTAGE / DEMONTAGE"))).toBe(true);
  });
});

describe("rapprochement referentiel <-> planning (meme scopeKey)", () => {
  it("un emplacement PALAIS_INT_NU retrouve sa regle de planning", async () => {
    const { parseReferentialCsv } = await import("./referential");
    const { buildScopeKey } = await import("./planning");

    // Referentiel reel : PORT = PALAIS.
    const ref = parseReferentialCsv(
      "PORT,ZONE T-T,PLAN,NUM-TERRE\nPALAIS,PALAIS int - NU,FEDERATION,PALAIS064\n"
    );
    const location = ref.exhibitors[0].locations[0];
    const refKey = buildScopeKey("SECTOR", location.portCode, location.sectorCode, null);

    // Planning reel : PORT = VIEUX PORT -> normalise vers PALAIS.
    const rows: unknown[][] = [
      ["", "", "MONTAGE"],
      HEADER,
      HEADER,
      dataRow("VIEUX PORT", "PALAIS int - NU", { terre: ["2026-09-03", 8, "2026-09-03", 18] }),
      ["", "", "DEMONTAGE"],
      HEADER,
      HEADER,
      dataRow("PORT CANTO", "POWER", {}),
    ];
    const plan = buildRxPlanningRows(rows);
    const planKey = plan.rows[0].scopeKey;

    expect(refKey).toBe("SECTOR:PALAIS:PALAIS_INT_NU");
    expect(planKey).toBe(refKey);
  });
});
