import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    exhibitor: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    exhibitorLocation: { count: vi.fn() },
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
import { prisma } from "@/lib/prisma";
import * as auth from "@/lib/auth-helpers";

const mock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as unknown as ReturnType<typeof vi.fn>;

function request(query = "", body?: unknown) {
  return new NextRequest(`http://localhost/api/admin/referential/exhibitors?espace=rx${query}`, {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock(auth.requirePermission).mockResolvedValue({ user: { id: "user-rx" } });
  mock(auth.resolveEspaceOrgId).mockResolvedValue("org-rx");
  mock(auth.getAccessibleOrganizationIds).mockResolvedValue(["org-rx"]);
  mock(auth.canAccessOrganization).mockReturnValue(true);
  mock(auth.assertEventBelongsToOrg).mockResolvedValue(undefined);
  mock(prisma.exhibitor.findMany).mockResolvedValue([]);
  mock(prisma.exhibitor.count).mockResolvedValue(0);
  mock(prisma.exhibitorLocation.count).mockResolvedValue(0);
});

describe("GET /api/admin/referential/exhibitors", () => {
  it("applique la pagination et retourne le contrat attendu", async () => {
    mock(prisma.exhibitor.findMany).mockResolvedValue([
      { id: "ex-1", name: "ACME", _count: { locations: 2 }, locations: [] },
    ]);
    mock(prisma.exhibitor.count)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(10);
    mock(prisma.exhibitorLocation.count).mockResolvedValue(24);

    const response = await GET(request("&page=2&pageSize=5"));
    const body = await response.json();

    expect(prisma.exhibitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 })
    );
    expect(body).toMatchObject({
      total: 12,
      page: 2,
      pageSize: 5,
      counters: { exhibitors: 10, locations: 24 },
      items: [{ id: "ex-1", locationsCount: 2 }],
    });
  });

  it("recherche sur le nom normalisé et les codes d'emplacement", async () => {
    await GET(request("&q=Power-215"));
    const call = mock(prisma.exhibitor.findMany).mock.calls[0][0];
    expect(JSON.stringify(call.where.OR)).toContain("POWER215");
  });

  it("retourne 403 quand la permission est refusée", async () => {
    mock(auth.requirePermission).mockRejectedValue(new Response("refus", { status: 403 }));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(prisma.exhibitor.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/referential/exhibitors", () => {
  it("normalise et crée l'exposant avec ses emplacements", async () => {
    mock(prisma.exhibitor.create).mockResolvedValue({ id: "ex-1", locations: [] });
    const response = await POST(
      request("", {
        eventId: "event-rx",
        name: "  Société Été  ",
        locations: [{ type: "terre", code: " Power-215 ", sectorCode: " power " }],
      })
    );

    expect(response.status).toBe(201);
    expect(auth.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      "GESTION_ESPACES",
      "write"
    );
    expect(auth.assertEventBelongsToOrg).toHaveBeenCalledWith("event-rx", "org-rx");
    expect(prisma.exhibitor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nameNormalized: "SOCIETE ETE",
          stand: "Power-215",
          locations: {
            create: [
              expect.objectContaining({
                type: "TERRE",
                codeNormalized: "POWER215",
                sectorCode: "POWER",
              }),
            ],
          },
        }),
      })
    );
  });
});
