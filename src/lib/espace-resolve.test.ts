import { describe, expect, it } from "vitest";

/**
 * Tests unitaires *purs* (sans accès DB) sur la dérivation d'espace RX
 * depuis le secteur d'un exposant.
 */
import { deriveSpaceFromSector } from "@/templates/accreditation/rx/config";

describe("rx — deriveSpaceFromSector", () => {
  it("mappe le secteur PALAIS — PALAIS sur un choix utilisateur (Int/Ext)", () => {
    expect(deriveSpaceFromSector("PALAIS — PALAIS")).toEqual({
      space: "PALAIS_CHOICE",
      requiresUserChoice: true,
    });
  });

  it("mappe les secteurs Vieux Port aux espaces correspondants", () => {
    expect(deriveSpaceFromSector("VIEUX PORT — QML")).toMatchObject({
      space: "QML",
      requiresUserChoice: false,
    });
    expect(deriveSpaceFromSector("VIEUX PORT — QSP")).toMatchObject({
      space: "QSP",
      requiresUserChoice: false,
    });
    expect(deriveSpaceFromSector("VIEUX PORT — PANTIERO")).toMatchObject({
      space: "PANTIERO",
      requiresUserChoice: false,
    });
    expect(deriveSpaceFromSector("VIEUX PORT — JETEE")).toMatchObject({
      space: "JETEE",
      requiresUserChoice: false,
    });
  });

  it("retourne null sur un secteur inconnu", () => {
    expect(deriveSpaceFromSector("MYSTERE — DOWNTOWN")).toEqual({
      space: null,
      requiresUserChoice: false,
    });
  });

  it("est insensible à la casse et aux espaces", () => {
    expect(deriveSpaceFromSector("vieux port — qml")).toMatchObject({
      space: "QML",
    });
    expect(deriveSpaceFromSector("  PALAIS — PALAIS  ")).toMatchObject({
      space: "PALAIS_CHOICE",
    });
  });
});
