import type { LangCode, T } from "@/lib/translations";
import type { RxCategory, RxSpaceDef } from "./config";

/**
 * Helpers de localisation des libellés métier RX (espaces, catégories, notes).
 *
 * Les libellés sont résolus depuis `t.rx.*` (indexé par identifiant technique
 * stable). En cas de clé manquante, on retombe sur le texte français figé dans
 * `config.ts` — l'UI n'est jamais cassée.
 */

export function getLocalizedSpace(
  space: RxSpaceDef,
  t: T
): { label: string; note?: string } {
  const tr = t.rx.spaces[space.id];
  return {
    label: tr?.label ?? space.label,
    note: tr?.note ?? space.note,
  };
}

export function getLocalizedCategory(
  cat: RxCategory,
  t: T
): { name: string; scalesNote?: string } {
  const tr = t.rx.categories[cat.id];
  return {
    name: tr?.name ?? cat.name,
    scalesNote: tr?.scalesNote ?? cat.scalesNote,
  };
}

/** Repli français pour les libellés skip non encore traduits dans une langue. */
const SKIP_FR = {
  montageLabel: "Je souhaite une accréditation uniquement pour le démontage",
  demontageLabel: "Je ne souhaite pas d'accréditation pour le démontage",
  addMontageBanner:
    "Vous avez demandé une accréditation uniquement pour le démontage.",
  addMontageCta: "Ajouter le montage",
  addDemontageBanner:
    "Vous n'avez pas demandé d'accréditation pour le démontage.",
  addDemontageCta: "Ajouter le démontage",
  selectCategoriesIntro:
    "Sélectionnez les catégories concernées par le démontage, puis renseignez la date, le créneau et le véhicule.",
  bothSkippedWarning:
    "Vous devez conserver au moins le montage ou le démontage.",
};

/** Libellés skip montage/démontage avec repli FR si la langue n'est pas traduite. */
export function getSkipT(t: T): typeof SKIP_FR {
  return { ...SKIP_FR, ...(t.rx.skip ?? {}) };
}

const BATEAU_TERRE_FR = {
  contactScales:
    "Il est impératif de contacter notre manutentionnaire Scales (scales.expo@scales.fr) afin d'être intégré au planning des arrivées.",
  noConvoy: "Les convois non prévus au planning n'auront pas accès aux quais.",
  autoUnload:
    "Bateaux à terre en auto-déchargement : sélectionnez « Stand sous tente / Espace nu devant bateau ».",
};

/** Consigne bateaux à terre avec repli FR. */
export function getBateauTerreT(t: T): typeof BATEAU_TERRE_FR {
  return { ...BATEAU_TERRE_FR, ...(t.rx.bateauTerre ?? {}) };
}

/** Libellés « Autre » prestataire (étape 5) avec repli FR. */
export function getOtherProviderT(t: T): {
  otherProvider: string;
  otherProviderLabel: string;
  otherProviderPlaceholder: string;
  otherProviderRequired: string;
} {
  const m = t.rx.manutention;
  return {
    otherProvider: m.otherProvider ?? "Autre",
    otherProviderLabel: m.otherProviderLabel ?? "Nom du prestataire",
    otherProviderPlaceholder:
      m.otherProviderPlaceholder ?? "Précisez le transporteur / prestataire",
    otherProviderRequired:
      m.otherProviderRequired ?? "Veuillez préciser le nom du prestataire.",
  };
}

/**
 * Formate une date ISO "YYYY-MM-DD" en format court localisé (ex. "jeu. 3 sept."
 * en français, "Thu, Sep 3" en anglais), via `Intl.DateTimeFormat`.
 */
export function formatDateLocalized(iso: string, lang: LangCode): string {
  if (!iso) return "";
  const dt = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(lang, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(dt);
  } catch {
    return iso;
  }
}
