import { describe, it, expect } from "vitest";
import { mapEventOptionFromApi } from "./event-carousel-mapper";

/**
 * Phase 6C-A (F8) — `GET /api/events` renvoie déjà `logisticsPlanningMode`
 * (objet `Event` complet) : ce champ ne doit plus être supprimé lors du
 * mapping vers `EventOption`, sous peine de faire retomber silencieusement
 * tout le formulaire RX en comportement `DISABLED` legacy.
 */
describe("mapEventOptionFromApi", () => {
  it("conserve logisticsPlanningMode=TRANSITION renvoyé par l'API", () => {
    const opt = mapEventOptionFromApi({
      id: "evt-1",
      slug: "yachting-2026",
      name: "Yachting Festival",
      logo: "/logo.png",
      logisticsPlanningMode: "TRANSITION",
    });
    expect(opt.logisticsPlanningMode).toBe("TRANSITION");
  });

  it("conserve logisticsPlanningMode=STRICT renvoyé par l'API", () => {
    const opt = mapEventOptionFromApi({
      id: "evt-2",
      slug: "yachting-2027",
      name: "Yachting Festival 2027",
      logo: null,
      logisticsPlanningMode: "STRICT",
    });
    expect(opt.logisticsPlanningMode).toBe("STRICT");
  });

  it("retombe sur DISABLED si le champ est absent (rétrocompatibilité anciens events)", () => {
    const opt = mapEventOptionFromApi({
      id: "evt-3",
      slug: "legacy-event",
      name: "Événement historique",
      logo: null,
    });
    expect(opt.logisticsPlanningMode).toBe("DISABLED");
  });

  it("retombe sur DISABLED si le champ est null", () => {
    const opt = mapEventOptionFromApi({
      id: "evt-4",
      slug: "legacy-event-2",
      name: "Événement historique 2",
      logo: null,
      logisticsPlanningMode: null,
    });
    expect(opt.logisticsPlanningMode).toBe("DISABLED");
  });

  it("retombe sur DISABLED si le champ contient une valeur inconnue (défense en profondeur)", () => {
    const opt = mapEventOptionFromApi({
      id: "evt-5",
      slug: "corrupted-event",
      name: "Événement corrompu",
      logo: null,
      logisticsPlanningMode: "SOMETHING_ELSE",
    });
    expect(opt.logisticsPlanningMode).toBe("DISABLED");
  });

  it("utilise le logo fourni par l'API si présent", () => {
    const opt = mapEventOptionFromApi({
      id: "evt-6",
      slug: "with-logo",
      name: "Avec logo",
      logo: "https://cdn.example.com/logo.png",
      logisticsPlanningMode: "DISABLED",
    });
    expect(opt.logo).toBe("https://cdn.example.com/logo.png");
  });

  it("dérive une URL de logo par défaut via /api/events/{id}/logo si absent", () => {
    const opt = mapEventOptionFromApi({
      id: "evt-7",
      slug: "no-logo",
      name: "Sans logo",
      logo: null,
      logisticsPlanningMode: "DISABLED",
    });
    expect(opt.logo).toBe("/api/events/evt-7/logo");
  });

  it("mappe id/slug/name vers id/key/label", () => {
    const opt = mapEventOptionFromApi({
      id: "evt-8",
      slug: "mon-slug",
      name: "Mon Nom",
      logo: null,
    });
    expect(opt.id).toBe("evt-8");
    expect(opt.key).toBe("mon-slug");
    expect(opt.label).toBe("Mon Nom");
  });
});
