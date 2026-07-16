import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    organization: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    exhibitor: { findUnique: vi.fn() },
    exhibitorLocation: { findUnique: vi.fn() },
    logisticsPlanning: { findMany: vi.fn() },
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
  exhibitorLocation: { findUnique: Mock };
  logisticsPlanning: { findMany: Mock };
};
const mockedPrisma = prisma as unknown as MockedPrisma;

function makeReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/planning?${qs}`);
}

const ORG = { id: "org-1", isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/planning — validation", () => {
  it("400 si orgSlug/eventSlug manquants", async () => {
    const res = await GET(makeReq("phase=MONTAGE"));
    expect(res.status).toBe(400);
  });

  it("400 si phase invalide", async () => {
    const res = await GET(makeReq("orgSlug=rx&eventSlug=cyf26&phase=INVALID"));
    expect(res.status).toBe(400);
  });

  it("404 si organisation inconnue", async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(null);
    const res = await GET(makeReq("orgSlug=unknown&eventSlug=cyf26&phase=MONTAGE"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/planning — anti-IDOR", () => {
  beforeEach(() => {
    mockedPrisma.organization.findUnique.mockResolvedValue(ORG);
  });

  it("404 si l'event n'appartient pas à l'organisation résolue", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: "evt-1",
      organizationId: "AUTRE_ORG",
      logisticsPlanningMode: "DISABLED",
    });
    const res = await GET(makeReq("orgSlug=rx&eventSlug=cyf26&phase=MONTAGE"));
    expect(res.status).toBe(404);
  });

  it("404 si exhibitorLocationId fourni sans exhibitorId", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: "evt-1",
      organizationId: "org-1",
      logisticsPlanningMode: "STRICT",
    });
    const res = await GET(
      makeReq("orgSlug=rx&eventSlug=cyf26&phase=MONTAGE&exhibitorLocationId=loc-1")
    );
    expect(res.status).toBe(400);
  });

  it("404 si l'exposant appartient à un autre événement", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: "evt-1",
      organizationId: "org-1",
      logisticsPlanningMode: "STRICT",
    });
    mockedPrisma.exhibitor.findUnique.mockResolvedValue({
      id: "ex-1",
      organizationId: "org-1",
      eventId: "AUTRE_EVENT",
    });
    const res = await GET(
      makeReq("orgSlug=rx&eventSlug=cyf26&phase=MONTAGE&exhibitorId=ex-1&exhibitorLocationId=loc-1")
    );
    expect(res.status).toBe(404);
  });

  it("404 si l'emplacement n'appartient pas à l'exposant résolu (mismatch)", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: "evt-1",
      organizationId: "org-1",
      logisticsPlanningMode: "STRICT",
    });
    mockedPrisma.exhibitor.findUnique.mockResolvedValue({
      id: "ex-1",
      organizationId: "org-1",
      eventId: "evt-1",
    });
    mockedPrisma.exhibitorLocation.findUnique.mockResolvedValue({
      id: "loc-1",
      exhibitorId: "UN_AUTRE_EXPOSANT",
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
    });
    const res = await GET(
      makeReq("orgSlug=rx&eventSlug=cyf26&phase=MONTAGE&exhibitorId=ex-1&exhibitorLocationId=loc-1")
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/planning — résolution", () => {
  beforeEach(() => {
    mockedPrisma.organization.findUnique.mockResolvedValue(ORG);
  });

  it("mode DISABLED : ne consulte jamais logisticsPlanning.findMany", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: "evt-1",
      organizationId: "org-1",
      logisticsPlanningMode: "DISABLED",
    });
    const res = await GET(makeReq("orgSlug=rx&eventSlug=cyf26&phase=MONTAGE"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.resolution.source).toBe("NONE");
    expect(mockedPrisma.logisticsPlanning.findMany).not.toHaveBeenCalled();
  });

  it("mode STRICT avec règle DB : retourne source DB et ne fuite aucun objet Prisma complet", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: "evt-1",
      organizationId: "org-1",
      logisticsPlanningMode: "STRICT",
    });
    mockedPrisma.exhibitor.findUnique.mockResolvedValue({
      id: "ex-1",
      organizationId: "org-1",
      eventId: "evt-1",
    });
    mockedPrisma.exhibitorLocation.findUnique.mockResolvedValue({
      id: "loc-1",
      exhibitorId: "ex-1",
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
    });
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([
      {
        scope: "SPACE",
        scopeKey: "SPACE:POWER",
        categoryCode: "ALL",
        phase: "MONTAGE",
        date: "2026-09-13",
        startTime: "08:00",
        endTime: "12:00",
      },
    ]);
    const res = await GET(
      makeReq("orgSlug=rx&eventSlug=cyf26&phase=MONTAGE&exhibitorId=ex-1&exhibitorLocationId=loc-1")
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.resolution.source).toBe("DB");
    expect(body.resolution.scope).toBe("SPACE");
    expect(body.resolution.slots).toEqual({ "2026-09-13": "08:00-12:00" });
    // Aucune fuite de champ Prisma brut (id, createdAt, importBatchId...).
    expect(body.resolution).not.toHaveProperty("id");
    expect(body.resolution).not.toHaveProperty("importBatchId");
  });

  it("mode STRICT sans règle DB : erreur structurée PLANNING_NOT_FOUND", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: "evt-1",
      organizationId: "org-1",
      logisticsPlanningMode: "STRICT",
    });
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]);
    const res = await GET(makeReq("orgSlug=rx&eventSlug=cyf26&phase=MONTAGE"));
    const body = await res.json();
    expect(body.resolution.error).toEqual({
      code: "PLANNING_NOT_FOUND",
      message: expect.any(String),
    });
  });

  it("restreint la requête Prisma aux scopeKey candidats de l'emplacement résolu", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: "evt-1",
      organizationId: "org-1",
      logisticsPlanningMode: "TRANSITION",
    });
    mockedPrisma.exhibitor.findUnique.mockResolvedValue({
      id: "ex-1",
      organizationId: "org-1",
      eventId: "evt-1",
    });
    mockedPrisma.exhibitorLocation.findUnique.mockResolvedValue({
      id: "loc-1",
      exhibitorId: "ex-1",
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
    });
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]);
    await GET(
      makeReq("orgSlug=rx&eventSlug=cyf26&phase=MONTAGE&exhibitorId=ex-1&exhibitorLocationId=loc-1")
    );
    const callArgs = mockedPrisma.logisticsPlanning.findMany.mock.calls[0][0];
    expect(callArgs.where.organizationId).toBe("org-1");
    expect(callArgs.where.eventId).toBe("evt-1");
    expect(callArgs.where.scopeKey.in).toEqual([
      "LOCATION:loc-1",
      "SPACE:POWER",
      "SECTOR:PORT_CANTO:POWER",
      "PORT:PORT_CANTO",
      "EVENT",
    ]);
  });
});
