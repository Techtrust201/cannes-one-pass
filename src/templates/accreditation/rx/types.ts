import type { CountryRegion, Vehicle } from "@/types";

/**
 * Shape du form data pour le template RX.
 *
 * Le wizard RX réutilise la même tram UI que le Palais : 4 grandes
 * étapes dans la progress bar. Les sous-shapes ci-dessous suivent le
 * découpage Step1=Identification / Step2=Livraison & véhicules /
 * Step3=Reprise & manutention / Step4=Récap.
 */
export interface RxContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phoneCode: string;
  phoneNumber: string;
}

export interface RxCategorySelection {
  /** Identifiant de la catégorie (config.ts) — ex: "stand-nu", "bateau-terre". */
  categoryId: string;
  /** Date de livraison (YYYY-MM-DD). */
  livDate: string;
  /** Plage horaire de livraison (ex: "09:00"). */
  livTime: string;
  /** Date de reprise. */
  repDate: string;
  /** Plage horaire de reprise. */
  repTime: string;
  /** Véhicules attendus pour cette catégorie (gabarit requis, plaque optionnelle). */
  vehicles: Array<{
    vehicleType: string;
    plate: string | null;
    trailerPlate?: string;
    notes?: string;
    /** Société réalisant la prestation avec ce véhicule (transporteur, décorateur, prestataire…). */
    interveningCompany?: string;
    /**
     * Téléphone du chauffeur du véhicule de livraison / montage (ou véhicule
     * principal en mode skip-montage). Optionnel : à défaut, on retombe sur le
     * téléphone du contact (responsable logistique). Harmonisé avec la reprise
     * (`repPhoneCode` / `repPhoneNumber`).
     */
    phoneCode?: string;
    phoneNumber?: string;
    /** Ville de départ (bilan carbone). */
    city?: string;
    country?: CountryRegion;
    estimatedKms?: number;
    /** Reprise : même véhicule que la livraison (défaut true). */
    repSameAsDelivery?: boolean;
    repVehicleType?: string;
    repPlate?: string | null;
    repPhoneCode?: string;
    repPhoneNumber?: string;
    /** Reprise différente : société intervenante du véhicule de reprise. */
    repInterveningCompany?: string;
    /** Reprise différente : ville de départ (bilan carbone). */
    repCity?: string;
    repCountry?: CountryRegion;
    repEstimatedKms?: number;
  }>;
}

export interface RxFormData {
  stepOne: {
    event: string; // slug de l'event sélectionné via le carrousel
    /** ID interne de l'événement — peuplé en même temps que `event`. */
    eventId: string;
    exhibitorId: string;
    exhibitorName: string;
    exhibitorStand: string;
    exhibitorSector: string;
    /** Espace auto-déduit ou choisi (INTERIEUR_PALAIS, EXTERIEUR_PALAIS, QML, QSP, CANTO_POWER, …). */
    space: string;
    /**
     * Phase 6 — Emplacement référentiel (`ExhibitorLocation`) résolu pour cet
     * exposant. Vide si aucun emplacement n'a encore été importé pour cet
     * exposant (fonctionnement legacy inchangé dans ce cas : aucun blocage).
     * Ces champs ne sont JAMAIS envoyés comme identifiant de confiance au
     * serveur — seuls `locationLabel` (code naturel) et `locationType` sont
     * transmis ; le serveur revérifie et résout lui-même l'ID réel.
     */
    exhibitorLocationId?: string;
    locationLabel?: string;
    locationType?: "TERRE" | "FLOT" | "STAND" | "";
    portCode?: string;
    sectorCode?: string;
    logisticSpace?: string;
    /**
     * Phase 6C-A — Mode planning de l'événement sélectionné
     * (`Event.logisticsPlanningMode`), reçu une seule fois à la sélection de
     * l'événement (`EventCarouselSelector`). Pilote le caractère obligatoire
     * de l'emplacement référentiel et le comportement du hook planning.
     * Valeur sûre par défaut pour les brouillons anciens : "DISABLED"
     * (comportement historique inchangé).
     */
    logisticsPlanningMode?: "DISABLED" | "TRANSITION" | "STRICT";
    contact: RxContactInfo;
  };
  stepTwo: {
    categories: RxCategorySelection[];
    /**
     * Skip montage : « Je souhaite une accréditation uniquement pour le
     * démontage ». Si true, l'étape Livraison (montage) disparaît de la
     * progress bar et les catégories sont sélectionnées à l'étape Reprise.
     */
    skipMontage?: boolean;
    /**
     * Skip démontage : « Je ne souhaite pas d'accréditation pour le
     * démontage ». Si true, l'étape Reprise (démontage) disparaît et on
     * passe directement à la Manutention.
     */
    skipDemontage?: boolean;
  };
  stepThree: {
    manutentionProvider: string;
    /** Nom libre du prestataire si « Autre » est choisi (obligatoire alors). */
    manutentionProviderOther?: string;
    scalesAcknowledged: boolean;
    consent: boolean;
  };
}

export function getDefaultRxFormData(): RxFormData {
  return {
    stepOne: {
      event: "",
      eventId: "",
      exhibitorId: "",
      exhibitorName: "",
      exhibitorStand: "",
      exhibitorSector: "",
      space: "",
      exhibitorLocationId: "",
      locationLabel: "",
      locationType: "",
      portCode: "",
      sectorCode: "",
      logisticSpace: "",
      logisticsPlanningMode: "DISABLED",
      contact: {
        firstName: "",
        lastName: "",
        email: "",
        phoneCode: "+33",
        phoneNumber: "",
      },
    },
    stepTwo: { categories: [], skipMontage: false, skipDemontage: false },
    stepThree: {
      manutentionProvider: "",
      manutentionProviderOther: "",
      scalesAcknowledged: false,
      consent: false,
    },
  };
}

/**
 * Shape d'extension persistée en DB dans `Accreditation.extension`.
 * Permet de retrouver côté logisticien toutes les données RX-spécifiques
 * (qui ne tiennent pas dans les colonnes racine de l'Accreditation).
 */
export interface RxExtension {
  exhibitor: {
    id: string;
    name: string;
    stand: string;
    sector: string;
  };
  contact: RxContactInfo;
  space: string;
  /**
   * Emplacement référentiel choisi (critères naturels uniquement — jamais
   * l'ID interne). Absent si aucun emplacement n'a été importé pour cet
   * exposant : le serveur ne rattachera alors aucun référentiel (comme
   * aujourd'hui, sans blocage).
   */
  location?: {
    code: string | null;
    type: "TERRE" | "FLOT" | "STAND" | null;
  };
  categories: RxCategorySelection[];
  scalesAssigned: boolean;
  manutentionProvider: string;
  /** Prestataire libre saisi quand « Autre » est sélectionné à l'étape 5. */
  manutentionProviderOther?: string;
  /** Skip montage : accréditation pour le démontage uniquement. */
  skipMontage?: boolean;
  /** Skip démontage : pas d'accréditation pour le démontage. */
  skipDemontage?: boolean;
  /** Zone de déchargement suggérée (gabarit × port) — pré-sélection validation. */
  suggestedZone?: string;
}

// Re-export pratique du type Vehicle pour les futurs templates ; aucun
// import autre ne devrait être nécessaire dans les composants RX.
export type { Vehicle };
