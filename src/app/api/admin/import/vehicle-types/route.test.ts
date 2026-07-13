import { describe, it, expect, vi, beforeEach } from "vitest";

const order: string[] = [];

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      order.push("tx");
      return cb({});
    }),
  };
  return { prisma: prismaMock, default: prismaMock };
});

vi.mock("@/lib/auth-helpers", () => ({
  requirePermission: vi.fn(),
  getAccessibleOrganizationIds: vi.fn(),
  assertEventBelongsToOrg: vi.fn(),
}));

vi.mock("@/lib/imports/import-batch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/imports/import-batch")>(
    "@/lib/imports/import-batch"
  );
  return {
    ...actual,
    startImportBatch: vi.fn(async () => {
      order.push("start");
      return { id: "batch-1" };
    }),
    completeImportBatch: vi.fn(async () => {
      order.push("complete");
    }),
    failImportBatch: vi.fn(async () => {
      order.push("fail");
    }),
  };
});

const applyVehicleTypesCommit = vi.fn();
vi.mock("@/lib/imports/vehicle-types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/imports/vehicle-types")>(
    "@/lib/imports/vehicle-types"
  );
  return { ...actual, applyVehicleTypesCommit: (...args: unknown[]) => applyVehicleTypesCommit(...args) };
});

import { POST } from "./route";
import * as auth from "@/lib/auth-helpers";
import * as batch from "@/lib/imports/import-batch";
import type { NextRequest } from "next/server";

const requirePermission = auth.requirePermission as unknown as ReturnType<typeof vi.fn>;
const getAccessibleOrganizationIds = auth.getAccessibleOrganizationIds as unknown as ReturnType<
  typeof vi.fn
>;
const startImportBatch = batch.startImportBatch as unknown as ReturnType<typeof vi.fn>;
const failImportBatch = batch.failImportBatch as unknown as ReturnType<typeof vi.fn>;

const VALID_CSV =
  "CODE,LABEL,GABARIT,TONNAGE MINI,TONNAGE MOYEN,TONNAGE MAXI,CO2 COEFFICIENT,VEHICLE FAMILY\nVL,Vehicule leger,VL,0,1.5,3.5,0.2,LIGHT\n";

function makeReq(opts: {
  content?: string;
  fileName?: string;
  mime?: string;
  org?: string | null;
  search?: string;
}): NextRequest {
  const fd = new FormData();
  if (opts.content !== undefined) {
    fd.set("file", new File([opts.content], opts.fileName ?? "vt.csv", { type: opts.mime ?? "text/csv" }));
  }
  if (opts.org !== null) fd.set("organizationId", opts.org ?? "org-1");
  const url = new URL("http://localhost/api/admin/import/vehicle-types" + (opts.search ?? ""));
  return { formData: async () => fd, nextUrl: url } as unknown as NextRequest;
}

function okSession() {
  requirePermission.mockResolvedValue({ user: { id: "u-1" } });
  getAccessibleOrganizationIds.mockResolvedValue(["org-1"]);
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  applyVehicleTypesCommit.mockResolvedValue({
    counters: { created: 1, updated: 0, unchanged: 0, deactivated: 0, errorCount: 0 },
    created: 1,
    updated: 0,
    unchanged: 0,
  });
});

describe("POST /api/admin/import/vehicle-types — securite", () => {
  it("non authentifie -> refus", async () => {
    requirePermission.mockRejectedValue(new Response("Non authentifie", { status: 401 }));
    const res = await POST(makeReq({ content: VALID_CSV }));
    expect(res.status).toBe(401);
  });

  it("permission demandee = FLUX_VEHICULES en ecriture", async () => {
    okSession();
    await POST(makeReq({ content: VALID_CSV }));
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "FLUX_VEHICULES", "write");
  });

  it("anti-IDOR : organisation hors perimetre -> 403", async () => {
    requirePermission.mockResolvedValue({ user: { id: "u-1" } });
    getAccessibleOrganizationIds.mockResolvedValue(["org-1"]);
    const res = await POST(makeReq({ content: VALID_CSV, org: "org-autre", search: "?commit=true" }));
    expect(res.status).toBe(403);
    expect(startImportBatch).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/import/vehicle-types — LIGHT / HEAVY / dry-run / commit", () => {
  it("dry-run : aucune ecriture", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("dry-run");
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("LIGHT accepte", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV }));
    expect(res.status).toBe(200);
  });

  it("HEAVY accepte", async () => {
    okSession();
    const heavy = VALID_CSV.replace("LIGHT", "HEAVY");
    const res = await POST(makeReq({ content: heavy }));
    expect(res.status).toBe(200);
  });

  it("famille invalide -> 422, aucune ecriture", async () => {
    okSession();
    const bad = VALID_CSV.replace("LIGHT", "MEDIUM");
    const res = await POST(makeReq({ content: bad, search: "?commit=true" }));
    expect(res.status).toBe(422);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("code duplique dans le fichier -> warning, pas d'erreur bloquante", async () => {
    okSession();
    const dup = VALID_CSV + "vl,Vehicule leger 2,VL,0,1.5,3.5,0.2,LIGHT\n";
    const res = await POST(makeReq({ content: dup }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.warnings.some((w: { reason: string }) => w.reason.includes("DUPLICATE_CODE"))).toBe(true);
  });

  it("commit succes : ImportBatch (hors tx) -> tx -> COMPLETED, sourceProfile VEHICLE_TYPES", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    expect(res.status).toBe(200);
    expect(order).toEqual(["start", "tx", "complete"]);
    expect(startImportBatch.mock.calls[0]![1].sourceProfile).toBe("VEHICLE_TYPES");
  });

  it("rollback : echec transaction -> ImportBatch FAILED", async () => {
    okSession();
    applyVehicleTypesCommit.mockRejectedValue(new Error("boom"));
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    expect(res.status).toBe(500);
    expect(order).toEqual(["start", "tx", "fail"]);
    expect(failImportBatch).toHaveBeenCalledOnce();
  });
});
