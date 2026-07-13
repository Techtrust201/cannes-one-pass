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

const applyZonesCommit = vi.fn();
vi.mock("@/lib/imports/zones", async () => {
  const actual = await vi.importActual<typeof import("@/lib/imports/zones")>("@/lib/imports/zones");
  return { ...actual, applyZonesCommit: (...args: unknown[]) => applyZonesCommit(...args) };
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
  "CODE,LABEL,ADDRESS,LATITUDE,LONGITUDE\nLA_BOCCA,La Bocca,12 Av de la Bocca,43.5461,7.0128\n";

function makeReq(opts: {
  content?: string;
  fileName?: string;
  mime?: string;
  org?: string | null;
  includeEvent?: boolean;
  search?: string;
}): NextRequest {
  const fd = new FormData();
  if (opts.content !== undefined) {
    fd.set("file", new File([opts.content], opts.fileName ?? "zones.csv", { type: opts.mime ?? "text/csv" }));
  }
  if (opts.org !== null) fd.set("organizationId", opts.org ?? "org-1");
  if (opts.includeEvent) fd.set("eventId", "evt-1");
  const url = new URL("http://localhost/api/admin/import/zones" + (opts.search ?? ""));
  return { formData: async () => fd, nextUrl: url } as unknown as NextRequest;
}

function okSession() {
  requirePermission.mockResolvedValue({ user: { id: "u-1" } });
  getAccessibleOrganizationIds.mockResolvedValue(["org-1"]);
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  applyZonesCommit.mockResolvedValue({
    counters: { created: 1, updated: 0, unchanged: 0, deactivated: 0, errorCount: 0 },
    created: 1,
    updated: 0,
    unchanged: 0,
  });
});

describe("POST /api/admin/import/zones — securite", () => {
  it("non authentifie -> refus", async () => {
    requirePermission.mockRejectedValue(new Response("Non authentifie", { status: 401 }));
    const res = await POST(makeReq({ content: VALID_CSV }));
    expect(res.status).toBe(401);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("anti-IDOR : organisation hors perimetre -> 403", async () => {
    requirePermission.mockResolvedValue({ user: { id: "u-1" } });
    getAccessibleOrganizationIds.mockResolvedValue(["org-1"]);
    const res = await POST(makeReq({ content: VALID_CSV, org: "org-autre", search: "?commit=true" }));
    expect(res.status).toBe(403);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("permission demandee = GESTION_ZONES en ecriture", async () => {
    okSession();
    await POST(makeReq({ content: VALID_CSV }));
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "GESTION_ZONES", "write");
  });

  it("aucun eventId requis (ZoneConfig n'a pas de eventId)", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/import/zones — dry-run / commit / atomicite", () => {
  it("dry-run : aucune ecriture", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("dry-run");
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("commit succes : ImportBatch (hors tx) -> tx -> COMPLETED", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("commit");
    expect(order).toEqual(["start", "tx", "complete"]);
    const startArgs = startImportBatch.mock.calls[0]![1];
    expect(startArgs.sourceProfile).toBe("ZONES");
  });

  it("organisation etrangere : refus avant toute ecriture", async () => {
    requirePermission.mockResolvedValue({ user: { id: "u-1" } });
    getAccessibleOrganizationIds.mockResolvedValue(["org-1"]);
    const res = await POST(
      makeReq({ content: VALID_CSV, org: "org-etrangere", search: "?commit=true" })
    );
    expect(res.status).toBe(403);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("zone en doublon dans le fichier -> warning, pas d'erreur bloquante", async () => {
    okSession();
    const dup =
      "CODE,LABEL,ADDRESS,LATITUDE,LONGITUDE\nLA_BOCCA,La Bocca,Adresse,43.5,7.0\nLA_BOCCA,La Bocca 2,Adresse 2,43.6,7.1\n";
    const res = await POST(makeReq({ content: dup }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.warnings.some((w: { reason: string }) => w.reason.includes("DUPLICATE_ZONE_CODE"))).toBe(true);
  });

  it("commit echec : rollback puis ImportBatch FAILED", async () => {
    okSession();
    applyZonesCommit.mockRejectedValue(new Error("boom"));
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

  it("colonne ORGANIZATION ID dans le fichier -> erreur 422, aucune ecriture", async () => {
    okSession();
    const csv = "CODE,LABEL,ADDRESS,LATITUDE,LONGITUDE,ORGANIZATION ID\nLA_BOCCA,La Bocca,Adresse,43.5,7.0,org-injecte\n";
    const res = await POST(makeReq({ content: csv, search: "?commit=true" }));
    expect(res.status).toBe(422);
    expect(startImportBatch).not.toHaveBeenCalled();
  });
});
