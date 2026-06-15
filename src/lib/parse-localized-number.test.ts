import { describe, it, expect } from "vitest";
import { parseLocalizedNumber } from "./parse-localized-number";

describe("parseLocalizedNumber", () => {
  it("accepte les décimales françaises (virgule)", () => {
    expect(parseLocalizedNumber("1,3")).toBe(1.3);
    expect(parseLocalizedNumber("1,7")).toBe(1.7);
    expect(parseLocalizedNumber("2,3")).toBe(2.3);
    expect(parseLocalizedNumber("0,22")).toBe(0.22);
  });

  it("accepte les décimales anglaises (point)", () => {
    expect(parseLocalizedNumber("1.3")).toBe(1.3);
    expect(parseLocalizedNumber("1.7")).toBe(1.7);
    expect(parseLocalizedNumber("2.3")).toBe(2.3);
    expect(parseLocalizedNumber("0.22")).toBe(0.22);
  });

  it("accepte les entiers et les nombres déjà typés", () => {
    expect(parseLocalizedNumber("20")).toBe(20);
    expect(parseLocalizedNumber("4")).toBe(4);
    expect(parseLocalizedNumber(12)).toBe(12);
    expect(parseLocalizedNumber(0)).toBe(0);
  });

  it("tolère les espaces et le signe", () => {
    expect(parseLocalizedNumber(" 20 ")).toBe(20);
    expect(parseLocalizedNumber("1 000,5")).toBe(1000.5);
    expect(parseLocalizedNumber("-3,5")).toBe(-3.5);
    expect(parseLocalizedNumber(",5")).toBe(0.5);
  });

  it("retourne null pour les valeurs invalides", () => {
    expect(parseLocalizedNumber("")).toBeNull();
    expect(parseLocalizedNumber("   ")).toBeNull();
    expect(parseLocalizedNumber("abc")).toBeNull();
    expect(parseLocalizedNumber("1,2,3")).toBeNull();
    expect(parseLocalizedNumber("1.2.3")).toBeNull();
    expect(parseLocalizedNumber("12px")).toBeNull();
    expect(parseLocalizedNumber(null)).toBeNull();
    expect(parseLocalizedNumber(undefined)).toBeNull();
    expect(parseLocalizedNumber(NaN)).toBeNull();
    expect(parseLocalizedNumber(Infinity)).toBeNull();
  });
});
