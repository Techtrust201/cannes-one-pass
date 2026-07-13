import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────
// Template registry : schema Zod contrôlé par chaque test (succès/échec),
// pour isoler la logique métier du service de la validation Palais/RX réelle.
const mockSafeParse = vi.fn();
vi.mock("@/templates/accreditation/registry", () => ({
  getTemplate: () => ({ slug: "test", schema: { safeParse: mockSafeParse } }),
}));

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    organization: { findUnique: vi.fn(), findFirst: vi.fn() },
    event: { findUnique: vi.fn() },
    vehicleTypeConfig: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma: prismaMock, default: prismaMock };
});

// auth-helpers est mocké intégralement : `getSession` (route publique par
// défaut) et `assertEventBelongsToOrg` (dynamiquement importé par le moteur).
// Les messages exacts de `assertEventBelongsToOrg` sont définis côté HEAD et
// injectés par les tests event/org pour valider la passthrough de la route.
vi.mock("@/lib/auth-helpers", () => ({
  getSession: vi.fn(),
  requirePermission: vi.fn(),
  getAccessibleEventIdsForEspace: vi.fn(),
  resolveEspaceOrgId: vi.fn(),
  assertEventBelongsToOrg: vi.fn(),
}));

vi.mock("@/lib/history-server", () => ({
  writeHistoryDirect: vi.fn(),
}));

vi.mock("@/lib/accreditation-creation-email", () => ({
  sendAccreditationCreationEmail: vi.fn(),
}));

vi.mock("@/lib/capacity-quota-guard", async () => {
  const actual = await vi.importActual<typeof import("./capacity-quota-guard")>(
    "./capacity-quota-guard"
  );
  return {
    ...actual,
    enforceCapacityQuotas: vi.fn(),
  };
});

import prisma from "@/lib/prisma";
import { getSession, assertEventBelongsToOrg } from "@/lib/auth-helpers";
import { writeHistoryDirect } from "@/lib/history-server";
import { sendAccreditationCreationEmail } from "@/lib/accreditation-creation-email";
import { enforceCapacityQuotas, CapacityQuotaError } from "@/lib/capacity-quota-guard";
import {
  previewAccreditation,
  createAccreditationInTransaction,
  createAccreditation,
  type AccreditationCommand,
} from "./accreditation-service";
import { POST } from "@/app/api/accreditations/route";

type MockedPrisma = {
  organization: { findUnique: Mock; findFirst: Mock };
  event: { findUnique: Mock };
  vehicleTypeConfig: { findMany: Mock };
  user: { findUnique: Mock };
  $transaction: Mock;
};
const mockedPrisma = prisma as unknown as MockedPrisma;

function baseCommand(overrides: AccreditationCommand = {}): AccreditationCommand {
  return {
    organizationSlug: "palais",
    company: "Acme",
    stand: "PALAIS-001",
    unloading: "quai",
    event: "cannes-2026",
    email: "contact@acme.fr",
    vehicles: [
      { plate: "AB-123-CD", size: "L", phoneCode: "+33", phoneNumber: "600000000", date: "2026-05-13", time: "08:00-09:00", city: "Cannes", unloading: "quai" },
    ],
    ...overrides,
  };
}

/** Faux client transactionnel : chaque appel crée des vi.fn() neufs (aucun leak). */
function makeFakeTx(overrides: Record<string, unknown> = {}) {
  return {
    stand: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "stand-1" }),
      update: vi.fn(),
    },
    accreditation: {
      create: vi.fn().mockResolvedValue({ id: "acc-1", vehicles: [] }),
    },
    ...overrides,
  };
}

/** Fabrique une NextRequest minimale pour tester le handler HTTP réel. */
function makeReq(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body, headers: new Headers() } as unknown as Parameters<
    typeof POST
  >[0];
}

beforeEach(() => {
  vi.resetAllMocks();
  mockSafeParse.mockReturnValue({ success: true });
  mockedPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", isActive: true });
  mockedPrisma.organization.findFirst.mockResolvedValue(null);
  mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-1", organizationId: "org-1" });
  mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
  (getSession as Mock).mockResolvedValue(null);
  (assertEventBelongsToOrg as Mock).mockResolvedValue(undefined);
  (sendAccreditationCreationEmail as Mock).mockResolvedValue("sent");
});

// ── previewAccreditation (validations + lectures, aucune écriture) ────────

describe("previewAccreditation", () => {
  it("retourne une erreur 400 si le Zod du template échoue et que le fallback legacy Palais ne s'applique pas", async () => {
    mockSafeParse.mockReturnValue({
      success: false,
      error: { issues: [{ message: "Champ requis" }] },
    });
    const result = await previewAccreditation(baseCommand({ organizationSlug: "rx" }), {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toBe("Champ requis");
    }
  });

  it("accepte le fallback legacy Palais quand le Zod échoue mais que tous les champs legacy sont présents", async () => {
    mockSafeParse.mockReturnValue({ success: false, error: { issues: [{ message: "x" }] } });
    const result = await previewAccreditation(baseCommand(), {});
    expect(result.ok).toBe(true);
  });

  it("bloque sans e-mail destinataire valide, même si le reste du payload est valide", async () => {
    const result = await previewAccreditation(
      baseCommand({ email: undefined, extension: undefined }),
      {}
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/e-mail/i);
    }
  });

  it("respecte une catégorie explicitement fournie plutôt que la déduction automatique", async () => {
    const result = await previewAccreditation(
      baseCommand({ category: "bateau_flot", stand: "PALAIS-001" }),
      { currentUserId: "u1", currentUserRole: "ADMIN" }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.category).toBe("BATEAU_FLOT");
      expect(result.categorySource).toBe("LOGISTICIEN");
    }
  });

  it("déduit automatiquement la catégorie depuis le stand quand aucune catégorie n'est fournie", async () => {
    const result = await previewAccreditation(baseCommand({ stand: "JETEE-042" }), {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.category).toBe("BATEAU_FLOT");
      expect(result.categorySource).toBe("AUTO_DEDUCTION");
    }
  });

  it("détermine le statut ATTENTE pour une création interne (logisticien) et NOUVEAU pour le formulaire public", async () => {
    const internal = await previewAccreditation(baseCommand(), { currentUserId: "u1", currentUserRole: "ADMIN" });
    const publicResult = await previewAccreditation(baseCommand(), {});
    expect(internal.ok && internal.status).toBe("ATTENTE");
    expect(publicResult.ok && publicResult.status).toBe("NOUVEAU");
  });

  it("chemin RX public réussi : org résolue, statut NOUVEAU, candidates prêtes", async () => {
    const result = await previewAccreditation(baseCommand({ organizationSlug: "rx" }), {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.organizationId).toBe("org-1");
      expect(result.eventId).toBe("event-1");
      expect(result.status).toBe("NOUVEAU");
    }
  });

  it("véhicule de reprise : construit une candidate quota DEMONTAGE distincte du MONTAGE", async () => {
    const result = await previewAccreditation(
      baseCommand({
        currentZone: "LA_BOCCA",
        vehicles: [
          {
            vehicleType: "VL",
            plate: "A", size: "L", phoneCode: "+33", phoneNumber: "1", date: "2026-05-13", time: "08:00-09:00", city: "Cannes", unloading: "quai",
            repVehicleType: "PORTEUR", repDate: "2026-05-20", repTime: "10:00-11:00",
          },
        ],
      }),
      {}
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const demontage = result.quotaCandidates.find((c) => c.key.phase === "DEMONTAGE");
      const montage = result.quotaCandidates.find((c) => c.key.phase === "MONTAGE");
      expect(montage).toBeDefined();
      expect(demontage).toBeDefined();
      expect(demontage?.key.date).toBe("2026-05-20");
      expect(demontage?.key.startTime).toBe("10:00");
    }
  });
});

// ── createAccreditationInTransaction (orchestration, tx mockée) ──────────
// NB : ces tests utilisent une transaction mockée — ce sont des tests
// d'orchestration. Les vrais tests d'intégration de rollback PostgreSQL
// restent prévus en Phase 8 (sans Neon production).

describe("createAccreditationInTransaction (orchestration)", () => {
  it("crée le Stand quand il n'existe pas encore, puis crée l'accréditation dans la même transaction", async () => {
    const preview = await previewAccreditation(baseCommand(), {});
    if (!preview.ok) throw new Error("preview should succeed");
    const tx = makeFakeTx();

    await createAccreditationInTransaction(tx as never, preview, {});

    expect(tx.stand.create).toHaveBeenCalledTimes(1);
    expect(tx.accreditation.create).toHaveBeenCalledTimes(1);
    expect(writeHistoryDirect).toHaveBeenCalledWith(expect.objectContaining({ accreditationId: "acc-1" }), tx);
  });

  it("met à jour le secteur d'un Stand existant plutôt que d'en créer un nouveau", async () => {
    const preview = await previewAccreditation(
      baseCommand({ extension: { exhibitor: { sector: "PORT_CANTO" } } }),
      {}
    );
    if (!preview.ok) throw new Error("preview should succeed");
    const tx = makeFakeTx({
      stand: {
        findFirst: vi.fn().mockResolvedValue({ id: "stand-existing" }),
        create: vi.fn(),
        update: vi.fn(),
      },
    });

    await createAccreditationInTransaction(tx as never, preview, {});

    expect(tx.stand.create).not.toHaveBeenCalled();
    expect(tx.stand.update).toHaveBeenCalledWith({
      where: { id: "stand-existing" },
      data: { sector: "PORT_CANTO" },
    });
  });

  it("applique enforceCapacityQuotas uniquement quand des quota candidates sont présentes", async () => {
    const preview = await previewAccreditation(baseCommand(), {});
    if (!preview.ok) throw new Error("preview should succeed");

    await createAccreditationInTransaction(makeFakeTx() as never, { ...preview, quotaCandidates: [] }, {});
    expect(enforceCapacityQuotas).not.toHaveBeenCalled();

    await createAccreditationInTransaction(
      makeFakeTx() as never,
      {
        ...preview,
        quotaCandidates: [
          {
            key: { organizationId: "org-1", eventId: "event-1", zone: "LA_BOCCA", date: "2026-05-13", startTime: "08:00", endTime: "09:00", vehicleFamily: "LIGHT", phase: "MONTAGE" },
            requestedCount: 1,
          },
        ],
      },
      {}
    );
    expect(enforceCapacityQuotas).toHaveBeenCalledTimes(1);
  });

  it("crée une accréditation par véhicule en mode split, avec un historique par accréditation créée", async () => {
    const preview = await previewAccreditation(
      baseCommand({
        splitPerVehicle: true,
        vehicles: [
          { plate: "A", size: "L", phoneCode: "+33", phoneNumber: "1", date: "2026-05-13", time: "08:00-09:00", city: "Cannes", unloading: "quai" },
          { plate: "B", size: "L", phoneCode: "+33", phoneNumber: "2", date: "2026-05-13", time: "08:00-09:00", city: "Cannes", unloading: "quai" },
        ],
      }),
      {}
    );
    if (!preview.ok) throw new Error("preview should succeed");
    const tx = makeFakeTx({
      accreditation: {
        create: vi.fn().mockResolvedValueOnce({ id: "acc-1" }).mockResolvedValueOnce({ id: "acc-2" }),
      },
    });

    const result = await createAccreditationInTransaction(tx as never, preview, {});

    expect(result.kind).toBe("split");
    expect(tx.accreditation.create).toHaveBeenCalledTimes(2);
    expect(writeHistoryDirect).toHaveBeenCalledTimes(2);
  });

  it("génère un publicToken au format base64url (16 caractères) pour chaque accréditation", async () => {
    const preview = await previewAccreditation(baseCommand(), {});
    if (!preview.ok) throw new Error("preview should succeed");
    const tx = makeFakeTx();

    await createAccreditationInTransaction(tx as never, preview, {});

    const data = tx.accreditation.create.mock.calls[0][0].data;
    expect(data.publicToken).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("conserve une plaque RX nullable : plate=null et plateNormalized=null", async () => {
    const preview = await previewAccreditation(
      baseCommand({
        organizationSlug: "rx",
        vehicles: [
          { size: "L", phoneCode: "+33", phoneNumber: "1", date: "2026-05-13", time: "08:00-09:00", city: "Cannes", unloading: "quai" },
        ],
      }),
      {}
    );
    if (!preview.ok) throw new Error("preview should succeed");
    const tx = makeFakeTx();

    await createAccreditationInTransaction(tx as never, preview, {});

    const veh = tx.accreditation.create.mock.calls[0][0].data.vehicles.create[0];
    expect(veh.plate).toBeNull();
    expect(veh.plateNormalized).toBeNull();
  });

  it("conserve les données de reprise (rep*) dans extension.vehicleContext (mode split)", async () => {
    const preview = await previewAccreditation(
      baseCommand({
        splitPerVehicle: true,
        currentZone: "LA_BOCCA",
        vehicles: [
          {
            plate: "A", size: "L", phoneCode: "+33", phoneNumber: "1", date: "2026-05-13", time: "08:00-09:00", city: "Cannes", unloading: "quai",
            repVehicleType: "PORTEUR", repDate: "2026-05-20", repTime: "10:00-11:00",
          },
        ],
      }),
      {}
    );
    if (!preview.ok) throw new Error("preview should succeed");
    const tx = makeFakeTx();

    await createAccreditationInTransaction(tx as never, preview, {});

    const ctx = tx.accreditation.create.mock.calls[0][0].data.extension.vehicleContext;
    expect(ctx.repVehicleType).toBe("PORTEUR");
    expect(ctx.repDate).toBe("2026-05-20");
    expect(ctx.repTime).toBe("10:00-11:00");
  });

  it("figeage référentiel (Phase 4A) : exhibitorId/exhibitorLocationId/locationLabel/locationSnapshot proviennent UNIQUEMENT de context.referential (mode single)", async () => {
    const preview = await previewAccreditation(baseCommand(), {
      referential: {
        exhibitorId: "exh-1",
        exhibitorLocationId: "loc-1",
        locationLabel: "PAN 023",
        locationSnapshot: { portCode: "PORT_CANTO", sectorCode: "POWER" },
      },
    });
    if (!preview.ok) throw new Error("preview should succeed");
    expect(preview.exhibitorId).toBe("exh-1");
    expect(preview.exhibitorLocationId).toBe("loc-1");
    expect(preview.locationLabel).toBe("PAN 023");
    expect(preview.locationSnapshot).toEqual({ portCode: "PORT_CANTO", sectorCode: "POWER" });

    const tx = makeFakeTx();
    await createAccreditationInTransaction(tx as never, preview, {});
    const data = tx.accreditation.create.mock.calls[0]![0].data;
    expect(data.exhibitorId).toBe("exh-1");
    expect(data.exhibitorLocationId).toBe("loc-1");
    expect(data.locationLabel).toBe("PAN 023");
    expect(data.locationSnapshot).toEqual({ portCode: "PORT_CANTO", sectorCode: "POWER" });
  });

  it("figeage référentiel (Phase 4A) : ignore toute tentative d'injection via le payload client (raw.exhibitorId n'est jamais lu)", async () => {
    const preview = await previewAccreditation(
      baseCommand({ exhibitorId: "attacker-exhibitor", exhibitorLocationId: "attacker-loc" }),
      {}
    );
    if (!preview.ok) throw new Error("preview should succeed");
    expect(preview.exhibitorId).toBeNull();
    expect(preview.exhibitorLocationId).toBeNull();
  });

  it("figeage référentiel (Phase 4A) : propagé aussi en mode split (par véhicule)", async () => {
    const preview = await previewAccreditation(baseCommand({ splitPerVehicle: true }), {
      referential: { exhibitorId: "exh-2", exhibitorLocationId: "loc-2", locationLabel: "FLOT 12" },
    });
    if (!preview.ok) throw new Error("preview should succeed");
    const tx = makeFakeTx();
    await createAccreditationInTransaction(tx as never, preview, {});
    const data = tx.accreditation.create.mock.calls[0]![0].data;
    expect(data.exhibitorId).toBe("exh-2");
    expect(data.exhibitorLocationId).toBe("loc-2");
    expect(data.locationLabel).toBe("FLOT 12");
  });

  it("traçabilité de duplication (Phase 4A) : historique CREATED avec changeReason + diff.sourceAccreditationId quand duplicateSourceAccreditationId est fourni par le contexte serveur", async () => {
    const preview = await previewAccreditation(baseCommand(), {
      currentUserId: "u1",
      currentUserRole: "ADMIN",
      duplicateSourceAccreditationId: "parent-42",
    });
    if (!preview.ok) throw new Error("preview should succeed");
    const tx = makeFakeTx();

    await createAccreditationInTransaction(tx as never, preview, {
      currentUserId: "u1",
      currentUserRole: "ADMIN",
      duplicateSourceAccreditationId: "parent-42",
    });

    expect(writeHistoryDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        accreditationId: "acc-1",
        action: "CREATED",
        actorSource: "LOGISTICIEN",
        changeReason: expect.stringContaining("parent-42"),
        diff: { channel: "DUPLICATION", sourceAccreditationId: "parent-42" },
        description: expect.stringContaining("parent-42"),
      }),
      tx
    );
  });

  it("sans duplicateSourceAccreditationId, l'historique reste une création générique (non-régression)", async () => {
    const preview = await previewAccreditation(baseCommand(), {});
    if (!preview.ok) throw new Error("preview should succeed");
    const tx = makeFakeTx();

    await createAccreditationInTransaction(tx as never, preview, {});

    expect(writeHistoryDirect).toHaveBeenCalledWith(
      expect.objectContaining({ accreditationId: "acc-1", description: "Accréditation créée" }),
      tx
    );
    const call = (writeHistoryDirect as Mock).mock.calls[0]![0];
    expect(call.changeReason).toBeUndefined();
    expect(call.diff).toBeUndefined();
  });

  it("propage une erreur d'écriture Stand : create Accreditation non appelé (rollback attendu)", async () => {
    const preview = await previewAccreditation(baseCommand(), {});
    if (!preview.ok) throw new Error("preview should succeed");
    const tx = makeFakeTx({
      stand: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(new Error("stand fail")),
        update: vi.fn(),
      },
    });

    await expect(createAccreditationInTransaction(tx as never, preview, {})).rejects.toThrow("stand fail");
    expect(tx.accreditation.create).not.toHaveBeenCalled();
    expect(writeHistoryDirect).not.toHaveBeenCalled();
  });
});

// ── createAccreditation (orchestrateur complet, $transaction mockée) ─────

describe("createAccreditation (orchestration)", () => {
  it("convertit une CapacityQuotaError levée dans la transaction en résultat 409, sans envoi d'e-mail", async () => {
    const quotaError = new CapacityQuotaError({
      phase: "MONTAGE", zone: "LA_BOCCA", date: "2026-05-13", startTime: "08:00", endTime: "09:00", vehicleFamily: "LIGHT", remaining: 0, requestedCount: 1,
    });
    mockedPrisma.$transaction.mockRejectedValue(quotaError);

    const result = await createAccreditation(baseCommand(), {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("CAPACITY_QUOTA_FULL");
    }
    expect(sendAccreditationCreationEmail).not.toHaveBeenCalled();
  });

  // ── emailOutcome (cas simple) : retourne EXACTEMENT le résultat de
  // sendAccreditationCreationEmail, "failed" seulement si exception. Le
  // contrat existant (4 valeurs) est préservé, jamais de "skipped" générique.
  it("cas simple : e-mail envoyé → 201, emailOutcome=sent", async () => {
    mockedPrisma.$transaction.mockResolvedValue({
      kind: "single",
      accreditation: { id: "acc-1", vehicles: [{ plate: "AB-123-CD", unloading: "quai" }] },
    });
    (sendAccreditationCreationEmail as Mock).mockResolvedValue("sent");

    const result = await createAccreditation(baseCommand(), {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(201);
      expect(result.body.emailOutcome).toBe("sent");
      expect(result.body.id).toBe("acc-1");
    }
    expect(sendAccreditationCreationEmail).toHaveBeenCalledWith({ accreditationId: "acc-1", recipient: "contact@acme.fr" });
  });

  it("cas simple : e-mail en échec (retour failed) → DB réussie, HTTP 201, emailOutcome=failed", async () => {
    mockedPrisma.$transaction.mockResolvedValue({ kind: "single", accreditation: { id: "acc-1", vehicles: [] } });
    (sendAccreditationCreationEmail as Mock).mockResolvedValue("failed");

    const result = await createAccreditation(baseCommand(), {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(201);
      expect(result.body.emailOutcome).toBe("failed");
    }
  });

  it("cas simple : e-mail qui throw → HTTP 201 quand même (résultat métier jamais modifié), emailOutcome=failed", async () => {
    mockedPrisma.$transaction.mockResolvedValue({ kind: "single", accreditation: { id: "acc-1", vehicles: [] } });
    (sendAccreditationCreationEmail as Mock).mockRejectedValue(new Error("smtp down"));

    const result = await createAccreditation(baseCommand(), {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(201);
      expect(result.body.emailOutcome).toBe("failed");
    }
  });

  it("cas simple : e-mail ignoré (organisation désactivée) → 201, emailOutcome=skipped_disabled (jamais 'skipped')", async () => {
    mockedPrisma.$transaction.mockResolvedValue({ kind: "single", accreditation: { id: "acc-1", vehicles: [] } });
    (sendAccreditationCreationEmail as Mock).mockResolvedValue("skipped_disabled");

    const result = await createAccreditation(baseCommand(), {});

    expect(result.ok && result.body.emailOutcome).toBe("skipped_disabled");
  });

  it("cas simple : e-mail ignoré (aucun destinataire) → 201, emailOutcome=skipped_no_recipient (jamais 'skipped')", async () => {
    mockedPrisma.$transaction.mockResolvedValue({ kind: "single", accreditation: { id: "acc-1", vehicles: [] } });
    (sendAccreditationCreationEmail as Mock).mockResolvedValue("skipped_no_recipient");

    const result = await createAccreditation(baseCommand(), {});

    expect(result.ok && result.body.emailOutcome).toBe("skipped_no_recipient");
  });

  // ── emailOutcome (split) : agrégation déterministe sur les 4 valeurs du
  // contrat existant (failed > sent > skipped_no_recipient (si unanime) >
  // skipped_disabled), jamais de "skipped" générique.
  it("split : tous sent → emailOutcome=sent", async () => {
    mockedPrisma.$transaction.mockResolvedValue({ kind: "split", created: [{ id: "acc-1" }, { id: "acc-2" }] });
    (sendAccreditationCreationEmail as Mock).mockResolvedValue("sent");

    const result = await createAccreditation(baseCommand({ splitPerVehicle: true }), {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toEqual({ count: 2, ids: ["acc-1", "acc-2"], emailOutcome: "sent" });
    }
    expect(sendAccreditationCreationEmail).toHaveBeenCalledTimes(2);
  });

  it("split : sent + failed → les deux tentés, HTTP 201, emailOutcome=failed", async () => {
    mockedPrisma.$transaction.mockResolvedValue({ kind: "split", created: [{ id: "acc-1" }, { id: "acc-2" }] });
    (sendAccreditationCreationEmail as Mock)
      .mockResolvedValueOnce("sent")
      .mockRejectedValueOnce(new Error("smtp down"));

    const result = await createAccreditation(baseCommand({ splitPerVehicle: true }), {});

    expect(sendAccreditationCreationEmail).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(201);
      expect(result.body.emailOutcome).toBe("failed");
    }
  });

  it("split : sent + skipped → emailOutcome=sent", async () => {
    mockedPrisma.$transaction.mockResolvedValue({ kind: "split", created: [{ id: "acc-1" }, { id: "acc-2" }] });
    (sendAccreditationCreationEmail as Mock)
      .mockResolvedValueOnce("sent")
      .mockResolvedValueOnce("skipped_no_recipient");

    const result = await createAccreditation(baseCommand({ splitPerVehicle: true }), {});

    expect(result.ok && result.body.emailOutcome).toBe("sent");
  });

  it("split : tous skipped_no_recipient (unanime) → emailOutcome=skipped_no_recipient", async () => {
    mockedPrisma.$transaction.mockResolvedValue({ kind: "split", created: [{ id: "acc-1" }, { id: "acc-2" }] });
    (sendAccreditationCreationEmail as Mock).mockResolvedValue("skipped_no_recipient");

    const result = await createAccreditation(baseCommand({ splitPerVehicle: true }), {});

    expect(result.ok && result.body.emailOutcome).toBe("skipped_no_recipient");
  });

  it("split : tous skipped_disabled → emailOutcome=skipped_disabled", async () => {
    mockedPrisma.$transaction.mockResolvedValue({ kind: "split", created: [{ id: "acc-1" }, { id: "acc-2" }] });
    (sendAccreditationCreationEmail as Mock).mockResolvedValue("skipped_disabled");

    const result = await createAccreditation(baseCommand({ splitPerVehicle: true }), {});

    expect(result.ok && result.body.emailOutcome).toBe("skipped_disabled");
  });

  it("split : mélange skipped_no_recipient + skipped_disabled (non unanime) → emailOutcome=skipped_disabled", async () => {
    mockedPrisma.$transaction.mockResolvedValue({ kind: "split", created: [{ id: "acc-1" }, { id: "acc-2" }] });
    (sendAccreditationCreationEmail as Mock)
      .mockResolvedValueOnce("skipped_no_recipient")
      .mockResolvedValueOnce("skipped_disabled");

    const result = await createAccreditation(baseCommand({ splitPerVehicle: true }), {});

    expect(result.ok && result.body.emailOutcome).toBe("skipped_disabled");
  });

  it("n'expose jamais la valeur générique 'skipped' dans emailOutcome (simple ou split)", async () => {
    const validValues = ["sent", "failed", "skipped_no_recipient", "skipped_disabled"];

    mockedPrisma.$transaction.mockResolvedValue({ kind: "single", accreditation: { id: "acc-1", vehicles: [] } });
    for (const outcome of validValues) {
      (sendAccreditationCreationEmail as Mock).mockResolvedValue(outcome);
      const result = await createAccreditation(baseCommand(), {});
      expect(result.ok && result.body.emailOutcome).not.toBe("skipped");
      expect(result.ok && validValues.includes(result.body.emailOutcome as string)).toBe(true);
    }

    mockedPrisma.$transaction.mockResolvedValue({ kind: "split", created: [{ id: "acc-1" }, { id: "acc-2" }] });
    for (const outcome of validValues) {
      (sendAccreditationCreationEmail as Mock).mockResolvedValue(outcome);
      const result = await createAccreditation(baseCommand({ splitPerVehicle: true }), {});
      expect(result.ok && result.body.emailOutcome).not.toBe("skipped");
      expect(result.ok && validValues.includes(result.body.emailOutcome as string)).toBe(true);
    }
  });

  it("erreur d'écriture Stand dans la transaction : propagée, aucune accréditation, aucun e-mail", async () => {
    const tx = makeFakeTx({
      stand: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(new Error("stand fail")),
        update: vi.fn(),
      },
    });
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    await expect(createAccreditation(baseCommand(), {})).rejects.toThrow("stand fail");
    expect(tx.accreditation.create).not.toHaveBeenCalled();
    expect(sendAccreditationCreationEmail).not.toHaveBeenCalled();
  });

  it("erreur d'écriture Vehicle/Accreditation dans la transaction : propagée, aucun e-mail", async () => {
    const tx = makeFakeTx({
      accreditation: { create: vi.fn().mockRejectedValue(new Error("veh fail")) },
    });
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    await expect(createAccreditation(baseCommand(), {})).rejects.toThrow("veh fail");
    expect(sendAccreditationCreationEmail).not.toHaveBeenCalled();
  });

  it("erreur d'écriture historique dans la transaction : propagée, aucun e-mail", async () => {
    const tx = makeFakeTx();
    (writeHistoryDirect as Mock).mockRejectedValueOnce(new Error("hist fail"));
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    await expect(createAccreditation(baseCommand(), {})).rejects.toThrow("hist fail");
    expect(sendAccreditationCreationEmail).not.toHaveBeenCalled();
  });

  it("propage l'erreur de validation du preview sans ouvrir de transaction", async () => {
    const result = await createAccreditation(baseCommand({ email: undefined, extension: undefined }), {});
    expect(result.ok).toBe(false);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// ── Handler HTTP réel : parité du contrat event/organisation ─────────────

describe("POST /api/accreditations — parité HTTP event/organisation", () => {
  it("Event introuvable : renvoie 400 avec le body texte brut 'Event inconnu' (content-type text/plain)", async () => {
    (assertEventBelongsToOrg as Mock).mockRejectedValue(new Response("Event inconnu", { status: 400 }));

    const res = await POST(makeReq(baseCommand()));

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Event inconnu");
    expect(res.headers.get("content-type") ?? "").toContain("text/plain");
  });

  it("Event d'une autre organisation : renvoie 400 avec le body texte brut exact (cas non fusionné)", async () => {
    (assertEventBelongsToOrg as Mock).mockRejectedValue(
      new Response("L'event ne correspond pas à l'organisation cible", { status: 400 })
    );

    const res = await POST(makeReq(baseCommand()));

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("L'event ne correspond pas à l'organisation cible");
    expect(res.headers.get("content-type") ?? "").toContain("text/plain");
  });

  it("succès : renvoie 201 avec le corps de l'accréditation créée", async () => {
    mockedPrisma.$transaction.mockResolvedValue({
      kind: "single",
      accreditation: { id: "acc-1", vehicles: [] },
    });
    (sendAccreditationCreationEmail as Mock).mockResolvedValue("sent");

    const res = await POST(makeReq(baseCommand()));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("acc-1");
    expect(body.emailOutcome).toBe("sent");
  });

  it("quota plein : renvoie 409 avec le code CAPACITY_QUOTA_FULL", async () => {
    mockedPrisma.$transaction.mockRejectedValue(
      new CapacityQuotaError({
        phase: "MONTAGE", zone: "LA_BOCCA", date: "2026-05-13", startTime: "08:00", endTime: "09:00", vehicleFamily: "LIGHT", remaining: 0, requestedCount: 1,
      })
    );

    const res = await POST(makeReq(baseCommand()));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("CAPACITY_QUOTA_FULL");
  });
});
