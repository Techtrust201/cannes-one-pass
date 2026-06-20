import { describe, expect, it } from "vitest";
import {
  buildAccreditationPdfFilename,
  sanitizeFilenamePart,
} from "@/lib/accreditation-pdf-filename";

describe("sanitizeFilenamePart", () => {
  it("retire les accents et caractères spéciaux", () => {
    expect(sanitizeFilenamePart("Stand Élégant n°12 !")).toBe(
      "Stand-Elegant-n-12"
    );
  });

  it("compacte les séparateurs et tronque", () => {
    expect(sanitizeFilenamePart("  A / B   C  ")).toBe("A-B-C");
  });

  it("renvoie une chaîne vide si rien d'exploitable", () => {
    expect(sanitizeFilenamePart("   ")).toBe("");
    expect(sanitizeFilenamePart(null)).toBe("");
    expect(sanitizeFilenamePart(undefined)).toBe("");
  });

  it("borne la longueur à 40 caractères sans tiret final", () => {
    const out = sanitizeFilenamePart("a".repeat(50));
    expect(out.length).toBe(40);
  });
});

describe("buildAccreditationPdfFilename", () => {
  it("document validé avec stand et plaque", () => {
    expect(
      buildAccreditationPdfFilename({
        stand: "Stand A12",
        plate: "AB-123-CD",
        validated: true,
      })
    ).toBe("Accreditation_Stand-A12_AB-123-CD.pdf");
  });

  it("document validé avec stand seul (PDF global)", () => {
    expect(
      buildAccreditationPdfFilename({ stand: "Stand A12", validated: true })
    ).toBe("Accreditation_Stand-A12.pdf");
  });

  it("demande non validée → préfixe Demande_Accreditation", () => {
    expect(
      buildAccreditationPdfFilename({
        stand: "Stand A12",
        plate: "AB123CD",
        validated: false,
      })
    ).toBe("Demande_Accreditation_Stand-A12_AB123CD.pdf");
  });

  it("fallback propre quand stand absent", () => {
    expect(buildAccreditationPdfFilename({ validated: true })).toBe(
      "Accreditation.pdf"
    );
  });
});
