import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    organization: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    exhibitor: { findMany: vi.fn() },
    exhibitorLocation: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return { prisma: prismaMock, default: prismaMock, withRetry: (fn: () => unknown) => fn() };
});

vi.mock("@/lib/auth-helpers", () => ({
  getSession: vi.fn(async () => null),
}));

const createAccreditation = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; body: unknown }>>(
  async () => ({ ok: true, body: { id: "acc-1" } })
);
vi.mock("@/lib/accreditation-service", () => ({
  createAccreditation: (...args: unknown[]) => createAccreditation(...args),
  CapacityQuotaError: class CapacityQuotaError extends Error {},
}));

const resolveReferential = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/imports/accreditations-referential-resolver", () => ({
  resolveReferential: (...args: unknown[]) => resolveReferential(...args),
}));

import prisma from "@/lib/prisma";
import { POST } from "./route";
import { NextRequest } from "next/server";

type MockedPrisma = {
  organization: { findUnique: Mock };
  event: { findUnique: Mock };
};
const mockedPrisma = prisma as unknown as MockedPrisma;

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/accreditations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const RX_COMMAND = {
  organizationSlug: "rx",
  event: "cyf26",
  company: "Sunseeker",
  stand: "PAN 023",
  extension: {
    exhibitor: { id: "client-supplied-id", name: "Sunseeker" },
    location: { code: "PAN 023", type: "TERRE" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  createAccreditation.mockResolvedValue({ ok: true, body: { id: "acc-1" } });
});

describe("POST /api/accreditations — rattachement référentiel (Phase 6)", () => {
  it("Palais (organizationSlug != rx) : ne résout jamais de référentiel", async () => {
    await POST(makeReq({ organizationSlug: "palais", event: "cannes26", company: "Acme" }));
    expect(resolveReferential).not.toHaveBeenCalled();
    expect(createAccreditation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ referential: undefined })
    );
  });

  it("RX sans nom exposant / event : ne résout aucun référentiel", async () => {
    await POST(makeReq({ organizationSlug: "rx", event: "", extension: {} }));
    expect(resolveReferential).not.toHaveBeenCalled();
  });

  it("RX avec résolution réussie : injecte exhibitorId/exhibitorLocationId/locationSnapshot dans le contexte, jamais l'ID client", async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue({ id: "org-1" });
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "evt-1", organizationId: "org-1" });
    resolveReferential.mockResolvedValue({
      ok: true,
      exhibitorId: "real-exhibitor-id",
      exhibitorLocationId: "real-location-id",
      locationLabel: "PAN 023",
      locationSnapshot: { exhibitorName: "Sunseeker", locationCode: "PAN 023" },
    });

    await POST(makeReq(RX_COMMAND));

    expect(resolveReferential).toHaveBeenCalledWith(
      expect.anything(),
      { organizationId: "org-1", eventId: "evt-1" },
      expect.objectContaining({ name: "Sunseeker", locationCode: "PAN 023", locationType: "TERRE" })
    );
    const ctx = createAccreditation.mock.calls[0]?.[1] as { referential?: { exhibitorId?: string } };
    expect(ctx.referential).toEqual({
      exhibitorId: "real-exhibitor-id",
      exhibitorLocationId: "real-location-id",
      locationLabel: "PAN 023",
      locationSnapshot: { exhibitorName: "Sunseeker", locationCode: "PAN 023" },
    });
    // L'ID fourni par le client n'est JAMAIS celui utilisé.
    expect(ctx.referential?.exhibitorId).not.toBe("client-supplied-id");
  });

  it("RX avec résolution en échec (introuvable/ambigu) : ne bloque pas, référentiel undefined", async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue({ id: "org-1" });
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "evt-1", organizationId: "org-1" });
    resolveReferential.mockResolvedValue({
      ok: false,
      code: "EXHIBITOR_AMBIGUOUS",
      message: "Plusieurs exposants correspondent.",
    });

    const res = await POST(makeReq(RX_COMMAND));

    expect(res.status).toBe(201);
    const ctx = createAccreditation.mock.calls[0]?.[1] as { referential?: { exhibitorId?: string } };
    expect(ctx.referential).toBeUndefined();
  });

  it("RX avec event hors organisation (anti-IDOR) : ne résout pas et ne bloque pas la création", async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue({ id: "org-1" });
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "evt-1", organizationId: "AUTRE_ORG" });

    const res = await POST(makeReq(RX_COMMAND));

    expect(resolveReferential).not.toHaveBeenCalled();
    expect(res.status).toBe(201);
    const ctx = createAccreditation.mock.calls[0]?.[1] as { referential?: { exhibitorId?: string } };
    expect(ctx.referential).toBeUndefined();
  });

  it("une erreur Prisma pendant la résolution référentiel ne fait jamais échouer la création", async () => {
    mockedPrisma.organization.findUnique.mockRejectedValue(new Error("DB down"));

    const res = await POST(makeReq(RX_COMMAND));

    expect(res.status).toBe(201);
    const ctx = createAccreditation.mock.calls[0]?.[1] as { referential?: { exhibitorId?: string } };
    expect(ctx.referential).toBeUndefined();
  });
});
