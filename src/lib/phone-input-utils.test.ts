import { describe, it, expect } from "vitest";
import { sanitizeLocalPhoneNumber } from "./phone-input-utils";

describe("sanitizeLocalPhoneNumber", () => {
  it("retire le + et les caractères non numériques", () => {
    expect(sanitizeLocalPhoneNumber("+33", "+33 6 38 15 27 62")).toBe("638152762");
  });

  it("retire le doublon d'indicatif", () => {
    expect(sanitizeLocalPhoneNumber("+33", "33638152762")).toBe("638152762");
  });

  it("retire le préfixe national 0", () => {
    expect(sanitizeLocalPhoneNumber("+33", "0638152762")).toBe("638152762");
  });

  it("conserve un numéro déjà correct", () => {
    expect(sanitizeLocalPhoneNumber("+33", "638152762")).toBe("638152762");
  });

  it("gère un indicatif international long", () => {
    expect(sanitizeLocalPhoneNumber("+221", "0771234567")).toBe("771234567");
  });
});
