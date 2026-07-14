import { describe, it, expect } from "vitest";
import {
  resolveEffectiveRxSpace,
  resolveEffectiveRxSector,
  isBateauTerreAllowed,
  findCategory,
  RX_SPACES,
} from "./config";

/**
 * Phase 6C-A (F1) — `resolveEffectiveRxSpace`/`resolveEffectiveRxSector`
 * doivent être la SEULE source de vérité pour l'espace/secteur RX dès
 * qu'un emplacement référentiel est résolu ; le repli sur le secteur legacy
 * brut de l'exposant n'est autorisé qu'en `DISABLED`/`TRANSITION`, jamais en
 * `STRICT` (D1).
 */
describe("resolveEffectiveRxSpace", () => {
  it("priorité 1 : logisticSpace de l'emplacement s'il correspond à une clé RX_SPACES valide", () => {
    const res = resolveEffectiveRxSpace({
      logisticSpace: "POWER",
      sectorCode: "PALAIS_EXT", // ne doit pas être utilisé : priorité 1 gagne
      exhibitorSector: "PALAIS — PALAIS",
      planningMode: "STRICT",
    });
    expect(res).toEqual({ space: "POWER", requiresUserChoice: false, source: "LOCATION_SPACE" });
  });

  it("ignore logisticSpace s'il ne correspond à AUCUNE clé RX_SPACES (jamais de clé inventée)", () => {
    const res = resolveEffectiveRxSpace({
      logisticSpace: "SOMETHING_UNKNOWN",
      sectorCode: "POWER",
      planningMode: "STRICT",
    });
    expect(res.source).toBe("LOCATION_SECTOR_DERIVED");
    expect(res.space).toBe("POWER");
  });

  it("priorité 2 : dérivation depuis sectorCode canonique de l'emplacement si logisticSpace absent", () => {
    const res = resolveEffectiveRxSpace({ sectorCode: "PALAIS_EXT", planningMode: "STRICT" });
    expect(res).toEqual({
      space: "EXTERIEUR_PALAIS",
      requiresUserChoice: false,
      source: "LOCATION_SECTOR_DERIVED",
    });
  });

  it("sectorCode est insensible à la casse et aux espaces", () => {
    const res = resolveEffectiveRxSpace({ sectorCode: "  power  ", planningMode: "TRANSITION" });
    expect(res.space).toBe("POWER");
    expect(res.source).toBe("LOCATION_SECTOR_DERIVED");
  });

  it("priorité 3 : repli legacy sur exhibitorSector autorisé en DISABLED", () => {
    const res = resolveEffectiveRxSpace({ exhibitorSector: "POWER — PORT CANTO", planningMode: "DISABLED" });
    expect(res).toEqual({ space: "POWER", requiresUserChoice: false, source: "LEGACY_SECTOR" });
  });

  it("priorité 3 : repli legacy sur exhibitorSector autorisé en TRANSITION", () => {
    const res = resolveEffectiveRxSpace({ exhibitorSector: "SAIL", planningMode: "TRANSITION" });
    expect(res).toEqual({ space: "SAIL", requiresUserChoice: false, source: "LEGACY_SECTOR" });
  });

  it("STRICT interdit le repli legacy sur exhibitorSector (D1) : renvoie non résolu plutôt qu'une valeur inventée", () => {
    const res = resolveEffectiveRxSpace({ exhibitorSector: "SAIL", planningMode: "STRICT" });
    expect(res).toEqual({ space: null, requiresUserChoice: false, source: "UNRESOLVED" });
  });

  it("legacy ambigu PALAIS — PALAIS : requiresUserChoice=true si aucun choix manuel fourni", () => {
    const res = resolveEffectiveRxSpace({ exhibitorSector: "PALAIS — PALAIS", planningMode: "DISABLED" });
    expect(res.requiresUserChoice).toBe(true);
    expect(res.source).toBe("LEGACY_SECTOR");
  });

  it("legacy ambigu PALAIS — PALAIS : utilise le choix manuel Intérieur/Extérieur s'il est fourni", () => {
    const res = resolveEffectiveRxSpace({
      exhibitorSector: "PALAIS — PALAIS",
      manualPalaisChoice: "INTERIEUR_PALAIS",
      planningMode: "TRANSITION",
    });
    expect(res).toEqual({
      space: "INTERIEUR_PALAIS",
      requiresUserChoice: false,
      source: "LEGACY_SECTOR_MANUAL_PALAIS",
    });
  });

  it("une donnée référentielle réelle rend le choix manuel Palais obsolète (priorité 1 gagne toujours)", () => {
    const res = resolveEffectiveRxSpace({
      logisticSpace: "POWER",
      manualPalaisChoice: "INTERIEUR_PALAIS",
      exhibitorSector: "PALAIS — PALAIS",
      planningMode: "TRANSITION",
    });
    expect(res.space).toBe("POWER");
    expect(res.source).toBe("LOCATION_SPACE");
  });

  it("aucune donnée du tout : non résolu explicite", () => {
    const res = resolveEffectiveRxSpace({ planningMode: "DISABLED" });
    expect(res).toEqual({ space: null, requiresUserChoice: false, source: "UNRESOLVED" });
  });

  it("toutes les clés produites par SECTOR_CODE_TO_SPACE correspondent à une clé RX_SPACES connue", () => {
    const sectorCodes = [
      "PALAIS_EXT",
      "PALAIS_INT_NU",
      "PALAIS_INT_EQUIPE",
      "POWER",
      "SAIL",
      "SAIL_MULTICOQUE",
      "SAIL_MONOCOQUE",
      "BROKER",
      "TENDERS",
      "PANTIERO",
      "JETEE",
      "QML",
      "QSP",
      "SYE",
    ];
    for (const sectorCode of sectorCodes) {
      const res = resolveEffectiveRxSpace({ sectorCode, planningMode: "STRICT" });
      expect(res.space, `sectorCode=${sectorCode}`).not.toBeNull();
      expect(Object.keys(RX_SPACES), `sectorCode=${sectorCode} -> ${res.space}`).toContain(res.space);
    }
  });
});

describe("resolveEffectiveRxSector", () => {
  it("priorité 1 : sectorCode + portCode de l'emplacement, reconstruit en '{portCode} {sectorCode}'", () => {
    const res = resolveEffectiveRxSector({ portCode: "PORT_CANTO", sectorCode: "POWER" });
    expect(res).toEqual({ sector: "PORT_CANTO POWER", source: "LOCATION_SECTOR" });
  });

  it("sectorCode seul (sans portCode) : conserve juste le sectorCode", () => {
    const res = resolveEffectiveRxSector({ sectorCode: "PALAIS_EXT" });
    expect(res).toEqual({ sector: "PALAIS_EXT", source: "LOCATION_SECTOR" });
  });

  it("priorité 2 : repli sur exhibitorSector legacy si aucun sectorCode d'emplacement", () => {
    const res = resolveEffectiveRxSector({ exhibitorSector: "POWER — PORT CANTO" });
    expect(res).toEqual({ sector: "POWER — PORT CANTO", source: "LEGACY_EXHIBITOR_SECTOR" });
  });

  it("aucune donnée : secteur vide explicite", () => {
    expect(resolveEffectiveRxSector({})).toEqual({ sector: "", source: "NONE" });
  });
});

describe("isBateauTerreAllowed — compatible secteur effectif ET legacy (F1)", () => {
  it("accepte le code canonique POWER (secteur effectif résolu par emplacement)", () => {
    expect(isBateauTerreAllowed("POWER")).toBe(true);
  });

  it("accepte le code canonique PALAIS_EXT (secteur effectif résolu par emplacement)", () => {
    expect(isBateauTerreAllowed("PALAIS_EXT")).toBe(true);
  });

  it("accepte le secteur effectif composite 'PORT_CANTO POWER' produit par resolveEffectiveRxSector", () => {
    const { sector } = resolveEffectiveRxSector({ portCode: "PORT_CANTO", sectorCode: "POWER" });
    expect(isBateauTerreAllowed(sector)).toBe(true);
  });

  it("accepte toujours le secteur legacy brut historique (rétrocompatibilité)", () => {
    expect(isBateauTerreAllowed("PORT CANTO — POWER")).toBe(true);
    expect(isBateauTerreAllowed("PALAIS — EXTÉRIEUR")).toBe(true);
  });

  it("refuse un secteur ne correspondant à aucune règle bateau-terre", () => {
    expect(isBateauTerreAllowed("SAIL")).toBe(false);
    expect(isBateauTerreAllowed("QML")).toBe(false);
    expect(isBateauTerreAllowed("")).toBe(false);
  });
});

describe("scalesRequired (StepManutentionRx) — logisticSpace prioritaire sur le secteur legacy (F1, correction ciblée)", () => {
  it("un logisticSpace d'emplacement différent du secteur legacy déclenche bien Scales pour 'bateau-terre'", () => {
    // Secteur legacy figé sur l'exposant : dérive vers l'espace "SAIL", qui
    // n'a AUCUNE plage bateau-terre (catégorie absente de RX_SPACES.SAIL) —
    // avec l'ancien code (`findCategory(stepOne.space, …)`), Scales ne serait
    // JAMAIS requis pour cet exposant.
    const legacySpace = resolveEffectiveRxSpace({
      exhibitorSector: "SAIL",
      planningMode: "DISABLED",
    });
    expect(legacySpace.space).toBe("SAIL");
    expect(findCategory(legacySpace.space ?? "", "bateau-terre")?.scales).toBeUndefined();

    // Mais un ExhibitorLocation réel a été résolu pour cet exposant, avec un
    // logisticSpace "POWER" (qui, lui, a bien une plage bateau-terre avec
    // scales=true) : l'espace EFFECTIF doit refléter cette réalité
    // référentielle, pas le texte legacy périmé.
    const effectiveSpace = resolveEffectiveRxSpace({
      logisticSpace: "POWER",
      sectorCode: "POWER",
      exhibitorSector: "SAIL", // texte legacy toujours présent sur l'exposant, mais périmé
      planningMode: "TRANSITION",
    });
    expect(effectiveSpace.space).toBe("POWER");
    expect(findCategory(effectiveSpace.space ?? "", "bateau-terre")?.scales).toBe(true);
  });

  it("sans emplacement référentiel résolu (espace vide '' comme après un changement d'emplacement), scalesRequired reste false plutôt que planté", () => {
    // `findCategory` doit rester défensif : jamais de crash sur une clé
    // d'espace vide/inconnue (ex. juste après `selectLocation`, avant que
    // `resolveEffectiveRxSpace` ne retrouve le nouvel espace effectif).
    expect(findCategory("", "bateau-terre")).toBeNull();
    expect(findCategory("SOMETHING_UNKNOWN", "bateau-terre")).toBeNull();
  });
});
