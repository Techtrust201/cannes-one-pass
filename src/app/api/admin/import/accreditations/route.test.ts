import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/imports/import-request", () => ({
  parseImportRequest: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    user: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
  };
  return { prisma: prismaMock, default: prismaMock };
});

vi.mock("@/lib/imports/file-parse", async () => {
  const actual = await vi.importActual<typeof import("@/lib/imports/file-parse")>(
    "@/lib/imports/file-parse"
  );
  return {
    ...actual,
    parseImportFile: vi.fn(() => ({ headers: [], rawHeaders: [], records: [] })),
  };
});

vi.mock("@/lib/imports/accreditations", () => ({
  parseAccreditationsTable: vi.fn(),
}));

vi.mock("@/lib/imports/accreditations-preview", () => ({
  previewAccreditationsBatch: vi.fn(),
}));

vi.mock("@/lib/imports/accreditations-commit", () => ({
  commitAccreditationsBatch: vi.fn(),
}));

vi.mock("@/lib/imports/import-batch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/imports/import-batch")>(
    "@/lib/imports/import-batch"
  );
  return {
    ...actual,
    findLastCompletedBatchByHash: vi.fn(async () => null),
  };
});

vi.mock("@/lib/rx-capacity-service", () => ({
  getRxAvailability: vi.fn(),
}));

import { POST } from "./route";
import { parseImportRequest } from "@/lib/imports/import-request";
import prisma from "@/lib/prisma";
import { parseAccreditationsTable } from "@/lib/imports/accreditations";
import { previewAccreditationsBatch } from "@/lib/imports/accreditations-preview";
import { commitAccreditationsBatch } from "@/lib/imports/accreditations-commit";
import { findLastCompletedBatchByHash } from "@/lib/imports/import-batch";

const mockParseImportRequest = parseImportRequest as unknown as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockOrgFindUnique = prisma.organization.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockEventFindUnique = prisma.event.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockParseAccreditationsTable = parseAccreditationsTable as unknown as ReturnType<typeof vi.fn>;
const mockPreviewBatch = previewAccreditationsBatch as unknown as ReturnType<typeof vi.fn>;
const mockCommitBatch = commitAccreditationsBatch as unknown as ReturnType<typeof vi.fn>;
const mockFindLastCompletedBatch = findLastCompletedBatchByHash as unknown as ReturnType<typeof vi.fn>;

function makeReq(search = ""): NextRequest {
  const fd = new FormData();
  fd.set("file", new File(["a,b\n1,2\n"], "acc.csv", { type: "text/csv" }));
  fd.set("organizationId", "org-1");
  fd.set("eventId", "evt-1");
  const url = new URL("http://localhost/api/admin/import/accreditations" + search);
  return { formData: async () => fd, nextUrl: url } as unknown as NextRequest;
}

function baseCtx(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u-1",
    organizationId: "org-1",
    eventId: "evt-1",
    fileName: "acc.csv",
    mimeType: "text/csv",
    fileBuffer: new Uint8Array([1, 2, 3]),
    commit: false,
    mode: "FUSION",
    format: "canonical",
    ...overrides,
  };
}

function baseParseResult(overrides: Record<string, unknown> = {}) {
  return { template: "palais", rows: [{ line: 1 }], totalRows: 1, errors: [], warnings: [], ...overrides };
}

function baseLine(overrides: Record<string, unknown> = {}) {
  return { line: 1, valid: true, errors: [], warnings: [], ...overrides };
}

function basePreviewResult(overrides: Partial<{ ok: boolean; lines: unknown[]; fileErrors: unknown[]; batchCapacityErrors: unknown[] }> = {}) {
  return {
    public: {
      ok: true,
      template: "palais",
      importMode: "PENDING",
      totalRows: 1,
      fileErrors: [],
      lines: [baseLine()],
      quotaGroups: [],
      batchCapacityErrors: [],
      ...overrides,
    },
    internalLinePlans: [
      {
        line: 1,
        command: {},
        context: {},
        preview: { ok: true, recipientEmail: "a@b.com" },
      },
    ],
  };
}

function baseCommitSuccess(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    batchId: "batch-1",
    created: [{ line: 1, accreditationId: "acc-1" }],
    counters: { created: 1, updated: 0, unchanged: 0, deactivated: 0, errorCount: 0 },
    emailResults: [{ line: 1, accreditationId: "acc-1", recipient: "a@b.com", outcome: "sent" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Le mock doit refleter le vrai comportement de `parseImportRequest` :
  // `commit` vient du query param `?commit=true` de la requete recue.
  mockParseImportRequest.mockImplementation(async (req: NextRequest) =>
    baseCtx({ commit: req.nextUrl.searchParams.get("commit") === "true" })
  );
  mockUserFindUnique.mockResolvedValue({ role: "ADMIN" });
  mockOrgFindUnique.mockResolvedValue({ slug: "palais", formTemplate: "palais" });
  mockEventFindUnique.mockResolvedValue({ slug: "evt-slug" });
  mockParseAccreditationsTable.mockReturnValue(baseParseResult());
  mockPreviewBatch.mockResolvedValue(basePreviewResult());
  mockFindLastCompletedBatch.mockResolvedValue(null);
  mockCommitBatch.mockResolvedValue(baseCommitSuccess());
});

describe("POST /api/admin/import/accreditations — securite", () => {
  it("1. non authentifie -> 401", async () => {
    mockParseImportRequest.mockRejectedValue(new Response("x", { status: 401 }));
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("2. permission absente -> 403", async () => {
    mockParseImportRequest.mockRejectedValue(
      new Response("Acces refuse a la fonctionnalite CREER", { status: 403 })
    );
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it("3. organisation hors perimetre -> 403", async () => {
    mockParseImportRequest.mockRejectedValue(new Response("Organisation hors de votre perimetre", { status: 403 }));
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it("4. event d'une autre organisation -> 400", async () => {
    mockParseImportRequest.mockRejectedValue(new Response("Event incoherent", { status: 400 }));
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
  });

  it("permission demandee = CREER en ecriture", async () => {
    await POST(makeReq());
    expect(mockParseImportRequest).toHaveBeenCalledWith(expect.anything(), "CREER");
  });
});

describe("POST /api/admin/import/accreditations — dry-run", () => {
  it("5. dry-run : aucune ecriture (commit jamais appele)", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockCommitBatch).not.toHaveBeenCalled();
  });

  it("6. dry-run Palais valide -> 200 ok true", async () => {
    const res = await POST(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.commit).toBe(false);
    expect(body.preview.template).toBe("palais");
    expect(typeof body.fileHashSha256).toBe("string");
  });

  it("7. dry-run RX valide -> template rx propage au parseur", async () => {
    mockOrgFindUnique.mockResolvedValue({ slug: "rx", formTemplate: "rx" });
    mockParseAccreditationsTable.mockReturnValue(baseParseResult({ template: "rx" }));
    mockPreviewBatch.mockResolvedValue(basePreviewResult({}));
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockParseAccreditationsTable).toHaveBeenCalledWith(expect.anything(), { template: "rx" });
  });

  it("8. PENDING (defaut) propage importMode=PENDING au preview", async () => {
    await POST(makeReq());
    const ctxArg = mockPreviewBatch.mock.calls[0]![2];
    expect(ctxArg.importMode).toBe("PENDING");
  });

  it("9. VALIDATED non SUPER_ADMIN refuse -> 403", async () => {
    mockUserFindUnique.mockResolvedValue({ role: "ADMIN" });
    const res = await POST(makeReq("?importMode=VALIDATED"));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("VALIDATED_IMPORT_FORBIDDEN");
    expect(mockPreviewBatch).not.toHaveBeenCalled();
  });

  it("10. VALIDATED SUPER_ADMIN accepte", async () => {
    mockUserFindUnique.mockResolvedValue({ role: "SUPER_ADMIN" });
    const res = await POST(makeReq("?importMode=VALIDATED"));
    expect(res.status).toBe(200);
    const ctxArg = mockPreviewBatch.mock.calls[0]![2];
    expect(ctxArg.importMode).toBe("VALIDATED");
  });

  it("16. fichier sensible (FORBIDDEN_COLUMN) -> preview.ok=false en dry-run", async () => {
    mockPreviewBatch.mockResolvedValue(
      basePreviewResult({
        ok: false,
        fileErrors: [{ line: 1, column: "_row", reason: "FORBIDDEN_COLUMN: organizationId" }],
        lines: [],
      })
    );
    const res = await POST(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.preview.fileErrors.length).toBeGreaterThan(0);
  });
});

describe("POST /api/admin/import/accreditations — commit : blocages", () => {
  it("11. preview invalide -> 400 PREVIEW_INVALID, commit jamais appele", async () => {
    mockPreviewBatch.mockResolvedValue(
      basePreviewResult({ ok: false, lines: [baseLine({ valid: false, errors: [{ line: 1, column: "_row", reason: "x" }] })] })
    );
    const res = await POST(makeReq("?commit=true"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("PREVIEW_INVALID");
    expect(mockCommitBatch).not.toHaveBeenCalled();
  });

  it("12. quota de lot depasse -> 409 BATCH_CAPACITY_EXCEEDED", async () => {
    mockPreviewBatch.mockResolvedValue(
      basePreviewResult({
        batchCapacityErrors: [
          { code: "BATCH_CAPACITY_EXCEEDED", zone: "POWER", date: "2026-09-16", startTime: "08:00", endTime: "17:00", vehicleFamily: "LIGHT", phase: "MONTAGE", remaining: 1, requestedCount: 3, exceededBy: 2, lines: [1] },
        ],
      })
    );
    const res = await POST(makeReq("?commit=true"));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("BATCH_CAPACITY_EXCEEDED");
    expect(mockCommitBatch).not.toHaveBeenCalled();
  });

  it("13. doublons sans confirmation -> 409 DUPLICATES_CONFIRMATION_REQUIRED", async () => {
    mockParseAccreditationsTable.mockReturnValue(
      baseParseResult({ warnings: [{ line: 2, column: "_row", reason: "DUPLICATE_ROWS: ligne identique a la ligne 1." }] })
    );
    const res = await POST(makeReq("?commit=true"));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("DUPLICATES_CONFIRMATION_REQUIRED");
    expect(mockCommitBatch).not.toHaveBeenCalled();
  });

  it("14. doublons confirmes -> commit execute", async () => {
    mockParseAccreditationsTable.mockReturnValue(
      baseParseResult({ warnings: [{ line: 2, column: "_row", reason: "DUPLICATE_ROWS: ligne identique a la ligne 1." }] })
    );
    const res = await POST(makeReq("?commit=true&confirmDuplicates=true"));
    expect(res.status).toBe(201);
    expect(mockCommitBatch).toHaveBeenCalledOnce();
  });

  it("15. reimport du meme fichier sans confirmation -> 409 REIMPORT_CONFIRMATION_REQUIRED", async () => {
    mockUserFindUnique.mockResolvedValue({ role: "SUPER_ADMIN" });
    mockFindLastCompletedBatch.mockResolvedValue({ id: "prev-batch" });
    const res = await POST(makeReq("?commit=true"));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("REIMPORT_CONFIRMATION_REQUIRED");
    expect(mockCommitBatch).not.toHaveBeenCalled();
  });

  it("reimport confirme par un non SUPER_ADMIN reste bloque", async () => {
    mockUserFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockFindLastCompletedBatch.mockResolvedValue({ id: "prev-batch" });
    const res = await POST(makeReq("?commit=true&confirmReimport=true"));
    expect(res.status).toBe(409);
    expect(mockCommitBatch).not.toHaveBeenCalled();
  });

  it("15b. reimport confirme par SUPER_ADMIN -> commit execute", async () => {
    mockUserFindUnique.mockResolvedValue({ role: "SUPER_ADMIN" });
    mockFindLastCompletedBatch.mockResolvedValue({ id: "prev-batch" });
    const res = await POST(makeReq("?commit=true&confirmReimport=true"));
    expect(res.status).toBe(201);
    expect(mockCommitBatch).toHaveBeenCalledOnce();
  });

  it("16b. fichier sensible en commit -> 400 PREVIEW_INVALID (jamais de commit)", async () => {
    mockPreviewBatch.mockResolvedValue(
      basePreviewResult({
        ok: false,
        fileErrors: [{ line: 1, column: "_row", reason: "FORBIDDEN_COLUMN: status" }],
        lines: [],
      })
    );
    const res = await POST(makeReq("?commit=true"));
    expect(res.status).toBe(400);
    expect(mockCommitBatch).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/import/accreditations — commit : succes et echecs", () => {
  it("17. commit reussi -> 201 avec ids et emailSummary", async () => {
    const res = await POST(makeReq("?commit=true"));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.created).toBe(1);
    expect(body.accreditationIds).toEqual(["acc-1"]);
    expect(body.emailSummary.sent).toBe(1);
    expect(body.emailSummary.allSucceeded).toBe(true);
    expect(mockCommitBatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ organizationId: "org-1", eventId: "evt-1", importMode: "PENDING" })
    );
  });

  it("18. e-mail partiellement echoue -> toujours HTTP 201", async () => {
    mockCommitBatch.mockResolvedValue(
      baseCommitSuccess({
        emailResults: [{ line: 1, accreditationId: "acc-1", recipient: "a@b.com", outcome: "failed" }],
      })
    );
    const res = await POST(makeReq("?commit=true"));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.emailSummary.failed).toBe(1);
    expect(body.emailSummary.allSucceeded).toBe(false);
  });

  it("19. erreur de transaction -> reponse controlee 500, jamais de stack trace brute", async () => {
    mockCommitBatch.mockResolvedValue({
      ok: false,
      batchId: "batch-2",
      status: 500,
      error: "Echec de la transaction d'import (aucune donnee ecrite : transaction annulee).",
      details: "boom",
    });
    const res = await POST(makeReq("?commit=true"));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.batchId).toBe("batch-2");
  });

  it("20. quota change entre preview et commit -> 409 avec code CAPACITY_QUOTA_FULL", async () => {
    mockCommitBatch.mockResolvedValue({
      ok: false,
      batchId: "batch-3",
      status: 409,
      code: "CAPACITY_QUOTA_FULL",
      error: "Creneau complet",
      details: { zone: "POWER" },
    });
    const res = await POST(makeReq("?commit=true"));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("CAPACITY_QUOTA_FULL");
  });
});
