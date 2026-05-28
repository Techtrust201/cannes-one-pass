/**
 * Shape du form data pour le template RX.
 *
 * Aligné sur la maquette HTML validée par Éric. Le wizard RX a **5 cards**
 * dans la progress bar (tram UI du Palais conservée) :
 *
 *   1. Exposant       — combobox unique + auto-déduction de l'espace
 *   2. Contact        — coordonnées du demandeur (nom/prénom/email/téléphone)
 *   3. Livraison      — catégories + dates + créneaux + N véhicules par cat
 *   4. Reprise        — date + créneau pour chaque catégorie cochée au montage
 *   5. Manutention    — prestataire complémentaire + notice Scales auto
 *
 * Référence : `/home/hugo/Téléchargements/remixed-7f8d8ed4.html`.
 */

import type { Vehicle } from "@/types";

/** Coordonnées de la personne en charge de l'accréditation. */
export interface RxContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phoneCode: string;
  phoneNumber: string;
}

/** Un véhicule attendu pour une catégorie de livraison. */
export interface RxDeliveryVehicle {
  /** Gabarit (code VehicleTypeConfig) — obligatoire pour RX. */
  vehicleType: string;
  /** Plaque réelle — optionnelle (saisie au scan QR à l'arrivée). */
  plate: string | null;
  /** Plaque remorque (semi, frigo, etc.). */
  trailerPlate?: string;
}

/** Une catégorie cochée par l'exposant pour le montage (livraison). */
export interface RxDeliveryCategory {
  categoryId: string;
  /** Date de livraison (YYYY-MM-DD), parmi les dates ouvertes de `cat.liv`. */
  date: string;
  /** Créneau horaire `HH:MM-HH:MM` parmi les heures de la plage. */
  slot: string;
  /** ≥ 1 véhicule attendu pour cette catégorie. */
  vehicles: RxDeliveryVehicle[];
}

/** Reprise (démontage) pour une catégorie cochée au montage. */
export interface RxPickupCategory {
  categoryId: string;
  date: string;
  slot: string;
}

/** Espaces logistiques admis ("" = non encore résolu). */
export type RxSpaceId =
  | ""
  | "INTERIEUR_PALAIS"
  | "EXTERIEUR_PALAIS"
  | "SYE"
  | "QML"
  | "QSP"
  | "PANTIERO"
  | "JETEE"
  | "TENDERS"
  | "POWER"
  | "SAIL"
  | "BROKER";

/** Prestataires de manutention admis (Mathez = libellé, code interne). */
export type RxManutentionProvider = "" | "SVMM" | "Mathez" | "Scales" | "Autonome";

export interface RxFormData {
  /** Step 1 : sélection de l'exposant + résolution de l'espace logistique. */
  exhibitor: {
    id: string;
    name: string;
    stand: string;
    sector: string;
    zone: string;
    space: RxSpaceId;
    /** True si l'exposant est au Palais et n'a pas encore choisi Int/Ext. */
    requiresPalaisChoice: boolean;
    /** Event RX actif résolu côté client (slug, ex: "yachting-2026"). */
    eventSlug: string;
  };
  /** Step 2 : coordonnées du demandeur. */
  contact: RxContactInfo;
  /** Step 3 : catégories cochées + dates + créneaux + véhicules. */
  delivery: {
    categories: RxDeliveryCategory[];
  };
  /** Step 4 : reprise pour chaque catégorie cochée au montage. */
  pickup: {
    categories: RxPickupCategory[];
  };
  /** Step 5 : prestataire de manutention complémentaire (optionnel). */
  manutention: {
    provider: RxManutentionProvider;
  };
}

export function getDefaultRxFormData(): RxFormData {
  return {
    exhibitor: {
      id: "",
      name: "",
      stand: "",
      sector: "",
      zone: "",
      space: "",
      requiresPalaisChoice: false,
      eventSlug: "",
    },
    contact: {
      firstName: "",
      lastName: "",
      email: "",
      phoneCode: "+33",
      phoneNumber: "",
    },
    delivery: { categories: [] },
    pickup: { categories: [] },
    manutention: { provider: "" },
  };
}

/**
 * Shape d'extension persistée en DB dans `Accreditation.extension` (JSON).
 * Permet de retrouver côté logisticien toutes les données RX-spécifiques
 * (qui ne tiennent pas dans les colonnes racine de l'Accreditation).
 */
export interface RxExtension {
  exhibitor: {
    id: string;
    name: string;
    stand: string;
    sector: string;
    zone: string;
  };
  contact: RxContactInfo;
  space: RxSpaceId;
  delivery: {
    categories: RxDeliveryCategory[];
  };
  pickup: {
    categories: RxPickupCategory[];
  };
  /** True si au moins une catégorie cochée a `scales: true`. */
  scalesAssigned: boolean;
  manutentionProvider: RxManutentionProvider;
}

export type { Vehicle };
