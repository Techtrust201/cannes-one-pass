import { describe, it, expect } from "vitest";
import {
  parseLegacySector,
  normalizeLegacyPortCode,
  normalizeLegacySectorCode,
  impliedPortFromSectorCode,
  hasPortSectorConflict,
  PORT_SECTOR_CONFLICT,
} from "./legacy-sector";

describe("parseLegacySector — cas RX canoniques", () => {
  it("PORT CANTO — POWER", () => {
    expect(parseLegacySector("PORT CANTO — POWER")).toEqual({
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
      ambiguous: false,
    });
  });

  it("VIEUX PORT — JETEE", () => {
    expect(parseLegacySector("VIEUX PORT — JETEE")).toEqual({
      portCode: "VIEUX_PORT",
      sectorCode: "JETEE",
      logisticSpace: "JETEE",
      ambiguous: false,
    });
  });

  it("VIEUX PORT — QML", () => {
    expect(parseLegacySector("VIEUX PORT — QML")).toEqual({
      portCode: "VIEUX_PORT",
      sectorCode: "QML",
      logisticSpace: "QML",
      ambiguous: false,
    });
  });

  it("PORT CANTO — SAIL Multicoque (sectorCode detaille, logisticSpace SAIL)", () => {
    expect(parseLegacySector("PORT CANTO — SAIL Multicoque")).toEqual({
      portCode: "PORT_CANTO",
      sectorCode: "SAIL_MULTICOQUE",
      logisticSpace: "SAIL",
      ambiguous: false,
    });
  });

  it("PORT CANTO — BROKER & TOYS", () => {
    expect(parseLegacySector("PORT CANTO — BROKER & TOYS")).toEqual({
      portCode: "PORT_CANTO",
      sectorCode: "BROKER",
      logisticSpace: "BROKER",
      ambiguous: false,
    });
  });
});

describe("parseLegacySector — zones PALAIS distinctes", () => {
  it("PALAIS — PALAIS int - NU", () => {
    expect(parseLegacySector("PALAIS — PALAIS int - NU")).toEqual({
      portCode: "PALAIS",
      sectorCode: "PALAIS_INT_NU",
      logisticSpace: "INTERIEUR_PALAIS",
      ambiguous: false,
    });
  });

  it("PALAIS — PALAIS int - Equipe", () => {
    expect(parseLegacySector("PALAIS — PALAIS int - Equipe")).toEqual({
      portCode: "PALAIS",
      sectorCode: "PALAIS_INT_EQUIPE",
      logisticSpace: "INTERIEUR_PALAIS",
      ambiguous: false,
    });
  });

  it("PALAIS — PALAIS ext", () => {
    expect(parseLegacySector("PALAIS — PALAIS ext")).toEqual({
      portCode: "PALAIS",
      sectorCode: "PALAIS_EXT",
      logisticSpace: "EXTERIEUR_PALAIS",
      ambiguous: false,
    });
  });

  it("PALAIS int - NU seul (zone sans port explicite)", () => {
    expect(parseLegacySector("PALAIS int - NU")).toEqual({
      portCode: "PALAIS",
      sectorCode: "PALAIS_INT_NU",
      logisticSpace: "INTERIEUR_PALAIS",
      ambiguous: false,
    });
  });

  it("PALAIS int - Equipe seul", () => {
    expect(parseLegacySector("PALAIS int - Equipe")).toEqual({
      portCode: "PALAIS",
      sectorCode: "PALAIS_INT_EQUIPE",
      logisticSpace: "INTERIEUR_PALAIS",
      ambiguous: false,
    });
  });

  it("legacy VIEUX PORT — PALAIS int - NU -> conflit port explicite vs zone", () => {
    expect(parseLegacySector("VIEUX PORT — PALAIS int - NU")).toEqual({
      portCode: null,
      sectorCode: "PALAIS_INT_NU",
      logisticSpace: "INTERIEUR_PALAIS",
      ambiguous: true,
      warningReason: PORT_SECTOR_CONFLICT,
    });
  });

  it("legacy VIEUX PORT — PALAIS ext -> conflit", () => {
    expect(parseLegacySector("VIEUX PORT — PALAIS ext")).toEqual({
      portCode: null,
      sectorCode: "PALAIS_EXT",
      logisticSpace: "EXTERIEUR_PALAIS",
      ambiguous: true,
      warningReason: PORT_SECTOR_CONFLICT,
    });
  });

  it("PALAIS_INT_NU et PALAIS_INT_EQUIPE restent distincts avec logisticSpace identique", () => {
    const nu = parseLegacySector("PALAIS — PALAIS int - NU");
    const equipe = parseLegacySector("PALAIS — PALAIS int - Equipe");

    expect(nu.sectorCode).toBe("PALAIS_INT_NU");
    expect(equipe.sectorCode).toBe("PALAIS_INT_EQUIPE");
    expect(nu.sectorCode).not.toBe(equipe.sectorCode);
    expect(nu.logisticSpace).toBe("INTERIEUR_PALAIS");
    expect(equipe.logisticSpace).toBe("INTERIEUR_PALAIS");
    expect(nu.logisticSpace).toBe(equipe.logisticSpace);
  });

  it("differences de casse et tirets typographiques (–)", () => {
    expect(parseLegacySector("palais – palais int – nu")).toMatchObject({
      portCode: "PALAIS",
      sectorCode: "PALAIS_INT_NU",
      logisticSpace: "INTERIEUR_PALAIS",
      ambiguous: false,
    });
  });

  it("ne decoupe pas naïvement le tiret interne de PALAIS int - NU (conflit si port explicite)", () => {
    expect(parseLegacySector("VIEUX PORT — PALAIS int - NU")).toMatchObject({
      portCode: null,
      sectorCode: "PALAIS_INT_NU",
      warningReason: PORT_SECTOR_CONFLICT,
      ambiguous: true,
    });
  });
});

describe("parseLegacySector — conflits port explicite vs zone", () => {
  it("VIEUX PORT — PALAIS int - NU", () => {
    expect(parseLegacySector("VIEUX PORT — PALAIS int - NU")).toEqual({
      portCode: null,
      sectorCode: "PALAIS_INT_NU",
      logisticSpace: "INTERIEUR_PALAIS",
      ambiguous: true,
      warningReason: PORT_SECTOR_CONFLICT,
    });
  });

  it("PORT CANTO — PALAIS ext", () => {
    expect(parseLegacySector("PORT CANTO — PALAIS ext")).toEqual({
      portCode: null,
      sectorCode: "PALAIS_EXT",
      logisticSpace: "EXTERIEUR_PALAIS",
      ambiguous: true,
      warningReason: PORT_SECTOR_CONFLICT,
    });
  });

  it("PALAIS — POWER", () => {
    expect(parseLegacySector("PALAIS — POWER")).toEqual({
      portCode: null,
      sectorCode: "POWER",
      logisticSpace: "POWER",
      ambiguous: true,
      warningReason: PORT_SECTOR_CONFLICT,
    });
  });

  it("VIEUX PORT — POWER (zone CANTO, port explicite Vieux Port)", () => {
    expect(parseLegacySector("VIEUX PORT — POWER")).toEqual({
      portCode: null,
      sectorCode: "POWER",
      logisticSpace: "POWER",
      ambiguous: true,
      warningReason: PORT_SECTOR_CONFLICT,
    });
  });

  it("PALAIS — PALAIS int - Equipe (coherent)", () => {
    expect(parseLegacySector("PALAIS — PALAIS int - Equipe")).toEqual({
      portCode: "PALAIS",
      sectorCode: "PALAIS_INT_EQUIPE",
      logisticSpace: "INTERIEUR_PALAIS",
      ambiguous: false,
    });
  });

  it("PALAIS — PALAIS ext (coherent)", () => {
    expect(parseLegacySector("PALAIS — PALAIS ext")).toEqual({
      portCode: "PALAIS",
      sectorCode: "PALAIS_EXT",
      logisticSpace: "EXTERIEUR_PALAIS",
      ambiguous: false,
    });
  });

  it("VIEUX PORT — JETEE (coherent, pas de conflit)", () => {
    expect(parseLegacySector("VIEUX PORT — JETEE")).toEqual({
      portCode: "VIEUX_PORT",
      sectorCode: "JETEE",
      logisticSpace: "JETEE",
      ambiguous: false,
    });
  });

  it("PORT CANTO — POWER (coherent)", () => {
    expect(parseLegacySector("PORT CANTO — POWER")).toEqual({
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
      ambiguous: false,
    });
  });

  it("hasPortSectorConflict detecte le conflit sans arbitrer", () => {
    expect(hasPortSectorConflict("VIEUX_PORT", "PALAIS_INT_NU")).toBe(true);
    expect(hasPortSectorConflict("PALAIS", "POWER")).toBe(true);
    expect(hasPortSectorConflict("VIEUX_PORT", "JETEE")).toBe(false);
    expect(hasPortSectorConflict("PORT_CANTO", "POWER")).toBe(false);
  });

  it("impliedPortFromSectorCode aligne sur le referentiel RX", () => {
    expect(impliedPortFromSectorCode("POWER")).toBe("PORT_CANTO");
    expect(impliedPortFromSectorCode("JETEE")).toBe("VIEUX_PORT");
    expect(impliedPortFromSectorCode("PALAIS_INT_NU")).toBe("PALAIS");
  });
});

describe("parseLegacySector — cas ambigus ou vides", () => {
  it("PALAIS — PALAIS seul -> tout null, ambiguous", () => {
    expect(parseLegacySector("PALAIS — PALAIS")).toEqual({
      portCode: null,
      sectorCode: null,
      logisticSpace: null,
      ambiguous: true,
    });
  });

  it("PALAIS — PALAIS int - NU n'est PAS ambigu (contrairement a PALAIS — PALAIS seul)", () => {
    expect(parseLegacySector("PALAIS — PALAIS int - NU").ambiguous).toBe(false);
  });

  it("valeur inconnue non decoupable -> ambiguous", () => {
    expect(parseLegacySector("SECTEUR INCONNU XYZ")).toEqual({
      portCode: null,
      sectorCode: null,
      logisticSpace: null,
      ambiguous: true,
    });
  });

  it("port connu mais zone inconnue -> portCode seulement, ambiguous", () => {
    expect(parseLegacySector("VIEUX PORT — FOOBAR")).toEqual({
      portCode: "VIEUX_PORT",
      sectorCode: null,
      logisticSpace: null,
      ambiguous: true,
    });
  });

  it("valeur vide -> tout null, non ambiguous", () => {
    expect(parseLegacySector("")).toEqual({
      portCode: null,
      sectorCode: null,
      logisticSpace: null,
      ambiguous: false,
    });
    expect(parseLegacySector(null)).toEqual({
      portCode: null,
      sectorCode: null,
      logisticSpace: null,
      ambiguous: false,
    });
  });
});

describe("parseLegacySector — separateurs et accents", () => {
  it("accepte le tiret cadratin (–)", () => {
    expect(parseLegacySector("PORT CANTO – POWER")).toMatchObject({
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      ambiguous: false,
    });
  });

  it("accepte le tiret ASCII entoure d'espaces quand le port est connu", () => {
    expect(parseLegacySector("VIEUX PORT - QML")).toMatchObject({
      portCode: "VIEUX_PORT",
      sectorCode: "QML",
      ambiguous: false,
    });
  });

  it("gere les accents (JETÉE)", () => {
    expect(parseLegacySector("VIEUX PORT — JETÉE")).toMatchObject({
      portCode: "VIEUX_PORT",
      sectorCode: "JETEE",
      logisticSpace: "JETEE",
      ambiguous: false,
    });
  });

  it("est idempotent (deux appels identiques)", () => {
    const input = "  PORT CANTO  —  POWER  ";
    const once = parseLegacySector(input);
    const twice = parseLegacySector(input);
    expect(twice).toEqual(once);
    expect(once).toMatchObject({ portCode: "PORT_CANTO", sectorCode: "POWER" });
  });
});

describe("normalizeLegacyPortCode / normalizeLegacySectorCode", () => {
  it("normalise les ports canoniques", () => {
    expect(normalizeLegacyPortCode("Port Canto")).toBe("PORT_CANTO");
    expect(normalizeLegacyPortCode("Vieux Port")).toBe("VIEUX_PORT");
    expect(normalizeLegacyPortCode("Palais")).toBe("PALAIS");
  });

  it("normalise PAN en PANTIERO", () => {
    expect(normalizeLegacySectorCode("PAN")).toBe("PANTIERO");
  });

  it("distingue les sous-zones PALAIS interieures", () => {
    expect(normalizeLegacySectorCode("PALAIS int - NU")).toBe("PALAIS_INT_NU");
    expect(normalizeLegacySectorCode("PALAIS int - Equipe")).toBe("PALAIS_INT_EQUIPE");
    expect(normalizeLegacySectorCode("PALAIS ext")).toBe("PALAIS_EXT");
  });
});
