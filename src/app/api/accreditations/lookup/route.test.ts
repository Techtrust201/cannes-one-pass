import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePermission,
  getAccessibleEventIdsForEspace,
  findFirst,
  findManyTypes,
} = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getAccessibleEventIdsForEspace: vi.fn(),
  findFirst: vi.fn(),
  findManyTypes: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requirePermission,
  getAccessibleEventIdsForEspace,
}));

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    accreditation: { findFirst, findMany: vi.fn() },
    vehicleTypeConfig: { findMany: findManyTypes },
  };
  return { default: prismaMock, prisma: prismaMock };
});

import { GET } from "./route";

function makeReq(qs: string) {
  return new Request(`http://local/api/accreditations/lookup?${qs}`) as never;
}

describe("GET lookup — vehicleId / phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue({ user: { id: "u1" } });
    getAccessibleEventIdsForEspace.mockResolvedValue("ALL");
    findManyTypes.mockResolvedValue([]);
  });

  it("propage vehicleId et phase dans le résumé", async () => {
    findFirst.mockResolvedValue({
      id: "acc-1",
      company: "HONDA",
      stand: "POWER 215",
      status: "ATTENTE",
      currentZone: "ZONE1",
      version: 1,
      isArchived: false,
      entryAt: null,
      exitAt: null,
      organizationId: "org-rx",
      organization: { slug: "rx" },
      vehicles: [
        {
          id: 10,
          plate: "AA-111-AA",
          trailerPlate: null,
          vehicleType: "PORTEUR",
          size: "PORTEUR",
          phoneCode: "+33",
          phoneNumber: "600000001",
          logisticsRole: "MONTAGE",
          date: "2026-09-03",
          time: "08:00-10:00",
        },
        {
          id: 20,
          plate: "BB-222-BB",
          trailerPlate: null,
          vehicleType: "VL",
          size: "VL",
          phoneCode: "+33",
          phoneNumber: "600000002",
          logisticsRole: "DEMONTAGE",
          date: "2026-09-14",
          time: "10:00-12:00",
        },
      ],
    });

    const res = await GET(makeReq("id=acc-1&vehicleId=10&phase=livraison&espace=rx"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].targetVehicleId).toBe(10);
    expect(data.matches[0].targetPhase).toBe("livraison");
    expect(data.matches[0].targetVehicle?.plate).toBe("AA-111-AA");
    expect(data.matches[0].targetVehicle?.logisticsRole).toBe("MONTAGE");
  });

  it("refuse vehicleId étranger", async () => {
    findFirst.mockResolvedValue({
      id: "acc-1",
      company: "HONDA",
      stand: "POWER 215",
      status: "ATTENTE",
      currentZone: null,
      version: 1,
      isArchived: false,
      entryAt: null,
      exitAt: null,
      organizationId: "org-rx",
      organization: { slug: "rx" },
      vehicles: [
        {
          id: 10,
          plate: "AA-111-AA",
          trailerPlate: null,
          vehicleType: "PORTEUR",
          size: "PORTEUR",
          phoneCode: "+33",
          phoneNumber: "600000001",
          logisticsRole: "MONTAGE",
          date: "2026-09-03",
          time: "08:00-10:00",
        },
      ],
    });

    const res = await GET(makeReq("id=acc-1&vehicleId=999&phase=livraison"));
    expect(res.status).toBe(409);
  });
});
