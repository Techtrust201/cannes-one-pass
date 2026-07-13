import { describe, it, expect, vi, beforeEach } from "vitest";

const order: string[] = [];

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      order.push("tx");
      return cb({});
    }),
    zoneConfig: {
      findMany: vi.fn(async () => [{ zone: "LA_BOCCA" }]),
    },
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

const applyCapacitiesCommit = vi.fn();
vi.mock("@/lib/imports/capacities", async () => {
  const actual = await vi.importActual<typeof import("@/lib/imports/capacities")>(
    "@/lib/imports/capacities"
  );
  return { ...actual, applyCapacitiesCommit: (...args: unknown[]) => applyCapacitiesCommit(...args) };
});

import { POST } from "./route";
import * as auth from "@/lib/auth-helpers";
import * as prismaModule from "@/lib/prisma";
import * as batch from "@/lib/imports/import-batch";
import type { NextRequest } from "next/server";

const requirePermission = auth.requirePermission as unknown as ReturnType<typeof vi.fn>;
const getAccessibleOrganizationIds = auth.getAccessibleOrganizationIds as unknown as ReturnType<
  typeof vi.fn
>;
const assertEventBelongsToOrg = auth.assertEventBelongsToOrg as unknown as ReturnType<typeof vi.fn>;
const startImportBatch = batch.startImportBatch as unknown as ReturnType<typeof vi.fn>;
const failImportBatch = batch.failImportBatch as unknown as ReturnType<typeof vi.fn>;
const zoneFindMany = (prismaModule as unknown as { prisma: { zoneConfig: { findMany: ReturnType<typeof vi.fn> } } })
  .prisma.zoneConfig.findMany;

const VALID_CSV = "ZONE,DATE,START TIME,END TIME,VEHICLE FAMILY,PHASE,CAPACITY\nLA_BOCCA,2026-09-16,08:00,12:00,LIGHT,MONTAGE,10\n";

function makeReq(opts: {
  content?: string;
  fileName?: string;
  mime?: string;
  org?: string | null;
  event?: string | null;
  search?: string;
}): NextRequest {
  const fd = new FormData();
  if (opts.content !== undefined) {
    fd.set("file", new File([opts.content], opts.fileName ?? "cap.csv", { type: opts.mime ?? "text/csv" }));
  }
  if (opts.org !== null) fd.set("organizationId", opts.org ?? "org-1");
  if (opts.event !== null) fd.set("eventId", opts.event ?? "evt-1");
  const url = new URL("http://localhost/api/admin/import/capacities" + (opts.search ?? ""));
  return { formData: async () => fd, nextUrl: url } as unknown as NextRequest;
}

function okSession() {
  requirePermission.mockResolvedValue({ user: { id: "u-1" } });
  getAccessibleOrganizationIds.mockResolvedValue(["org-1"]);
  assertEventBelongsToOrg.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  zoneFindMany.mockResolvedValue([{ zone: "LA_BOCCA" }]);
  applyCapacitiesCommit.mockResolvedValue({
    counters: { created: 1, updated: 0, unchanged: 0, deactivated: 0, errorCount: 0 },
    created: 1,
    updated: 0,
    unchanged: 0,
  });
});

describe("POST /api/admin/import/capacities — securite", () => {
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

  it("event d'une autre organisation -> refus", async () => {
    requirePermission.mockResolvedValue({ user: { id: "u-1" } });
    getAccessibleOrganizationIds.mockResolvedValue(["org-1"]);
    assertEventBelongsToOrg.mockRejectedValue(new Response("incoherent", { status: 400 }));
    const res = await POST(makeReq({ content: VALID_CSV, event: "evt-autre", search: "?commit=true" }));
    expect(res.status).toBe(400);
    expect(startImportBatch).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/import/capacities — cle naturelle / dry-run / commit / atomicite", () => {
  it("dry-run : aucune ecriture", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("dry-run");
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("zone inconnue -> erreur 422, aucune ecriture", async () => {
    okSession();
    zoneFindMany.mockResolvedValue([]);
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    expect(res.status).toBe(422);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("commit succes : ImportBatch (hors tx) -> tx -> COMPLETED, sourceProfile CAPACITIES", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    expect(res.status).toBe(200);
    expect(order).toEqual(["start", "tx", "complete"]);
    expect(startImportBatch.mock.calls[0]![1].sourceProfile).toBe("CAPACITIES");
    expect(startImportBatch.mock.calls[0]![1].eventId).toBe("evt-1");
  });

  it("transaction atomique : echec -> rollback + ImportBatch FAILED, code controle", async () => {
    okSession();
    applyCapacitiesCommit.mockRejectedValue(new Error("boom"));
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    expect(res.status).toBe(500);
    expect(order).toEqual(["start", "tx", "fail"]);
    expect(failImportBatch).toHaveBeenCalledOnce();
  });

  it("REPLACE refuse", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true&mode=REPLACE" }));
    expect(res.status).toBe(400);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("colonne EVENT ID dans le fichier -> erreur, jamais lue", async () => {
    okSession();
    const csv = VALID_CSV.replace("CAPACITY\n", "CAPACITY,EVENT ID\n").replace("10\n", "10,evt-injecte\n");
    const res = await POST(makeReq({ content: csv, search: "?commit=true" }));
    expect(res.status).toBe(422);
    expect(startImportBatch).not.toHaveBeenCalled();
  });
});
