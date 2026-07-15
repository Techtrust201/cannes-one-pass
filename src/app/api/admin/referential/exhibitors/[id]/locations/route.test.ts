import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    exhibitor: { findFirst: vi.fn() },
    exhibitorLocation: { findMany: vi.fn(), create: vi.fn() },
  };
  return { prisma, default: prisma };
});
vi.mock("@/lib/auth-helpers", () => ({
  requirePermission: vi.fn(),
  resolveEspaceOrgId: vi.fn(),
  getAccessibleOrganizationIds: vi.fn(),
  canAccessOrganization: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import * as auth from "@/lib/auth-helpers";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(auth.requirePermission).mockResolvedValue({ user: { id: "u-rx" } });
  asMock(auth.resolveEspaceOrgId).mockResolvedValue("org-rx");
  asMock(auth.getAccessibleOrganizationIds).mockResolvedValue(["org-rx"]);
  asMock(auth.canAccessOrganization).mockReturnValue(true);
  asMock(prisma.exhibitor.findFirst).mockResolvedValue({ id: "ex-1", eventId: "evt-rx" });
});

describe("POST emplacement exposant", () => {
  it("signale POWER215 déjà actif chez un autre exposant", async () => {
    asMock(prisma.exhibitorLocation.findMany).mockResolvedValue([
      { exhibitorId: "ex-2", code: "POWER 215" },
    ]);
    asMock(prisma.exhibitorLocation.create).mockResolvedValue({
      id: "loc-1",
      code: "POWER-215",
      codeNormalized: "POWER215",
    });
    const req = new NextRequest(
      "http://localhost/api/admin/referential/exhibitors/ex-1/locations?espace=rx",
      {
        method: "POST",
        body: JSON.stringify({ type: "terre", code: "POWER-215" }),
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(req, {
      params: Promise.resolve({ id: "ex-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(prisma.exhibitorLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: "TERRE",
          codeNormalized: "POWER215",
          exhibitorId: { not: "ex-1" },
        }),
      })
    );
    expect(body.collisionWarning).toEqual({
      exhibitorIds: ["ex-2"],
      codes: ["POWER-215", "POWER 215"],
    });
  });
});
