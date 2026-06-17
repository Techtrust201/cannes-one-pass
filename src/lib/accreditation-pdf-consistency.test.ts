import { describe, it, expect } from "vitest";
import {
  OFFICIAL_STATUSES,
  resolvePdfMode,
  resolvePdfStatusLabel,
} from "./accreditation-pdf-modes";
import { pdfTranslations, getPdfTranslations } from "./pdf-translations";
import type { LangCode } from "./translations";

const LANGS = Object.keys(pdfTranslations) as LangCode[];
const ALL_STATUSES = ["NOUVEAU", "ATTENTE", "ENTREE", "SORTIE", "REFUS", "ABSENT"];

describe("resolvePdfMode (garde-fou §3.4b)", () => {
  it("ne produit JAMAIS 'official' pour un statut non opérationnel, même demandé", () => {
    for (const status of ["NOUVEAU", "REFUS", "ABSENT"]) {
      expect(resolvePdfMode(status, "official")).toBe("request");
      expect(resolvePdfMode(status, undefined)).toBe("request");
      expect(resolvePdfMode(status, "request")).toBe("request");
    }
  });

  it("produit 'official' pour un statut opérationnel (sauf si 'request' explicite)", () => {
    for (const status of OFFICIAL_STATUSES) {
      expect(resolvePdfMode(status, "official")).toBe("official");
      expect(resolvePdfMode(status, undefined)).toBe("official");
      // Demande explicite "request" respectée (ex. téléchargement public).
      expect(resolvePdfMode(status, "request")).toBe("request");
    }
  });
});

describe("resolvePdfStatusLabel (cohérence bandeau/statut)", () => {
  it("n'affiche jamais un libellé de validation en mode request, dans toutes les langues", () => {
    for (const lang of LANGS) {
      const pdfT = getPdfTranslations(lang);
      const validatedLabel = pdfT.statusLabels.ATTENTE; // libellé « VALIDÉE »
      for (const status of ALL_STATUSES) {
        const label = resolvePdfStatusLabel(pdfT, status, "request");
        // En mode request, on affiche toujours « à valider », jamais « validée ».
        expect(label).toBe(pdfT.requestStatusLabel);
        expect(label).not.toBe(validatedLabel);
      }
    }
  });

  it("affiche le statut opérationnel en mode official", () => {
    for (const lang of LANGS) {
      const pdfT = getPdfTranslations(lang);
      expect(resolvePdfStatusLabel(pdfT, "ATTENTE", "official")).toBe(
        pdfT.statusLabels.ATTENTE
      );
      expect(resolvePdfStatusLabel(pdfT, "ENTREE", "official")).toBe(
        pdfT.statusLabels.ENTREE
      );
      expect(resolvePdfStatusLabel(pdfT, "SORTIE", "official")).toBe(
        pdfT.statusLabels.SORTIE
      );
    }
  });

  it("garantit l'absence de contradiction « demande non validée » + « validée »", () => {
    // Reproduit le scénario du bug : statut ATTENTE rendu en mode request
    // (ex. téléchargement public d'une demande). Le libellé ne doit pas être
    // « VALIDÉE ».
    for (const lang of LANGS) {
      const pdfT = getPdfTranslations(lang);
      const mode = resolvePdfMode("ATTENTE", "request");
      expect(mode).toBe("request");
      const label = resolvePdfStatusLabel(pdfT, "ATTENTE", mode);
      expect(label).toBe(pdfT.requestStatusLabel);
      expect(label).not.toBe(pdfT.statusLabels.ATTENTE);
    }
  });
});

describe("requestStatusLabel défini pour toutes les langues", () => {
  it("chaque langue a un libellé de demande non vide et distinct de « validée »", () => {
    for (const lang of LANGS) {
      const pdfT = pdfTranslations[lang];
      expect(pdfT.requestStatusLabel).toBeTruthy();
      expect(pdfT.requestStatusLabel).not.toBe(pdfT.statusLabels.ATTENTE);
    }
  });
});
