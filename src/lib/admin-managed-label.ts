/**
 * Résolution générique des libellés d'entités ADMINISTRABLES (code + label
 * éditable en back-office + traductions i18n par code).
 *
 * Règle anti-régression (cf. bug GROS_PORTEUR relabellisé « Porteur » affiché
 * « 20 m³ ») : une traduction i18n statique par code NE DOIT JAMAIS écraser un
 * libellé personnalisé par l'admin en base.
 *
 * Ordre de priorité appliqué :
 *   1. Traduction BDD pour la langue courante (`dbTranslations[lang]`).
 *   2. Libellé BDD PERSONNALISÉ : si le libellé saisi en back-office diffère du
 *      libellé standard FR du code, l'admin l'a personnalisé → il prime sur
 *      l'i18n codé en dur (sans traduction dédiée, il sert dans toutes les langues).
 *   3. Traduction i18n standard par code (codes connus, NON personnalisés).
 *   4. Libellé BDD (repli pour entités custom non traduites).
 *   5. Code technique humanisé (dernier recours).
 *
 * En résumé :
 *   DB translation[lang] > DB label personnalisé > i18n standard par code > DB label > code
 *
 * ⚠️ NE PAS utiliser pour des STATUTS SYSTÈME fixes et non administrables
 * (`NOUVEAU`, `REFUS`, `ENTREE`, `ATTENTE`, …) : ce ne sont pas des libellés
 * éditables par l'utilisateur, ils ont leur propre table de traduction figée.
 */
import type { LangCode } from "./translations";

/** Map partielle code langue → libellé d'affichage (traductions BDD admin). */
export type AdminManagedTranslations = Partial<Record<LangCode, string>>;

export interface ResolveAdminManagedLabelOptions {
  /** Code technique brut de l'entité (peut être custom ou standard). */
  code: string | null | undefined;
  /** Langue d'affichage cible. */
  lang: LangCode;
  /** Traductions explicites stockées en base (JSON `displayLabels`). */
  dbTranslations?: AdminManagedTranslations | null;
  /** Libellé d'affichage saisi en base (la source de vérité éditable). */
  dbLabel?: string | null;
  /**
   * Code normalisé reconnu comme standard, ou `null` si custom. Sert de clé
   * dans `standardLabelsByLang` et `standardFrenchLabels`.
   */
  standardCode?: string | null;
  /** Libellés i18n standard, indexés par langue puis par code standard. */
  standardLabelsByLang?: Record<string, Record<string, string>> | null;
  /** Libellés FR de référence par code standard (détection de personnalisation). */
  standardFrenchLabels?: Record<string, string> | null;
}

/** Normalise un libellé pour comparaison (minuscules, espaces compactés). */
export function normalizeLabelForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveAdminManagedLabel(
  opts: ResolveAdminManagedLabelOptions
): string {
  const {
    code,
    lang,
    dbTranslations,
    dbLabel,
    standardCode,
    standardLabelsByLang,
    standardFrenchLabels,
  } = opts;

  // 1. Traduction BDD explicite pour la langue courante.
  const dbTranslated = dbTranslations?.[lang]?.trim();
  if (dbTranslated) return dbTranslated;

  const dbDisplay = dbLabel?.trim();

  // 2 & 3. i18n standard par code, SAUF si l'admin a personnalisé le libellé.
  if (standardCode) {
    const standardFr = standardFrenchLabels?.[standardCode];
    const isCustomized =
      !!dbDisplay &&
      !!standardFr &&
      normalizeLabelForCompare(dbDisplay) !== normalizeLabelForCompare(standardFr);
    if (!isCustomized) {
      const translated = standardLabelsByLang?.[lang]?.[standardCode];
      if (translated) return translated;
    }
  }

  // 4. Libellé BDD (repli pour entités custom non traduites).
  if (dbDisplay) return dbDisplay;
  // 5. Code technique humanisé.
  if (code?.trim()) return code.trim().replace(/_/g, " ");
  return "";
}
