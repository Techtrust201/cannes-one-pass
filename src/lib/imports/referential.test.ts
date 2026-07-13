import { describe, it, expect } from "vitest";
import { parseReferentialCsv, resolveReferentialGeography } from "./referential";

describe("resolveReferentialGeography", () => {
  it("canonicalise PORT + ZONE via parseLegacySector", () => {
    const geo = resolveReferentialGeography("PORT CANTO", "POWER");
    expect(geo.portCode).toBe("PORT_CANTO");
    expect(geo.sectorCode).toBe("POWER");
    expect(geo.logisticSpace).toBe("POWER");
    expect(geo.ambiguous).toBe(false);
  });

  it("VIEUX PORT + JETEE -> codes canoniques", () => {
    const geo = resolveReferentialGeography("VIEUX PORT", "JETEE");
    expect(geo.portCode).toBe("VIEUX_PORT");
    expect(geo.sectorCode).toBe("JETEE");
  });

  it("conflit port explicite / port implique -> portCode null + warningReason", () => {
    const geo = resolveReferentialGeography("VIEUX PORT", "PALAIS int - NU");
    expect(geo.portCode).toBeNull();
    expect(geo.sectorCode).toBe("PALAIS_INT_NU");
    expect(geo.ambiguous).toBe(true);
    expect(geo.warningReason).toBe("PORT_SECTOR_CONFLICT");
  });

  it("aucune entree -> geographie vide", () => {
    expect(resolveReferentialGeography("", "")).toEqual({
      portCode: null,
      sectorCode: null,
      logisticSpace: null,
      ambiguous: false,
    });
  });
});

describe("parseReferentialCsv — cas nominal RX", () => {
  it("PLAN->name, PORT/ZONE->geo, NUM-TERRE/NUM-FLOT->locations", () => {
    const csv =
      "PLAN,PORT,ZONE T-T,NUM-TERRE,NUM-FLOT\n" +
      "Sunseeker,PORT CANTO,POWER,POWER 209,POWER 210\n";
    const res = parseReferentialCsv(csv);

    expect(res.errors).toEqual([]);
    expect(res.exhibitors).toHaveLength(1);

    const exh = res.exhibitors[0];
    expect(exh.name).toBe("Sunseeker");
    expect(exh.nameNormalized).toBe("SUNSEEKER");
    expect(exh.locations).toHaveLength(2);

    const terre = exh.locations.find((l) => l.type === "TERRE")!;
    expect(terre.code).toBe("POWER 209");
    expect(terre.codeNormalized).toBe("POWER209");
    expect(terre.portCode).toBe("PORT_CANTO");
    expect(terre.sectorCode).toBe("POWER");
    expect(terre.ambiguous).toBe(false);

    const flot = exh.locations.find((l) => l.type === "FLOT")!;
    expect(flot.code).toBe("POWER 210");
    expect(flot.portCode).toBe("PORT_CANTO");
  });

  it("split multi-valeurs '/' -> plusieurs emplacements", () => {
    const csv =
      "PLAN,PORT,ZONE T-T,NUM-TERRE\n" + "Acme,VIEUX PORT,PAN,PAN 023 / PAN 024\n";
    const res = parseReferentialCsv(csv);

    const exh = res.exhibitors[0];
    expect(exh.locations).toHaveLength(2);
    expect(exh.locations.map((l) => l.code).sort()).toEqual(["PAN 023", "PAN 024"]);
    expect(exh.locations.every((l) => l.type === "TERRE")).toBe(true);
    expect(exh.locations.every((l) => l.sectorCode === "PANTIERO")).toBe(true);
    expect(exh.locations.every((l) => l.portCode === "VIEUX_PORT")).toBe(true);
  });

  it("resout les alias d'entetes (SOCIETE, PORT, SECTEUR, FLOT)", () => {
    const csv = "SOCIETE;PORT;SECTEUR;FLOT\nAcme;PORT CANTO;POWER;POWER 300\n";
    const res = parseReferentialCsv(csv);
    expect(res.exhibitors[0].name).toBe("Acme");
    expect(res.exhibitors[0].locations[0].type).toBe("FLOT");
    expect(res.exhibitors[0].locations[0].sectorCode).toBe("POWER");
    expect(res.exhibitors[0].locations[0].portCode).toBe("PORT_CANTO");
  });
});

describe("parseReferentialCsv — fusion & dedoublonnage", () => {
  it("fusionne le meme exposant sur plusieurs lignes", () => {
    const csv =
      "PLAN,PORT,ZONE T-T,NUM-TERRE\n" +
      "Acme,VIEUX PORT,JETEE,JETEE 001\n" +
      "Acme,VIEUX PORT,JETEE,JETEE 002\n";
    const res = parseReferentialCsv(csv);

    expect(res.exhibitors).toHaveLength(1);
    expect(res.exhibitors[0].locations).toHaveLength(2);
    expect(res.exhibitors[0].sourceLines).toEqual([2, 3]);
  });

  it("dedoublonne un emplacement identique (type + codeNormalized)", () => {
    const csv =
      "PLAN,PORT,ZONE T-T,NUM-TERRE\n" +
      "Acme,VIEUX PORT,JETEE,JETEE 001\n" +
      "Acme,VIEUX PORT,JETEE,JETEE-001\n";
    const res = parseReferentialCsv(csv);

    expect(res.exhibitors[0].locations).toHaveLength(1);
    expect(res.exhibitors[0].locations[0].sourceLines).toEqual([2, 3]);
  });
});

describe("parseReferentialCsv — erreurs & avertissements", () => {
  it("colonne exposant manquante -> erreur bloquante _row", () => {
    const csv = "PORT,ZONE T-T\nPORT CANTO,POWER\n";
    const res = parseReferentialCsv(csv);
    expect(res.exhibitors).toEqual([]);
    expect(res.errors[0].reason).toContain("Colonne exposant manquante");
  });

  it("nom vide -> erreur ligne, ligne ignoree", () => {
    const csv = "PLAN,NUM-TERRE\n ,JETEE 001\nAcme,JETEE 002\n";
    const res = parseReferentialCsv(csv);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].line).toBe(2);
    expect(res.exhibitors).toHaveLength(1);
    expect(res.exhibitors[0].name).toBe("Acme");
  });

  it("conflit port/secteur -> avertissement + emplacement ambigu (portCode null)", () => {
    const csv =
      "PLAN,PORT,ZONE T-T,NUM-TERRE\n" + "Acme,VIEUX PORT,PALAIS int - NU,NU 01\n";
    const res = parseReferentialCsv(csv);

    const loc = res.exhibitors[0].locations[0];
    expect(loc.portCode).toBeNull();
    expect(loc.sectorCode).toBe("PALAIS_INT_NU");
    expect(loc.ambiguous).toBe(true);
    expect(loc.warningReason).toBe("PORT_SECTOR_CONFLICT");
    expect(res.warnings.some((w) => w.reason.includes("PORT_SECTOR_CONFLICT"))).toBe(true);
  });

  it("aucune colonne d'emplacement -> erreur bloquante (>=1 emplacement obligatoire)", () => {
    const csv = "PLAN\nAcme\nSunseeker\n";
    const res = parseReferentialCsv(csv);
    expect(res.exhibitors).toEqual([]);
    expect(res.errors.some((e) => e.reason.includes("Aucune colonne d'emplacement"))).toBe(true);
  });

  it("ligne avec nom mais sans emplacement -> erreur de ligne (jamais ignoree)", () => {
    const csv = "PLAN,NUM-TERRE\nAcme,JETEE 001\nSunseeker,\n";
    const res = parseReferentialCsv(csv);
    expect(res.errors.some((e) => e.line === 3 && e.reason.includes("sans emplacement"))).toBe(true);
  });

  it("alias COMPANY NAME (fichier RX officiel) reconnu comme nom", () => {
    const csv = "PORT,ZONE T-T,COMPANY NAME,NUM-TERRE,NUM-FLOT\nPORT CANTO,POWER,Sunseeker,POWER 209,POWER 210\n";
    const res = parseReferentialCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.exhibitors[0].name).toBe("Sunseeker");
    expect(res.exhibitors[0].locations).toHaveLength(2);
  });

  it("colonne STAND generique -> emplacement de type STAND", () => {
    const csv = "NAME,STAND\nPalais Expo,PALAIS 110\n";
    const res = parseReferentialCsv(csv);
    expect(res.exhibitors[0].locations[0].type).toBe("STAND");
    expect(res.exhibitors[0].locations[0].code).toBe("PALAIS 110");
    expect(res.exhibitors[0].locations[0].codeNormalized).toBe("PALAIS110");
  });
});
