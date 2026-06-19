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

/** Slug d'organisation Palais (distinct du slug de template « palais »). */
const PALAIS = "palais-des-festivals";

const PROVIDERS = [
  { id: "p1", name: "GL Events" },
  { id: "p2", name: "Sud Manut" },
];

describe("isPalaisOrg", () => {
  it("reconnaît le slug d'organisation Palais (insensible à la casse)", () => {
    expect(isPalaisOrg("palais-des-festivals")).toBe(true);
    expect(isPalaisOrg("PALAIS-DES-FESTIVALS")).toBe(true);
    expect(isPalaisOrg("  palais-des-festivals  ")).toBe(true);
  });

  it("ne traite PAS le slug de template « palais » comme l'organisation Palais", () => {
    // « palais » est un formTemplate, jamais un Organization.slug : il ne doit
    // pas déclencher les surcharges Palais.
    expect(isPalaisOrg("palais")).toBe(false);
  });

  it("rejette RX, une organisation fictive et les valeurs vides", () => {
    expect(isPalaisOrg("rx")).toBe(false);
    expect(isPalaisOrg("cannes-lions")).toBe(false);
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
      const fr = getOrgFieldLabel(PALAIS, key, "fr", "fallback");
      for (const lang of ["en", "pt", "pl"] as LangCode[]) {
        const label = getOrgFieldLabel(PALAIS, key, lang, "fallback");
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
        expect(getOrgFieldLabel(PALAIS, key, lang, "fallback")).not.toBe("fallback");
      }
    }
  });
});

describe("getOrgFieldLabel — RX / autres orgs / template (inchangé)", () => {
  it("renvoie le fallback pour RX, une org fictive, le template « palais » et null", () => {
    expect(getOrgFieldLabel("rx", "decoratorName", "fr", "Nom du décorateur")).toBe(
      "Nom du décorateur"
    );
    expect(getOrgFieldLabel("cannes-lions", "standServed", "en", "Stand served")).toBe(
      "Stand served"
    );
    // Slug de template, pas l'organisation Palais → pas de surcharge.
    expect(getOrgFieldLabel("palais", "decoratorName", "fr", "Nom du décorateur")).toBe(
      "Nom du décorateur"
    );
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
    const en = buildUnloadingOptions(PALAIS, PROVIDERS, "en");
    expect(en[0].label).toBe("Unknown");
    expect(en[1].label).toBe("Manual unloading");
    const pl = buildUnloadingOptions(PALAIS, PROVIDERS, "pl");
    expect(pl[0].label).toBe("Nieznany");
  });

  it("n'envoie jamais de libellé traduit comme valeur backend", () => {
    const en = buildUnloadingOptions(PALAIS, PROVIDERS, "en");
    expect(en[0].value).toBe(UNLOADING_UNKNOWN);
    expect(en[1].value).toBe(UNLOADING_MANUAL);
  });
});

describe("buildUnloadingOptions — déduplication", () => {
  it("masque un prestataire « Inconnu » qui ferait doublon avec l'option synthétique (Palais)", () => {
    const providers = [
      { id: "p0", name: "Inconnu" },
      { id: "p1", name: "GL Events" },
    ];
    const opts = buildUnloadingOptions(PALAIS, providers, "fr");
    // Une seule entrée « Inconnu » (la synthétique UNKNOWN), pas le prestataire.
    const inconnus = opts.filter((o) => o.label === "Inconnu");
    expect(inconnus).toHaveLength(1);
    expect(inconnus[0].value).toBe(UNLOADING_UNKNOWN);
    expect(opts.map((o) => o.value)).toEqual([UNLOADING_UNKNOWN, UNLOADING_MANUAL, "GL Events"]);
  });

  it("masque un prestataire « Autonome » ou « Déchargement manuel » (doublon manuel)", () => {
    const providers = [
      { id: "p0", name: "Autonome" },
      { id: "p1", name: "Déchargement manuel" },
      { id: "p2", name: "Mathez" },
    ];
    const opts = buildUnloadingOptions(PALAIS, providers, "fr");
    expect(opts.map((o) => o.value)).toEqual([UNLOADING_UNKNOWN, UNLOADING_MANUAL, "Mathez"]);
  });

  it("déduplique de façon insensible à la casse et aux espaces", () => {
    const providers = [{ id: "p0", name: "  inconnu  " }, { id: "p1", name: "BBO" }];
    const opts = buildUnloadingOptions(PALAIS, providers, "fr");
    expect(opts.filter((o) => o.label === "Inconnu")).toHaveLength(1);
    expect(opts.some((o) => o.value === "BBO")).toBe(true);
  });

  it("préserve l'ordre des prestataires tel que fourni par l'API (déjà trié)", () => {
    const providers = [
      { id: "p1", name: "Zeta" },
      { id: "p2", name: "Alpha" },
    ];
    // L'API trie par sortOrder puis nom ; le builder ne réordonne pas les
    // prestataires entre eux.
    const opts = buildUnloadingOptions(PALAIS, providers, "fr");
    const providerValues = opts.map((o) => o.value).filter((v) => v === "Zeta" || v === "Alpha");
    expect(providerValues).toEqual(["Zeta", "Alpha"]);
  });
});

describe("buildUnloadingOptions — défaut (non Palais)", () => {
  it("préserve le comportement historique pour RX et une org fictive", () => {
    for (const slug of ["rx", "cannes-lions", "palais" /* template slug */]) {
      const opts = buildUnloadingOptions(slug, PROVIDERS, "fr");
      expect(opts.map((o) => o.value)).toEqual(["GL Events", "Sud Manut", UNLOADING_MANUAL]);
      // Pas d'option « Inconnu » hors organisation Palais.
      expect(opts.some((o) => o.value === UNLOADING_UNKNOWN)).toBe(false);
    }
  });
});

describe("getDefaultUnloadingValue", () => {
  it("présélectionne Inconnu pour Palais", () => {
    expect(getDefaultUnloadingValue("palais-des-festivals")).toBe(UNLOADING_UNKNOWN);
  });

  it("ne présélectionne rien hors organisation Palais", () => {
    expect(getDefaultUnloadingValue("rx")).toBe("");
    expect(getDefaultUnloadingValue("cannes-lions")).toBe("");
    expect(getDefaultUnloadingValue("palais")).toBe(""); // slug de template
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
