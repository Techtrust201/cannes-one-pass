import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    exhibitorLocation: { findFirst: vi.fn(), update: vi.fn() },
  };
  return { prisma, default: prisma };
});
vi.mock("@/lib/auth-helpers", () => ({
  requirePermission: vi.fn(),
  resolveEspaceOrgId: vi.fn(),
  getAccessibleOrganizationIds: vi.fn(),
  canAccessOrganization: vi.fn(),
}));

import { PATCH } from "./route";
import { prisma } from "@/lib/prisma";
import * as auth from "@/lib/auth-helpers";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(auth.requirePermission).mockResolvedValue({ user: { id: "u-rx" } });
  asMock(auth.resolveEspaceOrgId).mockResolvedValue("org-rx");
  asMock(auth.getAccessibleOrganizationIds).mockResolvedValue(["org-rx"]);
  asMock(auth.canAccessOrganization).mockReturnValue(true);
  asMock(prisma.exhibitorLocation.findFirst).mockResolvedValue({ id: "loc-1" });
});

describe("PATCH /locations/:id", () => {
  it("normalise les codes et autorise uniquement le toggle non destructif", async () => {
    asMock(prisma.exhibitorLocation.update).mockResolvedValue({ id: "loc-1" });
    const req = new NextRequest(
      "http://localhost/api/admin/referential/locations/loc-1?espace=rx",
      {
        method: "PATCH",
        body: JSON.stringify({
          code: " Power-215 ",
          portCode: " port canto ",
          isActive: false,
        }),
        headers: { "content-type": "application/json" },
      }
    );
    const response = await PATCH(req, {
      params: Promise.resolve({ id: "loc-1" }),
    });

    expect(response.status).toBe(200);
    expect(prisma.exhibitorLocation.findFirst).toHaveBeenCalledWith({
      where: { id: "loc-1", exhibitor: { organizationId: "org-rx" } },
      select: { id: true },
    });
    expect(prisma.exhibitorLocation.update).toHaveBeenCalledWith({
      where: { id: "loc-1" },
      data: {
        code: "Power-215",
        codeNormalized: "POWER215",
        portCode: "PORT CANTO",
        isActive: false,
      },
    });
  });
});
