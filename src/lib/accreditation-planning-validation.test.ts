import { describe, it, expect, vi } from "vitest";
import {
  validateAccreditationPlanning,
  type AccreditationPlanningDb,
  type PlanningValidationCommand,
  type PlanningValidationContext,
  type PlanningValidationCategoryInput,
  type ValidateAccreditationPlanningInput,
} from "./accreditation-planning-validation";
import type { PlanningPhase, PlanningRuleRow } from "./logistics-planning";

/**
 * Espace legacy utilisé pour tous les tests : `EXTERIEUR_PALAIS` (issu de
 * `planning-data.ts`) — matrice réelle :
 *   - "stand-tente".liv  : 2026-09-06/07 "08:00-23:00" ;
 *   - "stand-tente".rep  : 2026-09-13 "19:00-23:00", 2026-09-14 "08:00-17:00" ;
 *   - "bateau-terre".liv : 2026-09-04/05 "18:00-21:00" ;
 *   - "bateau-terre".rep : 2026-09-14/15 "17:00-21:00".
 */
const LOCATION = { portCode: "PALAIS", sectorCode: "PALAIS_EXT", logisticSpace: "EXTERIEUR_PALAIS" };

function rxContext(mode: PlanningValidationContext["logisticsPlanningMode"]): PlanningValidationContext {
  return { organizationId: "org-rx", eventId: "event-rx", organizationSlug: "rx", logisticsPlanningMode: mode };
}

/**
 * `livTime`/`repTime` transportent la PLAGE COMPLÈTE `"HH:MM-HH:MM"` choisie
 * dans le menu (peuplée côté client par `genSlots`), jamais une simple heure
 * de départ — cf. `StepDeliveryRx`/`StepPickupRx` (`slot={selected.livTime}`).
 */
function category(overrides: Partial<PlanningValidationCategoryInput> = {}): PlanningValidationCategoryInput {
  return {
    categoryId: "stand-tente",
    livDate: "2026-09-06",
    livTime: "08:00-09:00",
    repDate: "2026-09-14",
    repTime: "08:00-09:00",
    vehicles: [{ vehicleType: "C", plate: "AB-123-CD" }],
    ...overrides,
  };
}

function dbRow(overrides: Partial<PlanningRuleRow> = {}): PlanningRuleRow {
  return {
    scope: "SPACE",
    scopeKey: "SPACE:EXTERIEUR_PALAIS",
    categoryCode: "TERRE",
    phase: "MONTAGE",
    date: "2026-09-06",
    startTime: "10:00",
    endTime: "11:00",
    ...overrides,
  };
}

/** Db mocké : renvoie les lignes fournies pour une phase donnée, quel que soit le `scopeKey` demandé. */
function makeDb(
  rowsByPhase: Partial<Record<PlanningPhase, PlanningRuleRow[]>> = {},
  opts: { throwOnFindMany?: boolean } = {}
): AccreditationPlanningDb {
  return {
    logisticsPlanning: {
      findMany: vi.fn().mockImplementation(async ({ where }: { where: { phase: PlanningPhase } }) => {
        if (opts.throwOnFindMany) throw new Error("connection terminated: secret-dsn");
        return rowsByPhase[where.phase] ?? [];
      }),
    },
  };
}

function run(
  db: AccreditationPlanningDb,
  context: PlanningValidationContext,
  command: PlanningValidationCommand,
  location: ValidateAccreditationPlanningInput["referential"]["location"] = LOCATION
) {
  return validateAccreditationPlanning(db, { context, referential: { location }, command });
}

describe("validateAccreditationPlanning — validation planning RX (Phase 6C-B-1, lecture seule)", () => {
  it("1. Palais (organizationSlug !== 'rx') → succès, zéro lecture planning", async () => {
    const db = makeDb();
    const res = await run(db, { ...rxContext("STRICT"), organizationSlug: "palais" }, {
      categories: [category()],
    });
    expect(res).toMatchObject({ ok: true, skipped: true, phaseEntries: [] });
    expect(db.logisticsPlanning.findMany).not.toHaveBeenCalled();
  });

  it("2. RX DISABLED → succès, zéro lecture planning", async () => {
    const db = makeDb();
    const res = await run(db, rxContext("DISABLED"), { categories: [category()] });
    expect(res).toMatchObject({ ok: true, skipped: true, phaseEntries: [] });
    expect(db.logisticsPlanning.findMany).not.toHaveBeenCalled();
  });

  it("3. TRANSITION règle DB valide → succès, requête DB correctement scopée", async () => {
    const db = makeDb({
      MONTAGE: [dbRow()],
      DEMONTAGE: [dbRow({ phase: "DEMONTAGE", date: "2026-09-14", startTime: "08:00", endTime: "09:00" })],
    });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category({ livTime: "10:00-11:00", repTime: "08:00-09:00" })],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.skipped).toBe(false);
      expect(res.phaseEntries).toHaveLength(2);
    }
    const call = (db.logisticsPlanning.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.where).toMatchObject({
      organizationId: "org-rx",
      eventId: "event-rx",
      phase: "MONTAGE",
      isActive: true,
    });
    expect(call.where.scopeKey.in).toEqual(
      expect.arrayContaining(["SPACE:EXTERIEUR_PALAIS", "SECTOR:PALAIS:PALAIS_EXT", "PORT:PALAIS", "EVENT"])
    );
  });

  it("4. TRANSITION règle absente + legacy valide → succès (repli planning-data.ts)", async () => {
    const db = makeDb({ MONTAGE: [], DEMONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category({ livDate: "2026-09-06", livTime: "08:00-09:00", repDate: "2026-09-14", repTime: "08:00-09:00" })],
    });
    expect(res).toMatchObject({ ok: true, skipped: false });
  });

  it("5. TRANSITION règle absente + legacy date invalide → 400 PLANNING_DATE_INVALID", async () => {
    const db = makeDb({ MONTAGE: [], DEMONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category({ livDate: "2026-09-01", livTime: "08:00-09:00", repDate: "", repTime: "" })],
      skipDemontage: true,
    });
    expect(res).toMatchObject({ ok: false, status: 400, code: "PLANNING_DATE_INVALID" });
  });

  it("6. TRANSITION règle absente + legacy heure invalide → 400 PLANNING_SLOT_INVALID", async () => {
    const db = makeDb({ MONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category({ livDate: "2026-09-06", livTime: "08:30-09:30" })],
      skipDemontage: true,
    });
    expect(res).toMatchObject({ ok: false, status: 400, code: "PLANNING_SLOT_INVALID" });
  });

  it("7. TRANSITION erreur DB → 503 PLANNING_VALIDATION_UNAVAILABLE, sans fuite de détail", async () => {
    const db = makeDb({}, { throwOnFindMany: true });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category()],
    });
    expect(res).toMatchObject({ ok: false, status: 503, code: "PLANNING_VALIDATION_UNAVAILABLE" });
    if (!res.ok) expect(res.message).not.toMatch(/secret-dsn|Error:/);
  });

  it("8. STRICT règle DB valide → succès", async () => {
    const db = makeDb({
      MONTAGE: [dbRow()],
      DEMONTAGE: [dbRow({ phase: "DEMONTAGE", date: "2026-09-14", startTime: "08:00", endTime: "09:00" })],
    });
    const res = await run(db, rxContext("STRICT"), {
      categories: [category({ livTime: "10:00-11:00", repTime: "08:00-09:00" })],
    });
    expect(res).toMatchObject({ ok: true, skipped: false });
  });

  it("9. STRICT règle absente → 409 PLANNING_NOT_FOUND (aucun fallback legacy)", async () => {
    const db = makeDb({ MONTAGE: [] });
    const res = await run(db, rxContext("STRICT"), {
      categories: [category({ livDate: "2026-09-06", livTime: "08:00-09:00" })],
      skipDemontage: true,
    });
    expect(res).toMatchObject({ ok: false, status: 409, code: "PLANNING_NOT_FOUND" });
  });

  it("10. STRICT date falsifiée → 400 PLANNING_DATE_INVALID (date hors des lignes DB résolues)", async () => {
    const db = makeDb({ MONTAGE: [dbRow({ date: "2026-09-06" })] });
    const res = await run(db, rxContext("STRICT"), {
      categories: [category({ livDate: "2026-09-07", livTime: "10:00-11:00" })],
      skipDemontage: true,
    });
    expect(res).toMatchObject({ ok: false, status: 400, code: "PLANNING_DATE_INVALID" });
  });

  it("11. STRICT créneau falsifié → 400 PLANNING_SLOT_INVALID (créneau mal aligné, absent de genSlots)", async () => {
    const db = makeDb({ MONTAGE: [dbRow({ date: "2026-09-06", startTime: "10:00", endTime: "11:00" })] });
    const res = await run(db, rxContext("STRICT"), {
      categories: [category({ livDate: "2026-09-06", livTime: "10:30-11:30" })],
      skipDemontage: true,
    });
    expect(res).toMatchObject({ ok: false, status: 400, code: "PLANNING_SLOT_INVALID" });
  });

  it("12. catégorie inconnue → 400 PLANNING_CATEGORY_INVALID", async () => {
    const db = makeDb();
    const res = await run(db, rxContext("STRICT"), {
      categories: [category({ categoryId: "unknown-cat" })],
    });
    expect(res).toMatchObject({ ok: false, status: 400, code: "PLANNING_CATEGORY_INVALID" });
    expect(db.logisticsPlanning.findMany).not.toHaveBeenCalled();
  });

  it("13. plages disjointes en DB → 409 PLANNING_DISJOINT_RANGES", async () => {
    const db = makeDb({
      MONTAGE: [
        dbRow({ date: "2026-09-06", startTime: "08:00", endTime: "09:00" }),
        dbRow({ date: "2026-09-06", startTime: "14:00", endTime: "15:00" }),
      ],
    });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category({ livDate: "2026-09-06", livTime: "08:00" })],
      skipDemontage: true,
    });
    expect(res).toMatchObject({ ok: false, status: 409, code: "PLANNING_DISJOINT_RANGES" });
  });

  it("14. skipMontage → seules des entrées DEMONTAGE sont produites/validées", async () => {
    const db = makeDb({ DEMONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category({ livDate: "", livTime: "", repDate: "2026-09-14", repTime: "08:00-09:00" })],
      skipMontage: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.phaseEntries.every((e) => e.phase === "DEMONTAGE")).toBe(true);
      expect(res.phaseEntries).toHaveLength(1);
    }
    expect(db.logisticsPlanning.findMany).toHaveBeenCalledTimes(1);
    expect((db.logisticsPlanning.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where.phase).toBe(
      "DEMONTAGE"
    );
  });

  it("15. skipDemontage → seules des entrées MONTAGE sont produites/validées", async () => {
    const db = makeDb({ MONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category({ livDate: "2026-09-06", livTime: "08:00-09:00", repDate: "", repTime: "" })],
      skipDemontage: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.phaseEntries.every((e) => e.phase === "MONTAGE")).toBe(true);
      expect(res.phaseEntries).toHaveLength(1);
    }
    expect(db.logisticsPlanning.findMany).toHaveBeenCalledTimes(1);
  });

  it("16. skipMontage et skipDemontage tous deux vrais → 400 PLANNING_SKIP_INVALID, aucun accès DB", async () => {
    const db = makeDb();
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category()],
      skipMontage: true,
      skipDemontage: true,
    });
    expect(res).toMatchObject({ ok: false, status: 400, code: "PLANNING_SKIP_INVALID" });
    expect(db.logisticsPlanning.findMany).not.toHaveBeenCalled();
  });

  it("17. repSameAsDelivery=true → le véhicule de démontage reprend le gabarit du véhicule de livraison", async () => {
    const db = makeDb({ MONTAGE: [], DEMONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [
        category({
          vehicles: [{ vehicleType: "C", plate: "AB-123-CD", repSameAsDelivery: true, repVehicleType: "D" }],
        }),
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const demontage = res.phaseEntries.find((e) => e.phase === "DEMONTAGE");
      expect(demontage?.vehicleType).toBe("C");
    }
  });

  it("18. reprise différente (repSameAsDelivery=false) → le véhicule de démontage utilise repVehicleType", async () => {
    const db = makeDb({ MONTAGE: [], DEMONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [
        category({
          vehicles: [{ vehicleType: "C", plate: "AB-123-CD", repSameAsDelivery: false, repVehicleType: "D" }],
        }),
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const montage = res.phaseEntries.find((e) => e.phase === "MONTAGE");
      const demontage = res.phaseEntries.find((e) => e.phase === "DEMONTAGE");
      expect(montage?.vehicleType).toBe("C");
      expect(demontage?.vehicleType).toBe("D");
    }
  });

  it("19. plaque RX absente (plate null) acceptée : ce module ne valide jamais la plaque", async () => {
    const db = makeDb({ MONTAGE: [], DEMONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category({ vehicles: [{ vehicleType: "C", plate: null }] })],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.phaseEntries.every((e) => e.sourceVehicle.plate === null)).toBe(true);
    }
  });

  it("20. plusieurs catégories → categoryCode résolu indépendamment pour chacune", async () => {
    const db = makeDb({ MONTAGE: [], DEMONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [
        category({ categoryId: "stand-tente" }),
        category({
          categoryId: "bateau-terre",
          livDate: "2026-09-04",
          livTime: "18:00-19:00",
          repDate: "2026-09-14",
          repTime: "17:00-18:00",
        }),
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const codes = new Set(res.phaseEntries.map((e) => e.categoryCode));
      expect(codes).toEqual(new Set(["TERRE", "BATEAUX_A_TERRE"]));
    }
  });

  it("21. plusieurs véhicules → un vehicleIndex distinct par véhicule, pour chaque phase", async () => {
    const db = makeDb({ MONTAGE: [], DEMONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [
        category({
          vehicles: [
            { vehicleType: "C", plate: "AB-123-CD" },
            { vehicleType: "D", plate: "EF-456-GH" },
          ],
        }),
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.phaseEntries).toHaveLength(4); // 2 véhicules x (MONTAGE + DEMONTAGE)
      const montageIndexes = res.phaseEntries.filter((e) => e.phase === "MONTAGE").map((e) => e.vehicleIndex);
      expect(montageIndexes.sort()).toEqual([0, 1]);
    }
  });

  it("22. MONTAGE valide + DEMONTAGE invalide → l'ensemble de la validation échoue", async () => {
    const db = makeDb({ MONTAGE: [], DEMONTAGE: [] });
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category({ livDate: "2026-09-06", livTime: "08:00-09:00", repDate: "2026-09-14", repTime: "09:30-10:30" })],
    });
    expect(res).toMatchObject({ ok: false, status: 400, code: "PLANNING_SLOT_INVALID", details: { phase: "DEMONTAGE" } });
  });

  it("23. créneau non aligné (dans la plage numérique mais absent de genSlots) → refus strict (pas de comparaison start<=t<=end)", async () => {
    const db = makeDb({ MONTAGE: [dbRow({ date: "2026-09-06", startTime: "08:00", endTime: "12:00" })] });
    const res = await run(db, rxContext("STRICT"), {
      categories: [category({ livDate: "2026-09-06", livTime: "09:30-10:30" })],
      skipDemontage: true,
    });
    expect(res).toMatchObject({ ok: false, status: 400, code: "PLANNING_SLOT_INVALID" });
  });

  it("24. phaseEntries produites uniquement depuis extension.categories[] (vehicles inchangés par référence)", async () => {
    const db = makeDb({ MONTAGE: [], DEMONTAGE: [] });
    const v1 = { vehicleType: "C", plate: "AB-123-CD" };
    const v2 = { vehicleType: "D", plate: "EF-456-GH" };
    const res = await run(db, rxContext("TRANSITION"), {
      categories: [category({ vehicles: [v1, v2] })],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.phaseEntries).toHaveLength(4);
      expect(res.phaseEntries.filter((e) => e.sourceVehicle === v1)).toHaveLength(2);
      expect(res.phaseEntries.filter((e) => e.sourceVehicle === v2)).toHaveLength(2);
    }
  });

  it("25. un éventuel champ 'vehicles' racine falsifié n'influence jamais le résultat (non lu par ce module)", async () => {
    const db = makeDb({ MONTAGE: [], DEMONTAGE: [] });
    const baseCommand: PlanningValidationCommand = { categories: [category()] };
    const withRootNoise = {
      ...baseCommand,
      vehicles: [{ vehicleType: "FAKE", date: "1999-01-01", time: "00:00" }],
    } as unknown as PlanningValidationCommand;

    const resBase = await run(db, rxContext("TRANSITION"), baseCommand);
    const resNoise = await run(makeDb({ MONTAGE: [], DEMONTAGE: [] }), rxContext("TRANSITION"), withRootNoise);

    expect(resBase.ok).toBe(true);
    expect(resNoise.ok).toBe(true);
    if (resBase.ok && resNoise.ok) {
      expect(resNoise.phaseEntries).toEqual(resBase.phaseEntries);
    }
  });
});
