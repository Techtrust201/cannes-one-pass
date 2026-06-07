/**
 * Planning CYF26 — données générées depuis `CYF26-planning.xlsx`.
 *
 * NE PAS ÉDITER À LA MAIN : ce fichier est (re)généré par
 * `scripts/import-rx-planning.ts` à partir du planning officiel RX.
 *
 * Structure : pour chaque espace logistique, les 3 catégories unifiées
 * (`ponton-privatif`, `stand-tente`, `bateau-terre`) avec leurs plages de
 * montage (`liv`) et de démontage (`rep`), indexées par date `YYYY-MM-DD`
 * et exprimées en `"HH:MM-HH:MM"` (une entrée par jour). Une catégorie sans
 * plage (`liv` et `rep` vides) n'est pas proposée pour l'espace concerné.
 *
 * Convention de découpage jour par jour :
 *   - premier jour : heure de début du planning → 23:00
 *   - jours intermédiaires : 08:00 → 23:00
 *   - dernier jour : 08:00 → heure de fin du planning
 *   - plage sur un seul jour : heure de début → heure de fin
 * L'heure de fin représente le **dernier créneau de départ autorisé**
 * (cf. `genSlots(..., { inclusiveLastStart: true })`).
 */

/** Map "YYYY-MM-DD" → "HH:MM-HH:MM" (une plage par jour). */
export type DateTimeSlots = Record<string, string>;

/** Les 3 catégories logistiques unifiées RX (parité avec le planning). */
export type RxCategoryId = "ponton-privatif" | "stand-tente" | "bateau-terre";

export const RX_PLANNING: Record<
  string,
  Record<RxCategoryId, { liv: DateTimeSlots; rep: DateTimeSlots }>
> = {
  INTERIEUR_PALAIS: {
    "ponton-privatif": { liv: {}, rep: {} },
    "stand-tente": { liv: { "2026-09-03": "08:00-23:00", "2026-09-04": "08:00-23:00", "2026-09-05": "08:00-23:00", "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-23:00", "2026-09-15": "08:00-12:00" } },
    "bateau-terre": { liv: {}, rep: {} },
  },
  EXTERIEUR_PALAIS: {
    "ponton-privatif": { liv: {}, rep: {} },
    "stand-tente": { liv: { "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-17:00" } },
    "bateau-terre": { liv: { "2026-09-04": "18:00-21:00", "2026-09-05": "18:00-21:00" }, rep: { "2026-09-14": "17:00-21:00", "2026-09-15": "17:00-21:00" } },
  },
  QML: {
    "ponton-privatif": { liv: { "2026-09-03": "08:00-23:00", "2026-09-04": "08:00-23:00", "2026-09-05": "08:00-23:00", "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-19:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-12:00" } },
    "stand-tente": { liv: { "2026-09-05": "08:00-23:00", "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-17:00" } },
    "bateau-terre": { liv: {}, rep: {} },
  },
  QSP: {
    "ponton-privatif": { liv: { "2026-09-04": "12:00-23:00", "2026-09-05": "08:00-23:00", "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-19:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-12:00" } },
    "stand-tente": { liv: { "2026-09-05": "08:00-23:00", "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-17:00" } },
    "bateau-terre": { liv: {}, rep: {} },
  },
  PANTIERO: {
    "ponton-privatif": { liv: { "2026-09-06": "12:00-23:00", "2026-09-07": "08:00-19:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-12:00" } },
    "stand-tente": { liv: { "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-17:00" } },
    "bateau-terre": { liv: {}, rep: {} },
  },
  JETEE: {
    "ponton-privatif": { liv: { "2026-09-06": "12:00-23:00", "2026-09-07": "08:00-19:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-12:00" } },
    "stand-tente": { liv: { "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-17:00" } },
    "bateau-terre": { liv: {}, rep: {} },
  },
  SYE: {
    "ponton-privatif": { liv: {}, rep: {} },
    "stand-tente": { liv: { "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-17:00" } },
    "bateau-terre": { liv: { "2026-09-04": "18:00-21:00", "2026-09-05": "18:00-21:00" }, rep: { "2026-09-14": "17:00-21:00", "2026-09-15": "17:00-21:00" } },
  },
  TENDERS: {
    "ponton-privatif": { liv: {}, rep: {} },
    "stand-tente": { liv: { "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-17:00" } },
    "bateau-terre": { liv: { "2026-09-04": "18:00-21:00", "2026-09-05": "18:00-21:00" }, rep: { "2026-09-14": "17:00-21:00", "2026-09-15": "17:00-21:00" } },
  },
  BROKER: {
    "ponton-privatif": { liv: {}, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-12:00" } },
    "stand-tente": { liv: { "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-17:00" } },
    "bateau-terre": { liv: {}, rep: {} },
  },
  SAIL: {
    "ponton-privatif": { liv: { "2026-09-04": "12:00-23:00", "2026-09-05": "08:00-23:00", "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-19:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-12:00" } },
    "stand-tente": { liv: { "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-17:00" } },
    "bateau-terre": { liv: {}, rep: {} },
  },
  POWER: {
    "ponton-privatif": { liv: { "2026-09-05": "12:00-23:00", "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-19:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-12:00" } },
    "stand-tente": { liv: { "2026-09-06": "08:00-23:00", "2026-09-07": "08:00-23:00" }, rep: { "2026-09-13": "19:00-23:00", "2026-09-14": "08:00-17:00" } },
    "bateau-terre": { liv: { "2026-09-03": "14:00-23:00", "2026-09-04": "08:00-16:00" }, rep: { "2026-09-15": "08:00-17:00" } },
  },
};

/** Libellés d'affichage des espaces (repris en i18n via `t.rx.spaces`). */
export const RX_SPACE_LABELS: Record<string, { label: string; note?: string }> = {
  INTERIEUR_PALAIS: { label: "Intérieur Palais des Festivals" },
  EXTERIEUR_PALAIS: { label: "Extérieur Palais des Festivals" },
  QML: { label: "Quai Max Laubeuf (QML) + traversante" },
  QSP: { label: "Quai Saint-Pierre" },
  PANTIERO: { label: "Pantiero" },
  JETEE: { label: "Jetée Nord / Sud" },
  SYE: { label: "Super Yachts Extension" },
  TENDERS: {
    label: "Espace Tenders (proche du Palais)",
    note: "Espace proche du Palais — règles équivalentes à l'Extérieur Palais.",
  },
  BROKER: { label: "Espace Broker et Toys" },
  SAIL: { label: "Espace Voile (Mono / Multicoque)" },
  POWER: { label: "Power Boat Marina" },
};
