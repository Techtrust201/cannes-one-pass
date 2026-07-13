import { describe, it, expect } from "vitest";
import { applyPlanningOverrides, findCategoryIn, RX_CATEGORY_TO_DB_CODE } from "./planning-bridge";
import type { RxSpaceDef } from "./config";
import type { PlanningResolution } from "@/lib/logistics-planning";

function baseSpace(): RxSpaceDef {
  return {
    id: "POWER",
    label: "Power Boat Marina",
    categories: [
      { id: "ponton-privatif", name: "Ponton privatif", liv: { "2026-09-13": "08:00-12:00" }, rep: {}, scales: false },
      { id: "bateau-terre", name: "Bateaux à terre", liv: {}, rep: { "2026-09-16": "12:00-23:00" }, scales: true },
    ],
  };
}

function dbResolution(slots: Record<string, string>): PlanningResolution {
  return {
    source: "DB",
    mode: "STRICT",
    phase: "MONTAGE",
    categoryCode: "PONTON_PRIVATIF",
    scope: "SPACE",
    scopeKey: "SPACE:POWER",
    slots,
    rule: { scope: "SPACE", scopeKey: "SPACE:POWER", categoryCode: "PONTON_PRIVATIF", dates: Object.keys(slots) },
    error: null,
  };
}

describe("RX_CATEGORY_TO_DB_CODE", () => {
  it("mappe les 3 catégories legacy vers les categoryCode canoniques DB", () => {
    expect(RX_CATEGORY_TO_DB_CODE["ponton-privatif"]).toBe("PONTON_PRIVATIF");
    expect(RX_CATEGORY_TO_DB_CODE["stand-tente"]).toBe("TERRE");
    expect(RX_CATEGORY_TO_DB_CODE["bateau-terre"]).toBe("BATEAUX_A_TERRE");
  });
});

describe("applyPlanningOverrides", () => {
  it("retourne l'espace tel quel si aucun override (DISABLED / pas encore chargé)", () => {
    const space = baseSpace();
    const result = applyPlanningOverrides(space, {}, "liv");
    expect(result).toBe(space);
  });

  it("retourne null si l'espace est null", () => {
    expect(applyPlanningOverrides(null, {}, "liv")).toBeNull();
  });

  it("remplace liv par les créneaux DB uniquement pour source === DB", () => {
    const space = baseSpace();
    const result = applyPlanningOverrides(
      space,
      { "ponton-privatif": dbResolution({ "2026-09-20": "07:00-09:00" }) },
      "liv"
    );
    expect(result?.categories.find((c) => c.id === "ponton-privatif")?.liv).toEqual({
      "2026-09-20": "07:00-09:00",
    });
    // Catégorie non concernée par l'override reste intacte.
    expect(result?.categories.find((c) => c.id === "bateau-terre")?.rep).toEqual({
      "2026-09-16": "12:00-23:00",
    });
  });

  it("ignore une résolution LEGACY/NONE (garde la donnée statique locale)", () => {
    const space = baseSpace();
    const legacyResolution: PlanningResolution = {
      source: "LEGACY",
      mode: "TRANSITION",
      phase: "MONTAGE",
      categoryCode: "ALL",
      scope: null,
      scopeKey: null,
      slots: { "1999-01-01": "00:00-01:00" },
      rule: null,
      error: null,
    };
    const result = applyPlanningOverrides(space, { "ponton-privatif": legacyResolution }, "liv");
    expect(result?.categories.find((c) => c.id === "ponton-privatif")?.liv).toEqual({
      "2026-09-13": "08:00-12:00",
    });
  });

  it("vide la catégorie (retire du choix) si la résolution est en erreur STRICT", () => {
    const space = baseSpace();
    const strictError: PlanningResolution = {
      source: "NONE",
      mode: "STRICT",
      phase: "MONTAGE",
      categoryCode: "PONTON_PRIVATIF",
      scope: null,
      scopeKey: null,
      slots: {},
      rule: null,
      error: { code: "PLANNING_NOT_FOUND", message: "Aucune règle trouvée." },
    };
    const result = applyPlanningOverrides(space, { "ponton-privatif": strictError }, "liv");
    expect(result?.categories.find((c) => c.id === "ponton-privatif")?.liv).toEqual({});
  });

  it("ne modifie jamais l'objet source (immutabilité)", () => {
    const space = baseSpace();
    const originalLiv = space.categories[0].liv;
    applyPlanningOverrides(space, { "ponton-privatif": dbResolution({ "2026-09-20": "07:00-09:00" }) }, "liv");
    expect(space.categories[0].liv).toBe(originalLiv);
    expect(space.categories[0].liv).toEqual({ "2026-09-13": "08:00-12:00" });
  });
});

describe("findCategoryIn", () => {
  it("retrouve une catégorie dans un espace fusionné", () => {
    const space = baseSpace();
    expect(findCategoryIn(space, "bateau-terre")?.name).toBe("Bateaux à terre");
  });

  it("retourne null si l'espace ou la catégorie est absente", () => {
    expect(findCategoryIn(null, "bateau-terre")).toBeNull();
    expect(findCategoryIn(baseSpace(), "inconnue")).toBeNull();
  });
});
