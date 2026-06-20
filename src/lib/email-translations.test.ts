import { describe, expect, it } from "vitest";
import { getEmailTranslations, type EmailT } from "@/lib/email-translations";
import type { LangCode } from "@/lib/translations";

const LANGS: LangCode[] = [
  "fr",
  "en",
  "pl",
  "cs",
  "lt",
  "de",
  "tr",
  "es",
  "pt",
  "it",
  "ru",
];

const KEYS: (keyof EmailT)[] = [
  "titleValidated",
  "titleRequest",
  "greeting",
  "introValidated",
  "introRequest",
  "bannerValidatedTitle",
  "bannerValidatedText",
  "bannerRequestTitle",
  "bannerRequestText",
  "event",
  "vehicle",
  "vehicleTemplate",
  "trailer",
  "plannedDate",
  "departureCity",
  "driverPhone",
  "qrAlt",
  "qrCaption",
  "spamTitle",
  "spamText",
  "footerAuto",
  "subjectValidated",
  "subjectRequest",
];

describe("email-translations", () => {
  it("fournit toutes les clés non vides pour les 11 langues", () => {
    for (const lang of LANGS) {
      const t = getEmailTranslations(lang);
      for (const key of KEYS) {
        expect(t[key], `${lang}.${key}`).toBeTruthy();
      }
    }
  });

  it("le français n'est pas dupliqué tel quel en anglais (preuve de traduction)", () => {
    const fr = getEmailTranslations("fr");
    const en = getEmailTranslations("en");
    expect(en.event).not.toBe(fr.event);
    expect(en.vehicle).not.toBe(fr.vehicle);
    expect(en.greeting).not.toBe(fr.greeting);
  });

  it("fallback fr pour une langue inconnue", () => {
    const t = getEmailTranslations("xx" as LangCode);
    expect(t.greeting).toBe(getEmailTranslations("fr").greeting);
  });
});
