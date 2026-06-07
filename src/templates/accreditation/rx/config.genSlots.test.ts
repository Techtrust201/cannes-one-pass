import { describe, it, expect } from "vitest";
import { genSlots, isBateauTerreAllowed } from "./config";

describe("genSlots", () => {
  it("inclut le créneau 19h–20h pour une plage finissant à 19:00 (règle RX)", () => {
    const slots = genSlots("08:00-19:00");
    expect(slots[0]).toBe("08:00-09:00");
    expect(slots[slots.length - 1]).toBe("19:00-20:00");
    expect(slots).toContain("18:00-19:00");
  });

  it("ne génère pas de créneau 23:00-00:00 pour une plage finissant à 23:00", () => {
    const slots = genSlots("00:00-23:00");
    expect(slots).not.toContain("23:00-00:00");
    expect(slots).not.toContain("23:00-24:00");
    expect(slots[slots.length - 1]).toBe("22:00-23:00");
  });

  it("plage de soirée 19:00-23:00 → dernier créneau 22:00-23:00", () => {
    const slots = genSlots("19:00-23:00");
    expect(slots[0]).toBe("19:00-20:00");
    expect(slots[slots.length - 1]).toBe("22:00-23:00");
  });

  it("plage courte 18:00-21:00 : dernier départ à 21:00 (21:00-22:00)", () => {
    const slots = genSlots("18:00-21:00");
    expect(slots).toEqual([
      "18:00-19:00",
      "19:00-20:00",
      "20:00-21:00",
      "21:00-22:00",
    ]);
  });

  it("inclusiveLastStart=false → comportement classique (pas de créneau final ajouté)", () => {
    const slots = genSlots("08:00-19:00", { inclusiveLastStart: false });
    expect(slots[slots.length - 1]).toBe("18:00-19:00");
    expect(slots).not.toContain("19:00-20:00");
  });

  it("renvoie une liste vide pour une plage invalide ou traversant minuit", () => {
    expect(genSlots("")).toEqual([]);
    expect(genSlots("19:00-17:00")).toEqual([]);
    expect(genSlots("nope")).toEqual([]);
  });
});

describe("isBateauTerreAllowed", () => {
  it("autorise Canto POWER et Vieux Port PALAIS ext", () => {
    expect(isBateauTerreAllowed("CANTO — POWER")).toBe(true);
    expect(isBateauTerreAllowed("PORT CANTO — POWER")).toBe(true);
    expect(isBateauTerreAllowed("VIEUX PORT — PALAIS ext")).toBe(true);
    expect(isBateauTerreAllowed("PALAIS EXT")).toBe(true);
  });

  it("refuse les autres secteurs", () => {
    expect(isBateauTerreAllowed("VIEUX PORT — QML")).toBe(false);
    expect(isBateauTerreAllowed("CANTO — SAIL")).toBe(false);
    expect(isBateauTerreAllowed("PALAIS — PALAIS int - NU")).toBe(false);
    expect(isBateauTerreAllowed("")).toBe(false);
  });
});
