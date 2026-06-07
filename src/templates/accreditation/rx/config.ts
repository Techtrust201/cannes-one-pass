/**
 * Configuration métier RX / Cannes Yachting Festival 2026.
 *
 * Les plannings (matrice espace × catégorie × jour) proviennent du planning
 * officiel RX et sont générés dans `planning-data.ts` (cf.
 * `scripts/import-rx-planning.ts`). Ce fichier ne contient que la logique
 * métier : construction des espaces, dérivation depuis le secteur exposant,
 * restriction « bateaux à terre », génération des créneaux.
 *
 * Modèle unifié : chaque espace propose les **3 catégories** identiques
 * (parité avec le planning) — Ponton privatif / Stand sous tente / Bateaux à
 * terre — une catégorie n'étant proposée que si elle a au moins une plage.
 */

import {
  RX_PLANNING,
  RX_SPACE_LABELS,
  type DateTimeSlots,
  type RxCategoryId,
} from "./planning-data";

export type { DateTimeSlots, RxCategoryId };

export interface RxCategory {
  id: string;
  name: string;
  /** Plages de livraison (montage) par date. */
  liv: DateTimeSlots;
  /** Plages de reprise (démontage) par date. */
  rep: DateTimeSlots;
  /** True si Scales doit être automatiquement assigné (manutention spécialisée). */
  scales: boolean;
  /** Note d'information complémentaire pour les exposants. */
  scalesNote?: string;
}

export interface RxSpaceDef {
  id: string;
  label: string;
  /** Note d'espace affichée en récap (ex: Tenders). */
  note?: string;
  categories: RxCategory[];
}

/**
 * Métadonnées des 3 catégories unifiées. Seule « Bateaux à terre » déclenche
 * la manutention Scales automatique. Les libellés sont traduits via
 * `t.rx.categories[id]` (repli sur `name` ci-dessous).
 */
const CATEGORY_META: Record<
  RxCategoryId,
  { name: string; scales: boolean; scalesNote?: string }
> = {
  "ponton-privatif": { name: "Ponton privatif", scales: false },
  "stand-tente": {
    name: "Stand sous tente / Espace nu devant bateau",
    scales: false,
  },
  "bateau-terre": {
    name: "Bateaux à terre",
    scales: true,
    scalesNote:
      "Manutention via Scales obligatoire pour les bateaux à terre.",
  },
};

const CATEGORY_ORDER: RxCategoryId[] = [
  "ponton-privatif",
  "stand-tente",
  "bateau-terre",
];

/** Construit les espaces RX depuis le planning généré. */
function buildSpaces(): Record<string, RxSpaceDef> {
  const out: Record<string, RxSpaceDef> = {};
  for (const [spaceId, cats] of Object.entries(RX_PLANNING)) {
    const labelDef = RX_SPACE_LABELS[spaceId] ?? { label: spaceId };
    const categories: RxCategory[] = [];
    for (const catId of CATEGORY_ORDER) {
      const sched = cats[catId];
      const hasData =
        Object.keys(sched.liv).length > 0 || Object.keys(sched.rep).length > 0;
      if (!hasData) continue;
      const meta = CATEGORY_META[catId];
      categories.push({
        id: catId,
        name: meta.name,
        liv: sched.liv,
        rep: sched.rep,
        scales: meta.scales,
        scalesNote: meta.scalesNote,
      });
    }
    out[spaceId] = {
      id: spaceId,
      label: labelDef.label,
      note: labelDef.note,
      categories,
    };
  }
  return out;
}

/** Tous les espaces logistiques RX (3 catégories unifiées par espace). */
export const RX_SPACES: Record<string, RxSpaceDef> = buildSpaces();

/** Espace spécial signalant qu'un choix Intérieur/Extérieur Palais est requis. */
export const PALAIS_CHOICE = "PALAIS_CHOICE";

/**
 * « Bateaux à terre » n'est proposé que pour certains secteurs (règle RX) :
 *   - Port Canto — POWER
 *   - Vieux Port — PALAIS extérieur
 * Pour tout autre secteur, la catégorie est masquée même si l'espace la
 * contient (les bateaux à terre en auto-déchargement choisissent « Stand sous
 * tente / Espace nu devant bateau »).
 */
export function isBateauTerreAllowed(sector: string): boolean {
  const s = (sector ?? "").toUpperCase();
  const cantoPower = s.includes("CANTO") && s.includes("POWER");
  const palaisExt =
    s.includes("PALAIS") &&
    (s.includes("EXT") || s.includes("EXTÉRIEUR") || s.includes("EXTERIEUR"));
  return cantoPower || palaisExt;
}

/**
 * Mapping `secteur` (figé sur l'exposant) → clé d'espace logistique.
 * Retourne `requiresUserChoice` lorsque le secteur est "PALAIS — PALAIS"
 * (l'exposant doit alors préciser Intérieur ou Extérieur).
 */
export function deriveSpaceFromSector(sector: string): {
  space: string | null;
  requiresUserChoice: boolean;
} {
  const s = (sector ?? "").trim().toUpperCase();
  if (s.includes("PALAIS — PALAIS") || s.includes("PALAIS – PALAIS")) {
    return { space: PALAIS_CHOICE, requiresUserChoice: true };
  }
  if (s.includes("PALAIS EXT")) {
    return { space: "EXTERIEUR_PALAIS", requiresUserChoice: false };
  }
  if (s.includes("PALAIS INT")) {
    return { space: "INTERIEUR_PALAIS", requiresUserChoice: false };
  }
  if (s.includes("SYE")) return { space: "SYE", requiresUserChoice: false };
  if (s.includes("PANTIERO") || s.includes("PAN")) {
    return { space: "PANTIERO", requiresUserChoice: false };
  }
  if (s.includes("QSP")) return { space: "QSP", requiresUserChoice: false };
  if (s.includes("JETEE") || s.includes("JETÉE")) {
    return { space: "JETEE", requiresUserChoice: false };
  }
  if (s.includes("QML")) return { space: "QML", requiresUserChoice: false };
  if (s.includes("TENDERS")) return { space: "TENDERS", requiresUserChoice: false };
  if (s.includes("POWER")) return { space: "POWER", requiresUserChoice: false };
  if (s.includes("SAIL")) return { space: "SAIL", requiresUserChoice: false };
  if (s.includes("BROKER")) return { space: "BROKER", requiresUserChoice: false };
  return { space: null, requiresUserChoice: false };
}

/** Retrouve la définition d'une catégorie dans un espace donné. */
export function findCategory(
  spaceKey: string,
  categoryId: string
): RxCategory | null {
  const space = RX_SPACES[spaceKey];
  if (!space) return null;
  return space.categories.find((c) => c.id === categoryId) ?? null;
}

export interface GenSlotsOptions {
  /**
   * Si true (défaut RX), l'heure de fin de la plage représente le **début du
   * dernier créneau de départ autorisé** : une plage `"08:00-19:00"` produit
   * donc un dernier créneau `19:00-20:00`. Si false, comportement classique
   * (dernier créneau `18:00-19:00`).
   */
  inclusiveLastStart?: boolean;
  /**
   * Heure de fin maximale d'un créneau (défaut 23) : empêche de générer un
   * créneau traversant minuit (ex. `23:00-00:00`) sur les plages finissant à
   * 23:00 — non demandé par RX (dernier créneau métier = 19h–20h).
   */
  maxEndHour?: number;
}

/**
 * Génère des créneaux d'une heure depuis une plage `"HH:MM-HH:MM"`.
 *
 * Exemple (RX, `inclusiveLastStart`) :
 *   `"08:00-19:00"` → `["08:00-09:00", …, "18:00-19:00", "19:00-20:00"]`
 *   `"00:00-23:00"` → `[…, "22:00-23:00"]` (pas de `23:00-00:00`)
 *
 * IMPORTANT : une plage doit être stockée par jour (jamais `"19:00-17:00"`
 * traversant minuit, qui produirait une liste vide).
 */
export function genSlots(range: string, opts: GenSlotsOptions = {}): string[] {
  const { inclusiveLastStart = true, maxEndHour = 23 } = opts;
  if (!range || !range.includes("-")) return [];
  const [start, end] = range.split("-");
  const sh = parseInt(start.split(":")[0], 10);
  const eh = parseInt(end.split(":")[0], 10);
  if (Number.isNaN(sh) || Number.isNaN(eh) || eh <= sh) return [];
  const slots: string[] = [];
  for (let h = sh; h < eh; h++) {
    slots.push(
      `${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00`
    );
  }
  // Créneau supplémentaire dont le DÉBUT = heure de fin de plage (règle RX),
  // borné pour ne jamais traverser minuit ni dépasser `maxEndHour`.
  if (inclusiveLastStart && eh + 1 <= maxEndHour) {
    slots.push(
      `${String(eh).padStart(2, "0")}:00-${String(eh + 1).padStart(2, "0")}:00`
    );
  }
  return slots;
}

/** Formate une date ISO "YYYY-MM-DD" en français court : "jeu 3 sep". */
export function formatDateFR(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const months = [
    "jan", "fév", "mar", "avr", "mai", "jun",
    "jul", "aoû", "sep", "oct", "nov", "déc",
  ];
  const days = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  const dt = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return iso;
  return `${days[dt.getDay()]} ${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]}`;
}

/** Formate un créneau "08:00-09:00" pour affichage : "08:00 – 09:00". */
export function formatSlot(slot: string): string {
  return slot ? slot.replace("-", " – ") : "";
}

/**
 * Liste des prestataires de manutention pour l'étape 5 RX (repli si la BDD
 * n'en renvoie aucun). L'option « Autre » (champ libre) est ajoutée par le
 * composant, pas ici.
 */
export const RX_MANUTENTION_PROVIDERS = [
  { value: "Scales", label: "Scales" },
  { value: "Mathez", label: "Mathez" },
  { value: "SVMM", label: "SVMM" },
  { value: "Clamageran", label: "Clamageran" },
];
