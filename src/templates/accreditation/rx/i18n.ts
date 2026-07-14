import type { LangCode, T } from "@/lib/translations";
import {
  resolveVehicleTypeDisplayLabel,
  type VehicleTypeDbTranslations,
} from "@/lib/vehicle-type-i18n";
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

/**
 * Libellé type de véhicule (affichage uniquement).
 *
 * Priorité : traduction BDD (admin) → i18n standard par code → gabarit/label
 * BDD pour les gabarits custom non traduits.
 */
export function getLocalizedVehicleType(
  code: string,
  lang: LangCode,
  fallbackGabarit?: string,
  fallbackLabel?: string,
  dbTranslations?: VehicleTypeDbTranslations | null
): string {
  return resolveVehicleTypeDisplayLabel({
    code,
    lang,
    dbTranslations,
    dbGabarit: fallbackGabarit,
    dbLabel: fallbackLabel,
  });
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

/** Repli français : message affiché quand le planning DB d'une catégorie est en erreur (STRICT). */
const PLANNING_ERROR_FR = {
  unavailable:
    "Le planning de cette catégorie est momentanément indisponible. Merci de réessayer dans quelques instants ou de contacter l'organisateur si le problème persiste.",
};

/** Message d'indisponibilité planning (Phase 6C-A, F4/F6) avec repli FR. */
export function getPlanningErrorT(t: T): typeof PLANNING_ERROR_FR {
  return { ...PLANNING_ERROR_FR, ...(t.rx.planningError ?? {}) };
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


const FLOW_FR = {
  confirmPublicTitle: "Confirmer l'envoi de la demande",
  confirmPublicMsg:
    "Votre demande sera enregistrée au statut Nouveau. Elle devra être validée par l'équipe logistique avant d'être utilisable.",
  confirmPublicCta: "Confirmer l'envoi",
  confirmLogisticienTitle: "Confirmer la création",
  confirmLogisticienMsg:
    "L'accréditation sera créée directement validée. Elle sera immédiatement visible et opérationnelle dans la liste.",
  confirmLogisticienCta: "Créer l'accréditation",
  successTitleOne: "Demande enregistrée !",
  successTitleMany: "demandes enregistrées !",
  successTitleOneLog: "Accréditation créée !",
  successTitleManyLog: "accréditations créées !",
  successPerVehicle: "Une accréditation a été créée par véhicule. ",
  successPublic:
    "Votre demande sera traitée puis validée par l'organisateur. Un e-mail de confirmation vous sera envoyé.",
  successLogisticien: "Validée(s) et visible(s) dans la liste.",
  downloadNotice:
    "Ce document peut être transmis au transporteur à titre informatif. Il ne constitue pas une accréditation d'accès.",
  downloadCta: "Télécharger ma demande",
  downloadOfficialNotice:
    "Téléchargez l'accréditation officielle à transmettre au transporteur ou à l'exposant.",
  downloadOfficialCta: "Télécharger l'accréditation (PDF officiel)",
  newRequest: "Nouvelle demande",
  newAccreditation: "Nouvelle accréditation",
  pageTitleLog: "Créer une accréditation",
  pageSubtitleLog:
    "Saisie directe par l'équipe logistique — accréditation validée à la création",
};

/** Textes modal / succès / en-tête selon le flux public vs logisticien (repli FR). */
export function getRxFlowT(t: T, mode: "public" | "logisticien" = "public") {
  const m = t.rx.manutention;
  const log = t.rx.logisticien;
  const base = {
    ...FLOW_FR,
    ...m,
    pageTitleLog: log?.pageTitle ?? FLOW_FR.pageTitleLog,
    pageSubtitleLog: log?.pageSubtitle ?? FLOW_FR.pageSubtitleLog,
  };
  const isLog = mode === "logisticien";
  return {
    confirmTitle: isLog
      ? (base.confirmLogisticienTitle ?? FLOW_FR.confirmLogisticienTitle)
      : (base.confirmPublicTitle ?? FLOW_FR.confirmPublicTitle),
    confirmMsg: isLog
      ? (base.confirmLogisticienMsg ?? FLOW_FR.confirmLogisticienMsg)
      : (base.confirmPublicMsg ?? FLOW_FR.confirmPublicMsg),
    confirmCta: isLog
      ? (base.confirmLogisticienCta ?? FLOW_FR.confirmLogisticienCta)
      : (base.confirmPublicCta ?? FLOW_FR.confirmPublicCta),
    successTitleOne: isLog
      ? (base.successTitleOneLog ?? FLOW_FR.successTitleOneLog)
      : (base.successTitleOne ?? FLOW_FR.successTitleOne),
    successTitleMany: isLog
      ? (base.successTitleManyLog ?? FLOW_FR.successTitleManyLog)
      : (base.successTitleMany ?? FLOW_FR.successTitleMany),
    successSubtext: isLog
      ? `${base.successPerVehicle ?? FLOW_FR.successPerVehicle}${base.successLogisticien ?? FLOW_FR.successLogisticien}`
      : (base.successPublic ?? FLOW_FR.successPublic),
    downloadNotice: isLog
      ? (base.downloadOfficialNotice ?? FLOW_FR.downloadOfficialNotice)
      : (base.downloadNotice ?? FLOW_FR.downloadNotice),
    downloadCta: isLog
      ? (base.downloadOfficialCta ?? FLOW_FR.downloadOfficialCta)
      : (base.downloadCta ?? FLOW_FR.downloadCta),
    resetCta: isLog
      ? (base.newAccreditation ?? FLOW_FR.newAccreditation)
      : (base.newRequest ?? FLOW_FR.newRequest),
    downloadBoxClass: isLog
      ? "rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-left space-y-3"
      : "rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-left space-y-3",
    downloadNoticeClass: isLog
      ? "text-sm font-semibold text-green-900"
      : "text-sm font-semibold text-amber-900",
    pdfMode: isLog ? ("official" as const) : ("request" as const),
    pdfFilename: isLog ? "accreditation.pdf" : "demande-accreditation.pdf",
    pageTitle: base.pageTitleLog,
    pageSubtitle: base.pageSubtitleLog,
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
