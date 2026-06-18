import { describe, it, expect } from "vitest";
import {
  isPalaisOrg,
  getOrgFieldLabel,
  buildUnloadingOptions,
  getDefaultUnloadingValue,
  resolveUnloadingLabel,
  UNLOADING_UNKNOWN,
  UNLOADING_MANUAL,
} from "./org-form-config";
import { LANGUAGES, type LangCode } from "./translations";

const LANGS = LANGUAGES.map((l) => l.code) as LangCode[];

const PROVIDERS = [
  { id: "p1", name: "GL Events" },
  { id: "p2", name: "Sud Manut" },
];

describe("isPalaisOrg", () => {
  it("reconnaît les slugs Palais (insensible à la casse)", () => {
    expect(isPalaisOrg("palais-des-festivals")).toBe(true);
    expect(isPalaisOrg("palais")).toBe(true);
    expect(isPalaisOrg("PALAIS-DES-FESTIVALS")).toBe(true);
  });

  it("rejette RX, les autres orgs et les valeurs vides", () => {
    expect(isPalaisOrg("rx")).toBe(false);
    expect(isPalaisOrg("autre-org")).toBe(false);
    expect(isPalaisOrg(null)).toBe(false);
    expect(isPalaisOrg(undefined)).toBe(false);
  });
});

describe("getOrgFieldLabel — Palais", () => {
  it("remplace Décorateur par Société et Stand par Stand | Client (FR)", () => {
    expect(getOrgFieldLabel("palais-des-festivals", "decoratorName", "fr", "Nom du décorateur")).toBe(
      "Société"
    );
    expect(getOrgFieldLabel("palais-des-festivals", "standServed", "fr", "Stand desservi")).toBe(
      "Stand | Client"
    );
  });

  it("fournit une traduction non française pour en/pt/pl (pas de résidu FR)", () => {
    for (const key of ["decoratorName", "standServed"] as const) {
      const fr = getOrgFieldLabel("palais", key, "fr", "fallback");
      for (const lang of ["en", "pt", "pl"] as LangCode[]) {
        const label = getOrgFieldLabel("palais", key, lang, "fallback");
        expect(label).not.toBe("fallback");
        expect(label.trim().length).toBeGreaterThan(0);
        // « Société » ne doit pas rester tel quel dans une autre langue.
        if (key === "decoratorName") expect(label).not.toBe(fr);
      }
    }
  });

  it("couvre les 11 langues pour chaque libellé surchargé", () => {
    for (const key of ["decoratorName", "decoratorPlaceholder", "standServed", "standPlaceholder"] as const) {
      for (const lang of LANGS) {
        expect(getOrgFieldLabel("palais", key, lang, "fallback")).not.toBe("fallback");
      }
    }
  });
});

describe("getOrgFieldLabel — RX / autres (inchangé)", () => {
  it("renvoie le fallback pour RX et les autres organisations", () => {
    expect(getOrgFieldLabel("rx", "decoratorName", "fr", "Nom du décorateur")).toBe(
      "Nom du décorateur"
    );
    expect(getOrgFieldLabel("autre-org", "standServed", "en", "Stand served")).toBe("Stand served");
    expect(getOrgFieldLabel(null, "decoratorName", "fr", "Nom du décorateur")).toBe(
      "Nom du décorateur"
    );
  });
});

describe("buildUnloadingOptions — Palais", () => {
  it("ordonne Inconnu, puis Déchargement manuel, puis les prestataires", () => {
    const opts = buildUnloadingOptions("palais-des-festivals", PROVIDERS, "fr");
    expect(opts.map((o) => o.value)).toEqual([
      UNLOADING_UNKNOWN,
      UNLOADING_MANUAL,
      "GL Events",
      "Sud Manut",
    ]);
    expect(opts[0].label).toBe("Inconnu");
    expect(opts[1].label).toBe("Déchargement manuel");
    // Noms propres de prestataires : non traduits.
    expect(opts[2].label).toBe("GL Events");
  });

  it("traduit les options génériques selon la langue", () => {
    const en = buildUnloadingOptions("palais", PROVIDERS, "en");
    expect(en[0].label).toBe("Unknown");
    expect(en[1].label).toBe("Manual unloading");
    const pl = buildUnloadingOptions("palais", PROVIDERS, "pl");
    expect(pl[0].label).toBe("Nieznany");
  });

  it("n'envoie jamais de libellé traduit comme valeur backend", () => {
    const en = buildUnloadingOptions("palais", PROVIDERS, "en");
    expect(en[0].value).toBe(UNLOADING_UNKNOWN);
    expect(en[1].value).toBe(UNLOADING_MANUAL);
  });
});

describe("buildUnloadingOptions — défaut (non Palais)", () => {
  it("préserve le comportement historique : prestataires puis Déchargement manuel", () => {
    const opts = buildUnloadingOptions("rx", PROVIDERS, "fr");
    expect(opts.map((o) => o.value)).toEqual(["GL Events", "Sud Manut", UNLOADING_MANUAL]);
    // Pas d'option « Inconnu » hors Palais.
    expect(opts.some((o) => o.value === UNLOADING_UNKNOWN)).toBe(false);
  });
});

describe("getDefaultUnloadingValue", () => {
  it("présélectionne Inconnu pour Palais", () => {
    expect(getDefaultUnloadingValue("palais-des-festivals")).toBe(UNLOADING_UNKNOWN);
  });

  it("ne présélectionne rien hors Palais", () => {
    expect(getDefaultUnloadingValue("rx")).toBe("");
    expect(getDefaultUnloadingValue(null)).toBe("");
  });
});

describe("resolveUnloadingLabel", () => {
  it("traduit les codes synthétiques connus", () => {
    expect(resolveUnloadingLabel(UNLOADING_UNKNOWN, "fr")).toBe("Inconnu");
    expect(resolveUnloadingLabel(UNLOADING_UNKNOWN, "en")).toBe("Unknown");
    expect(resolveUnloadingLabel(UNLOADING_MANUAL, "fr")).toBe("Déchargement manuel");
    expect(resolveUnloadingLabel(UNLOADING_MANUAL, "pt")).toBe("Descarga manual");
  });

  it("laisse les noms de prestataires inchangés", () => {
    expect(resolveUnloadingLabel("GL Events", "en")).toBe("GL Events");
  });

  it("gère les valeurs vides", () => {
    expect(resolveUnloadingLabel("", "fr")).toBe("");
    expect(resolveUnloadingLabel(null, "fr")).toBe("");
    expect(resolveUnloadingLabel(undefined, "en")).toBe("");
  });
});
