import { describe, it, expect } from "vitest";
import { RX_PLANNING } from "./planning-data";

/**
 * Valide la conversion du planning CYF26 (XLSX → RX_PLANNING), générée par
 * `scripts/import-rx-planning.ts`. On vérifie les cas représentatifs du
 * mapping et du découpage jour par jour.
 */
describe("RX_PLANNING — planning CYF26 converti", () => {
  it("POWER : ponton, stand-tente et bateau-terre ont des plages montage + démontage", () => {
    const p = RX_PLANNING.POWER;
    expect(Object.keys(p["ponton-privatif"].liv).length).toBeGreaterThan(0);
    expect(Object.keys(p["ponton-privatif"].rep).length).toBeGreaterThan(0);
    expect(Object.keys(p["stand-tente"].liv).length).toBeGreaterThan(0);
    // POWER est le seul Canto avec bateaux à terre (montage 03-04/09).
    expect(p["bateau-terre"].liv["2026-09-03"]).toBe("14:00-23:00");
    expect(p["bateau-terre"].liv["2026-09-04"]).toBe("08:00-16:00");
    expect(p["bateau-terre"].rep["2026-09-15"]).toBe("08:00-17:00");
  });

  it("EXTERIEUR_PALAIS : bateau-terre a une DOUBLE plage (2 jours montage + 2 jours démontage)", () => {
    const bt = RX_PLANNING.EXTERIEUR_PALAIS["bateau-terre"];
    expect(bt.liv["2026-09-04"]).toBe("18:00-21:00");
    expect(bt.liv["2026-09-05"]).toBe("18:00-21:00");
    expect(bt.rep["2026-09-14"]).toBe("17:00-21:00");
    expect(bt.rep["2026-09-15"]).toBe("17:00-21:00");
  });

  it("BROKER : pas de montage ponton (N/A), mais démontage ponton présent", () => {
    const ponton = RX_PLANNING.BROKER["ponton-privatif"];
    expect(Object.keys(ponton.liv).length).toBe(0); // N/A au montage
    expect(Object.keys(ponton.rep).length).toBeGreaterThan(0); // démontage présent
    // stand-tente présent au montage
    expect(Object.keys(RX_PLANNING.BROKER["stand-tente"].liv).length).toBeGreaterThan(0);
  });

  it("N/A → catégorie sans plage (objets vides), jamais de plage parasite", () => {
    // QML n'a pas de bateaux à terre.
    const qmlBt = RX_PLANNING.QML["bateau-terre"];
    expect(qmlBt.liv).toEqual({});
    expect(qmlBt.rep).toEqual({});
  });

  it("Découpage jour par jour : dernier jour de montage POWER ponton finit à 19:00", () => {
    // POWER ponton montage 05/09 12h → 07/09 19h
    const liv = RX_PLANNING.POWER["ponton-privatif"].liv;
    expect(liv["2026-09-05"]).toBe("12:00-23:00"); // 1er jour : début → 23:00
    expect(liv["2026-09-06"]).toBe("08:00-23:00"); // jour intermédiaire
    expect(liv["2026-09-07"]).toBe("08:00-19:00"); // dernier jour : 08:00 → fin
  });
});
