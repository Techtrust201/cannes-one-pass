import { describe, it, expect, vi, beforeEach } from "vitest";

// Ordre d'appels observe (pour prouver : ImportBatch hors tx, puis tx, puis COMPLETED/FAILED).
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

const applyReferentialCommit = vi.fn();
vi.mock("@/lib/imports/referential-commit", () => ({
  applyReferentialCommit: (...args: unknown[]) => applyReferentialCommit(...args),
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
const failImportBatch = batch.failImportBatch as unknown as ReturnType<typeof vi.fn>;

const VALID_CSV =
  "PORT,ZONE T-T,COMPANY NAME,NUM-TERRE,NUM-FLOT\nPORT CANTO,POWER,Sunseeker,POWER 209,POWER 210\n";

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
    fd.set("file", new File([opts.content], opts.fileName ?? "ref.csv", { type: opts.mime ?? "text/csv" }));
  }
  if (opts.org !== null) fd.set("organizationId", opts.org ?? "org-rx");
  if (opts.event !== null) fd.set("eventId", opts.event ?? "evt-rx");
  const url = new URL("http://localhost/api/admin/import/referential" + (opts.search ?? ""));
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
  applyReferentialCommit.mockResolvedValue({
    counters: { analyzed: 1, created: 1, updated: 0, unchanged: 0, skipped: 0, errors: 0, deactivated: 0 },
    exhibitorsCreated: 1,
    exhibitorsUpdated: 0,
    exhibitorsUnchanged: 0,
    locationsCreated: 2,
    locationsUpdated: 0,
    locationsUnchanged: 0,
  });
});

describe("POST /api/admin/import/referential — securite", () => {
  it("non authentifie -> refus (Response propagee)", async () => {
    requirePermission.mockRejectedValue(new Response("Non authentifie", { status: 401 }));
    const res = await POST(makeReq({ content: VALID_CSV }));
    expect(res.status).toBe(401);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("permission absente -> 403", async () => {
    requirePermission.mockRejectedValue(new Response("Acces refuse", { status: 403 }));
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    expect(res.status).toBe(403);
  });

  it("anti-IDOR : utilisateur RX ne peut importer dans le Palais -> 403", async () => {
    requirePermission.mockResolvedValue({ user: { id: "u-rx" } });
    getAccessibleOrganizationIds.mockResolvedValue(["org-rx"]);
    const res = await POST(makeReq({ content: VALID_CSV, org: "org-palais", search: "?commit=true" }));
    expect(res.status).toBe(403);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("anti-IDOR : event d'une autre organisation -> refus", async () => {
    requirePermission.mockResolvedValue({ user: { id: "u-rx" } });
    getAccessibleOrganizationIds.mockResolvedValue(["org-rx"]);
    assertEventBelongsToOrg.mockRejectedValue(
      new Response("L'event ne correspond pas a l'organisation cible", { status: 400 })
    );
    const res = await POST(makeReq({ content: VALID_CSV, event: "evt-palais", search: "?commit=true" }));
    expect(res.status).toBe(400);
  });

  it("permission demandee = GESTION_ESPACES en ecriture", async () => {
    okSession();
    await POST(makeReq({ content: VALID_CSV }));
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "GESTION_ESPACES", "write");
  });
});

describe("POST /api/admin/import/referential — dry-run / commit / atomicite", () => {
  it("dry-run : aucune ecriture (pas d'ImportBatch, pas de transaction)", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("dry-run");
    expect(startImportBatch).not.toHaveBeenCalled();
    expect(applyReferentialCommit).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it("commit succes : ImportBatch (hors tx) -> tx -> COMPLETED, fileHash utilise", async () => {
    okSession();
    const res = await POST(makeReq({ content: VALID_CSV, search: "?commit=true" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("commit");
    expect(order).toEqual(["start", "tx", "complete"]);
    // fileHashSha256 reellement transmis (64 hex).
    const startArgs = startImportBatch.mock.calls[0]![1];
    expect(startArgs.fileHashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(startArgs.sourceProfile).toBe("REFERENTIAL");
  });

  it("commit : org/event issus du contexte serveur (organizationId du fichier ignore)", async () => {
    okSession();
    const csvWithBogusOrg =
      "ORGANIZATIONID,PORT,ZONE T-T,COMPANY NAME,NUM-TERRE\norg-INJECTEE,PORT CANTO,POWER,Sunseeker,POWER 209\n";
    await POST(makeReq({ content: csvWithBogusOrg, search: "?commit=true" }));
    const ctxArg = applyReferentialCommit.mock.calls[0]![2];
    expect(ctxArg.organizationId).toBe("org-rx");
    expect(ctxArg.eventId).toBe("evt-rx");
  });

  it("commit echec : rollback (tx) puis ImportBatch FAILED, jamais COMPLETED", async () => {
    okSession();
    applyReferentialCommit.mockRejectedValue(new Error("boom"));
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

  it("erreurs de parsing (ligne sans emplacement) -> 422, aucune ecriture", async () => {
    okSession();
    const csv = "PORT,ZONE T-T,COMPANY NAME,NUM-TERRE\nPORT CANTO,POWER,SansPlace,\n";
    const res = await POST(makeReq({ content: csv, search: "?commit=true" }));
    expect(res.status).toBe(422);
    expect(startImportBatch).not.toHaveBeenCalled();
  });

  it("type de fichier non supporte -> 400 (garde MIME/extension)", async () => {
    okSession();
    const res = await POST(
      makeReq({ content: VALID_CSV, fileName: "ref.txtx", mime: "application/x-unknown", search: "?commit=true" })
    );
    expect(res.status).toBe(400);
    expect(startImportBatch).not.toHaveBeenCalled();
  });
});
