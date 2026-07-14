import { describe, it, expect } from "vitest";
import {
  parsePlanningCsv,
  buildScopeKey,
  canonicalPortCode,
  canonicalSectorCode,
  DEFAULT_CATEGORY_CODE,
} from "./planning";

describe("canonicalPortCode / canonicalSectorCode", () => {
  it("canonicalise les valeurs RX", () => {
    expect(canonicalPortCode("PORT CANTO")).toBe("PORT_CANTO");
    expect(canonicalPortCode("Vieux Port")).toBe("VIEUX_PORT");
    expect(canonicalSectorCode("power")).toBe("POWER");
    expect(canonicalSectorCode("PAN")).toBe("PANTIERO");
  });
  it("conserve les codes deja canoniques", () => {
    expect(canonicalPortCode("PORT_CANTO")).toBe("PORT_CANTO");
  });
  it("normalise tel quel pour un code non-RX", () => {
    expect(canonicalPortCode("Quai Nord")).toBe("QUAI NORD");
  });
  it("null si vide", () => {
    expect(canonicalPortCode("")).toBeNull();
    expect(canonicalSectorCode(null)).toBeNull();
  });
});

describe("buildScopeKey", () => {
  it("EVENT", () => {
    expect(buildScopeKey("EVENT", null, null, null)).toBe("EVENT");
  });
  it("PORT", () => {
    expect(buildScopeKey("PORT", "PORT_CANTO", null, null)).toBe("PORT:PORT_CANTO");
    expect(buildScopeKey("PORT", null, null, null)).toBeNull();
  });
  it("SECTOR", () => {
    expect(buildScopeKey("SECTOR", "PORT_CANTO", "POWER", null)).toBe("SECTOR:PORT_CANTO:POWER");
    expect(buildScopeKey("SECTOR", "PORT_CANTO", null, null)).toBeNull();
  });
  it("SPACE", () => {
    expect(buildScopeKey("SPACE", null, null, "POWER")).toBe("SPACE:POWER");
    expect(buildScopeKey("SPACE", null, null, null)).toBeNull();
  });
});

describe("parsePlanningCsv — nominal", () => {
  it("regle SECTOR sur un jour unique", () => {
    const csv =
      "SCOPE,PORT,SECTOR,PHASE,DATE,START TIME,END TIME\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,04/09/2026,08:00,12:00\n";
    const res = parsePlanningCsv(csv);

    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0];
    expect(row.scope).toBe("SECTOR");
    expect(row.scopeKey).toBe("SECTOR:PORT_CANTO:POWER");
    expect(row.portCode).toBe("PORT_CANTO");
    expect(row.sectorCode).toBe("POWER");
    expect(row.categoryCode).toBe(DEFAULT_CATEGORY_CODE);
    expect(row.phase).toBe("MONTAGE");
    expect(row.date).toBe("2026-09-04");
    expect(row.startTime).toBe("08:00");
    expect(row.endTime).toBe("12:00");
  });

  it("decoupe une plage de dates en lignes quotidiennes", () => {
    const csv =
      "SCOPE,PORT,SECTOR,PHASE,DATE,DATE_END,START TIME,END TIME\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,2026-09-06,08:00,18:00\n";
    const res = parsePlanningCsv(csv);

    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(3);
    expect(res.rows.map((r) => r.date)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
    expect(res.rows.every((r) => r.scopeKey === "SECTOR:PORT_CANTO:POWER")).toBe(true);
  });

  it("regle EVENT (Palais global) sans port/secteur", () => {
    const csv =
      "SCOPE,PHASE,DATE,START TIME,END TIME\n" + "EVENT,DEMONTAGE,10/09/2026,09:00,17:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.errors).toEqual([]);
    const row = res.rows[0];
    expect(row.scope).toBe("EVENT");
    expect(row.scopeKey).toBe("EVENT");
    expect(row.portCode).toBeNull();
    expect(row.sectorCode).toBeNull();
    expect(row.spaceCode).toBeNull();
    expect(row.phase).toBe("DEMONTAGE");
  });

  it("regle SPACE + categorie explicite", () => {
    const csv =
      "SCOPE,SPACE,CATEGORY,PHASE,DATE,START TIME,END TIME\n" +
      "SPACE,POWER,BATEAU_TERRE,MONTAGE,2026-09-04,08:00,12:00\n";
    const res = parsePlanningCsv(csv);
    const row = res.rows[0];
    expect(row.scopeKey).toBe("SPACE:POWER");
    expect(row.spaceCode).toBe("POWER");
    expect(row.categoryCode).toBe("BATEAU_TERRE");
    expect(row.portCode).toBeNull();
  });
});

describe("parsePlanningCsv — erreurs", () => {
  it("colonnes obligatoires manquantes -> erreur bloquante", () => {
    const csv = "SCOPE,PORT\nSECTOR,PORT CANTO\n";
    const res = parsePlanningCsv(csv);
    expect(res.rows).toEqual([]);
    expect(res.errors[0].reason).toContain("Colonnes obligatoires manquantes");
  });

  it("scope invalide -> erreur ligne", () => {
    const csv = "SCOPE,PHASE,DATE,START TIME,END TIME\nWORLD,MONTAGE,2026-09-04,08:00,12:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.rows).toEqual([]);
    expect(res.errors[0].reason).toContain("Scope invalide");
  });

  it("phase invalide -> erreur ligne", () => {
    const csv = "SCOPE,PHASE,DATE,START TIME,END TIME\nEVENT,BUILD,2026-09-04,08:00,12:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.errors[0].reason).toContain("Phase invalide");
  });

  it("codes manquants pour le scope -> erreur", () => {
    const csv = "SCOPE,PHASE,DATE,START TIME,END TIME\nSECTOR,MONTAGE,2026-09-04,08:00,12:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.errors[0].reason).toContain("Codes manquants");
  });

  it("heure de fin <= heure de debut -> erreur", () => {
    const csv =
      "SCOPE,PHASE,DATE,START TIME,END TIME\nEVENT,MONTAGE,2026-09-04,12:00,08:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.errors[0].reason).toContain("posterieure");
  });

  it("doublon intra-fichier -> erreur", () => {
    const csv =
      "SCOPE,PORT,SECTOR,PHASE,DATE,START TIME,END TIME\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,08:00,12:00\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,08:00,12:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.rows).toHaveLength(1);
    expect(res.errors.some((e) => e.reason.includes("Doublon"))).toBe(true);
  });

  it("date invalide -> erreur ligne", () => {
    const csv = "SCOPE,PHASE,DATE,START TIME,END TIME\nEVENT,MONTAGE,31/02/2026,08:00,12:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.errors[0].reason).toContain("Date de debut invalide");
  });
});

describe("parsePlanningCsv — plages disjointes (F7)", () => {
  it("fusionne deux lignes qui se chevauchent le même jour (aucune erreur)", () => {
    const csv =
      "SCOPE,PORT,SECTOR,PHASE,DATE,START TIME,END TIME\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,08:00,12:00\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,11:00,15:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.rows).toHaveLength(2);
    expect(res.errors).toEqual([]);
  });

  it("fusionne deux lignes qui se touchent exactement (aucune erreur)", () => {
    const csv =
      "SCOPE,PORT,SECTOR,PHASE,DATE,START TIME,END TIME\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,08:00,12:00\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,12:00,16:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.rows).toHaveLength(2);
    expect(res.errors).toEqual([]);
  });

  it("refuse deux lignes réellement disjointes pour la même clé (erreur bloquante, aucune écriture)", () => {
    const csv =
      "SCOPE,PORT,SECTOR,PHASE,DATE,START TIME,END TIME\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,08:00,10:00\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,14:00,16:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.errors.some((e) => e.reason.includes("PLANNING_DISJOINT_RANGES"))).toBe(true);
  });

  it("plages disjointes détectées même quand issues d'un étalement de plage de dates (DATE_START/DATE_END)", () => {
    const csv =
      "SCOPE,PORT,SECTOR,PHASE,DATE START,DATE END,START TIME,END TIME\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,2026-09-05,08:00,10:00\n" +
      "SECTOR,PORT CANTO,POWER,MONTAGE,2026-09-04,2026-09-04,14:00,16:00\n";
    const res = parsePlanningCsv(csv);
    // 2026-09-04 : deux plages disjointes (08-10 et 14-16) -> erreur.
    // 2026-09-05 : une seule plage (08-10, issue de l'étalement) -> pas d'erreur pour ce jour.
    const disjoint = res.errors.filter((e) => e.reason.includes("PLANNING_DISJOINT_RANGES"));
    expect(disjoint).toHaveLength(1);
    expect(disjoint[0].reason).toContain("2026-09-04");
  });

  it("ne bloque pas des plages identiques sur des jours différents (pas de conflit inter-jours)", () => {
    const csv =
      "SCOPE,PHASE,DATE,START TIME,END TIME\n" +
      "EVENT,MONTAGE,2026-09-04,08:00,12:00\n" +
      "EVENT,MONTAGE,2026-09-05,14:00,16:00\n";
    const res = parsePlanningCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(2);
  });
});
