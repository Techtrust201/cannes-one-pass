import { describe, it, expect } from "vitest";
import { intersectEventIds } from "./espace-scope";

describe("intersectEventIds", () => {
  it("retourne [] si le slug n'existe pas (orgEventIds = null)", () => {
    expect(intersectEventIds(["e1", "e2"], null)).toEqual([]);
    expect(intersectEventIds("ALL", null)).toEqual([]);
  });

  it("super-admin + espace : renvoie tous les events de l'org", () => {
    expect(intersectEventIds("ALL", ["e1", "e2"])).toEqual(["e1", "e2"]);
  });

  it("membre d'une org : intersection avec sa base", () => {
    expect(intersectEventIds(["e1", "e2", "e3"], ["e2", "e4"])).toEqual(["e2"]);
  });

  it("membre d'une org mais aucun event commun : []", () => {
    expect(intersectEventIds(["e1"], ["e2", "e3"])).toEqual([]);
  });

  it("utilisateur sans org ni grant (base vide) : [] peu importe l'org", () => {
    expect(intersectEventIds([], ["e1", "e2"])).toEqual([]);
    expect(intersectEventIds([], [])).toEqual([]);
  });

  it("grants-only (ex: event e1) qui appartient à l'org : renvoie e1", () => {
    expect(intersectEventIds(["e1"], ["e1", "e2"])).toEqual(["e1"]);
  });

  it("grants-only mais event non rattaché à l'org : []", () => {
    expect(intersectEventIds(["e1"], ["e2", "e3"])).toEqual([]);
  });

  it("ne duplique pas si base contient des doublons (entrée déjà dédupliquée en amont)", () => {
    expect(intersectEventIds(["e1", "e1", "e2"], ["e1"])).toEqual(["e1"]);
  });
});
