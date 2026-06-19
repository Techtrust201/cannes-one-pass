import type { LangCode } from "@/lib/translations";

/**
 * Configuration d'affichage des formulaires d'accréditation, scopée par
 * organisation.
 *
 * Objectif : piloter *uniquement l'affichage* (libellés + ordre des options)
 * par organisation, SANS toucher aux valeurs techniques envoyées au backend ni
 * aux noms de champs/colonnes en base.
 *
 * - Les libellés métier (« Société », « Stand | Client ») sont traduits dans
 *   les 11 langues de l'app.
 * - Les options de « Déchargement par » sont décrites par des entrées
 *   configurables (`code`, `displayLabels`, `sortOrder`, `isActive`,
 *   `isDefault`). La valeur envoyée au backend reste un code stable
 *   (`UNKNOWN`, `Autonome`) ou le nom du prestataire (nom propre, non traduit).
 *
 * Portée actuelle : `palais-des-festivals`. Les autres organisations
 * conservent le comportement historique via la configuration `default`.
 * RX n'utilise pas ces composants (routé vers son propre wizard), il n'est
 * donc jamais impacté.
 */

/**
 * Slug canonique de l'organisation Palais des Festivals (`Organization.slug`
 * en base). À NE PAS confondre avec le slug de *template* (`"palais"`,
 * `formTemplate`) qui n'est jamais propagé comme `orgSlug` aux composants.
 */
export const PALAIS_ORG_SLUG = "palais-des-festivals";

/**
 * Vrai uniquement pour l'organisation Palais des Festivals, identifiée par son
 * slug d'organisation explicite. On n'utilise JAMAIS `!isRx` comme proxy :
 * cela impacterait toute organisation non-RX (présente ou future).
 */
export function isPalaisOrg(slug?: string | null): boolean {
  return slug?.trim().toLowerCase() === PALAIS_ORG_SLUG;
}

/* ------------------------------------------------------------------ *
 * 1. Libellés de champs scopés par organisation                      *
 * ------------------------------------------------------------------ */

export type OrgFieldLabelKey =
  | "decoratorName"
  | "decoratorPlaceholder"
  | "standServed"
  | "standPlaceholder";

type LangMap = Record<LangCode, string>;

/**
 * Surcharges de libellés pour Palais des Festivals.
 * « Décorateur » → « Société », « Stand » → « Stand | Client ».
 * Les noms propres ne sont pas traduits ; ici ce sont des termes génériques,
 * donc traduits dans les 11 langues.
 */
const PALAIS_FIELD_LABELS: Record<OrgFieldLabelKey, LangMap> = {
  decoratorName: {
    fr: "Société",
    en: "Company",
    de: "Firma",
    es: "Empresa",
    pt: "Empresa",
    it: "Azienda",
    pl: "Firma",
    cs: "Společnost",
    lt: "Įmonė",
    tr: "Şirket",
    ru: "Компания",
  },
  decoratorPlaceholder: {
    fr: "Nom de la société",
    en: "Company name",
    de: "Name der Firma",
    es: "Nombre de la empresa",
    pt: "Nome da empresa",
    it: "Nome dell'azienda",
    pl: "Nazwa firmy",
    cs: "Název společnosti",
    lt: "Įmonės pavadinimas",
    tr: "Şirket adı",
    ru: "Название компании",
  },
  standServed: {
    fr: "Stand | Client",
    en: "Stand | Client",
    de: "Stand | Kunde",
    es: "Stand | Cliente",
    pt: "Stand | Cliente",
    it: "Stand | Cliente",
    pl: "Stoisko | Klient",
    cs: "Stánek | Klient",
    lt: "Stendas | Klientas",
    tr: "Stant | Müşteri",
    ru: "Стенд | Клиент",
  },
  standPlaceholder: {
    fr: "Nom du stand ou du client",
    en: "Stand or client name",
    de: "Name des Stands oder Kunden",
    es: "Nombre del stand o cliente",
    pt: "Nome do stand ou cliente",
    it: "Nome dello stand o cliente",
    pl: "Nazwa stoiska lub klienta",
    cs: "Název stánku nebo klienta",
    lt: "Stendo arba kliento pavadinimas",
    tr: "Stant veya müşteri adı",
    ru: "Название стенда или клиента",
  },
};

/**
 * Renvoie le libellé d'un champ pour une organisation donnée.
 * Si l'organisation n'a pas de surcharge, renvoie `fallback` (libellé i18n
 * standard fourni par l'appelant).
 */
export function getOrgFieldLabel(
  orgSlug: string | null | undefined,
  key: OrgFieldLabelKey,
  lang: LangCode,
  fallback: string
): string {
  if (isPalaisOrg(orgSlug)) {
    const override = PALAIS_FIELD_LABELS[key]?.[lang];
    if (override) return override;
  }
  return fallback;
}

/* ------------------------------------------------------------------ *
 * 2. Options « Déchargement par » — ordre & options synthétiques      *
 * ------------------------------------------------------------------ */

/**
 * ⚠️ STATUT « ADMINISTRABLE » — à lire avant d'évoluer ce bloc.
 *
 * Contrairement aux gabarits (table `VehicleTypeConfig` avec colonne
 * `sortOrder`, éditable en back-office), le champ « Déchargement par » n'est
 * PAS pilotable depuis le back-office en l'état :
 *
 *  - Les PRESTATAIRES (table `UnloadingProvider`) sont administrables en CRUD
 *    (création / renommage / activation via `/api/unloading-providers` et la
 *    section `UnloadingProvidersSection`), MAIS leur ordre d'affichage n'est
 *    pas configurable : l'API renvoie un tri alphabétique (`orderBy: name asc`),
 *    la table n'a pas de colonne `sortOrder`.
 *  - Les options SYNTHÉTIQUES (`UNKNOWN`, `Autonome`) et l'ordre global
 *    ci-dessous sont une CONFIG APPLICATIVE codée ici, par organisation. Ce
 *    n'est donc PAS une gestion back-office : c'est une config temporaire et
 *    figée dans le code (changer l'ordre = changer ce fichier + déployer).
 *
 * Pour rendre cet ordre réellement administrable (sujet général demandé), il
 * faudrait : ajouter `sortOrder` (+ éventuellement `displayLabels`, `isActive`)
 * à `UnloadingProvider`, exposer ce tri dans l'API et l'UI d'admin, et modéliser
 * les options synthétiques comme des entrées de table. Hors périmètre du besoin
 * Killian (contenu Palais) ; à traiter séparément.
 */

/**
 * Codes techniques stables envoyés au backend pour les options synthétiques
 * (non issues de la table `UnloadingProvider`).
 * - `UNKNOWN` : nouvelle option « Inconnu ».
 * - `Autonome` : « Déchargement manuel ». Valeur HISTORIQUE conservée pour la
 *   compatibilité avec les accréditations déjà stockées (ne pas renommer).
 */
export const UNLOADING_UNKNOWN = "UNKNOWN";
export const UNLOADING_MANUAL = "Autonome";

const UNLOADING_LABELS: Record<string, LangMap> = {
  [UNLOADING_UNKNOWN]: {
    fr: "Inconnu",
    en: "Unknown",
    de: "Unbekannt",
    es: "Desconocido",
    pt: "Desconhecido",
    it: "Sconosciuto",
    pl: "Nieznany",
    cs: "Neznámé",
    lt: "Nežinoma",
    tr: "Bilinmiyor",
    ru: "Неизвестно",
  },
  [UNLOADING_MANUAL]: {
    fr: "Déchargement manuel",
    en: "Manual unloading",
    de: "Manuelle Entladung",
    es: "Descarga manual",
    pt: "Descarga manual",
    it: "Scarico manuale",
    pl: "Rozładunek ręczny",
    cs: "Ruční vykládka",
    lt: "Rankinis iškrovimas",
    tr: "Manuel boşaltma",
    ru: "Ручная разгрузка",
  },
};

/**
 * Option synthétique de déchargement (hors prestataires en base).
 * Structure cible pour rendre l'ordre/affichage configurables par org.
 */
export interface SyntheticUnloadingOption {
  /** Valeur technique stable envoyée au backend. */
  code: string;
  /** Traductions d'affichage par langue (terme générique). */
  displayLabels: LangMap;
  /** Ordre d'affichage (croissant). */
  sortOrder: number;
  /** Option proposée si true. */
  isActive: boolean;
  /** Présélectionnée par défaut (au plus une par org). */
  isDefault?: boolean;
}

interface OrgUnloadingConfig {
  /** Options synthétiques (codes stables) propres à l'organisation. */
  synthetic: SyntheticUnloadingOption[];
  /**
   * Position des prestataires issus de la table `UnloadingProvider` dans
   * l'ordre global. Les prestataires conservent leur ordre de retour API,
   * décalé par cette base.
   */
  providersSortOrder: number;
}

/**
 * Config Palais : Inconnu (présélectionné) puis Déchargement manuel, puis les
 * prestataires existants. La présélection d'« Inconnu » évite de bloquer le
 * chauffeur sur un champ obligatoire (cf. présélection côté formulaire public).
 */
const PALAIS_UNLOADING: OrgUnloadingConfig = {
  synthetic: [
    {
      code: UNLOADING_UNKNOWN,
      displayLabels: UNLOADING_LABELS[UNLOADING_UNKNOWN],
      sortOrder: 10,
      isActive: true,
      isDefault: true,
    },
    {
      code: UNLOADING_MANUAL,
      displayLabels: UNLOADING_LABELS[UNLOADING_MANUAL],
      sortOrder: 20,
      isActive: true,
    },
  ],
  providersSortOrder: 100,
};

/**
 * Config par défaut (organisations non Palais utilisant le flux legacy) :
 * comportement HISTORIQUE strictement préservé — prestataires d'abord, puis
 * « Déchargement manuel » en dernier, aucune présélection.
 */
const DEFAULT_UNLOADING: OrgUnloadingConfig = {
  synthetic: [
    {
      code: UNLOADING_MANUAL,
      displayLabels: UNLOADING_LABELS[UNLOADING_MANUAL],
      sortOrder: 100,
      isActive: true,
    },
  ],
  providersSortOrder: 10,
};

function getOrgUnloadingConfig(orgSlug: string | null | undefined): OrgUnloadingConfig {
  return isPalaisOrg(orgSlug) ? PALAIS_UNLOADING : DEFAULT_UNLOADING;
}

export interface UnloadingProviderLite {
  id: string;
  name: string;
}

export interface UnloadingOption {
  /** Valeur technique envoyée au backend (code stable ou nom de prestataire). */
  value: string;
  /** Libellé affiché (traduit pour les options génériques). */
  label: string;
  /** True si l'option est présélectionnée par défaut. */
  isDefault?: boolean;
}

/**
 * Construit la liste ordonnée des options « Déchargement par » pour une
 * organisation et une langue données, en fusionnant :
 * - les options synthétiques (codes stables, traduites) ;
 * - les prestataires en base (noms propres, non traduits).
 *
 * Les valeurs (`value`) restent techniques : jamais de libellé traduit envoyé
 * au backend.
 */
export function buildUnloadingOptions(
  orgSlug: string | null | undefined,
  providers: UnloadingProviderLite[],
  lang: LangCode
): UnloadingOption[] {
  const config = getOrgUnloadingConfig(orgSlug);

  const activeSynthetic = config.synthetic.filter((o) => o.isActive);

  const synthetic = activeSynthetic.map((o) => ({
    value: o.code,
    label: o.displayLabels[lang] ?? o.displayLabels.fr,
    sortOrder: o.sortOrder,
    isDefault: o.isDefault,
  }));

  // Déduplication : un prestataire en base peut faire doublon avec une option
  // synthétique (ex. un prestataire nommé « Inconnu » qui ferait doublon avec
  // le code UNKNOWN, ou « Autonome »/« Déchargement manuel » avec le manuel).
  // On masque ces prestataires : l'option synthétique (traduite, code stable)
  // prime. Comparaison insensible casse/espaces, sur le code ET tous les
  // libellés de l'option synthétique.
  const reserved = new Set<string>();
  for (const o of activeSynthetic) {
    reserved.add(normalizeName(o.code));
    for (const label of Object.values(o.displayLabels)) {
      reserved.add(normalizeName(label));
    }
  }

  // Les prestataires conservent l'ordre fourni (l'API les trie déjà par
  // sortOrder puis nom — cf. /api/unloading-providers).
  const providerOptions = providers
    .filter((p) => !reserved.has(normalizeName(p.name)))
    .map((p, idx) => ({
      value: p.name,
      label: p.name,
      sortOrder: config.providersSortOrder + idx,
      isDefault: false as boolean | undefined,
    }));

  return [...synthetic, ...providerOptions]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ value, label, isDefault }) => ({ value, label, isDefault }));
}

/** Normalise un nom pour comparaison (minuscules, espaces compactés). */
function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Valeur de déchargement présélectionnée par défaut pour une organisation
 * (code stable), ou `""` si aucune. Utilisé pour ne pas bloquer un champ
 * obligatoire côté formulaire public Palais.
 */
export function getDefaultUnloadingValue(orgSlug: string | null | undefined): string {
  const config = getOrgUnloadingConfig(orgSlug);
  return config.synthetic.find((o) => o.isActive && o.isDefault)?.code ?? "";
}

/**
 * Résout le libellé d'affichage d'une valeur de déchargement stockée.
 * - Code synthétique connu (`UNKNOWN`, `Autonome`) → libellé traduit.
 * - Sinon (nom de prestataire) → valeur telle quelle (nom propre, non traduit).
 *
 * Indépendant de toute organisation : la résolution se fait sur la valeur
 * stockée, donc cohérente sur toutes les surfaces (récap, PDF, back-office).
 */
export function resolveUnloadingLabel(
  value: string | null | undefined,
  lang: LangCode
): string {
  if (!value) return "";
  const labels = UNLOADING_LABELS[value];
  if (labels) return labels[lang] ?? labels.fr;
  return value;
}
