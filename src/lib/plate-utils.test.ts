import { describe, expect, it } from "vitest";
import { sanitizePlate, plateCursorAfterSanitize } from "./plate-utils";

describe("plate-utils", () => {
  it("sanitizePlate supprime les caractères non alphanumériques et met en majuscules", () => {
    expect(sanitizePlate("aa-123-bb")).toBe("AA123BB");
    expect(sanitizePlate("xw394-!*")).toBe("XW394");
  });

  it("plateCursorAfterSanitize préserve la position logique du curseur", () => {
    expect(plateCursorAfterSanitize("AA-123", 4)).toBe(3);
    expect(plateCursorAfterSanitize("aa-123-bb", 8)).toBe(6);
  });
});
