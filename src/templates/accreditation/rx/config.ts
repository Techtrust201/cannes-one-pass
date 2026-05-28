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
};

/**
 * Mapping secteur (data-secteur de la combobox) → espace logistique.
 * Permet d'auto-détecter l'espace depuis l'exposant sélectionné.
 *
 * - PALAIS — PALAIS               → choix Int/Ext requis
 * - VIEUX PORT — QML              → QML
 * - VIEUX PORT — QSP              → QSP
 * - VIEUX PORT — PANTIERO         → PANTIERO
 * - VIEUX PORT — JETEE / TENDERS  → JETEE
 * - VIEUX PORT — SYE              → SYE (non implémenté en V1)
 * - CANTO — POWER / SAIL / BROKER → PANTIERO (mappage volontaire, à
 *   raffiner avec Éric quand RX précisera la gestion des espaces Canto)
 */
export function deriveSpaceFromSector(sector: string): {
  space: string | null;
  requiresUserChoice: boolean;
} {
  const s = sector.trim().toUpperCase();
  if (s.includes("PALAIS — PALAIS") || s.includes("PALAIS – PALAIS")) {
    return { space: "PALAIS_CHOICE", requiresUserChoice: true };
  }
  if (s.includes("QML")) return { space: "QML", requiresUserChoice: false };
  if (s.includes("QSP")) return { space: "QSP", requiresUserChoice: false };
  if (s.includes("PANTIERO")) return { space: "PANTIERO", requiresUserChoice: false };
  if (s.includes("JETEE") || s.includes("JETÉE") || s.includes("TENDERS")) {
    return { space: "JETEE", requiresUserChoice: false };
  }
  return { space: null, requiresUserChoice: false };
}

/** Liste des prestataires de manutention pour la Step 3 RX. */
export const RX_MANUTENTION_PROVIDERS = [
  { value: "SVMM", label: "SVMM" },
  { value: "Mathez", label: "Mathez" },
  { value: "Scales", label: "Scales" },
  { value: "Autonome", label: "Autonome (Scales uniquement pour catégories concernées)" },
];
