import { describe, it, expect } from "vitest";
import { deriveCategory } from "./category-rules";

describe("deriveCategory", () => {
  it("déduit BATEAU_FLOT pour un stand JETEE", () => {
    expect(deriveCategory({ stand: "JETEE 101" })).toBe("BATEAU_FLOT");
  });

  it("déduit BATEAU_FLOT pour un stand QUAI MAX LAUBEUF", () => {
    expect(deriveCategory({ stand: "QUAI-MAX-LAUBEUF-3" })).toBe("BATEAU_FLOT");
  });

  it("déduit STAND_NU pour un stand PALAIS", () => {
    expect(deriveCategory({ stand: "PALAIS-B12" })).toBe("STAND_NU");
  });

  it("déduit TENTE_STRUCTURE pour un stand TENTE", () => {
    expect(deriveCategory({ stand: "TENTE-3" })).toBe("TENTE_STRUCTURE");
  });

  it("utilise la zone si le stand n'est pas reconnu", () => {
    expect(deriveCategory({ stand: "Z-42", zone: "PANTIERO" })).toBe(
      "BATEAU_FLOT"
    );
    expect(deriveCategory({ stand: "Z-42", zone: "PALAIS_DES_FESTIVALS" })).toBe(
      "STAND_NU"
    );
  });

  it("retourne null si aucun indice", () => {
    expect(deriveCategory({ stand: "???", zone: null })).toBeNull();
    expect(deriveCategory({})).toBeNull();
  });

  it("est insensible à la casse sur stand", () => {
    expect(deriveCategory({ stand: "jetee 12" })).toBe("BATEAU_FLOT");
    expect(deriveCategory({ stand: "  Palais  " })).toBe("STAND_NU");
  });
});
