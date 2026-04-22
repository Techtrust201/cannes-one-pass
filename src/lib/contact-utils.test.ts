import { describe, it, expect } from "vitest";
import { formatPhoneNumber, getTelLink, getWhatsAppLink } from "./contact-utils";

describe("formatPhoneNumber", () => {
  it("formate un numéro FR avec code d'indicatif et préfixe 0", () => {
    expect(formatPhoneNumber("+33", "0612345678")).toBe("+33612345678");
  });

  it("formate un numéro FR sans préfixe 0", () => {
    expect(formatPhoneNumber("+33", "612345678")).toBe("+33612345678");
  });

  it("conserve le 0 si l'indicatif est corrompu (> 3 chiffres)", () => {
    // Cas du bug historique : phoneCode='+3376' + phoneNumber='0640775'
    // doit maintenant rester cohérent (ne pas strip) au lieu de tout casser.
    expect(formatPhoneNumber("+3376", "0640775")).toBe("+33760640775");
  });

  it("gère les espaces et caractères parasites", () => {
    expect(formatPhoneNumber("+33", "06 12 34 56 78")).toBe("+33612345678");
    expect(formatPhoneNumber("+33 ", " 0612345678")).toBe("+33612345678");
  });

  it("gère les numéros internationaux longs (dial code 3 chiffres)", () => {
    // Ex: Sénégal +221
    expect(formatPhoneNumber("+221", "771234567")).toBe("+221771234567");
  });

  it("ne strip pas le 0 initial si l'indicatif est vide", () => {
    expect(formatPhoneNumber("", "0612345678")).toBe("+0612345678");
  });
});

describe("getTelLink", () => {
  it("produit un lien tel: correct", () => {
    expect(getTelLink("+33", "0612345678")).toBe("tel:+33612345678");
  });
});

describe("getWhatsAppLink", () => {
  it("produit un lien WhatsApp sans +", () => {
    expect(getWhatsAppLink("+33", "0612345678")).toBe("https://wa.me/33612345678");
  });
});
