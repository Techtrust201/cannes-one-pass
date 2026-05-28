/**
 * Configuration des espaces RX/Yachting et de leurs catégories logistiques.
 *
 * Extrait du brief HTML validé par Éric :
 * `public/demo/yachting-2026-accreditations-logistiques.html`.
 *
 * Format des plages horaires : `"HH:MM-HH:MM"`. Lorsqu'on présente une
 * catégorie à l'exposant, on lui propose la liste des dates disponibles
 * avec leur plage horaire, et il choisit (date, heure d'arrivée).
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
  categories: RxCategory[];
  /** Espaces qui requièrent un choix utilisateur (ex: Int/Ext Palais). */
  requiresUserChoice?: boolean;
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
          "Pour la manutention des moteurs, RDV obligatoire avec Scales (réception entre 1er et 2 septembre).",
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
        scalesNote:
          "Manutention via Scales obligatoire pour les bateaux à terre.",
      },
    ],
  },
};

/**
 * Mapping secteur (data-secteur de la combobox) → espace logistique.
 * Permet d'auto-détecter l'espace depuis l'exposant sélectionné.
 *
 * Mapping aligné sur la maquette HTML validée (voir
 * `/home/hugo/Téléchargements/remixed-7f8d8ed4.html`, fonction
 * `getSpaceFromSecteur`).
 *
 * - PALAIS — PALAIS                → `PALAIS_CHOICE` (l'utilisateur doit
 *                                    choisir Intérieur ou Extérieur)
 * - VIEUX PORT — SYE               → SYE
 * - VIEUX PORT — QML               → QML
 * - VIEUX PORT — QSP               → QSP
 * - VIEUX PORT — PANTIERO          → PANTIERO
 * - VIEUX PORT — JETEE             → JETEE
 * - VIEUX PORT — TENDERS           → TENDERS
 * - CANTO — POWER                  → POWER
 * - CANTO — SAIL                   → SAIL
 * - CANTO — BROKER                 → BROKER
 */
export function deriveSpaceFromSector(sector: string): {
  space: string | null;
  requiresUserChoice: boolean;
} {
  const s = sector.trim().toUpperCase();
  if (s.includes("PALAIS — PALAIS") || s.includes("PALAIS – PALAIS")) {
    return { space: "PALAIS_CHOICE", requiresUserChoice: true };
  }
  // Ordre important : "TENDERS" et "SYE" avant les mappings génériques.
  if (s.includes("SYE")) return { space: "SYE", requiresUserChoice: false };
  if (s.includes("TENDERS")) return { space: "TENDERS", requiresUserChoice: false };
  if (s.includes("QML")) return { space: "QML", requiresUserChoice: false };
  if (s.includes("QSP")) return { space: "QSP", requiresUserChoice: false };
  if (s.includes("PANTIERO")) return { space: "PANTIERO", requiresUserChoice: false };
  if (s.includes("JETEE") || s.includes("JETÉE")) {
    return { space: "JETEE", requiresUserChoice: false };
  }
  if (s.includes("POWER")) return { space: "POWER", requiresUserChoice: false };
  if (s.includes("SAIL")) return { space: "SAIL", requiresUserChoice: false };
  if (s.includes("BROKER")) return { space: "BROKER", requiresUserChoice: false };
  return { space: null, requiresUserChoice: false };
}

/**
 * Génère les créneaux horaires d'une heure entre `start` et `end`.
 * Format d'entrée : `"HH:MM-HH:MM"`. Format de sortie : `["HH:00-HH:00", ...]`.
 */
export function generateHourlySlots(range: string): string[] {
  const [start, end] = range.split("-");
  if (!start || !end) return [];
  const sh = parseInt(start.split(":")[0]!, 10);
  const eh = parseInt(end.split(":")[0]!, 10);
  if (!Number.isFinite(sh) || !Number.isFinite(eh) || eh <= sh) return [];
  const slots: string[] = [];
  for (let h = sh; h < eh; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00`);
  }
  return slots;
}

/** Formate une date ISO `YYYY-MM-DD` en français court : "ven 4 sep". */
export function formatDateFR(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const months = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"];
  const days = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  const dt = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return iso;
  return `${days[dt.getDay()]} ${parseInt(parts[2]!, 10)} ${months[parseInt(parts[1]!, 10) - 1]}`;
}

/** Liste des prestataires de manutention pour la Step 3 RX. */
export const RX_MANUTENTION_PROVIDERS = [
  { value: "SVMM", label: "SVMM" },
  { value: "Mathez", label: "Mathez" },
  { value: "Scales", label: "Scales" },
  { value: "Autonome", label: "Autonome (Scales uniquement pour catégories concernées)" },
];
