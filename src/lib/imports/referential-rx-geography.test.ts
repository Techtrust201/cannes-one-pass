import { describe, it, expect } from "vitest";
import {
  tryRxReferentialPortNormalization,
  isRxReferentialPalaisExtZone,
  RX_LEGACY_PORT_NORMALIZED,
} from "./referential-rx-geography";
import { parseReferentialTable } from "./referential";
import { parseImportFile } from "./file-parse";
import { buildRxPlanningRows } from "./planning-rx-adapter";
import { buildScopeKey } from "./planning";

const NINE_LINES = [
  { name: "MG ENERGY", code: "PALAIS132" },
  { name: "WINDY", code: "TENDER 101" },
  { name: "BELLINI", code: "TENDER 103" },
  { name: "DE ANTONIO", code: "TENDER 105" },
  { name: "MUSSINI GIORGI", code: "TENDER 107" },
  { name: "CUPRICREST", code: "TENDER 109" },
  { name: "FRAUSCHER", code: "TENDER 111" },
  { name: "AICON", code: "TENDER 113" },
  { name: "TECHNOHULL", code: "TENDER 115" },
] as const;

describe("tryRxReferentialPortNormalization", () => {
  it("VIEUX PORT + PALAIS ext -> normalisation PALAIS", () => {
    const n = tryRxReferentialPortNormalization("VIEUX PORT", "PALAIS ext");
    expect(n).toEqual({
      normalizedPort: "PALAIS",
      sourcePort: "VIEUX PORT",
      sourceSector: "PALAIS ext",
    });
  });

  it("PALAIS + PALAIS ext -> pas de normalisation RX", () => {
    expect(tryRxReferentialPortNormalization("PALAIS", "PALAIS ext")).toBeNull();
  });

  it("VIEUX PORT + PALAIS int - NU -> pas de normalisation RX (generique prudent)", () => {
    expect(tryRxReferentialPortNormalization("VIEUX PORT", "PALAIS int - NU")).toBeNull();
  });

  it("isRxReferentialPalaisExtZone", () => {
    expect(isRxReferentialPalaisExtZone("PALAIS ext")).toBe(true);
    expect(isRxReferentialPalaisExtZone("PALAIS int - NU")).toBe(false);
  });
});

describe("9 lignes RX officielles — profil rxProfile (fixture synthetique)", () => {
  const csvHeader = "PORT,ZONE T-T,PLAN,NUM-TERRE,NUM-FLOT";
  const csvRows = NINE_LINES.map((l) => `VIEUX PORT,PALAIS ext,${l.name},${l.code},`);
  const res = parseReferentialTable(
    parseImportFile({
      buffer: new TextEncoder().encode([csvHeader, ...csvRows].join("\n")),
      fileName: "ref.csv",
      mimeType: "text/csv",
    }),
    { rxProfile: true }
  );

  it.each(NINE_LINES)("$name / $code : geographie canonique PALAIS_EXT", ({ code }) => {
    const loc = res.exhibitors
      .flatMap((e) => e.locations)
      .find((l) => l.codeNormalized === code.replace(/\s+/g, "") || l.code === code);
    expect(loc, `emplacement ${code}`).toBeDefined();
    expect(loc!.portCode).toBe("PALAIS");
    expect(loc!.sectorCode).toBe("PALAIS_EXT");
    expect(loc!.logisticSpace).toBe("EXTERIEUR_PALAIS");
    expect(loc!.ambiguous).toBe(false);
    expect(loc!.warningReason).toBe(RX_LEGACY_PORT_NORMALIZED);
  });

  it("aucun PORT_SECTOR_CONFLICT sur les 9 lignes", () => {
    expect(res.warnings.some((w) => w.reason.includes("PORT_SECTOR_CONFLICT"))).toBe(false);
    expect(
      res.exhibitors.flatMap((e) => e.locations).every((l) => l.warningReason !== "PORT_SECTOR_CONFLICT")
    ).toBe(true);
  });

  it("9 warnings RX_LEGACY_PORT_NORMALIZED structures", () => {
    const rxWarnings = res.warnings.filter((w) => w.reason === RX_LEGACY_PORT_NORMALIZED);
    expect(rxWarnings).toHaveLength(9);
    expect(rxWarnings[0]).toMatchObject({
      reason: RX_LEGACY_PORT_NORMALIZED,
      sourcePort: "VIEUX PORT",
      sourceSector: "PALAIS ext",
      normalizedPortCode: "PALAIS",
      normalizedSectorCode: "PALAIS_EXT",
    });
  });

  it("scopeKey compatible SECTOR:PALAIS:PALAIS_EXT", () => {
    for (const loc of res.exhibitors.flatMap((e) => e.locations)) {
      expect(buildScopeKey("SECTOR", loc.portCode, loc.sectorCode, null)).toBe(
        "SECTOR:PALAIS:PALAIS_EXT"
      );
    }
  });
});

describe("rapprochement referentiel RX <-> planning RX (PALAIS ext, en memoire)", () => {
  it("un emplacement importe retrouve les regles du planning correspondant", () => {
    const ref = parseReferentialTable(
      parseImportFile({
        buffer: new TextEncoder().encode(
          "PORT,ZONE T-T,PLAN,NUM-TERRE\nVIEUX PORT,PALAIS ext,WINDY,TENDER 101\n"
        ),
        fileName: "ref.csv",
        mimeType: "text/csv",
      }),
      { rxProfile: true }
    );
    const loc = ref.exhibitors[0]!.locations[0]!;
    const refKey = buildScopeKey("SECTOR", loc.portCode, loc.sectorCode, null);

    const planRows = [
      ["", "", "MONTAGE"],
      ["", "", ""],
      ["", "", ""],
      ["VIEUX PORT", "PALAIS ext", "", "", "", "", 46268, 0.333, 46268, 0.958, "N/A", "N/A", "N/A", "N/A"],
      ["", "", "DEMONTAGE"],
      ["", "", ""],
      ["", "", ""],
      ["VIEUX PORT", "PALAIS ext", "N/A", "N/A", "N/A", "N/A", 46278, 0.792, 46279, 0.5, "N/A", "N/A", "N/A", "N/A"],
    ];
    const plan = buildRxPlanningRows(planRows);
    const planKeys = new Set(plan.rows.map((r) => r.scopeKey));

    expect(refKey).toBe("SECTOR:PALAIS:PALAIS_EXT");
    expect(planKeys.has(refKey!)).toBe(true);
    expect(plan.rows.some((r) => r.scopeKey === refKey && r.sectorCode === "PALAIS_EXT")).toBe(true);
  });
});
