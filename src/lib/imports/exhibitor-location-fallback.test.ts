import { describe, it, expect } from "vitest";
import {
  getExhibitorLocationsWithLegacyFallback,
  type ExhibitorLocationLike,
} from "./exhibitor-location-fallback";

function realLocation(overrides: Partial<ExhibitorLocationLike>): ExhibitorLocationLike {
  return {
    id: "loc-1",
    exhibitorId: "ex-1",
    type: "STAND",
    code: "JETEE 001",
    codeNormalized: "JETEE001",
    portCode: null,
    sectorCode: null,
    logisticSpace: null,
    isActive: true,
    ...overrides,
  };
}

describe("getExhibitorLocationsWithLegacyFallback", () => {
  it("priorite aux locations reelles lorsqu'elles existent", () => {
    const locations = [realLocation({})];
    const result = getExhibitorLocationsWithLegacyFallback(
      { id: "ex-1", stand: "PALAIS 110" },
      locations
    );
    expect(result).toEqual(locations);
    expect(result[0]).not.toHaveProperty("isLegacyFallback");
  });

  it("repli legacy quand aucune location active n'existe mais Exhibitor.stand est renseigne", () => {
    const result = getExhibitorLocationsWithLegacyFallback({ id: "ex-2", stand: "PALAIS 110" }, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "STAND",
      code: "PALAIS 110",
      codeNormalized: "PALAIS110",
      isLegacyFallback: true,
    });
  });

  it("ignore les locations inactives et retombe sur le legacy si aucune active", () => {
    const locations = [realLocation({ isActive: false })];
    const result = getExhibitorLocationsWithLegacyFallback(
      { id: "ex-3", stand: "QML 7" },
      locations
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ isLegacyFallback: true, codeNormalized: "QML7" });
  });

  it("liste vide si ni location active ni stand legacy", () => {
    const result = getExhibitorLocationsWithLegacyFallback({ id: "ex-4", stand: null }, []);
    expect(result).toEqual([]);
  });

  it("repli legacy avec secteur parse (PORT CANTO — POWER)", () => {
    const result = getExhibitorLocationsWithLegacyFallback(
      { id: "ex-5", stand: "POWER 209", sector: "PORT CANTO — POWER" },
      []
    );
    expect(result[0]).toMatchObject({
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
    });
  });
});
