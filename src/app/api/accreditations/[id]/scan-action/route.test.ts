import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePermission,
  assertAccreditationAccess,
  transaction,
  findUniqueAcc,
  findFirstZone,
  findFirstSlot,
  createSlot,
  updateSlot,
  createMovement,
  createHistory,
  updateAcc,
} = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  assertAccreditationAccess: vi.fn(),
  transaction: vi.fn(),
  findUniqueAcc: vi.fn(),
  findFirstZone: vi.fn(),
  findFirstSlot: vi.fn(),
  createSlot: vi.fn(),
  updateSlot: vi.fn(),
  createMovement: vi.fn(),
  createHistory: vi.fn(),
  updateAcc: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requirePermission,
}));

vi.mock("@/lib/rbac", () => ({
  assertAccreditationAccess,
}));

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    $transaction: transaction,
    accreditation: { findUnique: vi.fn() },
  };
  return { default: prismaMock, prisma: prismaMock };
});

import { POST } from "./route";

function makeReq(body: Record<string, unknown>) {
  return new Request("http://local/api/accreditations/acc-1/scan-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const montage = {
  id: 10,
  logisticsRole: "MONTAGE",
  plate: "AA-111-AA",
  phoneCode: "+33",
  phoneNumber: "600000001",
};
const demontage = {
  id: 20,
  logisticsRole: "DEMONTAGE",
  plate: "BB-222-BB",
  phoneCode: "+33",
  phoneNumber: "600000002",
};

describe("POST scan-action — véhicule ciblé", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue({ user: { id: "u1" } });
    assertAccreditationAccess.mockResolvedValue(undefined);
    findFirstZone.mockResolvedValue({ id: "z1" });
    findFirstSlot.mockResolvedValue(null);
    createSlot.mockResolvedValue({});
    updateSlot.mockResolvedValue({});
    createMovement.mockResolvedValue({});
    createHistory.mockResolvedValue({});
    updateAcc.mockResolvedValue({});

    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        accreditation: {
          findUnique: findUniqueAcc,
          update: updateAcc,
        },
        zoneConfig: { findFirst: findFirstZone },
        vehicleTimeSlot: {
          findFirst: findFirstSlot,
          create: createSlot,
          update: updateSlot,
        },
        zoneMovement: { create: createMovement },
        accreditationHistory: { create: createHistory },
      };
      return fn(tx);
    });
  });

  it("QR Montage ouvre le créneau du véhicule 10 uniquement", async () => {
    findUniqueAcc.mockResolvedValue({
      id: "acc-1",
      organizationId: "org-rx",
      status: "ATTENTE",
      currentZone: null,
      version: 1,
      entryAt: null,
      vehicles: [montage, demontage],
    });

    const res = await POST(makeReq({
      action: "ENTRY",
      zone: "ZONE1",
      vehicleId: 10,
      phase: "livraison",
      version: 1,
    }), { params: Promise.resolve({ id: "acc-1" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vehicleId).toBe(10);
    expect(createSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vehicleId: 10 }),
      })
    );
    expect(createSlot).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vehicleId: 20 }),
      })
    );
  });

  it("QR Démontage ouvre le créneau du véhicule 20 uniquement", async () => {
    findUniqueAcc.mockResolvedValue({
      id: "acc-1",
      organizationId: "org-rx",
      status: "ATTENTE",
      currentZone: null,
      version: 1,
      entryAt: null,
      vehicles: [montage, demontage],
    });

    const res = await POST(makeReq({
      action: "ENTRY",
      zone: "ZONE1",
      vehicleId: 20,
      phase: "reprise",
      version: 1,
    }), { params: Promise.resolve({ id: "acc-1" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vehicleId).toBe(20);
    expect(createSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vehicleId: 20 }),
      })
    );
  });

  it("ancien QR sans vehicleId utilise le premier véhicule", async () => {
    findUniqueAcc.mockResolvedValue({
      id: "acc-1",
      organizationId: "org-rx",
      status: "ATTENTE",
      currentZone: null,
      version: 1,
      entryAt: null,
      vehicles: [montage, demontage],
    });

    const res = await POST(makeReq({
      action: "ENTRY",
      zone: "ZONE1",
      version: 1,
    }), { params: Promise.resolve({ id: "acc-1" }) });

    expect(res.status).toBe(200);
    expect(createSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vehicleId: 10 }),
      })
    );
  });

  it("vehicleId d'une autre accréditation → 409", async () => {
    findUniqueAcc.mockResolvedValue({
      id: "acc-1",
      organizationId: "org-rx",
      status: "ATTENTE",
      currentZone: null,
      version: 1,
      entryAt: null,
      vehicles: [montage, demontage],
    });

    const res = await POST(makeReq({
      action: "ENTRY",
      zone: "ZONE1",
      vehicleId: 999,
      version: 1,
    }), { params: Promise.resolve({ id: "acc-1" }) });

    expect(res.status).toBe(409);
    expect(createSlot).not.toHaveBeenCalled();
  });

  it("phase incompatible → 409", async () => {
    findUniqueAcc.mockResolvedValue({
      id: "acc-1",
      organizationId: "org-rx",
      status: "ATTENTE",
      currentZone: null,
      version: 1,
      entryAt: null,
      vehicles: [montage, demontage],
    });

    const res = await POST(makeReq({
      action: "ENTRY",
      zone: "ZONE1",
      vehicleId: 10,
      phase: "reprise",
      version: 1,
    }), { params: Promise.resolve({ id: "acc-1" }) });

    expect(res.status).toBe(409);
  });

  it("sortie Montage ne force pas SORTIE si Démontage encore présent", async () => {
    findUniqueAcc.mockResolvedValue({
      id: "acc-1",
      organizationId: "org-rx",
      status: "ENTREE",
      currentZone: "ZONE1",
      version: 2,
      entryAt: new Date(),
      vehicles: [montage, demontage],
    });
    // 1er findFirst = closeTimeSlot open slot ; 2e = otherVehicleStillOnSite
    findFirstSlot
      .mockResolvedValueOnce({ id: 100, stepNumber: 1 })
      .mockResolvedValueOnce({ id: 200 });

    const res = await POST(makeReq({
      action: "EXIT",
      zone: "ZONE1",
      vehicleId: 10,
      phase: "livraison",
      version: 2,
    }), { params: Promise.resolve({ id: "acc-1" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.siblingStillOnSite).toBe(true);
    expect(json.status).toBe("ENTREE");
    expect(updateAcc).not.toHaveBeenCalled();
    expect(updateSlot).toHaveBeenCalled();
  });
});
