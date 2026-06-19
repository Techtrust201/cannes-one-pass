import { describe, it, expect } from "vitest";
import { resolveAdminManagedLabel } from "./admin-managed-label";

// Jeu standard minimal (deux codes) pour exercer la priorité du helper.
const standardFrenchLabels = {
  GROS_PORTEUR: "20 m³",
  VL: "VL",
};
const standardLabelsByLang = {
  fr: { GROS_PORTEUR: "20 m³", VL: "VL" },
  en: { GROS_PORTEUR: "20 m³", VL: "VL" },
  de: { GROS_PORTEUR: "20 m³", VL: "VL" },
};

describe("resolveAdminManagedLabel — priorité administrable", () => {
  it("1. code standard non modifié → traduction i18n appliquée", () => {
    expect(
      resolveAdminManagedLabel({
        code: "VL",
        lang: "en",
        dbLabel: "VL",
        standardCode: "VL",
        standardLabelsByLang,
        standardFrenchLabels,
      })
    ).toBe("VL");
  });

  it("2. code standard avec label BDD personnalisé → label BDD prioritaire", () => {
    // Cas réel GROS_PORTEUR relabellisé « Porteur » : ne doit pas afficher « 20 m³ ».
    expect(
      resolveAdminManagedLabel({
        code: "GROS_PORTEUR",
        lang: "fr",
        dbLabel: "Porteur",
        standardCode: "GROS_PORTEUR",
        standardLabelsByLang,
        standardFrenchLabels,
      })
    ).toBe("Porteur");
    // Sans traduction dédiée, le libellé admin sert aussi dans les autres langues.
    expect(
      resolveAdminManagedLabel({
        code: "GROS_PORTEUR",
        lang: "en",
        dbLabel: "Porteur",
        standardCode: "GROS_PORTEUR",
        standardLabelsByLang,
        standardFrenchLabels,
      })
    ).toBe("Porteur");
  });

  it("3. code standard avec displayLabels[lang] → traduction BDD prioritaire", () => {
    expect(
      resolveAdminManagedLabel({
        code: "GROS_PORTEUR",
        lang: "en",
        dbTranslations: { en: "Heavy truck" },
        dbLabel: "Porteur",
        standardCode: "GROS_PORTEUR",
        standardLabelsByLang,
        standardFrenchLabels,
      })
    ).toBe("Heavy truck");
  });

  it("4. custom sans traduction → label BDD", () => {
    expect(
      resolveAdminManagedLabel({
        code: "CAMION_FRIGO",
        lang: "pl",
        dbLabel: "Camion frigo",
        standardCode: null,
        standardLabelsByLang,
        standardFrenchLabels,
      })
    ).toBe("Camion frigo");
  });

  it("5. custom avec traduction → traduction BDD", () => {
    expect(
      resolveAdminManagedLabel({
        code: "CAMION_FRIGO",
        lang: "en",
        dbTranslations: { en: "Refrigerated truck" },
        dbLabel: "Camion frigo",
        standardCode: null,
        standardLabelsByLang,
        standardFrenchLabels,
      })
    ).toBe("Refrigerated truck");
  });

  it("6. aucune donnée → fallback code humanisé", () => {
    expect(
      resolveAdminManagedLabel({
        code: "MON_CODE_TECHNIQUE",
        lang: "fr",
        standardCode: null,
      })
    ).toBe("MON CODE TECHNIQUE");
    expect(
      resolveAdminManagedLabel({ code: "", lang: "fr" })
    ).toBe("");
  });

  it("ignore une traduction BDD vide et applique le repli i18n", () => {
    expect(
      resolveAdminManagedLabel({
        code: "VL",
        lang: "de",
        dbTranslations: { de: "   " },
        dbLabel: "VL",
        standardCode: "VL",
        standardLabelsByLang,
        standardFrenchLabels,
      })
    ).toBe("VL");
  });
});
