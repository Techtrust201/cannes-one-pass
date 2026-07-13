import { describe, it, expect, vi } from "vitest";
import { applyPlanningCommit } from "./planning-commit";
import type { PlanningCommitTx } from "./planning-commit";
import type { PlanningRow } from "./planning";

function row(partial: Partial<PlanningRow> = {}): PlanningRow {
  return {
    scope: "SPACE",
    scopeKey: "SPACE:POWER",
    portCode: null,
    sectorCode: null,
    spaceCode: "POWER",
    categoryCode: "BATEAU_TERRE",
    phase: "DEMONTAGE",
    date: "2026-09-16",
    startTime: "08:00",
    endTime: "17:00",
    sourceLine: 2,
    ...partial,
  };
}

type FindManyFn = PlanningCommitTx["logisticsPlanning"]["findMany"];

function makeTx() {
  const findMany = vi.fn<FindManyFn>(async () => []);
  const create = vi.fn<PlanningCommitTx["logisticsPlanning"]["create"]>(async () => ({ id: "p-new" }));
  const update = vi.fn<PlanningCommitTx["logisticsPlanning"]["update"]>(async () => ({}));
  const tx: PlanningCommitTx = { logisticsPlanning: { findMany, create, update } };
  return { tx, findMany, create, update };
}

const CTX = { organizationId: "org-rx", eventId: "evt-1", importBatchId: "batch-1", source: "import" };

describe("applyPlanningCommit — FUSION complete", () => {
  it("1) premier import -> created", async () => {
    const { tx, create } = makeTx();
    const res = await applyPlanningCommit(tx, [row()], CTX);
    expect(create).toHaveBeenCalledOnce();
    expect(res.created).toBe(1);
    expect(res.updated).toBe(0);
    expect(res.unchanged).toBe(0);
    expect(res.counters.deactivated).toBe(0);
  });

  it("2) meme fichier -> unchanged (aucune ecriture)", async () => {
    const { tx, findMany, create, update } = makeTx();
    findMany.mockResolvedValueOnce([{ id: "p-1", startTime: "08:00", endTime: "17:00" }]);
    const res = await applyPlanningCommit(tx, [row()], CTX);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(res.unchanged).toBe(1);
    expect(res.created).toBe(0);
  });

  it("3) horaire modifie -> updated, aucun doublon actif", async () => {
    const { tx, findMany, create, update } = makeTx();
    // Base : 08:00-17:00 ; nouveau fichier : 12:00-17:00 (meme jour-combinaison).
    findMany.mockResolvedValueOnce([{ id: "p-1", startTime: "08:00", endTime: "17:00" }]);
    const res = await applyPlanningCommit(tx, [row({ startTime: "12:00", endTime: "17:00" })], CTX);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    const data = update.mock.calls[0]![0].data;
    expect(update.mock.calls[0]![0].where).toEqual({ id: "p-1" });
    expect(data.startTime).toBe("12:00");
    expect(data.endTime).toBe("17:00");
    expect(res.updated).toBe(1);
    expect(res.created).toBe(0);
    expect(res.counters.deactivated).toBe(0);
  });

  it("4) regle absente du nouveau fichier -> conservee (jamais desactivee)", async () => {
    const { tx, findMany, create, update } = makeTx();
    // Le fichier ne contient QUE POWER/16-09 ; une eventuelle regle JETEE/16-09
    // n'est jamais requetee ni touchee.
    findMany.mockResolvedValueOnce([{ id: "p-1", startTime: "08:00", endTime: "17:00" }]);
    const res = await applyPlanningCommit(tx, [row()], CTX);
    // Une seule combinaison interrogee (celle du fichier).
    expect(findMany).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(res.counters.deactivated).toBe(0);
  });

  it("5) deux creneaux reels le meme jour -> tous deux conserves", async () => {
    const { tx, create } = makeTx();
    const res = await applyPlanningCommit(
      tx,
      [
        row({ startTime: "08:00", endTime: "12:00" }),
        row({ startTime: "14:00", endTime: "18:00" }),
      ],
      CTX
    );
    expect(create).toHaveBeenCalledTimes(2);
    expect(res.created).toBe(2);
  });

  it("6) reimport idempotent -> tout unchanged, aucune ecriture", async () => {
    const { tx, findMany, create, update } = makeTx();
    findMany.mockResolvedValueOnce([
      { id: "p-1", startTime: "08:00", endTime: "12:00" },
      { id: "p-2", startTime: "14:00", endTime: "18:00" },
    ]);
    const res = await applyPlanningCommit(
      tx,
      [
        row({ startTime: "08:00", endTime: "12:00" }),
        row({ startTime: "14:00", endTime: "18:00" }),
      ],
      CTX
    );
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(res.unchanged).toBe(2);
  });

  it("ambigu (plusieurs restes des deux cotes) -> creation + conservation + warning", async () => {
    const { tx, create } = makeTx();
    // Existant : 2 creneaux ; entrant : 2 creneaux totalement differents.
    tx.logisticsPlanning.findMany = vi.fn<FindManyFn>(async () => [
      { id: "p-1", startTime: "06:00", endTime: "07:00" },
      { id: "p-2", startTime: "20:00", endTime: "21:00" },
    ]);
    const res = await applyPlanningCommit(
      tx,
      [
        row({ startTime: "08:00", endTime: "12:00" }),
        row({ startTime: "14:00", endTime: "18:00" }),
      ],
      CTX
    );
    expect(create).toHaveBeenCalledTimes(2);
    expect(res.created).toBe(2);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.counters.deactivated).toBe(0);
  });

  it("cree avec scope/scopeKey/spaceCode/importBatchId", async () => {
    const { tx, create } = makeTx();
    await applyPlanningCommit(tx, [row()], CTX);
    const data = create.mock.calls[0]![0].data;
    expect(data.scope).toBe("SPACE");
    expect(data.scopeKey).toBe("SPACE:POWER");
    expect(data.spaceCode).toBe("POWER");
    expect(data.importBatchId).toBe("batch-1");
  });
});

// ── Cycle FUSION complet sur un lot (DB memoire stateful) ──────────────────
interface StoredRow {
  id: string;
  organizationId: string;
  eventId: string;
  scopeKey: string;
  categoryCode: string;
  phase: string;
  date: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

function makeStatefulTx() {
  const store = new Map<string, StoredRow>();
  let seq = 0;
  const tx: PlanningCommitTx = {
    logisticsPlanning: {
      findMany: async ({ where }) =>
        [...store.values()]
          .filter(
            (r) =>
              r.organizationId === where.organizationId &&
              r.eventId === where.eventId &&
              r.scopeKey === where.scopeKey &&
              r.categoryCode === where.categoryCode &&
              r.phase === where.phase &&
              r.date === where.date &&
              r.isActive === where.isActive
          )
          .map((r) => ({ id: r.id, startTime: r.startTime, endTime: r.endTime })),
      create: async ({ data }) => {
        const id = `p${++seq}`;
        store.set(id, { id, ...(data as Omit<StoredRow, "id">) });
        return { id };
      },
      update: async ({ where: { id }, data }) => {
        const r = store.get(id)!;
        Object.assign(r, data);
        return r;
      },
    },
  };
  return { tx, store };
}

function batch(): PlanningRow[] {
  return [
    row({ scopeKey: "SECTOR:PORT_CANTO:POWER", sectorCode: "POWER", spaceCode: "POWER", scope: "SECTOR", date: "2026-09-16", startTime: "08:00", endTime: "17:00" }),
    row({ scopeKey: "SECTOR:PORT_CANTO:POWER", sectorCode: "POWER", spaceCode: "POWER", scope: "SECTOR", date: "2026-09-17", startTime: "08:00", endTime: "17:00" }),
    row({ scopeKey: "SECTOR:PALAIS:PALAIS_INT_NU", sectorCode: "PALAIS_INT_NU", spaceCode: "INTERIEUR_PALAIS", scope: "SECTOR", categoryCode: "TERRE", date: "2026-09-16", startTime: "08:00", endTime: "18:00" }),
    row({ scopeKey: "SECTOR:PALAIS:PALAIS_INT_EQUIPE", sectorCode: "PALAIS_INT_EQUIPE", spaceCode: "INTERIEUR_PALAIS", scope: "SECTOR", categoryCode: "TERRE", date: "2026-09-16", startTime: "08:00", endTime: "18:00" }),
  ];
}

describe("cycle FUSION complet sur un lot (DB memoire)", () => {
  it("import -> reimport identique -> modification d'un horaire", async () => {
    const { tx, store } = makeStatefulTx();

    // 1) Premier import : tout est cree.
    const r1 = await applyPlanningCommit(tx, batch(), CTX);
    expect(r1.created).toBe(4);
    expect(r1.updated).toBe(0);
    expect(store.size).toBe(4);

    // 2) Reimport identique : 0 creation, 0 modification, tout inchange.
    const r2 = await applyPlanningCommit(tx, batch(), CTX);
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(0);
    expect(r2.unchanged).toBe(4);
    expect(store.size).toBe(4);

    // 3) Modification de l'horaire POWER du 16/09 -> updated=1, aucun doublon.
    const modified = batch();
    modified[0] = { ...modified[0], startTime: "12:00" };
    const r3 = await applyPlanningCommit(tx, modified, CTX);
    expect(r3.updated).toBe(1);
    expect(r3.created).toBe(0);
    expect(r3.unchanged).toBe(3);
    expect(store.size).toBe(4); // pas de nouvelle ligne
    const powerD16 = [...store.values()].find(
      (r) => r.scopeKey === "SECTOR:PORT_CANTO:POWER" && r.date === "2026-09-16"
    )!;
    expect(powerD16.startTime).toBe("12:00");
    expect([...store.values()].every((r) => r.isActive)).toBe(true);
  });
});
