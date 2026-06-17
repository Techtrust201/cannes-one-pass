/**
 * Types communs au moteur de templates d'accréditation.
 *
 * Le but : permettre à chaque organisation d'exposer sa propre suite de
 * steps + son schéma de validation + sa fonction de mapping vers le
 * payload `POST /api/accreditations`, tout en partageant la même "tram"
 * UI (header, image latérale, progress bar, navigation, langue, footer).
 */

import type { ComponentType } from "react";
import type { z } from "zod";

/**
 * Slug d'organisation utilisé dans l'URL `/accreditation/[orgSlug]` et
 * dans `Organization.formTemplate`. Pas un enum strict : on accepte
 * toute nouvelle organisation à venir.
 */
export type TemplateSlug = string;

/**
 * Props injectées à chaque step. Chaque template définit son propre
 * shape de `data` et `update` via génériques.
 */
export interface StepProps<TData> {
  data: TData;
  update: (patch: Partial<TData>) => void;
  onValidityChange: (valid: boolean) => void;
  /**
   * Passe à `true` lorsque l'utilisateur tente de valider l'étape (clic
   * « Suivant ») alors que des champs obligatoires manquent. Le step affiche
   * alors les erreurs sous les champs concernés + un résumé en haut d'étape.
   */
  showErrors?: boolean;
  /** Slug de l'organisation courante (utile pour scoper les fetches API). */
  orgSlug: TemplateSlug;
  /** ID interne de l'organisation (Organization.id). */
  organizationId: string;
  /**
   * Contexte d'usage du wizard : formulaire public (défaut) ou back-office
   * logisticien. Permet aux steps d'adapter le comportement (ex: statut de
   * création de l'accréditation RX : NOUVEAU en public, ATTENTE en logisticien).
   */
  mode?: "public" | "logisticien";
  /**
   * Supprime le brouillon localStorage (sans réinitialiser l'état en mémoire).
   * Utilisé après une soumission réussie pour qu'un rechargement reparte
   * d'un formulaire vierge.
   */
  onClearDraft?: () => void;
  /**
   * Réinitialise complètement le formulaire (données initiales + suppression
   * du brouillon) et revient à l'étape 1. Utilisé par "Nouvelle demande".
   */
  onResetForm?: () => void;
}

/**
 * Définition d'un step injecté dans la "tram" UI commune.
 */
export interface StepDef<TData = unknown> {
  /** Identifiant stable (utile pour analytics et tests). */
  id: string;
  /** Libellé affiché dans la progress bar / aria-label. */
  label: string;
  /** Composant React rendu lorsque ce step est actif. */
  component: ComponentType<StepProps<TData>>;
}

/**
 * Payload envoyé à `POST /api/accreditations`. Champs racine partagés
 * par toutes les organisations + `extension` JSON spécifique au template
 * + `vehicles` (la cardinalité et le caractère obligatoire de la plaque
 * dépendent du template).
 */
export interface CreateAccreditationPayload {
  organizationSlug: TemplateSlug;
  company: string;
  stand: string;
  unloading: string;
  event: string;
  vehicles: Array<{
    plate: string | null;
    size: string;
    phoneCode: string;
    phoneNumber: string;
    date: string;
    time?: string;
    city: string;
    unloading: string[];
    kms?: string;
    vehicleType?: string;
    country?: string;
    estimatedKms?: number;
    trailerPlate?: string;
    emptyWeight?: number;
    maxWeight?: number;
    currentWeight?: number;
    /** Contexte de catégorie RX (utilisé par le split 1 accréd/véhicule). */
    categoryId?: string;
    repDate?: string;
    repTime?: string;
    repSameAsDelivery?: boolean;
    repVehicleType?: string;
    repPlate?: string | null;
    repPhoneCode?: string;
    repPhoneNumber?: string;
    interveningCompany?: string;
    repInterveningCompany?: string;
    repCity?: string;
    repCountry?: string;
    repEstimatedKms?: number;
  }>;
  message?: string;
  consent: boolean;
  /** E-mail facultatif du demandeur (Lot 2 : récap + QR envoyés à la création). */
  email?: string;
  language?: string;
  status?: string;
  currentZone?: string | null;
  category?: string;
  /**
   * Si true, l'API crée une accréditation par véhicule (workflow RX) au lieu
   * d'une seule accréditation regroupant tous les véhicules. Absent/false pour
   * Palais (comportement historique inchangé).
   */
  splitPerVehicle?: boolean;
  /** Données propres au template (rx → contact, catégories, créneaux…). */
  extension?: Record<string, unknown>;
}

/**
 * Définition d'un template d'accréditation. Une nouvelle organisation =
 * un nouveau dossier `src/templates/accreditation/<slug>/` exportant un
 * objet conforme à cette interface, puis enregistrement dans le registry.
 */
export interface AccreditationTemplate<TData = unknown> {
  /** Slug de l'organisation (doit matcher `Organization.slug`). */
  slug: TemplateSlug;
  /** Nombre total de steps (sert à la progress bar). */
  steps: StepDef<TData>[];
  /**
   * Hook optionnel : renvoie la liste des étapes **visibles** pour un état
   * de formulaire donné. Permet à un template (ex. RX avec skip montage /
   * démontage) de masquer dynamiquement certaines étapes de la progress bar
   * et de la navigation. Si non défini (ex. Palais), `steps` est utilisé tel
   * quel → comportement statique strictement inchangé.
   */
  getVisibleSteps?: (form: TData) => StepDef<TData>[];
  /** Valeur initiale du form data — restaurée depuis localStorage si possible. */
  initialData: () => TData;
  /** Schéma Zod côté serveur pour valider le payload complet à l'arrivée. */
  schema: z.ZodTypeAny;
  /** Mapping form data → payload POST. */
  mapPayload: (form: TData, language: string) => CreateAccreditationPayload;
  /** Métadonnées d'en-tête (titre/sous-titre + image éventuelle). */
  meta: {
    /**
     * Image latérale (chemin public). Si null, on affiche un placeholder
     * ou rien. Le Palais affiche `/accreditation/pict_page1/palais.jpg`
     * historiquement ; RX reprendra la même image (UI identique).
     */
    sideImage: string | null;
    /** Couleur d'accent (utilisée pour le carrousel sélectionné, etc.). */
    accentColor?: string;
  };
}
