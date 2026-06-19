/**
 * Libellés i18n des gabarits véhicules STANDARDS (6 codes).
 *
 * Source unique de vérité pour l'affichage traduit des types de véhicule
 * dans le parcours public (menu, récap, PDF, e-mail). Les codes et valeurs
 * en base ne sont JAMAIS modifiés : seul le label affiché est traduit.
 *
 * Priorité : i18n standard (par code) → fallback BDD (gabarits custom).
 */
// Import type-only volontaire : ce module est importé par `rx-translations.ts`
// (lui-même importé par `translations.ts`). Un import runtime de `translations`
// créerait une dépendance circulaire (undefined à l'initialisation). La
// validation des codes langue se fait donc localement (cf. SUPPORTED_LANG_SET).
import type { LangCode } from "./translations";

/** Map partielle code langue → libellé d'affichage (traductions BDD admin). */
export type VehicleTypeDbTranslations = Partial<Record<LangCode, string>>;

/** Codes gabarits standards reconnus par l'application. */
export const STANDARD_VEHICLE_TYPE_CODES = [
  "VL",
  "PORTEUR_LEGER",
  "PORTEUR",
  "GROS_PORTEUR",
  "PORTEUR_ARTICULE",
  "SEMI_REMORQUE",
] as const;

export type StandardVehicleTypeCode = (typeof STANDARD_VEHICLE_TYPE_CODES)[number];

export type VehicleTypeDisplayLabels = Record<StandardVehicleTypeCode, string>;

/** Libellés français de référence (résidus à ne pas afficher hors lang=fr). */
export const FRENCH_STANDARD_LABELS: VehicleTypeDisplayLabels = {
  VL: "VL",
  PORTEUR_LEGER: "10 m³",
  PORTEUR: "15 m³",
  GROS_PORTEUR: "20 m³",
  PORTEUR_ARTICULE: "Porteur articulé",
  SEMI_REMORQUE: "Semi remorque",
};

export const vehicleTypeDisplayLabels: Record<LangCode, VehicleTypeDisplayLabels> = {
  fr: FRENCH_STANDARD_LABELS,
  en: {
    VL: "VL",
    PORTEUR_LEGER: "10 m³",
    PORTEUR: "15 m³",
    GROS_PORTEUR: "20 m³",
    PORTEUR_ARTICULE: "Articulated truck",
    SEMI_REMORQUE: "Semi-trailer",
  },
  de: {
    VL: "VL",
    PORTEUR_LEGER: "10 m³",
    PORTEUR: "15 m³",
    GROS_PORTEUR: "20 m³",
    PORTEUR_ARTICULE: "Sattelzug",
    SEMI_REMORQUE: "Sattelauflieger",
  },
  es: {
    VL: "VL",
    PORTEUR_LEGER: "10 m³",
    PORTEUR: "15 m³",
    GROS_PORTEUR: "20 m³",
    PORTEUR_ARTICULE: "Camión articulado",
    SEMI_REMORQUE: "Semirremolque",
  },
  pt: {
    VL: "VL",
    PORTEUR_LEGER: "10 m³",
    PORTEUR: "15 m³",
    GROS_PORTEUR: "20 m³",
    PORTEUR_ARTICULE: "Camião articulado",
    SEMI_REMORQUE: "Semirreboque",
  },
  it: {
    VL: "VL",
    PORTEUR_LEGER: "10 m³",
    PORTEUR: "15 m³",
    GROS_PORTEUR: "20 m³",
    PORTEUR_ARTICULE: "Autotreno",
    SEMI_REMORQUE: "Semirimorchio",
  },
  pl: {
    VL: "VL",
    PORTEUR_LEGER: "10 m³",
    PORTEUR: "15 m³",
    GROS_PORTEUR: "20 m³",
    PORTEUR_ARTICULE: "Ciężarówka z przyczepą",
    SEMI_REMORQUE: "Naczepa",
  },
  cs: {
    VL: "VL",
    PORTEUR_LEGER: "10 m³",
    PORTEUR: "15 m³",
    GROS_PORTEUR: "20 m³",
    PORTEUR_ARTICULE: "Tahač s návěsem",
    SEMI_REMORQUE: "Návěs",
  },
  lt: {
    VL: "VL",
    PORTEUR_LEGER: "10 m³",
    PORTEUR: "15 m³",
    GROS_PORTEUR: "20 m³",
    PORTEUR_ARTICULE: "Vilkikas su priekaba",
    SEMI_REMORQUE: "Puspriekabė",
  },
  tr: {
    VL: "VL",
    PORTEUR_LEGER: "10 m³",
    PORTEUR: "15 m³",
    GROS_PORTEUR: "20 m³",
    PORTEUR_ARTICULE: "Çekici",
    SEMI_REMORQUE: "Yarı römork",
  },
  ru: {
    VL: "VL",
    PORTEUR_LEGER: "10 m³",
    PORTEUR: "15 m³",
    GROS_PORTEUR: "20 m³",
    PORTEUR_ARTICULE: "Седельный тягач",
    SEMI_REMORQUE: "Полуприцеп",
  },
};

const STANDARD_CODE_SET = new Set<string>(STANDARD_VEHICLE_TYPE_CODES);

export function isStandardVehicleTypeCode(code: string): code is StandardVehicleTypeCode {
  return STANDARD_CODE_SET.has(code.trim().toUpperCase());
}

export function normalizeVehicleTypeCode(
  code: string | null | undefined
): StandardVehicleTypeCode | null {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  return isStandardVehicleTypeCode(key) ? key : null;
}

/**
 * Normalise/valide une valeur brute de traductions BDD (`displayLabels` JSON)
 * en une map typée `{ langue: libellé }`. Ignore les clés de langue inconnues
 * et les valeurs vides/non-string : robuste face à des données héritées ou
 * malformées (jamais d'exception).
 */
/** Codes langue supportés, dérivés de la table i18n (évite l'import circulaire). */
const SUPPORTED_LANG_SET = new Set<string>(Object.keys(vehicleTypeDisplayLabels));

export function parseVehicleTypeDbTranslations(
  raw: unknown
): VehicleTypeDbTranslations {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: VehicleTypeDbTranslations = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SUPPORTED_LANG_SET.has(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) out[key as LangCode] = trimmed;
  }
  return out;
}

/**
 * Résout le libellé AFFICHÉ d'un gabarit véhicule.
 *
 * Ordre de priorité (cf. spec gabarits administrables) :
 *   1. Traduction BDD pour la langue courante (`dbTranslations[lang]`) — permet
 *      à l'admin de traduire les gabarits custom créés en back-office.
 *   2. Libellé BDD PERSONNALISÉ : si le gabarit/label saisi en back-office
 *      diffère du libellé standard FR du code, l'admin l'a personnalisé → il
 *      prime sur l'i18n standard (ex. code GROS_PORTEUR relabellisé « Porteur »
 *      ne doit pas s'afficher « 20 m³ »). Sans traduction BDD, ce libellé sert
 *      dans toutes les langues (l'admin peut ajouter des traductions ensuite).
 *   3. Traduction i18n standard par code (codes connus non personnalisés).
 *   4. Gabarit BDD, puis label BDD (repli pour gabarits custom non traduits).
 *   5. Code technique humanisé (dernier recours).
 */
export function resolveVehicleTypeDisplayLabel(opts: {
  code: string | null | undefined;
  lang: LangCode;
  dbTranslations?: VehicleTypeDbTranslations | null;
  dbLabel?: string | null;
  dbGabarit?: string | null;
}): string {
  const { code, lang, dbTranslations, dbLabel, dbGabarit } = opts;

  const dbTranslated = dbTranslations?.[lang]?.trim();
  if (dbTranslated) return dbTranslated;

  const gabarit = dbGabarit?.trim();
  const label = dbLabel?.trim();
  const dbDisplay = gabarit || label;

  const normalized = normalizeVehicleTypeCode(code);
  if (normalized) {
    // L'admin a-t-il personnalisé le libellé (diffère du standard FR du code) ?
    // Si oui, on respecte sa saisie plutôt que d'imposer le libellé i18n codé
    // en dur — évite qu'un code standard relabellisé affiche l'ancien libellé.
    const standardFr = FRENCH_STANDARD_LABELS[normalized];
    const isCustomized =
      !!dbDisplay && normalizeLabelForCompare(dbDisplay) !== normalizeLabelForCompare(standardFr);
    if (!isCustomized) {
      const translated = vehicleTypeDisplayLabels[lang]?.[normalized];
      if (translated) return translated;
    }
  }

  if (dbDisplay) return dbDisplay;
  if (code?.trim()) return code.trim().replace(/_/g, " ");
  return "";
}

/** Normalise un libellé pour comparaison (minuscules, espaces compactés). */
function normalizeLabelForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Alias court pour les appels serveur (PDF, e-mail). */
export function resolveVehicleTypeDisplayLabelByCode(
  code: string | null | undefined,
  lang: LangCode,
  dbFallback?: { label?: string | null; gabarit?: string | null }
): string {
  return resolveVehicleTypeDisplayLabel({
    code,
    lang,
    dbLabel: dbFallback?.label,
    dbGabarit: dbFallback?.gabarit,
  });
}
