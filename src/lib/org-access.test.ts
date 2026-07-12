import { describe, it, expect } from "vitest";
import { canAccessOrganization } from "./org-access";

// Tests ciblés du garde d'accès organisation utilisé par la page détail stand
// (Phase 0 — correction IDOR). Fonction pure : couvre les cas d'accès sans DB.
describe("canAccessOrganization", () => {
  it("utilisateur membre : accès autorisé à son organisation (org A → A)", () => {
    expect(canAccessOrganization(["orgA", "orgC"], "orgA")).toBe(true);
  });

  it("utilisateur membre : accès refusé à une autre organisation (org A → B)", () => {
    expect(canAccessOrganization(["orgA"], "orgB")).toBe(false);
  });

  it("super-admin (\"ALL\") : accès autorisé à n'importe quelle organisation", () => {
    expect(canAccessOrganization("ALL", "orgA")).toBe(true);
    expect(canAccessOrganization("ALL", "orgB")).toBe(true);
  });

  it("aucune organisation accessible (non authentifié / inactif / sans org) : refus", () => {
    expect(canAccessOrganization([], "orgA")).toBe(false);
  });

  it("id d'organisation vide/absent : refus (sauf super-admin)", () => {
    expect(canAccessOrganization(["orgA"], "")).toBe(false);
    expect(canAccessOrganization(["orgA"], null)).toBe(false);
    expect(canAccessOrganization(["orgA"], undefined)).toBe(false);
    // Un super-admin conserve l'accès même sans id explicite.
    expect(canAccessOrganization("ALL", null)).toBe(true);
  });
});
