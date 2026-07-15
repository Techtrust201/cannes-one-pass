import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    logisticsPlanning: { findMany: vi.fn() },
    rxCapacity: { findMany: vi.fn(), upsert: vi.fn() },
    zoneConfig: { findFirst: vi.fn() },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth-helpers", () => ({
  requirePermission: vi.fn(),
  resolveEspaceOrgId: vi.fn(),
  getAccessibleOrganizationIds: vi.fn(),
  canAccessOrganization: vi.fn(),
  assertEventBelongsToOrg: vi.fn(),
}));

vi.mock("@/lib/rx-capacity-service", () => ({
  getRxAvailability: vi.fn(),
}));

import { GET, POST } from "./route";
import { prisma } from "@/lib/prisma";
import * as auth from "@/lib/auth-helpers";
import { getRxAvailability } from "@/lib/rx-capacity-service";

const mock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as unknown as ReturnType<typeof vi.fn>;

function request(opts?: { method?: string; body?: unknown; query?: string }) {
  const q =
    opts?.query ??
    "espace=rx&eventId=e1&scopeKey=PORT:PORT_CANTO&phase=MONTAGE&zone=LA_BOCCA";
  return new NextRequest(`http://localhost/api/admin/planning/quota-grid?${q}`, {
    method: opts?.method ?? (opts?.body ? "POST" : "GET"),
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    headers: opts?.body ? { "content-type": "application/json" } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock(auth.requirePermission).mockResolvedValue({ user: { id: "u-rx" } });
  mock(auth.resolveEspaceOrgId).mockResolvedValue("org-rx");
  mock(auth.getAccessibleOrganizationIds).mockResolvedValue(["org-rx"]);
  mock(auth.canAccessOrganization).mockReturnValue(true);
  mock(auth.assertEventBelongsToOrg).mockResolvedValue(undefined);
  mock(prisma.logisticsPlanning.findMany).mockResolvedValue([]);
  mock(prisma.rxCapacity.findMany).mockResolvedValue([]);
  mock(prisma.zoneConfig.findFirst).mockResolvedValue({ zone: "LA_BOCCA" });
  mock(getRxAvailability).mockResolvedValue({
    hasQuota: true,
    capacity: 10,
    provisionalUsed: 0,
    confirmedUsed: 2,
    inZoneUsed: 0,
    totalUsed: 2,
    remaining: 8,
    isFull: false,
  });
});

describe("GET /api/admin/planning/quota-grid", () => {
  it("marque hors_planning les quotas hors plages actives", async () => {
    mock(prisma.logisticsPlanning.findMany).mockResolvedValue([
      {
        id: "rule-1",
        date: "2026-05-01",
        startTime: "08:00",
        endTime: "12:00",
        categoryCode: "ALL",
        isActive: true,
      },
    ]);
    mock(prisma.rxCapacity.findMany).mockResolvedValue([
      {
        id: 1,
        organizationId: "org-rx",
        eventId: "e1",
        scopeKey: "PORT:PORT_CANTO",
        zone: "LA_BOCCA",
        date: "2026-05-01",
        startTime: "14:00",
        endTime: "15:00",
        vehicleFamily: "LIGHT",
        phase: "MONTAGE",
        capacity: 5,
      },
      {
        id: 2,
        organizationId: "org-rx",
        eventId: "e1",
        scopeKey: "PORT:PORT_CANTO",
        zone: "LA_BOCCA",
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        vehicleFamily: "HEAVY",
        phase: "MONTAGE",
        capacity: 3,
      },
    ]);

    const res = await GET(request());
    const body = await res.json();
    expect(body.quotas).toHaveLength(2);
    expect(body.quotas.find((q: { id: number }) => q.id === 1).status).toBe("hors_planning");
    expect(body.quotas.find((q: { id: number }) => q.id === 2).status).toBe("ok");
    expect(body.anomalies.some((a: { type: string }) => a.type === "hors_planning")).toBe(true);
  });

  it("signale illimite si plage planning sans quota", async () => {
    mock(prisma.logisticsPlanning.findMany).mockResolvedValue([
      {
        id: "rule-1",
        date: "2026-05-02",
        startTime: "08:00",
        endTime: "10:00",
        categoryCode: "ALL",
        isActive: true,
      },
    ]);
    mock(prisma.rxCapacity.findMany).mockResolvedValue([]);

    const res = await GET(request());
    const body = await res.json();
    expect(body.anomalies.some((a: { type: string }) => a.type === "illimite")).toBe(true);
  });
});

describe("POST /api/admin/planning/quota-grid", () => {
  const baseBody = {
    eventId: "e1",
    scopeKey: "PORT:PORT_CANTO",
    zone: "LA_BOCCA",
    phase: "MONTAGE",
    confirm: true,
    slots: [{ date: "2026-05-01", startTime: "08:00", endTime: "09:00", lightCapacity: 5 }],
  };

  it("exige FLUX_VEHICULES write", async () => {
    mock(prisma.logisticsPlanning.findMany).mockResolvedValue([
      { date: "2026-05-01", startTime: "08:00", endTime: "12:00", isActive: true },
    ]);
    mock(prisma.rxCapacity.upsert).mockResolvedValue({
      id: 1,
      date: "2026-05-01",
      startTime: "08:00",
      endTime: "09:00",
      vehicleFamily: "LIGHT",
      capacity: 5,
      scopeKey: "PORT:PORT_CANTO",
      zone: "LA_BOCCA",
    });
    await POST(request({ body: baseBody }));
    expect(auth.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      "FLUX_VEHICULES",
      "write"
    );
  });

  it("refuse sans confirm:true", async () => {
    const res = await POST(request({ body: { ...baseBody, confirm: false } }));
    expect(res.status).toBe(400);
    expect(prisma.rxCapacity.upsert).not.toHaveBeenCalled();
  });

  it("refuse un créneau hors planning", async () => {
    mock(prisma.logisticsPlanning.findMany).mockResolvedValue([
      { date: "2026-05-01", startTime: "08:00", endTime: "10:00", isActive: true },
    ]);
    const res = await POST(
      request({
        body: {
          ...baseBody,
          slots: [{ date: "2026-05-01", startTime: "14:00", endTime: "15:00", lightCapacity: 2 }],
        },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("HORS_PLANNING");
  });

  it("accepte hors planning si allowOutOfPlanning", async () => {
    mock(prisma.logisticsPlanning.findMany).mockResolvedValue([]);
    mock(prisma.rxCapacity.upsert).mockResolvedValue({
      id: 9,
      date: "2026-05-01",
      startTime: "14:00",
      endTime: "15:00",
      vehicleFamily: "LIGHT",
      capacity: 2,
      scopeKey: "PORT:PORT_CANTO",
      zone: "LA_BOCCA",
    });
    const res = await POST(
      request({
        body: {
          ...baseBody,
          allowOutOfPlanning: true,
          reason: "dérogation test",
          slots: [{ date: "2026-05-01", startTime: "14:00", endTime: "15:00", lightCapacity: 2 }],
        },
      })
    );
    expect(res.status).toBe(200);
    expect(prisma.rxCapacity.upsert).toHaveBeenCalled();
  });

  it("upsert LIGHT et HEAVY", async () => {
    mock(prisma.logisticsPlanning.findMany).mockResolvedValue([
      { date: "2026-05-01", startTime: "08:00", endTime: "12:00", isActive: true },
    ]);
    mock(prisma.rxCapacity.upsert).mockResolvedValue({
      id: 1,
      date: "2026-05-01",
      startTime: "08:00",
      endTime: "09:00",
      vehicleFamily: "LIGHT",
      capacity: 5,
      scopeKey: "PORT:PORT_CANTO",
      zone: "LA_BOCCA",
    });
    const res = await POST(
      request({
        body: {
          ...baseBody,
          slots: [
            {
              date: "2026-05-01",
              startTime: "08:00",
              endTime: "09:00",
              lightCapacity: 5,
              heavyCapacity: 2,
            },
          ],
        },
      })
    );
    expect(res.status).toBe(200);
    expect(prisma.rxCapacity.upsert).toHaveBeenCalledTimes(2);
  });
});
