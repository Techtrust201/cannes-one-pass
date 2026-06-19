import { describe, it, expect } from "vitest";
import {
  STANDARD_VEHICLE_TYPE_CODES,
  FRENCH_STANDARD_LABELS,
  vehicleTypeDisplayLabels,
  resolveVehicleTypeDisplayLabel,
  parseVehicleTypeDbTranslations,
} from "./vehicle-type-i18n";
import { translations, type LangCode } from "./translations";

const LANGS = Object.keys(translations) as LangCode[];
const CODES = STANDARD_VEHICLE_TYPE_CODES;

const FRENCH_RESIDUES = [
  "Porteur articulé",
  "Semi-remorque",
  "Semi remorque",
  "Porteur moyen",
  "Gros porteur",
  "Porteur léger",
];

describe("vehicleTypeDisplayLabels — complétude 11 langues × 6 codes", () => {
  it("chaque (lang, code) a un libellé non vide", () => {
    for (const lang of LANGS) {
      for (const code of CODES) {
        const label = vehicleTypeDisplayLabels[lang][code];
        expect(label, `${lang}/${code}`).toBeTruthy();
        expect(typeof label).toBe("string");
      }
    }
  });

  it("le français de référence correspond aux libellés FR du module", () => {
    for (const code of CODES) {
      expect(vehicleTypeDisplayLabels.fr[code]).toBe(FRENCH_STANDARD_LABELS[code]);
    }
  });
});

describe("vehicleTypeDisplayLabels — anti-résidu français hors FR", () => {
  it("PORTEUR_ARTICULE et SEMI_REMORQUE ne sont pas des libellés FR résiduels", () => {
    for (const lang of LANGS) {
      if (lang === "fr") continue;
      for (const code of ["PORTEUR_ARTICULE", "SEMI_REMORQUE"] as const) {
        const label = vehicleTypeDisplayLabels[lang][code];
        expect(FRENCH_RESIDUES).not.toContain(label);
      }
    }
  });
});

describe("resolveVehicleTypeDisplayLabel", () => {
  it("traduit un code standard selon la langue (round-trip EN)", () => {
    const label = resolveVehicleTypeDisplayLabel({
      code: "PORTEUR_ARTICULE",
      lang: "en",
    });
    expect(label).toBe("Articulated truck");
    expect(label).not.toBe("Porteur articulé");
  });

  it("retourne le gabarit BDD pour un code custom, pas une traduction standard", () => {
    const label = resolveVehicleTypeDisplayLabel({
      code: "CUSTOM_GABARIT",
      lang: "en",
      dbGabarit: "Mon gabarit spécial",
      dbLabel: "Label admin",
    });
    expect(label).toBe("Mon gabarit spécial");
  });

  it("priorise i18n sur le label BDD français pour un code standard", () => {
    const label = resolveVehicleTypeDisplayLabel({
      code: "SEMI_REMORQUE",
      lang: "de",
      dbGabarit: "Semi remorque",
      dbLabel: "Semi-remorque",
    });
    expect(label).toBe("Sattelauflieger");
    expect(label).not.toBe("Semi remorque");
  });

  it("normalise le code (casse / espaces)", () => {
    expect(
      resolveVehicleTypeDisplayLabel({ code: " porteur_articule ", lang: "es" })
    ).toBe("Camión articulado");
  });

  it("respecte un libellé personnalisé en BDD pour un code standard relabellisé", () => {
    // Cas réel : code standard GROS_PORTEUR (i18n = « 20 m³ ») relabellisé
    // « Porteur » en back-office. On ne doit PAS afficher « 20 m³ ».
    expect(
      resolveVehicleTypeDisplayLabel({
        code: "GROS_PORTEUR",
        lang: "fr",
        dbGabarit: "Porteur",
        dbLabel: "Porteur",
      })
    ).toBe("Porteur");
    // Sans traduction dédiée, le libellé admin sert aussi dans les autres langues.
    expect(
      resolveVehicleTypeDisplayLabel({
        code: "GROS_PORTEUR",
        lang: "en",
        dbGabarit: "Porteur",
      })
    ).toBe("Porteur");
  });

  it("garde l'i18n standard quand le libellé BDD correspond au standard FR", () => {
    expect(
      resolveVehicleTypeDisplayLabel({
        code: "GROS_PORTEUR",
        lang: "en",
        dbGabarit: "20 m³",
        dbLabel: "20 m³",
      })
    ).toBe("20 m³");
  });
});

describe("resolveVehicleTypeDisplayLabel — gabarits administrables (BDD)", () => {
  it("priorise la traduction BDD sur l'i18n standard pour un code standard", () => {
    const label = resolveVehicleTypeDisplayLabel({
      code: "PORTEUR_ARTICULE",
      lang: "en",
      dbTranslations: { en: "Custom artic truck" },
    });
    expect(label).toBe("Custom artic truck");
  });

  it("traduit un gabarit custom via sa traduction BDD (langue présente)", () => {
    const opts = {
      code: "CAMION_FRIGO_12T",
      dbLabel: "Camion frigo 12T",
      dbGabarit: "Camion frigo 12T",
      dbTranslations: {
        en: "Refrigerated truck 12T",
        pt: "Camião refrigerado 12T",
      },
    };
    expect(resolveVehicleTypeDisplayLabel({ ...opts, lang: "en" })).toBe(
      "Refrigerated truck 12T"
    );
    expect(resolveVehicleTypeDisplayLabel({ ...opts, lang: "pt" })).toBe(
      "Camião refrigerado 12T"
    );
  });

  it("retombe proprement sur le label BDD pour un gabarit custom sans traduction", () => {
    const label = resolveVehicleTypeDisplayLabel({
      code: "CAMION_FRIGO_12T",
      lang: "pl",
      dbGabarit: "Camion frigo 12T",
      dbTranslations: { en: "Refrigerated truck 12T" },
    });
    expect(label).toBe("Camion frigo 12T");
  });

  it("ignore une traduction BDD vide et applique le repli", () => {
    const label = resolveVehicleTypeDisplayLabel({
      code: "SEMI_REMORQUE",
      lang: "de",
      dbTranslations: { de: "   " },
    });
    expect(label).toBe("Sattelauflieger");
  });
});

describe("parseVehicleTypeDbTranslations", () => {
  it("ne conserve que les langues supportées et les valeurs non vides", () => {
    const parsed = parseVehicleTypeDbTranslations({
      en: "Truck",
      pt: "  Camião  ",
      de: "",
      zz: "Ignored",
      ru: 42,
    });
    expect(parsed).toEqual({ en: "Truck", pt: "Camião" });
  });

  it("renvoie un objet vide pour une entrée invalide (null, array, string)", () => {
    expect(parseVehicleTypeDbTranslations(null)).toEqual({});
    expect(parseVehicleTypeDbTranslations(["en"])).toEqual({});
    expect(parseVehicleTypeDbTranslations("en")).toEqual({});
  });
});
