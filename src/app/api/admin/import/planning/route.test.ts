import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

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
      return { id: "batch-p" };
    }),
    completeImportBatch: vi.fn(async () => {
      order.push("complete");
    }),
    failImportBatch: vi.fn(async () => {
      order.push("fail");
    }),
  };
});

const applyPlanningCommit = vi.fn();
vi.mock("@/lib/imports/planning-commit", () => ({
  applyPlanningCommit: (...args: unknown[]) => applyPlanningCommit(...args),
}));

import { POST } from "./route";
import * as auth from "@/lib/auth-helpers";
import * as batch from "@/lib/imports/import-batch";
import type { NextRequest } from "next/server";

const requirePermission = auth.requirePermission as unknown as ReturnType<typeof vi.fn>;
const getAccessibleOrganizationIds = auth.getAccessibleOrganizationIds as unknown as ReturnType<
  typeof vi.fn
>;
const assertEventBelongsToOrg = auth.assertEventBelongsToOrg as unknown as ReturnType<typeof vi.fn>;
const startImportBatch = batch.startImportBatch as unknown as ReturnType<typeof vi.fn>;

const CANONICAL_CSV =
  "SCOPE,SPACE,CATEGORY,PHASE,DATE START,DATE END,START TIME,END TIME\n" +
  "SPACE,POWER,BATEAU_TERRE,DEMONTAGE,2026-09-16,2026-09-16,12:00,17:00\n";

function isoToSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
function hourFraction(h: number): number {
  return h / 24;
}

/** Construit un classeur XLSX RX matriciel minimal en buffer. */
function makeRxWorkbookBuffer(): Uint8Array {
  const empty = new Array(14).fill("");
  const power = new Array(14).fill("");
  power[0] = "PORT CANTO";
  power[1] = "POWER";
  power[10] = isoToSerial("2026-09-16");
  power[11] = hourFraction(12);
  power[12] = isoToSerial("2026-09-17");
  power[13] = hourFraction(17);
  const matrix: unknown[][] = [
    ["", "", "MONTAGE"],
    empty,
    empty,
    ["PORT CANTO", "POWER", ""],
    ["", "", "DEMONTAGE"],
    empty,
    empty,
    power,
  ];
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planning");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

function makeReq(opts: {
  content?: string | Uint8Array;
  fileName?: string;
  mime?: string;
  org?: string | null;
  event?: string | null;
  search?: string;
}): NextRequest {
  const fd = new FormData();
  if (opts.content !== undefined) {
    const part = opts.content as unknown as BlobPart;
    fd.set("file", new File([part], opts.fileName ?? "planning.csv", { type: opts.mime ?? "text/csv" }));
  }
  if (opts.org !== null) fd.set("organizationId", opts.org ?? "org-rx");
  if (opts.event !== null) fd.set("eventId", opts.event ?? "evt-rx");
  const url = new URL("http://localhost/api/admin/import/planning" + (opts.search ?? ""));
  return { formData: async () => fd, nextUrl: url } as unknown as NextRequest;
}

function okSession() {
  requirePermission.mockResolvedValue({ user: { id: "u-rx" } });
  getAccessibleOrganizationIds.mockResolvedValue(["org-rx"]);
  assertEventBelongsToOrg.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  applyPlanningCommit.mockResolvedValue({
    counters: { analyzed: 1, created: 1, updated: 0, unchanged: 0, skipped: 0, errors: 0, deactivated: 0 },
    created: 1,
    updated: 0,
    unchanged: 0,
    warnings: [],
  });
});

describe("POST /api/admin/import/planning — securite", () => {
  it("non authentifie -> 401", async () => {
    requirePermission.mockRejectedValue(new Response("x", { status: 401 }));
    const res = await POST(makeReq({ content: CANONICAL_CSV }));
    expect(res.status).toBe(401);
  });

  it("anti-IDOR : utilisateur Palais ne peut importer dans RX -> 403", async () => {
    requirePermission.mockResolvedValue({ user: { id: "u-palais" } });
    getAccessibleOrganizationIds.mockResolvedValue(["org-palais"]);
    const res = await POST(makeReq({ content: CANONICAL_CSV, org: "org-rx", search: "?commit=true" }));
    expect(res.status).toBe(403);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("permission demandee = GESTION_DATES en ecriture", async () => {
    okSession();
    await POST(makeReq({ content: CANONICAL_CSV }));
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "GESTION_DATES", "write");
  });
});

describe("POST /api/admin/import/planning — CSV canonique + XLSX RX", () => {
  it("dry-run CSV canonique : aucune ecriture", async () => {
    okSession();
    const res = await POST(makeReq({ content: CANONICAL_CSV }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("dry-run");
    expect(body.preview.dailyRows).toBe(1);
    expect(startImportBatch).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it("commit CSV canonique : start -> tx -> complete", async () => {
    okSession();
    const res = await POST(makeReq({ content: CANONICAL_CSV, search: "?commit=true" }));
    expect(res.status).toBe(200);
    expect(order).toEqual(["start", "tx", "complete"]);
    expect(startImportBatch.mock.calls[0]![1].sourceProfile).toBe("PLANNING");
  });

  it("XLSX RX matriciel (format=rx) : parse le workbook et applique le commit", async () => {
    okSession();
    const buf = makeRxWorkbookBuffer();
    const res = await POST(
      makeReq({
        content: buf,
        fileName: "CYF26-planning.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        search: "?commit=true&format=rx",
      })
    );
    expect(res.status).toBe(200);
    // Le decoupage quotidien produit 2 lignes (16 et 17 septembre).
    const rowsArg = applyPlanningCommit.mock.calls[0]![1] as { date: string }[];
    expect(rowsArg.length).toBe(2);
    expect(rowsArg.map((r) => r.date).sort()).toEqual(["2026-09-16", "2026-09-17"]);
    expect(order).toEqual(["start", "tx", "complete"]);
  });

  it("XLSX RX en dry-run : parse mais aucune ecriture", async () => {
    okSession();
    const buf = makeRxWorkbookBuffer();
    const res = await POST(
      makeReq({
        content: buf,
        fileName: "CYF26-planning.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        search: "?format=rx",
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.preview.dailyRows).toBe(2);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("commit echec -> FAILED, jamais COMPLETED", async () => {
    okSession();
    applyPlanningCommit.mockRejectedValue(new Error("boom"));
    const res = await POST(makeReq({ content: CANONICAL_CSV, search: "?commit=true" }));
    expect(res.status).toBe(500);
    expect(order).toEqual(["start", "tx", "fail"]);
  });

  it("REPLACE refuse", async () => {
    okSession();
    const res = await POST(makeReq({ content: CANONICAL_CSV, search: "?commit=true&mode=REPLACE" }));
    expect(res.status).toBe(400);
  });
});
