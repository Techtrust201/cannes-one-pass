import { describe, it, expect } from "vitest";
import {
  normalizeExhibitorName,
  normalizeLocationCode,
  normalizeOptionalCode,
} from "./normalization";

describe("normalizeExhibitorName", () => {
  it("trim + uppercase, sans toucher au libelle affiche original", () => {
    expect(normalizeExhibitorName("  Sunseeker  ")).toBe("SUNSEEKER");
  });

  it("ramene les espaces multiples a un seul espace", () => {
    expect(normalizeExhibitorName("Acme   Corp")).toBe("ACME CORP");
  });

  it("retire les accents de maniere deterministe", () => {
    expect(normalizeExhibitorName("Ébène Corp")).toBe("EBENE CORP");
  });

  it("est idempotent (appliquer deux fois donne le meme resultat)", () => {
    const once = normalizeExhibitorName("  Société Générale  ");
    const twice = normalizeExhibitorName(once);
    expect(twice).toBe(once);
    expect(once).toBe("SOCIETE GENERALE");
  });

  it("retourne null pour une valeur vide/absente", () => {
    expect(normalizeExhibitorName("")).toBeNull();
    expect(normalizeExhibitorName("   ")).toBeNull();
    expect(normalizeExhibitorName(null)).toBeNull();
    expect(normalizeExhibitorName(undefined)).toBeNull();
  });
});

describe("normalizeLocationCode", () => {
  it("JETEE 001 -> code inchange, codeNormalized sans espace", () => {
    expect(normalizeLocationCode("JETEE 001")).toEqual({
      code: "JETEE 001",
      codeNormalized: "JETEE001",
    });
  });

  it("Power 209 -> codeNormalized POWER209", () => {
    expect(normalizeLocationCode("Power 209")).toEqual({
      code: "Power 209",
      codeNormalized: "POWER209",
    });
  });

  it("retire accents et separateurs (tirets/underscores) uniquement dans la cle", () => {
    const result = normalizeLocationCode("Jetée-001");
    expect(result?.code).toBe("Jetée-001");
    expect(result?.codeNormalized).toBe("JETEE001");
  });

  it("est idempotent sur codeNormalized", () => {
    const once = normalizeLocationCode("  PALAIS   110  ");
    const twice = normalizeLocationCode(once?.codeNormalized ?? "");
    expect(once?.codeNormalized).toBe("PALAIS110");
    expect(twice?.codeNormalized).toBe("PALAIS110");
  });

  it("retourne null pour une valeur vide/absente", () => {
    expect(normalizeLocationCode("")).toBeNull();
    expect(normalizeLocationCode(null)).toBeNull();
    expect(normalizeLocationCode(undefined)).toBeNull();
  });

  it("ne confond pas deux codes reellement differents", () => {
    const a = normalizeLocationCode("POWER 209");
    const b = normalizeLocationCode("POWER 219");
    expect(a?.codeNormalized).not.toBe(b?.codeNormalized);
  });

  it("fusionne des variantes de separateurs (JETEE 001 vs JETEE-001)", () => {
    const spaced = normalizeLocationCode("JETEE 001");
    const hyphen = normalizeLocationCode("JETEE-001");
    expect(spaced?.codeNormalized).toBe("JETEE001");
    expect(hyphen?.codeNormalized).toBe("JETEE001");
    expect(spaced?.code).not.toBe(hyphen?.code);
  });
});

describe("normalizeOptionalCode", () => {
  it("normalise en conservant les espaces entre mots", () => {
    expect(normalizeOptionalCode("  vieux   port  ")).toBe("VIEUX PORT");
  });

  it("retire les accents", () => {
    expect(normalizeOptionalCode("Jetée")).toBe("JETEE");
  });

  it("retourne null pour une valeur vide/absente (ne jamais inventer)", () => {
    expect(normalizeOptionalCode("")).toBeNull();
    expect(normalizeOptionalCode(null)).toBeNull();
    expect(normalizeOptionalCode(undefined)).toBeNull();
  });
});
