/**
 * Configuration métier RX / Cannes Yachting Festival 2026.
 *
 * Source : cahier des charges RX (matrice espace × catégorie × jour),
 * transposé du planning officiel. Format des plages : `"HH:MM-HH:MM"`,
 * UNE entrée par jour (jamais de plage traversant minuit en une seule
 * chaîne — sinon `genSlots` renvoie une liste vide).
 *
 * À l'affichage, chaque couple (catégorie, date) propose des créneaux
 * d'une heure générés dynamiquement par `genSlots`.
 */

export type DateTimeSlots = Record<string, string>; // "YYYY-MM-DD" → "HH:MM-HH:MM"

export interface RxCategory {
  id: string;
  name: string;
  icon: string;
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

/** Tous les espaces logistiques RX. */
export const RX_SPACES: Record<string, RxSpaceDef> = {
  INTERIEUR_PALAIS: {
    id: "INTERIEUR_PALAIS",
    label: "Intérieur Palais des Festivals",
    categories: [
      {
        id: "stand-nu-int",
        name: "Stand nu",
        icon: "🛠️",
        liv: {
          "2026-09-03": "08:00-23:00",
          "2026-09-04": "08:00-23:00",
          "2026-09-05": "08:00-23:00",
          "2026-09-06": "08:00-23:00",
          "2026-09-07": "08:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-23:00",
          "2026-09-15": "00:00-12:00",
        },
        scales: false,
      },
      {
        id: "cle-en-main",
        name: "Stand Clé en main / Saphir",
        icon: "🔑",
        liv: { "2026-09-07": "08:00-23:00" },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-12:00",
        },
        scales: false,
      },
      {
        id: "bateau-terre-int",
        name: "Bateau à terre",
        icon: "⛵",
        liv: {
          "2026-09-03": "08:00-23:00",
          "2026-09-04": "08:00-23:00",
          "2026-09-05": "08:00-19:00",
        },
        rep: { "2026-09-15": "08:00-12:00" },
        scales: true,
        scalesNote:
          "Manutention bateaux intérieur Palais réalisée le mardi 15/09 selon planning Scales.",
      },
    ],
  },
  EXTERIEUR_PALAIS: {
    id: "EXTERIEUR_PALAIS",
    label: "Extérieur Palais des Festivals",
    categories: [
      {
        id: "bateau-terre-ext",
        name: "Bateau à terre",
        icon: "⛵",
        liv: {
          "2026-09-05": "16:00-23:00",
          "2026-09-06": "00:00-12:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-18:00",
        },
        scales: true,
        scalesNote: "Mise en place via Scales entre sam 5/09 16h et dim 6/09 12h.",
      },
      {
        id: "tente-ext",
        name: "Stand sous tente",
        icon: "⛺",
        liv: { "2026-09-07": "08:00-23:00" },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
      {
        id: "motoristes",
        name: "Structures spécifiques (motoristes)",
        icon: "⚙️",
        liv: {
          "2026-09-03": "18:00-23:00",
          "2026-09-04": "18:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: true,
        scalesNote:
          "Pour les moteurs, RDV obligatoire avec Scales (réception 1er–2 sept).",
      },
    ],
  },
  QML: {
    id: "QML",
    label: "Quai Max Laubeuf (QML) + traversante",
    categories: [
      {
        id: "flot-qml",
        name: "Bateau à flot / ponton privatif",
        icon: "🛥️",
        liv: {
          "2026-09-03": "12:00-23:00",
          "2026-09-04": "00:00-23:00",
          "2026-09-05": "00:00-23:00",
          "2026-09-06": "00:00-23:00",
          "2026-09-07": "00:00-19:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-12:00",
        },
        scales: false,
      },
      {
        id: "tente-qml",
        name: "Stand sous tente / espace nu devant bateau",
        icon: "⛺",
        liv: {
          "2026-09-05": "08:00-23:00",
          "2026-09-06": "08:00-23:00",
          "2026-09-07": "08:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
    ],
  },
  QSP: {
    id: "QSP",
    label: "Quai Saint-Pierre",
    categories: [
      {
        id: "flot-qsp",
        name: "Bateau à flot / ponton privatif",
        icon: "🛥️",
        liv: {
          "2026-09-04": "12:00-23:00",
          "2026-09-05": "00:00-23:00",
          "2026-09-06": "00:00-23:00",
          "2026-09-07": "00:00-19:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-23:00",
          "2026-09-15": "00:00-08:00",
        },
        scales: false,
      },
      {
        id: "tente-qsp",
        name: "Stand sous tente / espace nu devant bateau",
        icon: "⛺",
        liv: {
          "2026-09-05": "08:00-23:00",
          "2026-09-06": "08:00-23:00",
          "2026-09-07": "08:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
    ],
  },
  PANTIERO: {
    id: "PANTIERO",
    label: "Pantiero",
    categories: [
      {
        id: "flot-pan",
        name: "Bateau à flot / ponton privatif",
        icon: "🛥️",
        liv: {
          "2026-09-06": "12:00-23:00",
          "2026-09-07": "00:00-19:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-12:00",
        },
        scales: true,
        scalesNote: "Planning d'arrivée individuel envoyé par l'organisateur.",
      },
      {
        id: "tente-pan",
        name: "Stand sous tente / espace nu devant bateau",
        icon: "⛺",
        liv: {
          "2026-09-05": "08:00-23:00",
          "2026-09-06": "08:00-23:00",
          "2026-09-07": "08:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
    ],
  },
  JETEE: {
    id: "JETEE",
    label: "Jetée Nord / Sud",
    categories: [
      {
        id: "flot-jetee",
        name: "Bateau à flot / ponton privatif",
        icon: "🛥️",
        liv: {
          "2026-09-06": "12:00-23:00",
          "2026-09-07": "08:00-19:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-12:00",
        },
        scales: false,
      },
      {
        id: "tente-jetee",
        name: "Stand sous tente",
        icon: "⛺",
        liv: {
          "2026-09-05": "08:00-23:00",
          "2026-09-06": "08:00-23:00",
          "2026-09-07": "08:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
      {
        id: "nus-jetee",
        name: "Espace nu devant bateau",
        icon: "📐",
        liv: {
          "2026-09-04": "12:00-23:00",
          "2026-09-05": "00:00-23:00",
          "2026-09-06": "00:00-23:00",
          "2026-09-07": "00:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
    ],
  },
  SYE: {
    id: "SYE",
    label: "Super Yachts Extension",
    categories: [
      {
        id: "flot-sye",
        name: "Bateau à flot / ponton privatif",
        icon: "🛥️",
        liv: {
          "2026-09-06": "12:00-23:00",
          "2026-09-07": "00:00-19:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-12:00",
        },
        scales: true,
        scalesNote: "Planning d'arrivée individuel envoyé par l'organisateur.",
      },
      {
        id: "tente-sye",
        name: "Stand sous tente",
        icon: "⛺",
        liv: { "2026-09-07": "08:00-23:00" },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
    ],
  },
  TENDERS: {
    id: "TENDERS",
    label: "Espace Tenders (proche du Palais)",
    note: "Espace proche du Palais — règles équivalentes à l'Extérieur Palais.",
    categories: [
      {
        id: "tender-bateau",
        name: "Bateau / Tender",
        icon: "🛥️",
        liv: {
          "2026-09-05": "16:00-23:00",
          "2026-09-06": "00:00-12:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-18:00",
        },
        scales: true,
        scalesNote: "Manutention via Scales selon planning individuel.",
      },
      {
        id: "tender-tente",
        name: "Stand sous tente",
        icon: "⛺",
        liv: { "2026-09-07": "08:00-23:00" },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
    ],
  },
  BROKER: {
    id: "BROKER",
    label: "Espace Broker et Toys",
    categories: [
      {
        id: "flot-broker",
        name: "Bateau à flot / ponton privatif",
        icon: "🛥️",
        liv: {
          "2026-09-03": "08:00-23:00",
          "2026-09-04": "08:00-23:00",
          "2026-09-05": "08:00-23:00",
          "2026-09-06": "08:00-23:00",
          "2026-09-07": "08:00-19:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-12:00",
        },
        scales: true,
        scalesNote: "Planning individuel à coordonner avec Scales.",
      },
      {
        id: "tente-broker",
        name: "Tente / espace nu / devant bateau",
        icon: "⛺",
        liv: {
          "2026-09-05": "08:00-23:00",
          "2026-09-06": "08:00-23:00",
          "2026-09-07": "08:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
    ],
  },
  SAIL: {
    id: "SAIL",
    label: "Espace Voile (Mono / Multicoque)",
    categories: [
      {
        id: "flot-sail",
        name: "Bateau à flot / ponton privatif",
        icon: "⛵",
        liv: {
          "2026-09-04": "12:00-23:00",
          "2026-09-05": "00:00-23:00",
          "2026-09-06": "00:00-23:00",
          "2026-09-07": "00:00-19:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-12:00",
        },
        scales: false,
      },
      {
        id: "tente-sail",
        name: "Stand sous tente",
        icon: "⛺",
        liv: {
          "2026-09-05": "08:00-23:00",
          "2026-09-06": "08:00-23:00",
          "2026-09-07": "08:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
      {
        id: "nus-sail",
        name: "Espace nu devant bateau",
        icon: "📐",
        liv: {
          "2026-09-05": "08:00-23:00",
          "2026-09-06": "08:00-23:00",
          "2026-09-07": "08:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
    ],
  },
  POWER: {
    id: "POWER",
    label: "Power Boat Marina",
    categories: [
      {
        id: "flot-power",
        name: "Bateau à flot",
        icon: "🛥️",
        liv: {
          "2026-09-05": "12:00-23:00",
          "2026-09-06": "00:00-23:00",
        },
        rep: {
          "2026-09-13": "19:00-23:00",
          "2026-09-14": "00:00-17:00",
        },
        scales: false,
      },
      {
        id: "terre-power",
        name: "Bateau à terre",
        icon: "⛵",
        liv: {
          "2026-09-04": "14:00-23:00",
          "2026-09-05": "00:00-20:00",
        },
        rep: { "2026-09-15": "08:00-17:00" },
        scales: true,
        scalesNote: "Manutention via Scales obligatoire pour les bateaux à terre.",
      },
    ],
  },
};

/** Espace spécial signalant qu'un choix Intérieur/Extérieur Palais est requis. */
export const PALAIS_CHOICE = "PALAIS_CHOICE";

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
  if (s.includes("SYE")) return { space: "SYE", requiresUserChoice: false };
  if (s.includes("PANTIERO")) return { space: "PANTIERO", requiresUserChoice: false };
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

/**
 * Génère des créneaux d'une heure depuis une plage `"HH:MM-HH:MM"`.
 *
 * Exemple : `"08:00-12:00"` → `["08:00-09:00", …, "11:00-12:00"]`.
 *
 * IMPORTANT : une plage doit être stockée par jour (jamais `"19:00-17:00"`
 * traversant minuit, qui produirait une liste vide).
 */
export function genSlots(range: string): string[] {
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

/** Liste des prestataires de manutention pour la Step Manutention RX. */
export const RX_MANUTENTION_PROVIDERS = [
  { value: "SVMM", label: "SVMM" },
  { value: "Mathez", label: "Mathez" },
  { value: "Scales", label: "Scales" },
  { value: "Autonome", label: "Aucun (Scales uniquement pour catégories concernées)" },
];
