import { describe, it, expect } from "vitest";
import {
  buildReferentialTemplate,
  buildPlanningTemplate,
  templateFileName,
} from "./templates";
import { parseReferentialCsv } from "./referential";
import { parsePlanningCsv } from "./planning";

describe("templates telechargeables", () => {
  it("referentiel vide : entetes seules, parse sans erreur, 0 exposant", () => {
    const csv = buildReferentialTemplate("empty");
    expect(csv.split("\n")[0]).toContain("COMPANY NAME");
    const res = parseReferentialCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.exhibitors).toEqual([]);
  });

  it("referentiel exemple : parse sans erreur et produit des emplacements", () => {
    const res = parseReferentialCsv(buildReferentialTemplate("example"));
    expect(res.errors).toEqual([]);
    expect(res.exhibitors.length).toBeGreaterThan(0);
    // La ligne multi-valeurs "PAN 023 / PAN 024" produit 2 emplacements.
    const multi = res.exhibitors.find((e) => e.locations.length >= 2);
    expect(multi).toBeDefined();
  });

  it("planning canonique vide : parse sans erreur de colonnes, 0 ligne", () => {
    const res = parsePlanningCsv(buildPlanningTemplate("empty"));
    expect(res.errors).toEqual([]);
    expect(res.rows).toEqual([]);
  });

  it("planning canonique exemple : parse sans erreur et produit des lignes", () => {
    const res = parsePlanningCsv(buildPlanningTemplate("example"));
    expect(res.errors).toEqual([]);
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it("noms de fichiers de template", () => {
    expect(templateFileName("referential", "empty")).toBe("import-referential-empty.csv");
    expect(templateFileName("planning", "example")).toBe("import-planning-example.csv");
  });
});
