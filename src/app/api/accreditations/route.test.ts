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

const createAccreditation = vi.fn<
  (...args: unknown[]) => Promise<{ ok: boolean; status?: number; body?: unknown; error?: string; code?: string; details?: unknown }>
>(async () => ({ ok: true, body: { id: "acc-1" } }));
vi.mock("@/lib/accreditation-service", () => ({
  createAccreditation: (...args: unknown[]) => createAccreditation(...args),
  CapacityQuotaError: class CapacityQuotaError extends Error {},
  RxServerValidationError: class RxServerValidationError extends Error {
    status: number;
    code?: string;
    details?: unknown;
    constructor(status: number, message: string, code?: string, details?: unknown) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
}));

import prisma from "@/lib/prisma";
import { POST } from "./route";
import { NextRequest } from "next/server";

type MockedPrisma = {
  organization: { findUnique: Mock };
  event: { findUnique: Mock };
  exhibitor: { findMany: Mock };
  exhibitorLocation: { findMany: Mock };
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

describe("POST /api/accreditations — indications référentielles NON FIABLES (Phase 6C-B-2)", () => {
  // La résolution/revalidation fiable a été déplacée dans le moteur unique
  // (`resolveRxServerContext` dans `accreditation-service.ts`, mocké ici).
  // Cette route ne fait plus AUCUN accès DB pour le référentiel : elle se
  // limite à extraire des indications non fiables (`referentialInput`),
  // jamais un `exhibitorId` client, jamais bloquant.

  it("Palais (organizationSlug != rx) : aucune indication référentielle transmise", async () => {
    await POST(makeReq({ organizationSlug: "palais", event: "cannes26", company: "Acme" }));
    expect(createAccreditation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ referentialInput: undefined })
    );
  });

  it("RX : extrait exhibitorName/locationCode/locationType, jamais l'ID exposant fourni par le client", async () => {
    await POST(makeReq(RX_COMMAND));

    expect(createAccreditation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        referentialInput: {
          exhibitorName: "Sunseeker",
          locationCode: "PAN 023",
          locationType: "TERRE",
        },
      })
    );
    const ctx = createAccreditation.mock.calls[0]?.[1] as {
      referentialInput?: Record<string, unknown>;
    };
    expect(ctx.referentialInput).not.toHaveProperty("exhibitorId");
    expect(JSON.stringify(ctx.referentialInput)).not.toContain("client-supplied-id");
  });

  it("RX sans exposant/emplacement dans extension : indication non fiable construite avec des champs nuls (jamais undefined pour l'org RX)", async () => {
    await POST(makeReq({ organizationSlug: "rx", event: "cyf26", extension: {} }));

    expect(createAccreditation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        referentialInput: { exhibitorName: null, locationCode: null, locationType: null },
      })
    );
  });

  it("aucun accès Prisma direct dans la route pour le référentiel (délégué au moteur)", async () => {
    await POST(makeReq(RX_COMMAND));
    expect(mockedPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.event.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.exhibitor.findMany).not.toHaveBeenCalled();
  });

  it("mappe un échec moteur 503 (référentiel/planning RX indisponible) sans fuite de détail Prisma", async () => {
    createAccreditation.mockResolvedValueOnce({
      ok: false,
      status: 503,
      error: "Service de validation du référentiel temporairement indisponible.",
      code: "REFERENTIAL_VALIDATION_UNAVAILABLE",
    });

    const res = await POST(makeReq(RX_COMMAND));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("REFERENTIAL_VALIDATION_UNAVAILABLE");
  });

  it("mappe un échec moteur 409 (planning/référentiel incohérent RX) avec code structuré", async () => {
    createAccreditation.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "Emplacement introuvable pour cet exposant dans ce contexte.",
      code: "LOCATION_NOT_FOUND",
    });

    const res = await POST(makeReq(RX_COMMAND));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("LOCATION_NOT_FOUND");
  });
});
