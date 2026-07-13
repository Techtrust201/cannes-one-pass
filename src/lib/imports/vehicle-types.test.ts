import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";
import {
  parseVehicleTypesTable,
  applyVehicleTypesCommit,
  type VehicleTypesCommitTx,
  type ParsedVehicleTypeRow,
} from "./vehicle-types";

const HEADERS =
  "CODE,LABEL,GABARIT,TONNAGE MINI,TONNAGE MOYEN,TONNAGE MAXI,CO2 COEFFICIENT,PDF CODE,COLOR,SHOW TRAILER PLATE,RX PALM BEACH AT CANTO,RX ZONE CANTO,RX ZONE VIEUX PORT,SORT ORDER,IS ACTIVE,VEHICLE FAMILY";

function csv(rows: string): ReturnType<typeof parseCsv> {
  return parseCsv(`${HEADERS}\n${rows}`);
}

describe("parseVehicleTypesTable", () => {
  it("parse une ligne valide (LIGHT)", () => {
    const result = parseVehicleTypesTable(csv("vl,Vehicule leger,VL,0,1.5,3.5,0.2,A,green,non,non,,,1,oui,light"));
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]!.code).toBe("VL");
    expect(result.rows[0]!.vehicleFamily).toBe("LIGHT");
    expect(result.rows[0]!.tonnageMoyen).toBeCloseTo(1.5);
  });

  it("accepte les decimales FR (virgule) via un CSV delimite par point-virgule", () => {
    const table = parseCsv(
      `${HEADERS.replace(/,/g, ";")}\nPORTEUR;Porteur;Porteur;3,5;12,0;19,0;0,9;C;blue;oui;non;;;2;oui;heavy`
    );
    const result = parseVehicleTypesTable(table);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]!.tonnageMini).toBeCloseTo(3.5);
    expect(result.rows[0]!.vehicleFamily).toBe("HEAVY");
  });

  it("champs numeriques obligatoires manquants -> erreur", () => {
    const result = parseVehicleTypesTable(csv("PORTEUR,Porteur,Porteur,,12,19,0.9,,,,,,,,,"));
    expect(result.errors[0]!.reason).toMatch(/INVALID_TONNAGE_MINI/);
  });

  it("vehicleFamily invalide -> erreur explicite (jamais deduite)", () => {
    const result = parseVehicleTypesTable(
      csv("PORTEUR,Porteur,Porteur,3.5,12,19,0.9,,,,,,,,,MEDIUM")
    );
    expect(result.errors[0]!.reason).toMatch(/INVALID_VEHICLE_FAMILY/);
  });

  it("vehicleFamily vide -> null, jamais inventee", () => {
    const result = parseVehicleTypesTable(csv("PORTEUR,Porteur,Porteur,3.5,12,19,0.9,,,,,,,,,"));
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]!.vehicleFamily).toBeNull();
  });

  it("code duplique dans le meme fichier -> warning non bloquant", () => {
    const result = parseVehicleTypesTable(
      csv("VL,Vehicule leger,VL,0,1.5,3.5,0.2,,,,,,,,,\nvl,VL bis,VL,0,1.5,3.5,0.2,,,,,,,,,")
    );
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.reason.includes("DUPLICATE_CODE"))).toBe(true);
  });

  it("refuse la colonne interdite ORGANIZATION ID", () => {
    const table = parseCsv(
      "CODE,LABEL,GABARIT,TONNAGE MINI,TONNAGE MOYEN,TONNAGE MAXI,CO2 COEFFICIENT,ORGANIZATION ID\nVL,VL,VL,0,1.5,3.5,0.2,org-injecte"
    );
    const result = parseVehicleTypesTable(table);
    expect(result.errors.some((e) => e.reason.includes("FORBIDDEN_COLUMN"))).toBe(true);
  });
});

describe("applyVehicleTypesCommit — FUSION", () => {
  const baseRow: ParsedVehicleTypeRow = {
    line: 2,
    code: "VL",
    codeRaw: "vl",
    label: "Vehicule leger",
    gabarit: "VL",
    tonnageMini: 0,
    tonnageMoyen: 1.5,
    tonnageMaxi: 3.5,
    co2Coefficient: 0.2,
    pdfCode: null,
    color: null,
    showTrailerPlate: null,
    rxPalmBeachAtCanto: null,
    rxZoneCanto: null,
    rxZoneVieuxPort: null,
    sortOrder: null,
    isActive: null,
    vehicleFamily: "LIGHT",
  };

  function makeTx(existing: unknown = null) {
    const calls = { create: [] as unknown[], update: [] as unknown[] };
    const tx: VehicleTypesCommitTx = {
      vehicleTypeConfig: {
        findFirst: async () => existing as never,
        create: async (args) => {
          calls.create.push(args);
          return { id: 1 };
        },
        update: async (args) => {
          calls.update.push(args);
          return {};
        },
      },
    };
    return { tx, calls };
  }

  it("cree un gabarit absent (famille LIGHT immediatement usable)", async () => {
    const { tx, calls } = makeTx(null);
    const result = await applyVehicleTypesCommit(tx, [baseRow], { organizationId: "org-1" });
    expect(result.created).toBe(1);
    const data = (calls.create[0] as { data: Record<string, unknown> }).data;
    expect(data.vehicleFamily).toBe("LIGHT");
    expect(data.organizationId).toBe("org-1");
  });

  it("met a jour si un champ differe", async () => {
    const existing = {
      id: 9,
      label: "Ancien",
      gabarit: baseRow.gabarit,
      tonnageMini: baseRow.tonnageMini,
      tonnageMoyen: baseRow.tonnageMoyen,
      tonnageMaxi: baseRow.tonnageMaxi,
      co2Coefficient: baseRow.co2Coefficient,
      pdfCode: "C",
      color: "gray",
      showTrailerPlate: false,
      rxPalmBeachAtCanto: false,
      rxZoneCanto: null,
      rxZoneVieuxPort: null,
      sortOrder: 0,
      isActive: true,
      vehicleFamily: "HEAVY" as const,
    };
    const { tx, calls } = makeTx(existing);
    const result = await applyVehicleTypesCommit(tx, [baseRow], { organizationId: "org-1" });
    expect(result.updated).toBe(1);
    expect(calls.update).toHaveLength(1);
  });

  it("unchanged si identique", async () => {
    const existing = {
      id: 9,
      label: baseRow.label,
      gabarit: baseRow.gabarit,
      tonnageMini: baseRow.tonnageMini,
      tonnageMoyen: baseRow.tonnageMoyen,
      tonnageMaxi: baseRow.tonnageMaxi,
      co2Coefficient: baseRow.co2Coefficient,
      pdfCode: "C",
      color: "gray",
      showTrailerPlate: false,
      rxPalmBeachAtCanto: false,
      rxZoneCanto: null,
      rxZoneVieuxPort: null,
      sortOrder: 0,
      isActive: true,
      vehicleFamily: "LIGHT" as const,
    };
    const { tx, calls } = makeTx(existing);
    const result = await applyVehicleTypesCommit(tx, [baseRow], { organizationId: "org-1" });
    expect(result.unchanged).toBe(1);
    expect(calls.update).toHaveLength(0);
  });

  it("scoping organisation : findFirst filtre par organizationId + code", async () => {
    let receivedWhere: unknown;
    const tx: VehicleTypesCommitTx = {
      vehicleTypeConfig: {
        findFirst: async (args) => {
          receivedWhere = args.where;
          return null;
        },
        create: async () => ({ id: 1 }),
        update: async () => ({}),
      },
    };
    await applyVehicleTypesCommit(tx, [baseRow], { organizationId: "org-42" });
    expect(receivedWhere).toEqual({ organizationId: "org-42", code: "VL" });
  });
});
