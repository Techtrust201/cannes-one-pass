import { describe, it, expect, vi } from "vitest";
import {
  parseArgs,
  validatePurgeGuards,
  computePurgeCounts,
  executeOrganizationPurge,
  formatPurgeCountsReport,
  type PurgeDb,
  type PurgeGuardContext,
} from "./purge-organization";

const FULL_ARGV = [
  "--org-id=11111111-1111-1111-1111-111111111111",
  "--org-slug=rx",
  "--confirm-slug=rx",
  "--execute",
  "--backup-confirmed",
];

describe("parseArgs", () => {
  it("parse tous les arguments attendus", () => {
    const args = parseArgs(FULL_ARGV);
    expect(args).toEqual({
      orgId: "11111111-1111-1111-1111-111111111111",
      orgSlug: "rx",
      confirmSlug: "rx",
      execute: true,
      backupConfirmed: true,
    });
  });

  it("dry-run par défaut : execute=false et backupConfirmed=false si absents", () => {
    const args = parseArgs(["--org-id=abc", "--org-slug=rx"]);
    expect(args.execute).toBe(false);
    expect(args.backupConfirmed).toBe(false);
    expect(args.confirmSlug).toBeNull();
  });

  it("ignore les arguments inconnus sans planter", () => {
    const args = parseArgs(["--unknown-flag", "--org-id=abc"]);
    expect(args.orgId).toBe("abc");
  });
});

function ctx(overrides: Partial<PurgeGuardContext> = {}): PurgeGuardContext {
  return {
    args: {
      orgId: "11111111-1111-1111-1111-111111111111",
      orgSlug: "rx",
      confirmSlug: "rx",
      execute: true,
      backupConfirmed: true,
    },
    envAllowed: true,
    organization: { id: "11111111-1111-1111-1111-111111111111", slug: "rx" },
    ...overrides,
  };
}

describe("validatePurgeGuards — refus absolus", () => {
  it("refuse si des arguments obligatoires manquent", () => {
    const res = validatePurgeGuards(ctx({ args: { ...ctx().args, orgId: null } }));
    expect(res).toEqual({ ok: false, code: "MISSING_ARGS", reason: expect.any(String) });
  });

  it("refuse absolument le slug palais", () => {
    const res = validatePurgeGuards(
      ctx({ args: { ...ctx().args, orgSlug: "palais", confirmSlug: "palais" } })
    );
    expect(res.ok).toBe(false);
    expect((res as { code: string }).code).toBe("FORBIDDEN_SLUG_PALAIS");
  });

  it("refuse tout slug différent de rx", () => {
    const res = validatePurgeGuards(
      ctx({ args: { ...ctx().args, orgSlug: "autre-org", confirmSlug: "autre-org" } })
    );
    expect((res as { code: string }).code).toBe("SLUG_NOT_RX");
  });

  it("refuse si confirm-slug diffère de org-slug", () => {
    const res = validatePurgeGuards(ctx({ args: { ...ctx().args, confirmSlug: "RX" } }));
    expect((res as { code: string }).code).toBe("CONFIRM_SLUG_MISMATCH");
  });

  it("refuse si la variable d'environnement est absente", () => {
    const res = validatePurgeGuards(ctx({ envAllowed: false }));
    expect((res as { code: string }).code).toBe("ENV_VAR_MISSING");
  });

  it("refuse si le backup n'est pas confirmé", () => {
    const res = validatePurgeGuards(ctx({ args: { ...ctx().args, backupConfirmed: false } }));
    expect((res as { code: string }).code).toBe("BACKUP_NOT_CONFIRMED");
  });

  it("refuse si l'organisation est introuvable", () => {
    const res = validatePurgeGuards(ctx({ organization: null }));
    expect((res as { code: string }).code).toBe("ORG_NOT_FOUND");
  });

  it("refuse si l'UUID et le slug ne correspondent pas", () => {
    const res = validatePurgeGuards(
      ctx({ organization: { id: "11111111-1111-1111-1111-111111111111", slug: "autre-slug" } })
    );
    expect((res as { code: string }).code).toBe("UUID_SLUG_MISMATCH");
  });

  it("refuse si l'organisation résolue n'a pas le slug rx (defense en profondeur)", () => {
    const res = validatePurgeGuards(
      ctx({
        args: { ...ctx().args, orgSlug: "rx", confirmSlug: "rx" },
        organization: { id: "11111111-1111-1111-1111-111111111111", slug: "PALAIS" },
      })
    );
    expect((res as { code: string }).code).toBe("UUID_SLUG_MISMATCH");
  });

  it("accepte uniquement la conjonction EXACTE de toutes les protections", () => {
    expect(validatePurgeGuards(ctx())).toEqual({ ok: true });
  });
});

function makeMockDb(overrides: Partial<PurgeDb> = {}): PurgeDb {
  const countModel = () => ({ count: vi.fn(async () => 0), deleteMany: vi.fn(async () => ({ count: 0 })) });
  return {
    accreditation: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    accreditationHistoryArchive: countModel(),
    supportTicket: countModel(),
    exhibitorLocation: countModel(),
    exhibitor: countModel(),
    stand: countModel(),
    rxCapacity: countModel(),
    logisticsPlanning: countModel(),
    importBatch: countModel(),
    ...overrides,
  } as PurgeDb;
}

describe("computePurgeCounts", () => {
  it("scope systématiquement toutes les requêtes par organizationId", async () => {
    const db = makeMockDb({
      accreditation: {
        findMany: vi.fn(async () => [{ id: "acc-1" }, { id: "acc-2" }]),
        count: vi.fn(async () => 2),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
    });
    const counts = await computePurgeCounts(db, "org-rx");
    expect(counts.accreditations).toBe(2);
    expect(db.accreditation.count).toHaveBeenCalledWith({ where: { organizationId: "org-rx" } });
    expect(db.exhibitor.count).toHaveBeenCalledWith({ where: { organizationId: "org-rx" } });
    expect(db.exhibitorLocation.count).toHaveBeenCalledWith({
      where: { exhibitor: { organizationId: "org-rx" } },
    });
  });

  it("ne compte l'historique archivé que si des accréditations existent", async () => {
    const db = makeMockDb();
    await computePurgeCounts(db, "org-rx");
    expect(db.accreditationHistoryArchive.count).not.toHaveBeenCalled();
  });

  it("n'effectue jamais de suppression (lecture seule)", async () => {
    const db = makeMockDb();
    await computePurgeCounts(db, "org-rx");
    for (const model of Object.values(db)) {
      if (typeof model === "object" && model && "deleteMany" in model) {
        expect((model as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany).not.toHaveBeenCalled();
      }
    }
  });
});

describe("executeOrganizationPurge", () => {
  it("supprime dans l'ordre : archive d'abord (pas de cascade), puis les autres tables scopées organizationId", async () => {
    const callOrder: string[] = [];
    const db = makeMockDb({
      accreditation: {
        findMany: vi.fn(async () => [{ id: "acc-1" }]),
        count: vi.fn(async () => 1),
        deleteMany: vi.fn(async () => {
          callOrder.push("accreditation");
          return { count: 1 };
        }),
      },
      accreditationHistoryArchive: {
        count: vi.fn(async () => 0),
        deleteMany: vi.fn(async (args) => {
          callOrder.push("archive");
          expect(args.where.accreditationId.in).toEqual(["acc-1"]);
          return { count: 3 };
        }),
      },
    });
    const counts = await executeOrganizationPurge(db, "org-rx");
    expect(callOrder.indexOf("archive")).toBeLessThan(callOrder.indexOf("accreditation"));
    expect(counts.accreditationHistoryArchive).toBe(3);
    expect(counts.accreditations).toBe(1);
  });

  it("scope chaque deleteMany par organizationId, jamais par un autre critère", async () => {
    const db = makeMockDb();
    await executeOrganizationPurge(db, "org-rx");
    expect(db.stand.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-rx" } });
    expect(db.rxCapacity.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-rx" } });
    expect(db.logisticsPlanning.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-rx" } });
    expect(db.importBatch.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-rx" } });
    expect(db.supportTicket.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-rx" } });
    expect(db.exhibitor.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-rx" } });
    expect(db.exhibitorLocation.deleteMany).toHaveBeenCalledWith({
      where: { exhibitor: { organizationId: "org-rx" } },
    });
  });

  it("ne supprime rien si l'organisation n'a aucune accréditation (archive skip propre)", async () => {
    const db = makeMockDb();
    const counts = await executeOrganizationPurge(db, "org-rx");
    expect(db.accreditationHistoryArchive.deleteMany).not.toHaveBeenCalled();
    expect(counts.accreditationHistoryArchive).toBe(0);
  });
});

describe("formatPurgeCountsReport", () => {
  it("ne contient jamais de secret (aucune URL, aucun mot de passe)", () => {
    const lines = formatPurgeCountsReport({
      accreditations: 1,
      accreditationHistoryArchive: 2,
      supportTickets: 3,
      exhibitorLocations: 4,
      exhibitors: 5,
      stands: 6,
      rxCapacities: 7,
      logisticsPlanningRows: 8,
      importBatches: 9,
    });
    const joined = lines.join(" ");
    expect(joined).not.toMatch(/postgres:\/\//i);
    expect(joined).not.toMatch(/DATABASE_URL/i);
    expect(lines).toHaveLength(9);
  });
});
