import { describe, it, expect } from "vitest";
import {
  planNameNormalization,
  planStandLocation,
  planExhibitorBackfillBatch,
  standLocationKey,
  type BackfillExhibitorRow,
} from "./exhibitor-location-backfill";

function exhibitor(overrides: Partial<BackfillExhibitorRow>): BackfillExhibitorRow {
  return {
    id: "ex-1",
    name: "Sunseeker",
    nameNormalized: null,
    stand: "PALAIS 110",
    sector: null,
    ...overrides,
  };
}

describe("planNameNormalization", () => {
  it("propose une valeur quand nameNormalized est absent", () => {
    expect(planNameNormalization(exhibitor({ name: "  Sunseeker  " }))).toBe("SUNSEEKER");
  });

  it("n'ecrase jamais une valeur deja renseignee (meme si differente)", () => {
    expect(
      planNameNormalization(exhibitor({ name: "Sunseeker", nameNormalized: "AUTRE_VALEUR" }))
    ).toBeNull();
  });
});

describe("planStandLocation — parsing secteur legacy", () => {
  it("PORT CANTO — POWER -> codes canoniques separes", () => {
    const candidate = planStandLocation(
      exhibitor({ stand: "POWER 209", sector: "PORT CANTO — POWER" })
    );
    expect(candidate).toMatchObject({
      code: "POWER 209",
      codeNormalized: "POWER209",
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
      ambiguousSector: false,
    });
  });

  it("VIEUX PORT — JETEE", () => {
    const candidate = planStandLocation(
      exhibitor({ stand: "JETEE 001", sector: "VIEUX PORT — JETEE" })
    );
    expect(candidate).toMatchObject({
      portCode: "VIEUX_PORT",
      sectorCode: "JETEE",
      logisticSpace: "JETEE",
      ambiguousSector: false,
    });
  });

  it("VIEUX PORT — QML", () => {
    const candidate = planStandLocation(
      exhibitor({ stand: "QML 7", sector: "VIEUX PORT — QML" })
    );
    expect(candidate).toMatchObject({
      portCode: "VIEUX_PORT",
      sectorCode: "QML",
      logisticSpace: "QML",
    });
  });

  it("PORT CANTO — SAIL Multicoque", () => {
    const candidate = planStandLocation(
      exhibitor({ stand: "SAIL 1", sector: "PORT CANTO — SAIL Multicoque" })
    );
    expect(candidate).toMatchObject({
      portCode: "PORT_CANTO",
      sectorCode: "SAIL_MULTICOQUE",
      logisticSpace: "SAIL",
    });
  });

  it("PALAIS — PALAIS -> ambiguous, pas de sectorCode copie", () => {
    const candidate = planStandLocation(
      exhibitor({ stand: "PALAIS 110", sector: "PALAIS — PALAIS" })
    );
    expect(candidate).toMatchObject({
      portCode: null,
      sectorCode: null,
      logisticSpace: null,
      ambiguousSector: true,
    });
  });

  it("secteur inconnu -> ambiguous, pas de sectorCode invente", () => {
    const candidate = planStandLocation(
      exhibitor({ stand: "A1", sector: "VIEUX PORT — FOOBAR" })
    );
    expect(candidate).toMatchObject({
      portCode: "VIEUX_PORT",
      sectorCode: null,
      logisticSpace: null,
      ambiguousSector: true,
    });
  });
});

describe("planExhibitorBackfillBatch — simulation sur donnees factices", () => {
  it("exposant avec location deja creee -> pas de doublon", () => {
    const rows: BackfillExhibitorRow[] = [
      exhibitor({ id: "ex-1", stand: "JETEE 001", nameNormalized: "SUNSEEKER" }),
    ];
    const existingKeys = new Set([standLocationKey("ex-1", "JETEE001")]);

    const plan = planExhibitorBackfillBatch(rows, existingKeys);

    expect(plan.locationOps).toHaveLength(0);
    expect(plan.counters.locationsAlreadyPresent).toBe(1);
  });

  it("second passage sans doublon", () => {
    const rows: BackfillExhibitorRow[] = [exhibitor({ id: "ex-2", stand: "POWER 209" })];

    const firstPass = planExhibitorBackfillBatch(rows, new Set());
    expect(firstPass.locationOps).toHaveLength(1);

    const keysAfterFirstPass = new Set([standLocationKey("ex-2", "POWER209")]);
    const secondPass = planExhibitorBackfillBatch(rows, keysAfterFirstPass);

    expect(secondPass.locationOps).toHaveLength(0);
    expect(secondPass.counters.locationsAlreadyPresent).toBe(1);
  });

  it("collision codeNormalized : deux libelles distincts fusionnent -> compteur, pas de seconde location", () => {
    const rows: BackfillExhibitorRow[] = [
      exhibitor({ id: "ex-collision", stand: "JETEE 001", sector: null }),
      exhibitor({ id: "ex-collision", stand: "JETEE-001", sector: null }),
    ];

    const plan = planExhibitorBackfillBatch(rows, new Set());

    expect(plan.locationOps).toHaveLength(1);
    expect(plan.counters.codeNormalizedCollisions).toBe(1);
    expect(plan.counters.locationsToCreate).toBe(1);
  });

  it("lot mixte : compteurs coherents", () => {
    const rows: BackfillExhibitorRow[] = [
      exhibitor({ id: "ex-a", name: "Alpha", nameNormalized: null, stand: "A1", sector: "PORT CANTO — POWER" }),
      exhibitor({ id: "ex-b", name: "Beta", nameNormalized: "BETA", stand: "PALAIS 5", sector: "PALAIS — PALAIS" }),
      exhibitor({ id: "ex-c", name: "Gamma", nameNormalized: null, stand: null, sector: null }),
    ];

    const plan = planExhibitorBackfillBatch(rows, new Set());

    expect(plan.counters.analyzed).toBe(3);
    expect(plan.counters.nameNormalizedToSet).toBe(2);
    expect(plan.counters.locationsToCreate).toBe(2);
    expect(plan.counters.skipped).toBe(1);
    expect(plan.counters.ambiguousSector).toBe(1);
  });
});
