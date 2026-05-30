import type { Vehicle } from "@/types";

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
    /** Reprise : même véhicule que la livraison (défaut true). */
    repSameAsDelivery?: boolean;
    repVehicleType?: string;
    repPlate?: string | null;
    repPhoneCode?: string;
    repPhoneNumber?: string;
  }>;
}

export interface RxFormData {
  stepOne: {
    event: string; // slug de l'event sélectionné via le carrousel
    exhibitorId: string;
    exhibitorName: string;
    exhibitorStand: string;
    exhibitorSector: string;
    /** Espace auto-déduit ou choisi (INTERIEUR_PALAIS, EXTERIEUR_PALAIS, QML, QSP, CANTO_POWER, …). */
    space: string;
    contact: RxContactInfo;
  };
  stepTwo: {
    categories: RxCategorySelection[];
  };
  stepThree: {
    manutentionProvider: string;
    scalesAcknowledged: boolean;
    consent: boolean;
  };
}

export function getDefaultRxFormData(): RxFormData {
  return {
    stepOne: {
      event: "",
      exhibitorId: "",
      exhibitorName: "",
      exhibitorStand: "",
      exhibitorSector: "",
      space: "",
      contact: {
        firstName: "",
        lastName: "",
        email: "",
        phoneCode: "+33",
        phoneNumber: "",
      },
    },
    stepTwo: { categories: [] },
    stepThree: {
      manutentionProvider: "",
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
  categories: RxCategorySelection[];
  scalesAssigned: boolean;
  manutentionProvider: string;
}

// Re-export pratique du type Vehicle pour les futurs templates ; aucun
// import autre ne devrait être nécessaire dans les composants RX.
export type { Vehicle };
