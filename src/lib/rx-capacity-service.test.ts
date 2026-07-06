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

// ── getRxAvailability ─────────────────────────────────────────────────────

describe("getRxAvailability", () => {
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

  it("compte les accréditations consommatrices avec la bonne zone (currentZone)", async () => {
    mockedPrisma.rxCapacity.findUnique.mockResolvedValue({ capacity: 10 });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
    mockedPrisma.accreditation.findMany.mockResolvedValue([
      // Match : zone = LA_BOCCA, vehicleFamily = LIGHT (VL)
      {
        status: "NOUVEAU",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL" }],
      },
      // Exclu : zone différente
      {
        status: "ATTENTE",
        currentZone: "PALM_BEACH",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL" }],
      },
      // Match : ATTENTE, bonne zone
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL" }],
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
        vehicles: [{ vehicleType: "VL", size: "VL" }],
      },
      {
        status: "NOUVEAU",
        currentZone: null,
        extension: { suggestedZone: "PALM_BEACH" }, // zone différente
        vehicles: [{ vehicleType: "VL", size: "VL" }],
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
        vehicles: [{ vehicleType: "Porteur", size: "Porteur" }], // HEAVY
      },
      {
        status: "ENTREE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL" }], // LIGHT
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
        vehicles: [{ vehicleType: "Semi-remorque", size: "Semi-remorque" }],
      },
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL" }], // LIGHT, exclu
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
        vehicles: [{ vehicleType: "VL", size: "VL" }],
      },
      {
        status: "ATTENTE",
        currentZone: "LA_BOCCA",
        extension: null,
        vehicles: [{ vehicleType: "VL", size: "VL" }],
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
        vehicles: [{ vehicleType: "VL", size: "VL" }],
      },
    ]);

    const result = await getRxAvailability(BASE_KEY);

    expect(result.provisionalUsed).toBe(0);
    expect(result.totalUsed).toBe(0);
  });
});
