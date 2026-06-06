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
