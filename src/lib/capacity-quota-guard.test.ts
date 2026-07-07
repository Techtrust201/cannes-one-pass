import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildCapacityQuotaCandidates,
  lockKeyForCandidate,
  enforceCapacityQuotas,
  CapacityQuotaError,
  type CandidateVehicleInput,
} from "./capacity-quota-guard";
import type { RxCapacityKey } from "./rx-capacity";
import type { RxAvailabilityResult } from "./rx-capacity-service";

// ── Mock getRxAvailability (le recheck transactionnel n'est pas testé ici,
// seul enforceCapacityQuotas l'est via ce mock contrôlé). ──────────────────
vi.mock("./rx-capacity-service", () => ({
  getRxAvailability: vi.fn(),
}));
import { getRxAvailability } from "./rx-capacity-service";
const mockedGetRxAvailability = getRxAvailability as unknown as ReturnType<typeof vi.fn>;

const ORG = "org-1";
const EVENT = "event-1";

function resolveZoneAlways(zone: string) {
  return () => zone;
}
function resolveFamilyAlways(family: "LIGHT" | "HEAVY") {
  return () => family;
}

// ── buildCapacityQuotaCandidates ───────────────────────────────────────────

describe("buildCapacityQuotaCandidates", () => {
  it("construit une candidate MONTAGE quand vehicleType + date + time (plage) + zone sont présents", () => {
    const vehicles: CandidateVehicleInput[] = [
      { vehicleType: "VL", date: "2026-05-13", time: "08:00-09:00" },
    ];
    const candidates = buildCapacityQuotaCandidates({
      organizationId: ORG,
      eventId: EVENT,
      vehicles,
      resolveZone: resolveZoneAlways("LA_BOCCA"),
      resolveFamily: resolveFamilyAlways("LIGHT"),
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      requestedCount: 1,
      key: {
        organizationId: ORG,
        eventId: EVENT,
        zone: "LA_BOCCA",
        date: "2026-05-13",
        startTime: "08:00",
        endTime: "09:00",
        vehicleFamily: "LIGHT",
        phase: "MONTAGE",
      },
    });
  });

  it("ne construit aucune candidate MONTAGE si la zone n'est pas déterminable (jamais de zone inventée)", () => {
    const vehicles: CandidateVehicleInput[] = [
      { vehicleType: "VL", date: "2026-05-13", time: "08:00-09:00" },
    ];
    const candidates = buildCapacityQuotaCandidates({
      organizationId: ORG,
      eventId: EVENT,
      vehicles,
      resolveZone: () => null,
      resolveFamily: resolveFamilyAlways("LIGHT"),
    });
    expect(candidates).toHaveLength(0);
  });

  it("ne construit aucune candidate MONTAGE si time n'est pas une plage HH:MM-HH:MM", () => {
    const vehicles: CandidateVehicleInput[] = [
      { vehicleType: "VL", date: "2026-05-13", time: "08:00" },
    ];
    const candidates = buildCapacityQuotaCandidates({
      organizationId: ORG,
      eventId: EVENT,
      vehicles,
      resolveZone: resolveZoneAlways("LA_BOCCA"),
      resolveFamily: resolveFamilyAlways("LIGHT"),
    });
    expect(candidates).toHaveLength(0);
  });

  it("ne construit aucune candidate DEMONTAGE si repDate/repTime sont absents (optionnel)", () => {
    const vehicles: CandidateVehicleInput[] = [
      { vehicleType: "VL", date: "2026-05-13", time: "08:00-09:00" },
    ];
    const candidates = buildCapacityQuotaCandidates({
      organizationId: ORG,
      eventId: EVENT,
      vehicles,
      resolveZone: resolveZoneAlways("LA_BOCCA"),
      resolveFamily: resolveFamilyAlways("LIGHT"),
    });
    expect(candidates.every((c) => c.key.phase === "MONTAGE")).toBe(true);
  });

  it("construit une candidate DEMONTAGE quand repDate/repTime sont présents, avec repli sur le gabarit de montage si repVehicleType absent", () => {
    const vehicles: CandidateVehicleInput[] = [
      {
        vehicleType: "PORTEUR",
        date: "2026-05-13",
        time: "08:00-09:00",
        repDate: "2026-05-14",
        repTime: "10:00-11:00",
      },
    ];
    const candidates = buildCapacityQuotaCandidates({
      organizationId: ORG,
      eventId: EVENT,
      vehicles,
      resolveZone: resolveZoneAlways("LA_BOCCA"),
      resolveFamily: resolveFamilyAlways("HEAVY"),
    });
    const demontage = candidates.find((c) => c.key.phase === "DEMONTAGE");
    expect(demontage).toBeDefined();
    expect(demontage?.key.date).toBe("2026-05-14");
    expect(demontage?.key.startTime).toBe("10:00");
    expect(demontage?.key.endTime).toBe("11:00");
  });

  it("ne plante pas si aucune donnée de reprise n'existe (comportement silencieux)", () => {
    const vehicles: CandidateVehicleInput[] = [
      { vehicleType: "VL", date: "2026-05-13", time: "08:00-09:00" },
      {},
    ];
    expect(() =>
      buildCapacityQuotaCandidates({
        organizationId: ORG,
        eventId: EVENT,
        vehicles,
        resolveZone: resolveZoneAlways("LA_BOCCA"),
        resolveFamily: resolveFamilyAlways("LIGHT"),
      })
    ).not.toThrow();
  });

  it("regroupe les candidates identiques et somme requestedCount (2 véhicules même créneau => count=2)", () => {
    const vehicles: CandidateVehicleInput[] = [
      { vehicleType: "VL", date: "2026-05-13", time: "08:00-09:00" },
      { vehicleType: "VL", date: "2026-05-13", time: "08:00-09:00" },
    ];
    const candidates = buildCapacityQuotaCandidates({
      organizationId: ORG,
      eventId: EVENT,
      vehicles,
      resolveZone: resolveZoneAlways("LA_BOCCA"),
      resolveFamily: resolveFamilyAlways("LIGHT"),
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].requestedCount).toBe(2);
  });

  it("distingue deux créneaux différents (pas de regroupement erroné)", () => {
    const vehicles: CandidateVehicleInput[] = [
      { vehicleType: "VL", date: "2026-05-13", time: "08:00-09:00" },
      { vehicleType: "VL", date: "2026-05-13", time: "09:00-10:00" },
    ];
    const candidates = buildCapacityQuotaCandidates({
      organizationId: ORG,
      eventId: EVENT,
      vehicles,
      resolveZone: resolveZoneAlways("LA_BOCCA"),
      resolveFamily: resolveFamilyAlways("LIGHT"),
    });
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.requestedCount === 1)).toBe(true);
  });
});

// ── lockKeyForCandidate ─────────────────────────────────────────────────────

describe("lockKeyForCandidate", () => {
  const KEY: RxCapacityKey = {
    organizationId: ORG,
    eventId: EVENT,
    zone: "LA_BOCCA",
    date: "2026-05-13",
    startTime: "08:00",
    endTime: "09:00",
    vehicleFamily: "LIGHT",
    phase: "MONTAGE",
  };

  it("est stable pour une même clé", () => {
    expect(lockKeyForCandidate(KEY)).toBe(lockKeyForCandidate({ ...KEY }));
  });

  it("diffère si un seul champ de la clé change", () => {
    expect(lockKeyForCandidate(KEY)).not.toBe(
      lockKeyForCandidate({ ...KEY, zone: "PALM_BEACH" })
    );
  });

  it("permet un tri déterministe des lock keys (anti-deadlock)", () => {
    const keys: RxCapacityKey[] = [
      { ...KEY, zone: "PALM_BEACH" },
      { ...KEY, zone: "LA_BOCCA" },
    ];
    const sorted1 = [...keys].sort((a, b) =>
      lockKeyForCandidate(a).localeCompare(lockKeyForCandidate(b))
    );
    const sorted2 = [...keys]
      .reverse()
      .sort((a, b) => lockKeyForCandidate(a).localeCompare(lockKeyForCandidate(b)));
    expect(sorted1.map((k) => k.zone)).toEqual(sorted2.map((k) => k.zone));
  });
});

// ── enforceCapacityQuotas ───────────────────────────────────────────────────

describe("enforceCapacityQuotas", () => {
  beforeEach(() => {
    mockedGetRxAvailability.mockReset();
  });

  function makeFakeTx() {
    return {
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
  }

  const KEY_A: RxCapacityKey = {
    organizationId: ORG,
    eventId: EVENT,
    zone: "LA_BOCCA",
    date: "2026-05-13",
    startTime: "08:00",
    endTime: "09:00",
    vehicleFamily: "LIGHT",
    phase: "MONTAGE",
  };
  const KEY_B: RxCapacityKey = {
    ...KEY_A,
    zone: "PALM_BEACH",
  };

  it("ne bloque pas si hasQuota=false (aucun quota configuré)", async () => {
    mockedGetRxAvailability.mockResolvedValue({
      hasQuota: false,
      capacity: 0,
      provisionalUsed: 0,
      confirmedUsed: 0,
      inZoneUsed: 0,
      totalUsed: 0,
      remaining: 0,
      isFull: false,
    } satisfies RxAvailabilityResult);
    const tx = makeFakeTx();
    await expect(
      enforceCapacityQuotas(tx as never, [{ key: KEY_A, requestedCount: 5 }])
    ).resolves.toBeUndefined();
  });

  it("bloque si remaining < requestedCount même sans isFull explicite (2 véhicules, remaining=1)", async () => {
    mockedGetRxAvailability.mockResolvedValue({
      hasQuota: true,
      capacity: 2,
      provisionalUsed: 1,
      confirmedUsed: 0,
      inZoneUsed: 0,
      totalUsed: 1,
      remaining: 1,
      isFull: false,
    } satisfies RxAvailabilityResult);
    const tx = makeFakeTx();
    await expect(
      enforceCapacityQuotas(tx as never, [{ key: KEY_A, requestedCount: 2 }])
    ).rejects.toBeInstanceOf(CapacityQuotaError);
  });

  it("laisse passer si remaining >= requestedCount", async () => {
    mockedGetRxAvailability.mockResolvedValue({
      hasQuota: true,
      capacity: 5,
      provisionalUsed: 1,
      confirmedUsed: 0,
      inZoneUsed: 0,
      totalUsed: 1,
      remaining: 4,
      isFull: false,
    } satisfies RxAvailabilityResult);
    const tx = makeFakeTx();
    await expect(
      enforceCapacityQuotas(tx as never, [{ key: KEY_A, requestedCount: 2 }])
    ).resolves.toBeUndefined();
  });

  it("prend un lock (pg_advisory_xact_lock, requête paramétrée) avant le recheck", async () => {
    mockedGetRxAvailability.mockResolvedValue({
      hasQuota: false,
      capacity: 0,
      provisionalUsed: 0,
      confirmedUsed: 0,
      inZoneUsed: 0,
      totalUsed: 0,
      remaining: 0,
      isFull: false,
    } satisfies RxAvailabilityResult);
    const tx = makeFakeTx();
    await enforceCapacityQuotas(tx as never, [{ key: KEY_A, requestedCount: 1 }]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    // Requête paramétrée (template tag Prisma) : premier argument = tableau de
    // fragments SQL, jamais une chaîne concatenée avec la lock key en dur.
    const callArgs = tx.$executeRaw.mock.calls[0];
    expect(Array.isArray(callArgs[0])).toBe(true);
    expect(callArgs[0].join("")).toContain("pg_advisory_xact_lock");
    expect(callArgs[0].join("")).toContain("hashtextextended");
  });

  it("prend les locks dans un ordre déterministe (lock keys triées)", async () => {
    mockedGetRxAvailability.mockResolvedValue({
      hasQuota: false,
      capacity: 0,
      provisionalUsed: 0,
      confirmedUsed: 0,
      inZoneUsed: 0,
      totalUsed: 0,
      remaining: 0,
      isFull: false,
    } satisfies RxAvailabilityResult);
    const tx1 = makeFakeTx();
    await enforceCapacityQuotas(tx1 as never, [
      { key: KEY_B, requestedCount: 1 },
      { key: KEY_A, requestedCount: 1 },
    ]);
    const tx2 = makeFakeTx();
    await enforceCapacityQuotas(tx2 as never, [
      { key: KEY_A, requestedCount: 1 },
      { key: KEY_B, requestedCount: 1 },
    ]);
    // Même ordre de lock keys quel que soit l'ordre d'entrée des candidates.
    const lockKeysOf = (tx: ReturnType<typeof makeFakeTx>) =>
      tx.$executeRaw.mock.calls.map((args) => String(args[1]));
    expect(lockKeysOf(tx1)).toEqual(lockKeysOf(tx2));
  });

  it("recheck via getRxAvailability appelé avec le client tx injecté", async () => {
    mockedGetRxAvailability.mockResolvedValue({
      hasQuota: false,
      capacity: 0,
      provisionalUsed: 0,
      confirmedUsed: 0,
      inZoneUsed: 0,
      totalUsed: 0,
      remaining: 0,
      isFull: false,
    } satisfies RxAvailabilityResult);
    const tx = makeFakeTx();
    await enforceCapacityQuotas(tx as never, [{ key: KEY_A, requestedCount: 1 }]);
    expect(mockedGetRxAvailability).toHaveBeenCalledWith(KEY_A, tx);
  });
});
