import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";
import {
  parseZonesTable,
  applyZonesCommit,
  normalizeZoneCode,
  type ZonesCommitTx,
  type ParsedZoneRow,
} from "./zones";

const HEADERS = "CODE,LABEL,ADDRESS,LATITUDE,LONGITUDE,IS FINAL DESTINATION,COLOR,IS ACTIVE,READER NAME,READER URL,READER ACTIVE";

function csv(rows: string): ReturnType<typeof parseCsv> {
  return parseCsv(`${HEADERS}\n${rows}`);
}

describe("parseZonesTable", () => {
  it("parse une ligne valide minimale", () => {
    const result = parseZonesTable(csv("la bocca,La Bocca,12 Av de la Bocca,43.5461,7.0128,,,,,,"));
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.zone).toBe("LA_BOCCA");
    expect(result.rows[0]!.latitude).toBeCloseTo(43.5461);
    expect(result.rows[0]!.longitude).toBeCloseTo(7.0128);
  });

  it("normalise le code (espaces/tirets -> _, comme POST /api/zones)", () => {
    expect(normalizeZoneCode("La Bocca - Est")).toBe("LA_BOCCA___EST");
  });

  it("rejette une ligne sans code", () => {
    const result = parseZonesTable(csv(",La Bocca,Adresse,43.5,7.0,,,,,,"));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.reason).toMatch(/MISSING_ZONE_CODE/);
  });

  it("rejette une latitude non numerique", () => {
    const result = parseZonesTable(csv("LA_BOCCA,La Bocca,Adresse,abc,7.0,,,,,,"));
    expect(result.errors[0]!.reason).toMatch(/INVALID_LATITUDE/);
  });

  it("rejette une readerUrl sans http(s)", () => {
    const result = parseZonesTable(
      csv("LA_BOCCA,La Bocca,Adresse,43.5,7.0,,,,,ftp://exemple.test,")
    );
    expect(result.errors[0]!.reason).toMatch(/INVALID_READER_URL/);
  });

  it("signale un doublon de code dans le meme fichier (warning, non bloquant)", () => {
    const result = parseZonesTable(
      csv(
        "LA_BOCCA,La Bocca,Adresse,43.5,7.0,,,,,,\nLA_BOCCA,La Bocca 2,Adresse 2,43.6,7.1,,,,,,"
      )
    );
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.reason.includes("DUPLICATE_ZONE_CODE"))).toBe(true);
  });

  it("refuse la colonne interdite ORGANIZATION ID (injection cliente)", () => {
    const table = parseCsv(
      "CODE,LABEL,ADDRESS,LATITUDE,LONGITUDE,ORGANIZATION ID\nLA_BOCCA,La Bocca,Adresse,43.5,7.0,org-injecte"
    );
    const result = parseZonesTable(table);
    expect(result.errors.some((e) => e.reason.includes("FORBIDDEN_COLUMN"))).toBe(true);
  });

  it("refuse la colonne interdite ID", () => {
    const table = parseCsv(
      "ID,CODE,LABEL,ADDRESS,LATITUDE,LONGITUDE\n999,LA_BOCCA,La Bocca,Adresse,43.5,7.0"
    );
    const result = parseZonesTable(table);
    expect(result.errors.some((e) => e.reason.includes("FORBIDDEN_COLUMN"))).toBe(true);
  });

  it("accepte les booleens FR (oui/non, vrai/faux) et defauts", () => {
    const result = parseZonesTable(
      csv("PALAIS,Palais,Adresse,43.5,7.0,oui,purple,oui,,,")
    );
    expect(result.rows[0]!.isFinalDestination).toBe(true);
    expect(result.rows[0]!.isActive).toBe(true);
  });
});

describe("applyZonesCommit — FUSION", () => {
  const baseRow: ParsedZoneRow = {
    line: 2,
    zone: "LA_BOCCA",
    zoneRaw: "La Bocca",
    label: "La Bocca",
    address: "12 Av de la Bocca",
    latitude: 43.5461,
    longitude: 7.0128,
    isFinalDestination: null,
    color: null,
    isActive: null,
    readerName: null,
    readerUrl: null,
    readerActive: null,
  };

  function makeTx(existing: unknown = null) {
    const calls = { create: [] as unknown[], update: [] as unknown[] };
    const tx: ZonesCommitTx = {
      zoneConfig: {
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

  it("cree une zone absente", async () => {
    const { tx, calls } = makeTx(null);
    const result = await applyZonesCommit(tx, [baseRow], { organizationId: "org-1" });
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(calls.create).toHaveLength(1);
    expect((calls.create[0] as { data: Record<string, unknown> }).data.organizationId).toBe("org-1");
  });

  it("met a jour une zone existante si un champ differe", async () => {
    const existing = {
      id: 5,
      label: "Ancien nom",
      address: baseRow.address,
      latitude: baseRow.latitude,
      longitude: baseRow.longitude,
      isFinalDestination: false,
      color: "gray",
      isActive: true,
      readerName: null,
      readerUrl: null,
      readerActive: false,
    };
    const { tx, calls } = makeTx(existing);
    const result = await applyZonesCommit(tx, [baseRow], { organizationId: "org-1" });
    expect(result.updated).toBe(1);
    expect(calls.update).toHaveLength(1);
  });

  it("ne modifie rien si identique -> unchanged (aucun update)", async () => {
    const existing = {
      id: 5,
      label: baseRow.label,
      address: baseRow.address,
      latitude: baseRow.latitude,
      longitude: baseRow.longitude,
      isFinalDestination: false,
      color: "gray",
      isActive: true,
      readerName: null,
      readerUrl: null,
      readerActive: false,
    };
    const { tx, calls } = makeTx(existing);
    const result = await applyZonesCommit(tx, [baseRow], { organizationId: "org-1" });
    expect(result.unchanged).toBe(1);
    expect(calls.update).toHaveLength(0);
  });

  it("ne desactive jamais silencieusement (isActive omis -> non ecrit)", async () => {
    const existing = {
      id: 5,
      label: "Autre nom",
      address: baseRow.address,
      latitude: baseRow.latitude,
      longitude: baseRow.longitude,
      isFinalDestination: false,
      color: "gray",
      isActive: false,
      readerName: null,
      readerUrl: null,
      readerActive: false,
    };
    const { tx, calls } = makeTx(existing);
    await applyZonesCommit(tx, [baseRow], { organizationId: "org-1" });
    const patch = (calls.update[0] as { data: Record<string, unknown> }).data;
    expect(patch.isActive).toBeUndefined();
  });
});
