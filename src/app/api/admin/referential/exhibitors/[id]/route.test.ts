import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    exhibitor: { findFirst: vi.fn(), update: vi.fn() },
  };
  return { prisma, default: prisma };
});
vi.mock("@/lib/auth-helpers", () => ({
  requirePermission: vi.fn(),
  resolveEspaceOrgId: vi.fn(),
  getAccessibleOrganizationIds: vi.fn(),
  canAccessOrganization: vi.fn(),
}));

import { GET, PATCH } from "./route";
import { prisma } from "@/lib/prisma";
import * as auth from "@/lib/auth-helpers";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const params = { params: Promise.resolve({ id: "ex-1" }) };

function request(method: "GET" | "PATCH", body?: unknown) {
  return new NextRequest(
    "http://localhost/api/admin/referential/exhibitors/ex-1?espace=rx",
    {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { "content-type": "application/json" } : undefined,
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(auth.requirePermission).mockResolvedValue({ user: { id: "u-rx" } });
  asMock(auth.resolveEspaceOrgId).mockResolvedValue("org-rx");
  asMock(auth.getAccessibleOrganizationIds).mockResolvedValue(["org-rx"]);
  asMock(auth.canAccessOrganization).mockReturnValue(true);
});

describe("exposant individuel", () => {
  it("masque en 404 un identifiant d'une autre organisation", async () => {
    asMock(prisma.exhibitor.findFirst).mockResolvedValue(null);
    const response = await GET(request("GET"), params);
    expect(response.status).toBe(404);
    expect(prisma.exhibitor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ex-1", organizationId: "org-rx" } })
    );
  });

  it("PATCH normalise le nom et permet le toggle actif", async () => {
    asMock(prisma.exhibitor.findFirst).mockResolvedValue({ id: "ex-1" });
    asMock(prisma.exhibitor.update).mockResolvedValue({
      id: "ex-1",
      name: "Été Yachting",
      isActive: false,
    });

    const response = await PATCH(
      request("PATCH", { name: " Été   Yachting ", isActive: false }),
      params
    );
    expect(response.status).toBe(200);
    expect(prisma.exhibitor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ex-1" },
        data: {
          name: "Été Yachting",
          nameNormalized: "ETE YACHTING",
          isActive: false,
        },
      })
    );
  });
});
