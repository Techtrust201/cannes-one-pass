import { describe, it, expect, vi } from "vitest";
import {
  computeFileHashSha256,
  startImportBatch,
  completeImportBatch,
  failImportBatch,
  findLastCompletedBatchByHash,
  EMPTY_COUNTERS,
  type ImportBatchDb,
} from "./import-batch";

type CreateFn = ImportBatchDb["importBatch"]["create"];
type UpdateFn = ImportBatchDb["importBatch"]["update"];
type FindFirstFn = ImportBatchDb["importBatch"]["findFirst"];

function makeDb() {
  const create = vi.fn<CreateFn>(async () => ({ id: "batch-1" }));
  const update = vi.fn<UpdateFn>(async () => ({ id: "batch-1" }));
  const findFirst = vi.fn<FindFirstFn>(async () => null);
  const db: ImportBatchDb = { importBatch: { create, update, findFirst } };
  return { db, create, update, findFirst };
}

describe("computeFileHashSha256", () => {
  it("empreinte deterministe et stable", () => {
    const a = computeFileHashSha256("hello");
    const b = computeFileHashSha256("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("contenus differents -> empreintes differentes", () => {
    expect(computeFileHashSha256("a")).not.toBe(computeFileHashSha256("b"));
  });
});

describe("startImportBatch", () => {
  it("cree un lot en PROCESSING avec les champs attendus", async () => {
    const { db, create } = makeDb();
    const res = await startImportBatch(db, {
      organizationId: "org-rx",
      eventId: "evt-1",
      userId: "user-1",
      sourceProfile: "REFERENTIAL",
      fileName: "referentiel.csv",
      fileHashSha256: "abc",
    });
    expect(res.id).toBe("batch-1");
    expect(create).toHaveBeenCalledOnce();
    const data = create.mock.calls[0]![0].data;
    expect(data.status).toBe("PROCESSING");
    expect(data.organizationId).toBe("org-rx");
    expect(data.sourceProfile).toBe("REFERENTIAL");
  });

  it("tolere eventId/userId absents (null)", async () => {
    const { db, create } = makeDb();
    await startImportBatch(db, {
      organizationId: "org-rx",
      sourceProfile: "PLANNING",
      fileName: "planning.csv",
      fileHashSha256: "def",
    });
    const data = create.mock.calls[0]![0].data;
    expect(data.eventId).toBeNull();
    expect(data.userId).toBeNull();
  });
});

describe("completeImportBatch", () => {
  it("passe le lot en COMPLETED avec compteurs et completedAt", async () => {
    const { db, update } = makeDb();
    await completeImportBatch(db, "batch-1", {
      ...EMPTY_COUNTERS,
      created: 5,
      updated: 2,
    });
    const call = update.mock.calls[0]![0];
    expect(call.where).toEqual({ id: "batch-1" });
    expect(call.data.status).toBe("COMPLETED");
    expect(call.data.created).toBe(5);
    expect(call.data.updated).toBe(2);
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });
});

describe("failImportBatch", () => {
  it("passe le lot en FAILED en conservant la trace", async () => {
    const { db, update } = makeDb();
    await failImportBatch(db, "batch-1", { errorCount: 3, summary: { reason: "boom" } });
    const call = update.mock.calls[0]![0];
    expect(call.data.status).toBe("FAILED");
    expect(call.data.errorCount).toBe(3);
    expect(call.data.summary).toEqual({ reason: "boom" });
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });
});

describe("findLastCompletedBatchByHash", () => {
  it("interroge le dernier lot COMPLETED pour cette empreinte", async () => {
    const { db, findFirst } = makeDb();
    findFirst.mockResolvedValueOnce({ id: "prev-batch" });
    const res = await findLastCompletedBatchByHash(db, {
      organizationId: "org-rx",
      sourceProfile: "REFERENTIAL",
      fileHashSha256: "abc",
    });
    expect(res).toEqual({ id: "prev-batch" });
    const where = findFirst.mock.calls[0]![0].where;
    expect(where.status).toBe("COMPLETED");
    expect(where.fileHashSha256).toBe("abc");
  });
});
