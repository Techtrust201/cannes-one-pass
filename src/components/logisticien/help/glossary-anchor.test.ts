import { describe, expect, it } from "vitest";
import {
  glossaryHash,
  parseGlossaryIdFromHash,
} from "@/components/logisticien/help/glossary-anchor";

describe("glossary-anchor", () => {
  it("parseGlossaryIdFromHash accepte les ids lexique-*", () => {
    expect(parseGlossaryIdFromHash("#lexique-planning")).toBe("lexique-planning");
    expect(parseGlossaryIdFromHash("lexique-import")).toBe("lexique-import");
    expect(parseGlossaryIdFromHash("#autre")).toBeNull();
  });

  it("glossaryHash normalise l’id", () => {
    expect(glossaryHash("lexique-liste")).toBe("#lexique-liste");
    expect(glossaryHash("#lexique-liste")).toBe("#lexique-liste");
  });
});
