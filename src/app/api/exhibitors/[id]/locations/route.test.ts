import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    organization: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    exhibitor: { findUnique: vi.fn() },
    exhibitorLocation: { findMany: vi.fn() },
  };
  return { prisma: prismaMock, default: prismaMock, withRetry: (fn: () => unknown) => fn() };
});

import prisma from "@/lib/prisma";
import { GET } from "./route";
import { NextRequest } from "next/server";

type MockedPrisma = {
  organization: { findUnique: Mock };
  event: { findUnique: Mock };
  exhibitor: { findUnique: Mock };
  exhibitorLocation: { findMany: Mock };
};
const mockedPrisma = prisma as unknown as MockedPrisma;

function makeReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/exhibitors/ex-1/locations?${qs}`);
}

function call(qs: string, id = "ex-1") {
  return GET(makeReq(qs), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/exhibitors/[id]/locations", () => {
  it("liste vide si orgSlug/eventSlug manquants", async () => {
    const res = await call("");
    expect(await res.json()).toEqual([]);
  });

  it("liste vide si organisation inconnue/inactive", async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(null);
    const res = await call("orgSlug=rx&eventSlug=cyf26");
    expect(await res.json()).toEqual([]);
  });

  it("liste vide si l'event n'appartient pas à l'organisation (anti-IDOR)", async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", isActive: true });
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "evt-1", organizationId: "AUTRE" });
    const res = await call("orgSlug=rx&eventSlug=cyf26");
    expect(await res.json()).toEqual([]);
  });

  it("liste vide si l'exposant n'appartient pas à l'organisation/événement (anti-IDOR)", async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", isActive: true });
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "evt-1", organizationId: "org-1" });
    mockedPrisma.exhibitor.findUnique.mockResolvedValue({
      id: "ex-1",
      organizationId: "org-1",
      eventId: "AUTRE_EVENT",
    });
    const res = await call("orgSlug=rx&eventSlug=cyf26");
    expect(await res.json()).toEqual([]);
    expect(mockedPrisma.exhibitorLocation.findMany).not.toHaveBeenCalled();
  });

  it("retourne les locations actives scopées à l'exposant résolu", async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", isActive: true });
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "evt-1", organizationId: "org-1" });
    mockedPrisma.exhibitor.findUnique.mockResolvedValue({
      id: "ex-1",
      organizationId: "org-1",
      eventId: "evt-1",
    });
    mockedPrisma.exhibitorLocation.findMany.mockResolvedValue([
      { id: "loc-1", type: "TERRE", code: "JETEE 001", portCode: "VIEUX_PORT", sectorCode: "JETEE", logisticSpace: "JETEE" },
    ]);
    const res = await call("orgSlug=rx&eventSlug=cyf26");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].code).toBe("JETEE 001");
    expect(mockedPrisma.exhibitorLocation.findMany.mock.calls[0][0].where).toEqual({
      exhibitorId: "ex-1",
      isActive: true,
    });
  });
});
