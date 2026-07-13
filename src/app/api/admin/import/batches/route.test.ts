import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prismaMock = { importBatch: { findMany: vi.fn(async () => []) } };
  return { prisma: prismaMock, default: prismaMock };
});

vi.mock("@/lib/auth-helpers", () => ({
  requireEspaceManagement: vi.fn(),
  getAccessibleOrganizationIds: vi.fn(),
}));

import { GET } from "./route";
import * as auth from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

const requireEspaceManagement = auth.requireEspaceManagement as unknown as ReturnType<typeof vi.fn>;
const getAccessibleOrganizationIds = auth.getAccessibleOrganizationIds as unknown as ReturnType<
  typeof vi.fn
>;
const findMany = (prisma as unknown as { importBatch: { findMany: ReturnType<typeof vi.fn> } })
  .importBatch.findMany;

function makeReq(search = ""): NextRequest {
  return { nextUrl: new URL("http://localhost/api/admin/import/batches" + search) } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
});

describe("GET /api/admin/import/batches — securite multi-organisation", () => {
  it("non authentifie -> refus", async () => {
    requireEspaceManagement.mockRejectedValue(new Response("Non authentifie", { status: 401 }));
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("utilisateur non SUPER_ADMIN scope automatiquement a ses organisations accessibles", async () => {
    requireEspaceManagement.mockResolvedValue({ session: { user: { id: "u-1" } }, role: "ADMIN" });
    getAccessibleOrganizationIds.mockResolvedValue(["org-1", "org-2"]);
    await GET(makeReq());
    const where = findMany.mock.calls[0]![0].where;
    expect(where.organizationId).toEqual({ in: ["org-1", "org-2"] });
  });

  it("refuse de forcer organizationId hors perimetre (IDOR)", async () => {
    requireEspaceManagement.mockResolvedValue({ session: { user: { id: "u-1" } }, role: "ADMIN" });
    getAccessibleOrganizationIds.mockResolvedValue(["org-1"]);
    const res = await GET(makeReq("?organizationId=org-etrangere"));
    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN voit toutes les organisations sans filtre force", async () => {
    requireEspaceManagement.mockResolvedValue({ session: { user: { id: "u-1" } }, role: "SUPER_ADMIN" });
    getAccessibleOrganizationIds.mockResolvedValue("ALL");
    await GET(makeReq());
    const where = findMany.mock.calls[0]![0].where;
    expect(where.organizationId).toBeUndefined();
  });

  it("filtre par profil quand fourni", async () => {
    requireEspaceManagement.mockResolvedValue({ session: { user: { id: "u-1" } }, role: "SUPER_ADMIN" });
    getAccessibleOrganizationIds.mockResolvedValue("ALL");
    await GET(makeReq("?profile=zones"));
    const where = findMany.mock.calls[0]![0].where;
    expect(where.sourceProfile).toBe("ZONES");
  });

  it("retourne les champs attendus par l'interface (date, statut, compteurs...)", async () => {
    requireEspaceManagement.mockResolvedValue({ session: { user: { id: "u-1" } }, role: "SUPER_ADMIN" });
    getAccessibleOrganizationIds.mockResolvedValue("ALL");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const select = findMany.mock.calls[0]![0].select;
    expect(select).toMatchObject({
      status: true,
      created: true,
      updated: true,
      unchanged: true,
      deactivated: true,
      errorCount: true,
      startedAt: true,
    });
  });
});
