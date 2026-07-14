import { describe, it, expect } from "vitest";
import {
  resolvePlanning,
  buildScopeCandidates,
  type PlanningRuleRow,
} from "./logistics-planning";

function row(overrides: Partial<PlanningRuleRow>): PlanningRuleRow {
  return {
    scope: "EVENT",
    scopeKey: "EVENT",
    categoryCode: "ALL",
    phase: "MONTAGE",
    date: "2026-09-13",
    startTime: "08:00",
    endTime: "12:00",
    ...overrides,
  };
}

describe("buildScopeCandidates", () => {
  it("ordonne SPACE > SECTOR > PORT > EVENT quand tout est renseigné", () => {
    const candidates = buildScopeCandidates({
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
    });
    expect(candidates.map((c) => c.scopeKey)).toEqual([
      "SPACE:POWER",
      "SECTOR:PORT_CANTO:POWER",
      "PORT:PORT_CANTO",
      "EVENT",
    ]);
  });

  it("ne propose que EVENT quand aucun emplacement n'est fourni (Palais)", () => {
    expect(buildScopeCandidates(null)).toEqual([{ scope: "EVENT", scopeKey: "EVENT" }]);
  });

  it("omet SECTOR si sectorCode manque, garde PORT et EVENT", () => {
    const candidates = buildScopeCandidates({
      portCode: "VIEUX_PORT",
      sectorCode: null,
      logisticSpace: null,
    });
    expect(candidates.map((c) => c.scopeKey)).toEqual(["PORT:VIEUX_PORT", "EVENT"]);
  });
});

describe("resolvePlanning — priorité de portée", () => {
  const location = { portCode: "PORT_CANTO", sectorCode: "POWER", logisticSpace: "POWER" };

  it("choisit SPACE si une règle SPACE existe, même si SECTOR/PORT/EVENT existent aussi", () => {
    const rows = [
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "07:00", endTime: "09:00" }),
      row({ scope: "SECTOR", scopeKey: "SECTOR:PORT_CANTO:POWER", startTime: "08:00", endTime: "10:00" }),
      row({ scope: "PORT", scopeKey: "PORT:PORT_CANTO", startTime: "09:00", endTime: "11:00" }),
      row({ scope: "EVENT", scopeKey: "EVENT", startTime: "06:00", endTime: "23:00" }),
    ];
    const res = resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location, rows });
    expect(res.source).toBe("DB");
    expect(res.scope).toBe("SPACE");
    expect(res.slots).toEqual({ "2026-09-13": "07:00-09:00" });
  });

  it("cascade vers SECTOR si aucune ligne SPACE n'existe", () => {
    const rows = [
      row({ scope: "SECTOR", scopeKey: "SECTOR:PORT_CANTO:POWER", startTime: "08:00", endTime: "10:00" }),
      row({ scope: "EVENT", scopeKey: "EVENT" }),
    ];
    const res = resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location, rows });
    expect(res.scope).toBe("SECTOR");
  });

  it("cascade vers PORT puis EVENT si rien de plus spécifique", () => {
    const rowsPort = [row({ scope: "PORT", scopeKey: "PORT:PORT_CANTO" }), row({ scope: "EVENT", scopeKey: "EVENT" })];
    expect(resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location, rows: rowsPort }).scope).toBe("PORT");

    const rowsEventOnly = [row({ scope: "EVENT", scopeKey: "EVENT" })];
    expect(resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location, rows: rowsEventOnly }).scope).toBe("EVENT");
  });

  it("préfère la catégorie exacte à la catégorie générique ALL au même niveau", () => {
    const rows = [
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", categoryCode: "ALL", startTime: "06:00", endTime: "08:00" }),
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", categoryCode: "BATEAUX_A_TERRE", startTime: "09:00", endTime: "11:00" }),
    ];
    const res = resolvePlanning({
      mode: "STRICT",
      phase: "MONTAGE",
      categoryCode: "BATEAUX_A_TERRE",
      location,
      rows,
    });
    expect(res.categoryCode).toBe("BATEAUX_A_TERRE");
    expect(res.slots).toEqual({ "2026-09-13": "09:00-11:00" });
  });

  it("cascade au niveau suivant si des lignes existent mais pour une autre catégorie (jamais de résultat arbitraire)", () => {
    const rows = [
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", categoryCode: "PONTON_PRIVATIF" }),
      row({ scope: "SECTOR", scopeKey: "SECTOR:PORT_CANTO:POWER", categoryCode: "BATEAUX_A_TERRE", startTime: "09:00", endTime: "11:00" }),
    ];
    const res = resolvePlanning({
      mode: "STRICT",
      phase: "MONTAGE",
      categoryCode: "BATEAUX_A_TERRE",
      location,
      rows,
    });
    expect(res.scope).toBe("SECTOR");
  });

  it("agrège plusieurs dates d'une même règle dans `slots`", () => {
    const rows = [
      row({ scope: "EVENT", scopeKey: "EVENT", date: "2026-09-13" }),
      row({ scope: "EVENT", scopeKey: "EVENT", date: "2026-09-14", startTime: "09:00", endTime: "18:00" }),
    ];
    const res = resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location: null, rows });
    expect(res.slots).toEqual({ "2026-09-13": "08:00-12:00", "2026-09-14": "09:00-18:00" });
  });

  it("ne mélange jamais deux phases", () => {
    const rows = [
      row({ scope: "EVENT", scopeKey: "EVENT", phase: "MONTAGE", startTime: "08:00", endTime: "12:00" }),
      row({ scope: "EVENT", scopeKey: "EVENT", phase: "DEMONTAGE", startTime: "14:00", endTime: "18:00" }),
    ];
    const montage = resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location: null, rows });
    const demontage = resolvePlanning({ mode: "STRICT", phase: "DEMONTAGE", location: null, rows });
    expect(montage.slots).toEqual({ "2026-09-13": "08:00-12:00" });
    expect(demontage.slots).toEqual({ "2026-09-13": "14:00-18:00" });
  });

  it("ne lit jamais une règle d'un autre événement/organisation (rows déjà scopées par l'appelant)", () => {
    // Le moteur ne fait pas lui-même le scoping org/event : il travaille
    // uniquement sur les lignes transmises. On vérifie qu'une ligne
    // "étrangère" simplement absente du tableau ne peut jamais apparaître.
    const rows = [row({ scope: "EVENT", scopeKey: "EVENT" })];
    const res = resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location: null, rows });
    expect(res.slots).toEqual({ "2026-09-13": "08:00-12:00" });
    expect(Object.keys(res.slots)).toHaveLength(1);
  });
});

describe("resolvePlanning — plages disjointes (F7)", () => {
  const location = { portCode: "PORT_CANTO", sectorCode: "POWER", logisticSpace: "POWER" };

  it("fusionne deux plages qui se chevauchent le même jour", () => {
    const rows = [
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "08:00", endTime: "12:00" }),
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "11:00", endTime: "15:00" }),
    ];
    const res = resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location, rows });
    expect(res.error).toBeNull();
    expect(res.slots).toEqual({ "2026-09-13": "08:00-15:00" });
  });

  it("fusionne deux plages qui se touchent exactement (fin = début suivant)", () => {
    const rows = [
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "08:00", endTime: "12:00" }),
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "12:00", endTime: "16:00" }),
    ];
    const res = resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location, rows });
    expect(res.error).toBeNull();
    expect(res.slots).toEqual({ "2026-09-13": "08:00-16:00" });
  });

  it("refuse deux plages réellement disjointes (jamais de min-max artificiel dans le trou)", () => {
    const rows = [
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "08:00", endTime: "10:00" }),
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "14:00", endTime: "16:00" }),
    ];
    const res = resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location, rows });
    expect(res.source).toBe("NONE");
    expect(res.slots).toEqual({});
    expect(res.error?.code).toBe("PLANNING_DISJOINT_RANGES");
    expect(res.error?.conflicts).toEqual([
      { date: "2026-09-13", ranges: ["08:00-10:00", "14:00-16:00"] },
    ]);
  });

  it("ne retombe jamais sur le fallback legacy en TRANSITION pour des plages disjointes (donnée corrompue, pas règle absente)", () => {
    const rows = [
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "08:00", endTime: "10:00" }),
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "14:00", endTime: "16:00" }),
    ];
    const res = resolvePlanning({
      mode: "TRANSITION",
      phase: "MONTAGE",
      location,
      rows,
      fallback: { source: "LEGACY", slots: { "2026-09-13": "00:00-23:59" } },
    });
    expect(res.source).toBe("NONE");
    expect(res.error?.code).toBe("PLANNING_DISJOINT_RANGES");
  });

  it("ne cascade pas vers un scope moins prioritaire quand le scope choisi a des plages disjointes", () => {
    const rows = [
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "08:00", endTime: "10:00" }),
      row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "14:00", endTime: "16:00" }),
      row({ scope: "EVENT", scopeKey: "EVENT", startTime: "06:00", endTime: "23:00" }),
    ];
    const res = resolvePlanning({ mode: "STRICT", phase: "MONTAGE", location, rows });
    expect(res.scope).toBeNull();
    expect(res.error?.code).toBe("PLANNING_DISJOINT_RANGES");
  });
});

describe("resolvePlanning — mode DISABLED", () => {
  it("ignore totalement les lignes DB même si elles existent", () => {
    const rows = [row({ scope: "SPACE", scopeKey: "SPACE:POWER" })];
    const res = resolvePlanning({
      mode: "DISABLED",
      phase: "MONTAGE",
      location: { portCode: null, sectorCode: null, logisticSpace: "POWER" },
      rows,
    });
    expect(res.source).toBe("NONE");
    expect(res.slots).toEqual({});
    expect(res.error).toBeNull();
  });

  it("renvoie le fallback tel quel sans jamais consulter la DB", () => {
    const rows = [row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "01:00", endTime: "02:00" })];
    const res = resolvePlanning({
      mode: "DISABLED",
      phase: "MONTAGE",
      location: { portCode: null, sectorCode: null, logisticSpace: "POWER" },
      rows,
      fallback: { source: "LEGACY", slots: { "2026-09-10": "08:00-12:00" } },
    });
    expect(res.source).toBe("LEGACY");
    expect(res.slots).toEqual({ "2026-09-10": "08:00-12:00" });
  });

  it("ne renvoie jamais d'erreur, même sans fallback", () => {
    const res = resolvePlanning({ mode: "DISABLED", phase: "MONTAGE", location: null, rows: [] });
    expect(res.error).toBeNull();
  });
});

describe("resolvePlanning — mode TRANSITION", () => {
  const location = { portCode: "VIEUX_PORT", sectorCode: "JETEE", logisticSpace: "JETEE" };

  it("utilise la DB en priorité quand une règle existe", () => {
    const rows = [row({ scope: "SPACE", scopeKey: "SPACE:JETEE", startTime: "07:00", endTime: "09:00" })];
    const res = resolvePlanning({ mode: "TRANSITION", phase: "MONTAGE", location, rows });
    expect(res.source).toBe("DB");
  });

  it("retombe sur le fallback légal seulement pour la combinaison absente (une règle POWER en DB ne désactive pas le fallback JETEE)", () => {
    const rows = [row({ scope: "SPACE", scopeKey: "SPACE:POWER", startTime: "07:00", endTime: "09:00" })];
    const res = resolvePlanning({
      mode: "TRANSITION",
      phase: "MONTAGE",
      location,
      rows,
      fallback: { source: "LEGACY", slots: { "2026-09-11": "09:00-17:00" } },
    });
    expect(res.source).toBe("LEGACY");
    expect(res.slots).toEqual({ "2026-09-11": "09:00-17:00" });
  });

  it("EVENT_FALLBACK (Palais) est bien distingué de LEGACY (RX)", () => {
    const res = resolvePlanning({
      mode: "TRANSITION",
      phase: "MONTAGE",
      location: null,
      rows: [],
      fallback: { source: "EVENT_FALLBACK", slots: { "2026-09-11": "00:00-23:00" } },
    });
    expect(res.source).toBe("EVENT_FALLBACK");
  });

  it("renvoie une erreur structurée si ni DB ni fallback ne couvrent la combinaison", () => {
    const res = resolvePlanning({ mode: "TRANSITION", phase: "MONTAGE", location, rows: [] });
    expect(res.source).toBe("NONE");
    expect(res.error).toEqual({
      code: "PLANNING_NOT_FOUND",
      message: expect.stringContaining("MONTAGE"),
    });
  });
});

describe("resolvePlanning — mode STRICT", () => {
  const location = { portCode: "PORT_CANTO", sectorCode: "POWER", logisticSpace: "POWER" };

  it("bloque avec PLANNING_NOT_FOUND si aucune règle DB ne couvre la combinaison, même avec un fallback fourni", () => {
    const res = resolvePlanning({
      mode: "STRICT",
      phase: "DEMONTAGE",
      location,
      rows: [],
      fallback: { source: "LEGACY", slots: { "2026-09-11": "09:00-17:00" } },
    });
    expect(res.source).toBe("NONE");
    expect(res.slots).toEqual({});
    expect(res.error?.code).toBe("PLANNING_NOT_FOUND");
  });

  it("retourne la règle DB si elle existe", () => {
    const rows = [row({ scope: "SPACE", scopeKey: "SPACE:POWER", phase: "DEMONTAGE" })];
    const res = resolvePlanning({ mode: "STRICT", phase: "DEMONTAGE", location, rows });
    expect(res.source).toBe("DB");
    expect(res.error).toBeNull();
  });
});
