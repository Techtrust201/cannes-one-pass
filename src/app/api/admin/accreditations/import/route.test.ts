import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth-helpers", () => ({
  requirePermission: vi.fn(),
  getAccessibleEventIds: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    event: { findMany: vi.fn() },
    vehicleTypeConfig: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  };
  return { prisma: prismaMock, default: prismaMock };
});

// Le registre de templates importe des composants JSX (`.tsx`) que le
// pipeline Vitest/Rolldown ne peut pas parser comme module Node pur. Mock
// minimal (jamais appelé : `previewAccreditation` est lui-même mocké
// ci-dessous) pour permettre le chargement transitif de `accreditation-service.ts`
// via `vi.importActual` (nécessaire pour récupérer les VRAIES classes
// `CapacityQuotaError`/`RxServerValidationError`).
vi.mock("@/templates/accreditation/registry", () => ({
  getTemplate: () => ({ slug: "test", schema: { safeParse: vi.fn() } }),
}));

vi.mock("@/lib/accreditation-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accreditation-service")>(
    "@/lib/accreditation-service"
  );
  return {
    ...actual,
    previewAccreditation: vi.fn(),
    createAccreditationInTransaction: vi.fn(),
  };
});

import { POST } from "./route";
import * as auth from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import * as engine from "@/lib/accreditation-service";

const requirePermission = auth.requirePermission as unknown as ReturnType<typeof vi.fn>;
const getAccessibleEventIds = auth.getAccessibleEventIds as unknown as ReturnType<typeof vi.fn>;
const eventFindMany = prisma.event.findMany as unknown as ReturnType<typeof vi.fn>;
const transactionMock = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const previewAccreditation = engine.previewAccreditation as unknown as ReturnType<typeof vi.fn>;
const createAccreditationInTransaction = engine.createAccreditationInTransaction as unknown as ReturnType<
  typeof vi.fn
>;

const HEADER = "company,stand,email,eventSlug,vehiclePlate,vehicleSize,phoneCode,phoneNumber,date,time,city,unloading,category";
const VALID_ROW =
  "Decorateur Exemple,A12,contact@exemple.fr,yachting-2026,AB123CD,PORTEUR,+33,612345678,2026-09-04,08:30,Cannes,rear,bateau_flot";
const VALID_CSV = `${HEADER}\n${VALID_ROW}\n`;

function makeReq(opts: { content?: string; search?: string }): NextRequest {
  const fd = new FormData();
  if (opts.content !== undefined) {
    fd.set("file", new File([opts.content], "acc.csv", { type: "text/csv" }));
  }
  const url = new URL("http://localhost/api/admin/accreditations/import" + (opts.search ?? ""));
  return { formData: async () => fd, nextUrl: url } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ user: { id: "u-1" } });
  getAccessibleEventIds.mockResolvedValue("ALL");
  eventFindMany.mockResolvedValue([
    { slug: "yachting-2026", id: "evt-1", organizationId: "org-1", organization: { slug: "palais" } },
  ]);
  previewAccreditation.mockResolvedValue({
    ok: true,
    recipientEmail: "contact@exemple.fr",
    quotaCandidates: [],
  });
  createAccreditationInTransaction.mockResolvedValue({ kind: "single", accreditation: { id: "acc-1" } });
});

describe("POST /api/admin/accreditations/import — adaptateur moteur unique (Phase 4B-3)", () => {
  it("dry-run : aucune ecriture, previewAccreditation jamais appele", async () => {
    const res = await POST(makeReq({ content: VALID_CSV }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("dry-run");
    expect(previewAccreditation).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("commit : delegue au moteur unique (previewAccreditation puis createAccreditationInTransaction), jamais de create Prisma direct", async () => {
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("commit");
    expect(body.imported).toBe(1);
    expect(previewAccreditation).toHaveBeenCalledOnce();
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(createAccreditationInTransaction).toHaveBeenCalledOnce();
    // Le tx stub ({}) ne definit AUCUNE methode `accreditation.*` : si le
    // code appelait encore `tx.accreditation.create`, cet appel aurait leve
    // une TypeError et la transaction aurait echoue (500) au lieu de 200.
  });

  it("commit : previewAccreditation recoit le contexte CSV_IMPORT / PENDING, jamais de statut impose par le fichier", async () => {
    await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    const ctxArg = previewAccreditation.mock.calls[0]![1];
    expect(ctxArg).toEqual(expect.objectContaining({ channel: "CSV_IMPORT", importMode: "PENDING" }));
  });

  it("commit : une ligne en echec de preview -> 422, transaction jamais ouverte", async () => {
    previewAccreditation.mockResolvedValue({ ok: false, status: 400, error: "Plaque invalide", code: "VALIDATION_ERROR" });
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    expect(res.status).toBe(422);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("commit : echec de la transaction -> 500 controle", async () => {
    createAccreditationInTransaction.mockRejectedValue(new Error("boom"));
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });

  it("Phase 6C-B-5 : CapacityQuotaError dans la transaction -> 409 structuré (jamais un 500 générique)", async () => {
    createAccreditationInTransaction.mockRejectedValue(
      new engine.CapacityQuotaError({
        phase: "MONTAGE", zone: "LA_BOCCA", date: "2026-09-04", startTime: "08:00", endTime: "09:00",
        vehicleFamily: "LIGHT", remaining: 0, requestedCount: 1,
      })
    );
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.errors[0].reason).toContain("CAPACITY_QUOTA_FULL");
  });

  it("Phase 6C-B-5 : RxServerValidationError dans la transaction -> code/statut structuré préservé (jamais un 500 générique)", async () => {
    createAccreditationInTransaction.mockRejectedValue(
      new engine.RxServerValidationError(409, "Emplacement introuvable pour cet exposant dans ce contexte.", "LOCATION_NOT_FOUND")
    );
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.errors[0].reason).toContain("LOCATION_NOT_FOUND");
  });

  it("non authentifie -> 401", async () => {
    requirePermission.mockRejectedValue(new Response("x", { status: 401 }));
    const res = await POST(makeReq({ content: VALID_CSV }));
    expect(res.status).toBe(401);
  });
});
