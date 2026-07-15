import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    logisticsPlanning: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    event: { findMany: vi.fn() },
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

import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";
import { prisma } from "@/lib/prisma";
import * as auth from "@/lib/auth-helpers";

const mock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as unknown as ReturnType<typeof vi.fn>;

function request(
  path: string,
  opts?: { method?: string; body?: unknown; query?: string }
) {
  const q = opts?.query ?? "espace=rx";
  return new NextRequest(`http://localhost${path}?${q}`, {
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
  mock(prisma.logisticsPlanning.count).mockResolvedValue(0);
  mock(prisma.event.findMany).mockResolvedValue([]);
});

describe("GET /api/admin/planning/rules", () => {
  it("exige GESTION_DATES read", async () => {
    await GET(request("/api/admin/planning/rules"));
    expect(auth.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      "GESTION_DATES",
      "read"
    );
  });

  it("retourne 403 si permission refusée", async () => {
    mock(auth.requirePermission).mockRejectedValue(new Response("refus", { status: 403 }));
    const res = await GET(request("/api/admin/planning/rules"));
    expect(res.status).toBe(403);
    expect(prisma.logisticsPlanning.findMany).not.toHaveBeenCalled();
  });

  it("pagine et sérialise les règles", async () => {
    mock(prisma.logisticsPlanning.findMany).mockResolvedValue([
      {
        id: "r1",
        eventId: "e1",
        scope: "PORT",
        scopeKey: "PORT:PORT_CANTO",
        portCode: "PORT_CANTO",
        sectorCode: null,
        spaceCode: null,
        categoryCode: "ALL",
        phase: "MONTAGE",
        date: "2026-05-01",
        startTime: "08:00",
        endTime: "12:00",
        isActive: true,
        source: "manuel",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        event: { id: "e1", name: "YC", slug: "yc" },
      },
    ]);
    mock(prisma.logisticsPlanning.count).mockResolvedValue(1);

    const res = await GET(
      request("/api/admin/planning/rules", { query: "espace=rx&page=1&pageSize=10" })
    );
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      id: "r1",
      scopeKey: "PORT:PORT_CANTO",
      scopeLabel: "Port PORT CANTO",
      source: "manuel",
    });
  });
});

describe("POST /api/admin/planning/rules", () => {
  const validBody = {
    eventId: "e1",
    scope: "PORT",
    portCode: "PORT_CANTO",
    phase: "MONTAGE",
    date: "2026-05-01",
    startTime: "08:00",
    endTime: "12:00",
  };

  it("exige GESTION_DATES write", async () => {
    mock(prisma.logisticsPlanning.create).mockResolvedValue({
      id: "r1",
      ...validBody,
      scopeKey: "PORT:PORT_CANTO",
      portCode: "PORT_CANTO",
      sectorCode: null,
      spaceCode: null,
      categoryCode: "ALL",
      isActive: true,
      source: "manuel",
      createdAt: new Date(),
      updatedAt: new Date(),
      event: { id: "e1", name: "YC", slug: "yc" },
    });
    await POST(request("/api/admin/planning/rules", { body: validBody }));
    expect(auth.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      "GESTION_DATES",
      "write"
    );
  });

  it("refuse endTime <= startTime", async () => {
    const res = await POST(
      request("/api/admin/planning/rules", {
        body: { ...validBody, endTime: "08:00" },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/endTime/i);
  });

  it("refuse un chevauchement horaire", async () => {
    mock(prisma.logisticsPlanning.findMany).mockResolvedValue([
      { startTime: "09:00", endTime: "11:00" },
    ]);
    const res = await POST(request("/api/admin/planning/rules", { body: validBody }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("PLANNING_OVERLAP");
    expect(prisma.logisticsPlanning.create).not.toHaveBeenCalled();
  });

  it("autorise des plages adjacentes (contact)", async () => {
    mock(prisma.logisticsPlanning.findMany).mockResolvedValue([
      { startTime: "12:00", endTime: "14:00" },
    ]);
    mock(prisma.logisticsPlanning.create).mockResolvedValue({
      id: "r2",
      eventId: "e1",
      scope: "PORT",
      scopeKey: "PORT:PORT_CANTO",
      portCode: "PORT_CANTO",
      sectorCode: null,
      spaceCode: null,
      categoryCode: "ALL",
      phase: "MONTAGE",
      date: "2026-05-01",
      startTime: "08:00",
      endTime: "12:00",
      isActive: true,
      source: "manuel",
      createdAt: new Date(),
      updatedAt: new Date(),
      event: { id: "e1", name: "YC", slug: "yc" },
    });
    const res = await POST(request("/api/admin/planning/rules", { body: validBody }));
    expect(res.status).toBe(201);
    expect(prisma.logisticsPlanning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "manuel", scopeKey: "PORT:PORT_CANTO" }),
      })
    );
  });

  it("refuse scope sans codes obligatoires", async () => {
    const res = await POST(
      request("/api/admin/planning/rules", {
        body: { ...validBody, scope: "SECTOR", sectorCode: null },
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH/DELETE /api/admin/planning/rules/[id]", () => {
  it("refuse le patch hors org (404)", async () => {
    mock(prisma.logisticsPlanning.findUnique).mockResolvedValue({
      id: "r1",
      organizationId: "other-org",
      eventId: "e1",
      scopeKey: "EVENT",
      categoryCode: "ALL",
      phase: "MONTAGE",
      date: "2026-05-01",
      startTime: "08:00",
      endTime: "12:00",
    });
    const res = await PATCH(
      request("/api/admin/planning/rules/r1", {
        method: "PATCH",
        body: { isActive: false },
      }),
      { params: Promise.resolve({ id: "r1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("détecte un chevauchement au PATCH horaires", async () => {
    mock(prisma.logisticsPlanning.findUnique).mockResolvedValue({
      id: "r1",
      organizationId: "org-rx",
      eventId: "e1",
      scopeKey: "EVENT",
      categoryCode: "ALL",
      phase: "MONTAGE",
      date: "2026-05-01",
      startTime: "08:00",
      endTime: "10:00",
    });
    mock(prisma.logisticsPlanning.findMany).mockResolvedValue([
      { startTime: "10:30", endTime: "12:00" },
    ]);
    const res = await PATCH(
      request("/api/admin/planning/rules/r1", {
        method: "PATCH",
        body: { startTime: "09:00", endTime: "11:00" },
      }),
      { params: Promise.resolve({ id: "r1" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("PLANNING_OVERLAP");
  });

  it("supprime une règle de l'org", async () => {
    mock(prisma.logisticsPlanning.findUnique).mockResolvedValue({
      id: "r1",
      organizationId: "org-rx",
    });
    mock(prisma.logisticsPlanning.delete).mockResolvedValue({});
    const res = await DELETE(
      request("/api/admin/planning/rules/r1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "r1" }) }
    );
    expect(res.status).toBe(200);
    expect(prisma.logisticsPlanning.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
});
