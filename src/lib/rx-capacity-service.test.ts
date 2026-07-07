import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveDbVehicleFamily, getRxAvailability } from "./rx-capacity-service";
import type { RxCapacityKey } from "./rx-capacity";

// ── Mock Prisma ────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rxCapacity: {
      findUnique: vi.fn(),
    },
    vehicleTypeConfig: {
      findMany: vi.fn(),
    },
    accreditation: {
      findMany: vi.fn(),
    },
  },
}));

// ── Mock vehicle-type-server ───────────────────────────────────────────────

vi.mock("@/lib/vehicle-type-server", () => ({
  mapDbVehicleType: vi.fn((c: Record<string, unknown>) => ({
    code: c.code as string,
    label: c.label as string,
    pdfCode: c.pdfCode as string | undefined,
    vehicleFamily: c.vehicleFamily as string | undefined,
  })),
}));

import { prisma } from "@/lib/prisma";

type MockedPrisma = {
  rxCapacity: { findUnique: ReturnType<typeof vi.fn> };
  vehicleTypeConfig: { findMany: ReturnType<typeof vi.fn> };
  accreditation: { findMany: ReturnType<typeof vi.fn> };
};
const mockedPrisma = prisma as unknown as MockedPrisma;

// ── Clé de créneau de test ─────────────────────────────────────────────────

const BASE_KEY: RxCapacityKey = {
  organizationId: "org-1",
  eventId: "event-1",
  zone: "LA_BOCCA",
  date: "2026-05-12",
  startTime: "09:00",
  endTime: "10:00",
  vehicleFamily: "LIGHT",
  phase: "MONTAGE",
};

// ── resolveDbVehicleFamily (fonction pure exportée) ──────────────────────

describe("resolveDbVehicleFamily", () => {
  it("retourne LIGHT pour 'VL' sans config (fallback texte)", () => {
    expect(resolveDbVehicleFamily("VL", "VL", [])).toBe("LIGHT");
  });

  it("retourne HEAVY pour 'Porteur' sans config (fallback texte)", () => {
    expect(resolveDbVehicleFamily("Porteur", "Porteur", [])).toBe("HEAVY");
  });

  it("retourne HEAVY pour 'Semi-remorque' sans config (fallback texte)", () => {
    expect(resolveDbVehicleFamily("Semi-remorque", "Semi-remorque", [])).toBe("HEAVY");
  });

  it("retourne LIGHT si vehicleType null et size est un code LIGHT", () => {
    expect(resolveDbVehicleFamily(null, "VL", [])).toBe("LIGHT");
  });

  it("retourne HEAVY via pdfCode C dans la config", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const types = [{ code: "PL", label: "Porteur léger", pdfCode: "C", vehicleFamily: undefined }] as any[];
    expect(resolveDbVehicleFamily("PL", "PL", types)).toBe("HEAVY");
  });

  it("retourne LIGHT via pdfCode A dans la config", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const types = [{ code: "VL", label: "VL", pdfCode: "A", vehicleFamily: undefined }] as any[];
    expect(resolveDbVehicleFamily("VL", "VL", types)).toBe("LIGHT");
  });

  it("priorité vehicleFamily explicite sur pdfCode", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const types = [{ code: "SPECIAL", label: "Special", pdfCode: "A", vehicleFamily: "HEAVY" }] as any[];
    expect(resolveDbVehicleFamily("SPECIAL", "SPECIAL", types)).toBe("HEAVY");
  });
});

// ── getRxAvailability — MONTAGE ────────────────────────────────────────────
//
// Créneau BASE_KEY = 09:00 → 10:00. Le format effectif de `Vehicle.time` en
// base est la plage complète "09:00-10:00" ; on couvre aussi "09:00" (rétrocompat).

const SLOT = "09:00-10:00"; // plage complète (format réel en base)

describe("getRxAvailability — MONTAGE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne hasQuota=false si aucune ligne RxCapacity n'existe", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue(null);

    const result = await getRxAvailability(BASE_KEY);

    expect(result.hasQuota).toBe(false);
    expect(result.isFull).toBe(false);
    expect(result.capacity).toBe(0);
    expect(result.totalUsed).toBe(0);
    // Pas d'appel DB inutile si le quota est absent
    expect(mockedPrisma.accreditation.findMany).not.toHaveBeenCalled();
  });

  it("retourne hasQuota=true avec stats correctes quand le créneau est vide", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 5 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([]);

    const result = await getRxAvailability(BASE_KEY);

    expect(result.hasQuota).toBe(true);
    expect(result.capacity).toBe(5);
    expect(result.totalUsed).toBe(0);
    expect(result.remaining).toBe(5);
    expect(result.isFull).toBe(false);
  });

  it("compte un véhicule dont time est une PLAGE '09:00-10:00' (format réel en base)", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 5 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }],
      },
    ]);

    const result = await getRxAvailability(BASE_KEY);

    expect(result.confirmedUsed).toBe(1);
    expect(result.totalUsed).toBe(1);
    expect(result.remaining).toBe(4);
  });

  it("compte aussi un véhicule dont time est '09:00' (heure début seule, rétrocompat)", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 5 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL", time: "09:00" }],
      },
    ]);

    const result = await getRxAvailability(BASE_KEY);

    expect(result.totalUsed).toBe(1);
  });

  it("exclut un véhicule dont le créneau ne correspond pas (autre plage)", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 5 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL", time: "11:00-12:00" }],
      },
    ]);

    const result = await getRxAvailability(BASE_KEY);

    expect(result.totalUsed).toBe(0);
  });

  it("compte les accréditations consommatrices avec la bonne zone (currentZone)", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 10 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      // Match : zone = LA_BOCCA, vehicleFamily = LIGHT (VL)
      {
        status: "NOUVEAU",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }],
      },
      // Exclu : zone différente
      {
        status: "ATTENTE",
        currentZone: "PALM_BEACH",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }],
      },
      // Match : ATTENTE, bonne zone
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }],
      },
    ]);

    const result = await getRxAvailability(BASE_KEY);

    expect(result.hasQuota).toBe(true);
    expect(result.provisionalUsed).toBe(1); // 1 NOUVEAU
    expect(result.confirmedUsed).toBe(1);   // 1 ATTENTE
    expect(result.totalUsed).toBe(2);
    expect(result.remaining).toBe(8);
  });

  it("utilise suggestedZone comme fallback quand currentZone est null (NOUVEAU)", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 3 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "NOUVEAU",
        currentZone: null,
        extension: { suggestedZone: "LA_BOCCA" },
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }],
      },
      {
        status: "NOUVEAU",
        currentZone: null,
        extension: { suggestedZone: "PALM_BEACH" }, // zone différente
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }],
      },
    ]);

    const result = await getRxAvailability(BASE_KEY);

    expect(result.provisionalUsed).toBe(1); // seul celui avec LA_BOCCA
    expect(result.totalUsed).toBe(1);
  });

  it("exclut les véhicules HEAVY quand la clé demande LIGHT", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 5 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "ENTREE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "Porteur", size: "Porteur", time: SLOT }], // HEAVY
      },
      {
        status: "ENTREE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }], // LIGHT
      },
    ]);

    const result = await getRxAvailability({ ...BASE_KEY, vehicleFamily: "LIGHT" });

    expect(result.inZoneUsed).toBe(1); // seul le VL compte
    expect(result.totalUsed).toBe(1);
  });

  it("compte correctement les HEAVY quand la clé demande HEAVY", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 3 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "Semi-remorque", size: "Semi-remorque", time: SLOT }],
      },
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }], // LIGHT, exclu
      },
    ]);

    const result = await getRxAvailability({ ...BASE_KEY, vehicleFamily: "HEAVY" });

    expect(result.confirmedUsed).toBe(1);
    expect(result.totalUsed).toBe(1);
    expect(result.remaining).toBe(2);
  });

  it("isFull = true quand remaining = 0", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 2 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }],
      },
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }],
      },
    ]);

    const result = await getRxAvailability(BASE_KEY);

    expect(result.isFull).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("extension absente ou malformée ne plante pas (extension null)", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 5 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "NOUVEAU",
        currentZone: null,
        extension: null, // pas de suggestedZone non plus → zone effective null → exclu
        vehicles: [{ vehicleType: "VL", size: "VL", time: SLOT }],
      },
    ]);

    const result = await getRxAvailability(BASE_KEY);

    expect(result.provisionalUsed).toBe(0);
    expect(result.totalUsed).toBe(0);
  });

  it("REFUS / SORTIE / ABSENT ne sont jamais chargés (statut hors consommateurs)", async () => {
    // Le filtre prisma exclut déjà ces statuts ; on vérifie qu'un jeu vide
    // (aucune accréd consommatrice renvoyée) donne bien totalUsed=0.
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 4 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([]);

    const result = await getRxAvailability(BASE_KEY);

    // Le where prisma doit filtrer sur les statuts consommateurs uniquement.
    const call = mockedPrisma.accreditation.findMany.mock.calls[0][0];
    expect(call.where.status.in).toEqual(["NOUVEAU", "ATTENTE", "ENTREE"]);
    expect(result.totalUsed).toBe(0);
  });
});

// ── getRxAvailability — DEMONTAGE ──────────────────────────────────────────

const DEMONTAGE_KEY: RxCapacityKey = {
  organizationId: "org-1",
  eventId: "event-1",
  zone: "LA_BOCCA",
  date: "2026-09-13",
  startTime: "20:00",
  endTime: "21:00",
  vehicleFamily: "HEAVY",
  phase: "DEMONTAGE",
};

// Config véhicule minimale : "Porteur" HEAVY (pdfCode C), "VL" LIGHT (pdfCode A).
// Aucune zone de routage explicite → suggestZone retombe sur LA_BOCCA.
const DEMONTAGE_VT = [
  { code: "Porteur", label: "Porteur", pdfCode: "C", vehicleFamily: undefined,
    rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: null },
  { code: "VL", label: "VL", pdfCode: "A", vehicleFamily: undefined,
    rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: null },
];

describe("getRxAvailability — DEMONTAGE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compte une reprise via extension.vehicleContext (repDate/repTime/repVehicleType)", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 3 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue(DEMONTAGE_VT);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "ATTENTE",
        extension: {
          exhibitor: { sector: "VIEUX PORT — JETEE" },
          vehicleContext: {
            repDate: "2026-09-13",
            repTime: "20:00-21:00",
            repVehicleType: "Porteur", // HEAVY → LA_BOCCA
          },
        },
        // Le véhicule (montage) porte un gabarit LIGHT différent : ne doit pas
        // être utilisé pour le démontage.
        vehicles: [{ vehicleType: "VL", size: "VL" }],
      },
    ]);

    const result = await getRxAvailability(DEMONTAGE_KEY);

    expect(result.hasQuota).toBe(true);
    expect(result.confirmedUsed).toBe(1);
    expect(result.totalUsed).toBe(1);
    expect(result.remaining).toBe(2);
  });

  it("utilise repVehicleType (HEAVY) et non vehicleType montage (LIGHT)", async () => {
    // Clé LIGHT : la reprise est HEAVY (Porteur) → ne doit PAS compter,
    // ce qui prouve que repVehicleType prime sur le véhicule de montage.
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 3 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue(DEMONTAGE_VT);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "ATTENTE",
        extension: {
          exhibitor: { sector: "VIEUX PORT — JETEE" },
          vehicleContext: {
            repDate: "2026-09-13",
            repTime: "20:00-21:00",
            repVehicleType: "Porteur", // HEAVY
          },
        },
        vehicles: [{ vehicleType: "VL", size: "VL" }], // LIGHT montage
      },
    ]);

    const resultLight = await getRxAvailability({ ...DEMONTAGE_KEY, vehicleFamily: "LIGHT" });
    expect(resultLight.totalUsed).toBe(0);
  });

  it("fallback sur le véhicule de montage si repVehicleType absent", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 3 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue(DEMONTAGE_VT);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "NOUVEAU",
        extension: {
          exhibitor: { sector: "VIEUX PORT — JETEE" },
          vehicleContext: {
            repDate: "2026-09-13",
            repTime: "20:00-21:00",
            repVehicleType: null, // absent → fallback vehicle
          },
        },
        vehicles: [{ vehicleType: "Porteur", size: "Porteur" }], // HEAVY
      },
    ]);

    const result = await getRxAvailability(DEMONTAGE_KEY);
    expect(result.provisionalUsed).toBe(1);
    expect(result.totalUsed).toBe(1);
  });

  it("exclut une reprise sur une autre date", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 3 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue(DEMONTAGE_VT);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "ATTENTE",
        extension: {
          exhibitor: { sector: "VIEUX PORT — JETEE" },
          vehicleContext: {
            repDate: "2026-09-14", // autre jour
            repTime: "20:00-21:00",
            repVehicleType: "Porteur",
          },
        },
        vehicles: [{ vehicleType: "Porteur", size: "Porteur" }],
      },
    ]);

    const result = await getRxAvailability(DEMONTAGE_KEY);
    expect(result.totalUsed).toBe(0);
  });

  it("ignore les accréditations sans vehicleContext", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 3 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue(DEMONTAGE_VT);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      {
        status: "ATTENTE",
        extension: { exhibitor: { sector: "VIEUX PORT — JETEE" } }, // pas de vehicleContext
        vehicles: [{ vehicleType: "Porteur", size: "Porteur" }],
      },
    ]);

    const result = await getRxAvailability(DEMONTAGE_KEY);
    expect(result.totalUsed).toBe(0);
  });
});

// ── getRxAvailability — injection d'un client `db` (transaction-aware) ────
//
// Phase 3 : `getRxAvailability(key, db = prisma)` doit pouvoir être appelé
// avec un client de transaction interactive (`tx`) pour un recheck fiable
// DANS la transaction du garde-fou anti-surbooking. Les appels existants
// sans `db` (voir describes précédents) doivent rester inchangés — c'est
// vérifié par leur simple passage au vert avec le prisma global mocké.

describe("getRxAvailability — client db injecté (transaction-aware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeFakeTxClient() {
    return {
      rxCapacity: { findUnique: vi.fn() },
      vehicleTypeConfig: { findMany: vi.fn() },
      accreditation: { findMany: vi.fn() },
    };
  }

  it("utilise le client injecté plutôt que le prisma global quand `db` est fourni", async () => {
    const tx = makeFakeTxClient();
    tx.rxCapacity.findUnique.mockResolvedValue({ capacity: 5 });
    tx.vehicleTypeConfig.findMany.mockResolvedValue([]);
    tx.accreditation.findMany.mockResolvedValue([]);

    const result = await getRxAvailability(BASE_KEY, tx as never);

    expect(result.hasQuota).toBe(true);
    expect(result.capacity).toBe(5);
    expect(result.remaining).toBe(5);
    // Le client tx a bien été utilisé...
    expect(tx.rxCapacity.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.vehicleTypeConfig.findMany).toHaveBeenCalledTimes(1);
    // ...et JAMAIS le prisma global mocké (preuve d'injection réelle).
    expect(mockedPrisma.rxCapacity.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.vehicleTypeConfig.findMany).not.toHaveBeenCalled();
  });

  it("continue de fonctionner sans `db` fourni (rétrocompatibilité, utilise le prisma global)", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue(null);
    const result = await getRxAvailability(BASE_KEY);
    expect(result.hasQuota).toBe(false);
    expect(mockedPrisma.rxCapacity.findUnique).toHaveBeenCalledTimes(1);
  });

  it("thread le client injecté jusqu'au comptage DEMONTAGE (countDemontageStatuses)", async () => {
    const tx = makeFakeTxClient();
    tx.rxCapacity.findUnique.mockResolvedValue({ capacity: 3 });
    tx.vehicleTypeConfig.findMany.mockResolvedValue([]);
    tx.accreditation.findMany.mockResolvedValue([]);

    const result = await getRxAvailability(
      { ...BASE_KEY, phase: "DEMONTAGE" },
      tx as never
    );

    expect(result.hasQuota).toBe(true);
    expect(tx.accreditation.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.accreditation.findMany).not.toHaveBeenCalled();
  });
});
