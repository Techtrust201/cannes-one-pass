import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isValidEmail,
  isAllowedSenderAddress,
  getAllowedSenderDomains,
  resolveAccreditationSender,
  type OrgEmailConfig,
} from "./email-sender";

const baseOrg: OrgEmailConfig = {
  name: "Palais des Festivals",
  emailFromName: null,
  emailFromAddress: null,
  replyToEmail: null,
  emailSendingEnabled: true,
};

describe("isValidEmail", () => {
  it("accepte une adresse valide", () => {
    expect(isValidEmail("palais@notifications.techtrust.fr")).toBe(true);
  });
  it("refuse les valeurs vides / nulles", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
  it("refuse les protocoles et caractères dangereux", () => {
    expect(isValidEmail("javascript:alert(1)")).toBe(false);
    expect(isValidEmail("foo<bar>@x.fr")).toBe(false);
    expect(isValidEmail("foo @bar.fr")).toBe(false);
    expect(isValidEmail("foo@bar")).toBe(false);
  });
});

describe("allowlist domaines", () => {
  const original = process.env.EMAIL_ALLOWED_DOMAINS;
  afterEach(() => {
    if (original === undefined) delete process.env.EMAIL_ALLOWED_DOMAINS;
    else process.env.EMAIL_ALLOWED_DOMAINS = original;
  });

  it("utilise le domaine plateforme par défaut", () => {
    delete process.env.EMAIL_ALLOWED_DOMAINS;
    expect(getAllowedSenderDomains()).toContain("notifications.techtrust.fr");
    expect(isAllowedSenderAddress("palais@notifications.techtrust.fr")).toBe(true);
    expect(isAllowedSenderAddress("palais@autre-domaine.com")).toBe(false);
  });

  it("respecte l'override d'environnement", () => {
    process.env.EMAIL_ALLOWED_DOMAINS = "mail.example.com, notifications.techtrust.fr";
    expect(isAllowedSenderAddress("x@mail.example.com")).toBe(true);
    expect(isAllowedSenderAddress("x@evil.com")).toBe(false);
  });
});

describe("resolveAccreditationSender", () => {
  const originalFrom = process.env.FROM_EMAIL;
  const originalDomains = process.env.EMAIL_ALLOWED_DOMAINS;

  beforeEach(() => {
    process.env.FROM_EMAIL = "Cannes One Pass <noreply@techtrust.fr>";
    process.env.EMAIL_ALLOWED_DOMAINS = "notifications.techtrust.fr";
  });
  afterEach(() => {
    if (originalFrom === undefined) delete process.env.FROM_EMAIL;
    else process.env.FROM_EMAIL = originalFrom;
    if (originalDomains === undefined) delete process.env.EMAIL_ALLOWED_DOMAINS;
    else process.env.EMAIL_ALLOWED_DOMAINS = originalDomains;
  });

  it("utilise l'expéditeur de l'org si adresse valide et autorisée", () => {
    const r = resolveAccreditationSender({
      ...baseOrg,
      emailFromName: "Palais des Festivals",
      emailFromAddress: "palais@notifications.techtrust.fr",
    });
    expect(r.from).toBe("Palais des Festivals <palais@notifications.techtrust.fr>");
    expect(r.usedFallback).toBe(false);
    expect(r.disabled).toBe(false);
  });

  it("utilise le nom de l'org si emailFromName absent", () => {
    const r = resolveAccreditationSender({
      ...baseOrg,
      emailFromAddress: "palais@notifications.techtrust.fr",
    });
    expect(r.from).toBe("Palais des Festivals <palais@notifications.techtrust.fr>");
  });

  it("retombe sur FROM_EMAIL global sans config", () => {
    const r = resolveAccreditationSender(baseOrg);
    expect(r.from).toBe("Cannes One Pass <noreply@techtrust.fr>");
    expect(r.usedFallback).toBe(false);
  });

  it("retombe sur FROM_EMAIL avec org null", () => {
    const r = resolveAccreditationSender(null);
    expect(r.from).toBe("Cannes One Pass <noreply@techtrust.fr>");
  });

  it("inclut replyTo si configuré et valide", () => {
    const r = resolveAccreditationSender({
      ...baseOrg,
      emailFromAddress: "palais@notifications.techtrust.fr",
      replyToEmail: "logistique@palaisdesfestivals.com",
    });
    expect(r.replyTo).toBe("logistique@palaisdesfestivals.com");
  });

  it("ignore un replyTo invalide", () => {
    const r = resolveAccreditationSender({
      ...baseOrg,
      replyToEmail: "pas-un-email",
    });
    expect(r.replyTo).toBeUndefined();
  });

  it("fallback + note si adresse invalide", () => {
    const r = resolveAccreditationSender({
      ...baseOrg,
      emailFromAddress: "pas-un-email",
    });
    expect(r.from).toBe("Cannes One Pass <noreply@techtrust.fr>");
    expect(r.usedFallback).toBe(true);
    expect(r.note).toBeTruthy();
  });

  it("fallback + note si domaine non autorisé", () => {
    const r = resolveAccreditationSender({
      ...baseOrg,
      emailFromAddress: "palais@domaine-non-verifie.com",
    });
    expect(r.from).toBe("Cannes One Pass <noreply@techtrust.fr>");
    expect(r.usedFallback).toBe(true);
    expect(r.note).toContain("domaine-non-verifie.com");
  });

  it("désactive l'envoi si emailSendingEnabled = false", () => {
    const r = resolveAccreditationSender({
      ...baseOrg,
      emailFromAddress: "palais@notifications.techtrust.fr",
      emailSendingEnabled: false,
    });
    expect(r.disabled).toBe(true);
    expect(r.from).toBeNull();
  });

  it("neutralise les caractères dangereux du nom d'affichage", () => {
    const r = resolveAccreditationSender({
      ...baseOrg,
      emailFromName: 'Mauvais"<>nom',
      emailFromAddress: "palais@notifications.techtrust.fr",
    });
    expect(r.from).not.toContain('"');
    expect(r.from).not.toContain("<>");
    expect(r.from).toContain("<palais@notifications.techtrust.fr>");
  });

  it("retourne from=null si ni org ni FROM_EMAIL", () => {
    delete process.env.FROM_EMAIL;
    const r = resolveAccreditationSender(baseOrg);
    expect(r.from).toBeNull();
    expect(r.disabled).toBe(false);
  });
});
