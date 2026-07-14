import { describe, it, expect, vi, beforeEach } from "vitest";

const order: string[] = [];

// `accreditation-service.ts` (importActual ci-dessous, pour recuperer la
// VRAIE classe `CapacityQuotaError`) importe transitivement `@/lib/prisma`,
// qui leve si `DATABASE_URL` est absent en CI. Mock minimal pour permettre le
// chargement du module sans connexion reelle (aucune methode n'est appelee).
vi.mock("@/lib/prisma", () => {
  const prismaMock = {};
  return { prisma: prismaMock, default: prismaMock };
});

// Le registre de templates importe des composants JSX (`.tsx`) que le
// pipeline Vitest/Rolldown ne peut pas parser comme module Node pur. Mock
// minimal (jamais appele : `createAccreditationInTransaction` est lui-meme
// mocke ci-dessous) pour permettre le chargement transitif du module.
vi.mock("@/templates/accreditation/registry", () => ({
  getTemplate: () => ({ slug: "test", schema: { safeParse: vi.fn() } }),
}));

vi.mock("@/lib/accreditation-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accreditation-service")>(
    "@/lib/accreditation-service"
  );
  return {
    ...actual,
    createAccreditationInTransaction: vi.fn(),
    createAccreditation: vi.fn(() => {
      throw new Error("createAccreditation ne doit JAMAIS etre utilise par le commit d'import.");
    }),
  };
});

vi.mock("@/lib/accreditation-creation-email", () => ({
  sendAccreditationCreationEmail: vi.fn(),
}));

import {
  applyAccreditationsCommitInTransaction,
  commitAccreditationsBatch,
  type AccreditationsCommitDb,
} from "./accreditations-commit";
import type { InternalAccreditationLinePlan } from "./accreditations-preview";
import * as engine from "@/lib/accreditation-service";
import { sendAccreditationCreationEmail } from "@/lib/accreditation-creation-email";

const createAccreditationInTransaction = engine.createAccreditationInTransaction as unknown as ReturnType<
  typeof vi.fn
>;
const createAccreditation = engine.createAccreditation as unknown as ReturnType<typeof vi.fn>;
const sendEmail = sendAccreditationCreationEmail as unknown as ReturnType<typeof vi.fn>;

function makePlan(
  line: number,
  recipientEmail = `line${line}@example.com`
): InternalAccreditationLinePlan {
  return {
    line,
    command: {} as InternalAccreditationLinePlan["command"],
    context: { channel: "CSV_IMPORT", importMode: "PENDING" } as InternalAccreditationLinePlan["context"],
    preview: {
      ok: true,
      recipientEmail,
      quotaCandidates: [],
    } as unknown as InternalAccreditationLinePlan["preview"],
  };
}

function makeDb() {
  const create = vi.fn(async () => {
    order.push("start");
    return { id: "batch-1" };
  });
  const update = vi.fn(async (args: { data: { status: string } }) => {
    order.push(args.data.status === "COMPLETED" ? "complete" : "fail");
    return { id: "batch-1" };
  });
  const findFirst = vi.fn(async () => null);
  const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => {
    order.push("tx");
    return fn({});
  });
  const db = { importBatch: { create, update, findFirst }, $transaction } as unknown as AccreditationsCommitDb;
  return { db, create, update, findFirst, $transaction };
}

const CTX = {
  organizationId: "org-1",
  eventId: "evt-1",
  userId: "user-1",
  fileName: "acc.csv",
  fileHashSha256: "hash-1",
  importMode: "PENDING" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  createAccreditationInTransaction.mockImplementation(async (_tx, plan: { line?: number }) => ({
    kind: "single",
    accreditation: { id: `acc-${(plan as unknown as { __line?: number }).__line ?? "x"}` },
  }));
  sendEmail.mockResolvedValue("sent");
});

describe("applyAccreditationsCommitInTransaction", () => {
  it("appelle createAccreditationInTransaction une fois par ligne (jamais createAccreditation)", async () => {
    createAccreditationInTransaction.mockImplementation(async (_tx, plan) => ({
      kind: "single",
      accreditation: { id: `acc-${plan === undefined ? "?" : "ok"}` },
    }));
    const plans = [makePlan(1), makePlan(2), makePlan(3)];
    const result = await applyAccreditationsCommitInTransaction({} as never, plans);
    expect(createAccreditationInTransaction).toHaveBeenCalledTimes(3);
    expect(createAccreditation).not.toHaveBeenCalled();
    expect(result.created).toHaveLength(3);
    expect(result.counters.created).toBe(3);
  });

  it("supporte le resultat 'split' (RX, splitPerVehicle) en agregeant tous les ids crees", async () => {
    createAccreditationInTransaction.mockResolvedValueOnce({
      kind: "split",
      created: [{ id: "acc-a" }, { id: "acc-b" }],
    });
    const result = await applyAccreditationsCommitInTransaction({} as never, [makePlan(1)]);
    expect(result.created).toEqual([
      { line: 1, accreditationId: "acc-a" },
      { line: 1, accreditationId: "acc-b" },
    ]);
  });

  it("refuse de committer un plan dont le preview est en echec (garde defensive)", async () => {
    const invalid = { ...makePlan(1), preview: { ok: false } } as InternalAccreditationLinePlan;
    await expect(applyAccreditationsCommitInTransaction({} as never, [invalid])).rejects.toThrow();
    expect(createAccreditationInTransaction).not.toHaveBeenCalled();
  });

  it("une seule ligne en echec propage l'exception (rollback complet attendu par l'appelant)", async () => {
    createAccreditationInTransaction
      .mockResolvedValueOnce({ kind: "single", accreditation: { id: "acc-1" } })
      .mockRejectedValueOnce(new Error("boom ligne 2"));
    await expect(
      applyAccreditationsCommitInTransaction({} as never, [makePlan(1), makePlan(2)])
    ).rejects.toThrow("boom ligne 2");
  });
});

describe("commitAccreditationsBatch — orchestration complete", () => {
  it("21+29. une seule $transaction, aucune transaction imbriquee", async () => {
    const { db, $transaction } = makeDb();
    await commitAccreditationsBatch(db, [makePlan(1), makePlan(2)], CTX);
    expect($transaction).toHaveBeenCalledOnce();
  });

  it("22. createAccreditationInTransaction appele une fois par ligne valide", async () => {
    const { db } = makeDb();
    await commitAccreditationsBatch(db, [makePlan(1), makePlan(2), makePlan(3)], CTX);
    expect(createAccreditationInTransaction).toHaveBeenCalledTimes(3);
    expect(createAccreditation).not.toHaveBeenCalled();
  });

  it("23. rollback global : la transaction entiere echoue si une ligne echoue -> FAILED, aucun COMPLETED", async () => {
    const { db, update } = makeDb();
    createAccreditationInTransaction
      .mockResolvedValueOnce({ kind: "single", accreditation: { id: "acc-1" } })
      .mockRejectedValueOnce(new Error("boom"));
    const res = await commitAccreditationsBatch(db, [makePlan(1), makePlan(2)], CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
    expect(order).toEqual(["start", "tx", "fail"]);
    expect(update).toHaveBeenCalledOnce();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("24. aucun e-mail n'est envoye avant la fin de la transaction", async () => {
    sendEmail.mockImplementation(async () => {
      order.push("email");
      return "sent";
    });
    const { db } = makeDb();
    await commitAccreditationsBatch(db, [makePlan(1)], CTX);
    const txIndex = order.indexOf("tx");
    const emailIndex = order.indexOf("email");
    expect(txIndex).toBeGreaterThanOrEqual(0);
    expect(emailIndex).toBeGreaterThan(txIndex);
  });

  it("25. tous les e-mails sont tentes meme si l'un d'eux echoue", async () => {
    createAccreditationInTransaction
      .mockResolvedValueOnce({ kind: "single", accreditation: { id: "acc-1" } })
      .mockResolvedValueOnce({ kind: "single", accreditation: { id: "acc-2" } });
    sendEmail.mockResolvedValueOnce("sent").mockRejectedValueOnce(new Error("smtp down"));
    const { db } = makeDb();
    const res = await commitAccreditationsBatch(db, [makePlan(1), makePlan(2)], CTX);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.emailResults).toHaveLength(2);
      expect(res.emailResults.map((r) => r.outcome)).toEqual(["sent", "failed"]);
    }
  });

  it("26. completeImportBatch (COMPLETED) appele apres succes", async () => {
    const { db, update } = makeDb();
    const res = await commitAccreditationsBatch(db, [makePlan(1)], CTX);
    expect(res.ok).toBe(true);
    expect(order).toEqual(["start", "tx", "complete"]);
    const call = update.mock.calls[0]![0] as { data: { status: string } };
    expect(call.data.status).toBe("COMPLETED");
  });

  it("27. failImportBatch (FAILED) appele apres echec, jamais COMPLETED", async () => {
    createAccreditationInTransaction.mockRejectedValueOnce(new Error("boom"));
    const { db } = makeDb();
    await commitAccreditationsBatch(db, [makePlan(1)], CTX);
    expect(order).toEqual(["start", "tx", "fail"]);
  });

  it("28. resultats (ids + e-mails) conserves dans la reponse finale", async () => {
    const { db } = makeDb();
    const res = await commitAccreditationsBatch(db, [makePlan(1)], CTX);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.created).toEqual([{ line: 1, accreditationId: "acc-x" }]);
      expect(res.emailResults[0]!.accreditationId).toBe("acc-x");
      expect(res.emailResults[0]!.outcome).toBe("sent");
    }
  });

  it("30. n'utilise jamais createAccreditation (moteur avec transaction propre + email par ligne)", async () => {
    const { db } = makeDb();
    await commitAccreditationsBatch(db, [makePlan(1), makePlan(2)], CTX);
    expect(createAccreditation).not.toHaveBeenCalled();
  });

  it("quota epuise entre preview et commit (CapacityQuotaError) -> 409, rollback, aucun e-mail", async () => {
    const { CapacityQuotaError } = await vi.importActual<typeof import("@/lib/capacity-quota-guard")>(
      "@/lib/capacity-quota-guard"
    );
    createAccreditationInTransaction.mockRejectedValueOnce(
      new CapacityQuotaError({
        zone: "POWER",
        date: "2026-09-16",
        startTime: "08:00",
        endTime: "17:00",
        vehicleFamily: "LIGHT",
        phase: "MONTAGE",
        remaining: 0,
        requestedCount: 1,
      })
    );
    const { db } = makeDb();
    const res = await commitAccreditationsBatch(db, [makePlan(1)], CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.code).toBe("CAPACITY_QUOTA_FULL");
    }
    expect(sendEmail).not.toHaveBeenCalled();
    expect(order).toEqual(["start", "tx", "fail"]);
  });

  it("Phase 6C-B-4 : revalidation référentiel/planning RX échouée AU COMMIT (RxServerValidationError) -> code/statut structuré préservé, rollback, aucun e-mail", async () => {
    const { RxServerValidationError } = await vi.importActual<
      typeof import("@/lib/accreditation-service")
    >("@/lib/accreditation-service");
    createAccreditationInTransaction.mockRejectedValueOnce(
      new RxServerValidationError(409, "Emplacement introuvable pour cet exposant dans ce contexte.", "LOCATION_NOT_FOUND")
    );
    const { db } = makeDb();
    const res = await commitAccreditationsBatch(db, [makePlan(1)], CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.code).toBe("LOCATION_NOT_FOUND");
    }
    expect(sendEmail).not.toHaveBeenCalled();
    expect(order).toEqual(["start", "tx", "fail"]);
  });

  it("garde defensive : un plan invalide transmis au commit -> FAILED immediat, aucune $transaction", async () => {
    const { db, $transaction } = makeDb();
    const invalid = { ...makePlan(1), preview: { ok: false } } as InternalAccreditationLinePlan;
    const res = await commitAccreditationsBatch(db, [invalid], CTX);
    expect(res.ok).toBe(false);
    expect($transaction).not.toHaveBeenCalled();
  });
});
