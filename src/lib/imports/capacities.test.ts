import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";
import {
  parseCapacitiesTable,
  applyCapacitiesCommit,
  type CapacitiesCommitTx,
  type ParsedCapacityRow,
} from "./capacities";

const HEADERS = "ZONE,DATE,START TIME,END TIME,VEHICLE FAMILY,PHASE,CAPACITY";

function csv(rows: string): ReturnType<typeof parseCsv> {
  return parseCsv(`${HEADERS}\n${rows}`);
}

const ZONES = new Set(["LA_BOCCA"]);

describe("parseCapacitiesTable", () => {
  it("parse une ligne valide MONTAGE/LIGHT", () => {
    const result = parseCapacitiesTable(csv("LA_BOCCA,2026-09-16,08:00,12:00,LIGHT,MONTAGE,10"), {
      validZoneCodes: ZONES,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      zone: "LA_BOCCA",
      date: "2026-09-16",
      startTime: "08:00",
      endTime: "12:00",
      vehicleFamily: "LIGHT",
      phase: "MONTAGE",
      capacity: 10,
    });
  });

  it("MONTAGE et DEMONTAGE sont bien distingues", () => {
    const result = parseCapacitiesTable(
      csv(
        "LA_BOCCA,2026-09-16,08:00,12:00,LIGHT,MONTAGE,10\nLA_BOCCA,2026-09-16,08:00,12:00,LIGHT,DEMONTAGE,4"
      ),
      { validZoneCodes: ZONES }
    );
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.phase)).toEqual(["MONTAGE", "DEMONTAGE"]);
  });

  it("LIGHT et HEAVY sont bien distingues", () => {
    const result = parseCapacitiesTable(
      csv(
        "LA_BOCCA,2026-09-16,08:00,12:00,LIGHT,MONTAGE,10\nLA_BOCCA,2026-09-16,08:00,12:00,HEAVY,MONTAGE,4"
      ),
      { validZoneCodes: ZONES }
    );
    expect(result.errors).toHaveLength(0);
    expect(result.rows.map((r) => r.vehicleFamily)).toEqual(["LIGHT", "HEAVY"]);
  });

  it("zone inconnue/inactive -> erreur", () => {
    const result = parseCapacitiesTable(csv("INCONNUE,2026-09-16,08:00,12:00,LIGHT,MONTAGE,10"), {
      validZoneCodes: ZONES,
    });
    expect(result.errors[0]!.reason).toMatch(/UNKNOWN_ZONE/);
  });

  it("date invalide -> erreur", () => {
    const result = parseCapacitiesTable(csv("LA_BOCCA,16/09/2026,08:00,12:00,LIGHT,MONTAGE,10"), {
      validZoneCodes: ZONES,
    });
    expect(result.errors[0]!.reason).toMatch(/INVALID_DATE/);
  });

  it("startTime >= endTime -> erreur", () => {
    const result = parseCapacitiesTable(csv("LA_BOCCA,2026-09-16,12:00,08:00,LIGHT,MONTAGE,10"), {
      validZoneCodes: ZONES,
    });
    expect(result.errors[0]!.reason).toMatch(/INVALID_TIME_RANGE/);
  });

  it("capacite invalide (0, negatif, decimal) -> erreur", () => {
    const result = parseCapacitiesTable(csv("LA_BOCCA,2026-09-16,08:00,12:00,LIGHT,MONTAGE,0"), {
      validZoneCodes: ZONES,
    });
    expect(result.errors[0]!.reason).toMatch(/INVALID_CAPACITY/);
  });

  it("phase invalide -> erreur", () => {
    const result = parseCapacitiesTable(csv("LA_BOCCA,2026-09-16,08:00,12:00,LIGHT,SETUP,10"), {
      validZoneCodes: ZONES,
    });
    expect(result.errors[0]!.reason).toMatch(/INVALID_PHASE/);
  });

  it("meme cle naturelle repetee dans le fichier -> warning non bloquant", () => {
    const result = parseCapacitiesTable(
      csv(
        "LA_BOCCA,2026-09-16,08:00,12:00,LIGHT,MONTAGE,10\nLA_BOCCA,2026-09-16,08:00,12:00,LIGHT,MONTAGE,20"
      ),
      { validZoneCodes: ZONES }
    );
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.reason.includes("DUPLICATE_CAPACITY_KEY"))).toBe(true);
  });

  it("refuse les colonnes interdites ORGANIZATION ID / EVENT ID", () => {
    const table = parseCsv(
      "ZONE,DATE,START TIME,END TIME,VEHICLE FAMILY,PHASE,CAPACITY,EVENT ID\nLA_BOCCA,2026-09-16,08:00,12:00,LIGHT,MONTAGE,10,evt-injecte"
    );
    const result = parseCapacitiesTable(table, { validZoneCodes: ZONES });
    expect(result.errors.some((e) => e.reason.includes("FORBIDDEN_COLUMN"))).toBe(true);
  });
});

describe("applyCapacitiesCommit — FUSION (transaction atomique)", () => {
  const baseRow: ParsedCapacityRow = {
    line: 2,
    scopeKey: "ZONE:LA_BOCCA",
    zone: "LA_BOCCA",
    date: "2026-09-16",
    startTime: "08:00",
    endTime: "12:00",
    vehicleFamily: "LIGHT",
    phase: "MONTAGE",
    capacity: 10,
  };

  function makeTx(existing: unknown = null) {
    const calls = { create: [] as unknown[], update: [] as unknown[] };
    const tx: CapacitiesCommitTx = {
      rxCapacity: {
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

  it("cree une capacite absente avec la cle naturelle complete", async () => {
    const { tx, calls } = makeTx(null);
    const result = await applyCapacitiesCommit(tx, [baseRow], {
      organizationId: "org-1",
      eventId: "evt-1",
    });
    expect(result.created).toBe(1);
    const data = (calls.create[0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({
      organizationId: "org-1",
      eventId: "evt-1",
      zone: "LA_BOCCA",
      date: "2026-09-16",
      startTime: "08:00",
      endTime: "12:00",
      vehicleFamily: "LIGHT",
      phase: "MONTAGE",
      capacity: 10,
    });
  });

  it("met a jour uniquement la capacite si elle differe", async () => {
    const { tx, calls } = makeTx({ id: 3, capacity: 5 });
    const result = await applyCapacitiesCommit(tx, [baseRow], {
      organizationId: "org-1",
      eventId: "evt-1",
    });
    expect(result.updated).toBe(1);
    expect((calls.update[0] as { data: Record<string, unknown> }).data).toEqual({ capacity: 10 });
  });

  it("unchanged si la capacite est identique", async () => {
    const { tx, calls } = makeTx({ id: 3, capacity: 10 });
    const result = await applyCapacitiesCommit(tx, [baseRow], {
      organizationId: "org-1",
      eventId: "evt-1",
    });
    expect(result.unchanged).toBe(1);
    expect(calls.update).toHaveLength(0);
  });

  it("scoping org+event : aucune capacite d'une autre organisation n'est jamais modifiable", async () => {
    let receivedWhere: unknown;
    const tx: CapacitiesCommitTx = {
      rxCapacity: {
        findFirst: async (args) => {
          receivedWhere = args.where;
          return null;
        },
        create: async () => ({ id: 1 }),
        update: async () => ({}),
      },
    };
    await applyCapacitiesCommit(tx, [baseRow], { organizationId: "org-42", eventId: "evt-9" });
    expect(receivedWhere).toMatchObject({ organizationId: "org-42", eventId: "evt-9" });
  });
});
