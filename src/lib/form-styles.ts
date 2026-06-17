import { cn } from "@/lib/utils";

/**
 * Source unique des styles de champs de formulaire (accréditation public +
 * logisticien, toutes organisations). Centralise contraste, bordures nettes,
 * fond blanc, focus visible et confort tactile mobile (`text-base` = 16px pour
 * éviter le zoom auto iOS). Utilisé à la place des classes Tailwind dupliquées
 * dans chaque step.
 */

/** Classe de label : bien visible, contraste suffisant. */
export const formLabelClass = "block text-sm font-semibold text-gray-800";

/** Base commune des champs texte / select / textarea. */
const FORM_FIELD_BASE =
  "w-full rounded-lg border bg-white px-3 py-2.5 text-base text-gray-900 shadow-sm " +
  "placeholder:text-gray-400 transition-colors " +
  "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary " +
  "disabled:bg-gray-100 disabled:text-gray-500";

/**
 * Classe d'un champ input/select. Bordure nette par défaut, état invalide
 * rouge marqué (bordure + halo) pour signaler clairement un champ obligatoire
 * non rempli.
 */
export function formInputClass(invalid?: boolean, extra?: string) {
  return cn(
    FORM_FIELD_BASE,
    invalid
      ? "border-red-500 focus:ring-red-200 focus:border-red-500"
      : "border-gray-400 hover:border-gray-500",
    extra
  );
}

/** Variante textarea (hauteur de saisie confortable). */
export function formTextareaClass(invalid?: boolean, extra?: string) {
  return formInputClass(invalid, cn("min-h-[96px] resize-y", extra));
}

/**
 * Variante compacte pour les grilles denses (ex. lignes véhicule RX) : conserve
 * une densité réduite tout en gardant bordure nette, fond blanc et focus clair.
 */
const FORM_FIELD_COMPACT_BASE =
  "w-full rounded-md border bg-white px-2.5 py-1.5 text-sm text-gray-900 shadow-sm " +
  "placeholder:text-gray-400 transition-colors " +
  "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary " +
  "disabled:bg-gray-100 disabled:text-gray-500";

export function formInputCompactClass(invalid?: boolean, extra?: string) {
  return cn(
    FORM_FIELD_COMPACT_BASE,
    invalid
      ? "border-red-500 focus:ring-red-200 focus:border-red-500"
      : "border-gray-400 hover:border-gray-500",
    extra
  );
}

/** Classe d'un message d'erreur sous un champ. */
export const formErrorClass = "mt-1 text-sm font-medium text-red-600";
