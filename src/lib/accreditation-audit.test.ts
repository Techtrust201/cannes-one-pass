import { describe, it, expect } from "vitest";
import { computeDiff, inferActorSource } from "./accreditation-audit-pure";

describe("computeDiff", () => {
  it("retourne un diff vide quand rien ne change", () => {
    const before = { company: "A", stand: "B" };
    const after = { company: "A", stand: "B" };
    expect(computeDiff(before, after)).toEqual({ before: {}, after: {} });
  });

  it("isole uniquement les champs modifiés", () => {
    const before = { company: "Old", stand: "12", message: "hi" };
    const after = { company: "New", stand: "12", message: "hi" };
    expect(computeDiff(before, after)).toEqual({
      before: { company: "Old" },
      after: { company: "New" },
    });
  });

  it("ignore les champs techniques", () => {
    const before = { id: "1", version: 0, company: "Old" };
    const after = { id: "1", version: 1, company: "New" };
    expect(computeDiff(before, after)).toEqual({
      before: { company: "Old" },
      after: { company: "New" },
    });
  });

  it("gère les types composés (tableaux, objets)", () => {
    const before = { vehicles: [{ id: 1 }] };
    const after = { vehicles: [{ id: 1 }, { id: 2 }] };
    const d = computeDiff(before, after);
    expect(d.before).toHaveProperty("vehicles");
    expect(d.after).toHaveProperty("vehicles");
  });
});

describe("inferActorSource", () => {
  it("renvoie PUBLIC_FORM si pas de userId", () => {
    expect(inferActorSource(null, null)).toBe("PUBLIC_FORM");
    expect(inferActorSource(undefined, undefined)).toBe("PUBLIC_FORM");
  });

  it("renvoie SUPER_ADMIN pour un super-admin", () => {
    expect(inferActorSource("u1", "SUPER_ADMIN")).toBe("SUPER_ADMIN");
  });

  it("renvoie LOGISTICIEN pour les autres users authentifiés", () => {
    expect(inferActorSource("u1", "ADMIN")).toBe("LOGISTICIEN");
    expect(inferActorSource("u1", "USER")).toBe("LOGISTICIEN");
  });
});
