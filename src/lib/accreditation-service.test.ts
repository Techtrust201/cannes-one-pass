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
    // Phase 6C-B-2 : référentiel fiable + planning RX (previewAccreditation).
    exhibitor: { findUnique: vi.fn(), findMany: vi.fn() },
    exhibitorLocation: { findUnique: vi.fn(), findMany: vi.fn() },
    logisticsPlanning: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma: prismaMock, default: prismaMock };
});

describe("dérogation", () => {
  it("ne force pas la capacité et trace les bypass accordés", async () => {
    const preview = await previewAccreditation(baseCommand(), {
      currentUserId: "user-1",
      currentUserRole: "ADMIN",
      derogation: {
        reason: "Créneau exceptionnel validé par l'organisation.",
        byUserId: "user-1",
        capacityBypass: true,
        planningBypass: true,
      },
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const tx = makeFakeTx();
    await createAccreditationInTransaction(tx as never, preview, {
      currentUserId: "user-1",
      currentUserRole: "ADMIN",
      derogation: {
        reason: "Créneau exceptionnel validé par l'organisation.",
        byUserId: "user-1",
        capacityBypass: true,
        planningBypass: true,
      },
    });

    expect(enforceCapacityQuotas).not.toHaveBeenCalled();
    expect(writeHistoryDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        actorSource: "DEROGATION",
        changeReason: "Créneau exceptionnel validé par l'organisation.",
        diff: expect.objectContaining({ capacityBypass: true, planningBypass: true }),
      }),
      tx
    );
  });
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
  exhibitor: { findUnique: Mock; findMany: Mock };
  exhibitorLocation: { findUnique: Mock; findMany: Mock };
  logisticsPlanning: { findMany: Mock };
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

/**
 * Faux client transactionnel : chaque appel crée des vi.fn() neufs (aucun
 * leak). `event.findUnique` par défaut DISABLED (Phase 6C-B-2 : rechargement
 * fiable dans `createAccreditationInTransaction`, RX uniquement) — un test
 * RX TRANSITION/STRICT doit surcharger ce mock explicitement.
 */
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
    event: {
      findUnique: vi.fn().mockResolvedValue({ logisticsPlanningMode: "DISABLED" }),
    },
    exhibitor: { findUnique: vi.fn(), findMany: vi.fn() },
    exhibitorLocation: { findUnique: vi.fn(), findMany: vi.fn() },
    logisticsPlanning: { findMany: vi.fn() },
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

// ── previewAccreditation — contexte CSV_IMPORT (Phase 4B-2) ──────────────
// Politique de création déduite EXCLUSIVEMENT du contexte serveur
// (`channel`/`importMode`), jamais du payload client `command`.

describe("previewAccreditation — politique de création CSV_IMPORT", () => {
  it("1. création publique inchangée : contexte vide → NOUVEAU + PUBLIC_FORM", async () => {
    const result = await previewAccreditation(baseCommand(), {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("NOUVEAU");
      expect(result.actorSource).toBe("PUBLIC_FORM");
    }
  });

  it("2. création logisticien inchangée : currentUserRole=ADMIN → ATTENTE + LOGISTICIEN", async () => {
    const result = await previewAccreditation(baseCommand(), {
      currentUserId: "u1",
      currentUserRole: "ADMIN",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("ATTENTE");
      expect(result.actorSource).toBe("LOGISTICIEN");
    }
  });

  it("3. création super-admin inchangée : currentUserRole=SUPER_ADMIN → ATTENTE + SUPER_ADMIN", async () => {
    const result = await previewAccreditation(baseCommand(), {
      currentUserId: "u1",
      currentUserRole: "SUPER_ADMIN",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("ATTENTE");
      expect(result.actorSource).toBe("SUPER_ADMIN");
    }
  });

  it("4. CSV_IMPORT + importMode=PENDING → NOUVEAU + CSV_IMPORT", async () => {
    const result = await previewAccreditation(baseCommand(), {
      channel: "CSV_IMPORT",
      importMode: "PENDING",
      currentUserId: "u1",
      currentUserRole: "SUPER_ADMIN",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("NOUVEAU");
      expect(result.actorSource).toBe("CSV_IMPORT");
    }
  });

  it("5. CSV_IMPORT + importMode=VALIDATED → ATTENTE + CSV_IMPORT", async () => {
    const result = await previewAccreditation(baseCommand(), {
      channel: "CSV_IMPORT",
      importMode: "VALIDATED",
      currentUserId: "u1",
      currentUserRole: "SUPER_ADMIN",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("ATTENTE");
      expect(result.actorSource).toBe("CSV_IMPORT");
    }
  });

  it("6. catégorie explicite fournie en CSV_IMPORT → categorySource=CSV_IMPORT (jamais forcé LOGISTICIEN)", async () => {
    const result = await previewAccreditation(
      baseCommand({ category: "bateau_flot" }),
      { channel: "CSV_IMPORT", importMode: "PENDING" }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.category).toBe("BATEAU_FLOT");
      expect(result.categorySource).toBe("CSV_IMPORT");
    }
  });

  it("7. catégorie auto-déduite en CSV_IMPORT (aucune catégorie fournie) → categorySource=AUTO_DEDUCTION", async () => {
    const result = await previewAccreditation(
      baseCommand({ category: undefined, stand: "JETEE-042" }),
      { channel: "CSV_IMPORT", importMode: "PENDING" }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.categorySource).toBe("AUTO_DEDUCTION");
    }
  });

  it("8. status injecté dans le payload client est ignoré (toujours déduit du contexte serveur)", async () => {
    const result = await previewAccreditation(
      baseCommand({ status: "ATTENTE" }),
      { channel: "CSV_IMPORT", importMode: "PENDING" }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("NOUVEAU");
    }
  });

  it("9. actorSource injecté dans le payload client est ignoré (toujours déduit du contexte serveur)", async () => {
    const result = await previewAccreditation(
      baseCommand({ actorSource: "SUPER_ADMIN" }),
      { channel: "CSV_IMPORT", importMode: "VALIDATED" }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actorSource).toBe("CSV_IMPORT");
    }
  });

  it("10. contexte CSV_IMPORT sans importMode → erreur contrôlée INVALID_CREATION_CONTEXT", async () => {
    const result = await previewAccreditation(baseCommand(), {
      channel: "CSV_IMPORT",
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_CREATION_CONTEXT");
    }
  });

  it("11. importMode fourni sans channel CSV_IMPORT → erreur contrôlée INVALID_CREATION_CONTEXT", async () => {
    const result = await previewAccreditation(baseCommand(), {
      importMode: "PENDING",
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_CREATION_CONTEXT");
    }
  });

  it("11b. channel inconnu (ni undefined ni CSV_IMPORT) → erreur contrôlée INVALID_CREATION_CONTEXT", async () => {
    const result = await previewAccreditation(baseCommand(), {
      channel: "SOME_OTHER_CHANNEL",
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CREATION_CONTEXT");
    }
  });

  it("12. duplication existante (sans channel CSV) non régressée : statut/actorSource selon inferActorSource classique", async () => {
    const result = await previewAccreditation(baseCommand(), {
      currentUserId: "u1",
      currentUserRole: "ADMIN",
      duplicateSourceAccreditationId: "parent-42",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("ATTENTE");
      expect(result.actorSource).toBe("LOGISTICIEN");
      expect(result.duplicateSourceAccreditationId).toBe("parent-42");
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
            key: { organizationId: "org-1", eventId: "event-1", scopeKey: "ZONE:LA_BOCCA", zone: "LA_BOCCA", date: "2026-05-13", startTime: "08:00", endTime: "09:00", vehicleFamily: "LIGHT", phase: "MONTAGE" },
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

// ── Phase 6C-B-2 : référentiel fiable + planning serveur RX ────────────────
// Utilise les VRAIS `resolveTrustedAccreditationReferential` /
// `validateAccreditationPlanning` / `resolvePlanning` (aucun mock de ces
// modules) : ces tests prouvent l'intégration réelle dans le moteur, pas une
// simple délégation simulée. Seul `prisma`/`tx` (structurel) est mocké.

const RX_EXHIBITOR_ROW = {
  id: "exh-1",
  name: "Sunseeker",
  nameNormalized: "SUNSEEKER",
  externalReference: null,
  organizationId: "org-1",
  eventId: "event-1",
  isActive: true,
};
const RX_LOCATION_ROW = {
  id: "loc-1",
  exhibitorId: "exh-1",
  type: "TERRE",
  code: "PAN 023",
  codeNormalized: "PAN023",
  portCode: "PORT_CANTO",
  sectorCode: "POWER",
  logisticSpace: "EXTERIEUR_PALAIS",
  isActive: true,
};
const RX_REFERENTIAL_INPUT = {
  exhibitorName: "Sunseeker",
  locationCode: "PAN 023",
  locationType: "TERRE" as const,
};

function rxExtension(overrides: Record<string, unknown> = {}) {
  return {
    exhibitor: { name: "Sunseeker" },
    location: { code: "PAN 023", type: "TERRE" },
    categories: [
      {
        categoryId: "stand-tente",
        livDate: "2026-09-06",
        livTime: "08:00-09:00",
        repDate: "2026-09-14",
        repTime: "08:00-09:00",
        vehicles: [{ vehicleType: "VL", plate: "AB-123-CD" }],
      },
    ],
    ...overrides,
  };
}

function rxCommand(overrides: AccreditationCommand = {}): AccreditationCommand {
  return baseCommand({
    organizationSlug: "rx",
    currentZone: "LA_BOCCA",
    extension: rxExtension(),
    vehicles: [
      {
        plate: "AB-123-CD", size: "L", phoneCode: "+33", phoneNumber: "600000000",
        date: "2026-09-06", time: "08:00-09:00", city: "Cannes", unloading: "quai", vehicleType: "VL",
      },
    ],
    ...overrides,
  });
}

function mockRxEvent(mode: "DISABLED" | "TRANSITION" | "STRICT") {
  mockedPrisma.event.findUnique.mockResolvedValue({
    id: "event-1", organizationId: "org-1", logisticsPlanningMode: mode,
  });
}

function mockValidReferential() {
  mockedPrisma.exhibitor.findMany.mockResolvedValue([RX_EXHIBITOR_ROW]);
  mockedPrisma.exhibitorLocation.findMany.mockResolvedValue([RX_LOCATION_ROW]);
}

/** Faux `tx` RX complet (référentiel valide, aucune règle DB → repli legacy). */
function makeFakeRxTx(mode: "DISABLED" | "TRANSITION" | "STRICT", planningRows: unknown[] = []) {
  return makeFakeTx({
    event: { findUnique: vi.fn().mockResolvedValue({ logisticsPlanningMode: mode }) },
    exhibitor: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([RX_EXHIBITOR_ROW]) },
    exhibitorLocation: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([RX_LOCATION_ROW]) },
    logisticsPlanning: { findMany: vi.fn().mockResolvedValue(planningRows) },
  });
}

describe("Phase 6C-B-2 — moteur RX (référentiel + planning serveur, double validation)", () => {
  it("Palais n'appelle aucun validator (aucune lecture exhibitor/exhibitorLocation/logisticsPlanning)", async () => {
    const result = await previewAccreditation(baseCommand(), {});
    expect(result.ok).toBe(true);
    expect(mockedPrisma.exhibitor.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.exhibitor.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.logisticsPlanning.findMany).not.toHaveBeenCalled();
  });

  it("RX DISABLED : comportement historique inchangé — best-effort non bloquant, aucune lecture planning", async () => {
    mockRxEvent("DISABLED");
    mockedPrisma.exhibitor.findMany.mockResolvedValue([]); // exposant introuvable
    const result = await previewAccreditation(rxCommand(), { referentialInput: { exhibitorName: "Inconnu" } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.exhibitorId).toBeNull();
      expect(result.rxPhaseEntries).toEqual([]);
    }
    expect(mockedPrisma.logisticsPlanning.findMany).not.toHaveBeenCalled();
  });

  it("RX TRANSITION : aucune indication référentielle → refusé 400 EXHIBITOR_REQUIRED, aucune lecture planning", async () => {
    mockRxEvent("TRANSITION");
    const result = await previewAccreditation(rxCommand(), { referentialInput: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("EXHIBITOR_REQUIRED");
    }
    expect(mockedPrisma.logisticsPlanning.findMany).not.toHaveBeenCalled();
  });

  it("RX STRICT : aucune indication référentielle → refusé 400 EXHIBITOR_REQUIRED", async () => {
    mockRxEvent("STRICT");
    const result = await previewAccreditation(rxCommand(), { referentialInput: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EXHIBITOR_REQUIRED");
  });

  it("preview appelle les deux validateurs (référentiel PUIS planning) via prisma, jamais via un snapshot client", async () => {
    mockRxEvent("TRANSITION");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]);

    const result = await previewAccreditation(rxCommand(), { referentialInput: RX_REFERENTIAL_INPUT });
    expect(result.ok).toBe(true);
    expect(mockedPrisma.exhibitor.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.logisticsPlanning.findMany).toHaveBeenCalled();
    if (result.ok) {
      // Résolu depuis la DB (exh-1), jamais depuis un éventuel id client.
      expect(result.exhibitorId).toBe("exh-1");
      expect(result.exhibitorLocationId).toBe("loc-1");
      expect(result.rxPhaseEntries.length).toBeGreaterThan(0);
    }
  });

  it("transaction rappelle les deux validateurs via tx (jamais via prisma)", async () => {
    mockRxEvent("TRANSITION");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]);
    const preview = await previewAccreditation(rxCommand(), { referentialInput: RX_REFERENTIAL_INPUT });
    if (!preview.ok) throw new Error("preview should succeed");

    const tx = makeFakeRxTx("TRANSITION");
    await createAccreditationInTransaction(tx as never, preview, { referentialInput: RX_REFERENTIAL_INPUT });

    expect(tx.event.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.exhibitor.findMany).toHaveBeenCalledTimes(1);
    expect(tx.logisticsPlanning.findMany).toHaveBeenCalled();
    // Le preview (prisma) n'est PAS rappelé pendant l'écriture.
    expect(mockedPrisma.exhibitor.findMany).toHaveBeenCalledTimes(1);
    expect(tx.accreditation.create).toHaveBeenCalledTimes(1);
  });

  it("planning modifié après preview (règle DB supprimée, STRICT) → transaction refusée, aucune écriture", async () => {
    mockRxEvent("STRICT");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([
      { scope: "SPACE", scopeKey: "SPACE:EXTERIEUR_PALAIS", categoryCode: "TERRE", phase: "MONTAGE", date: "2026-09-06", startTime: "08:00", endTime: "09:00" },
      { scope: "SPACE", scopeKey: "SPACE:EXTERIEUR_PALAIS", categoryCode: "TERRE", phase: "DEMONTAGE", date: "2026-09-14", startTime: "08:00", endTime: "09:00" },
    ]);
    const preview = await previewAccreditation(rxCommand(), { referentialInput: RX_REFERENTIAL_INPUT });
    if (!preview.ok) throw new Error("preview should succeed");

    // Règle DB supprimée entre preview et commit (ex: admin a fermé le créneau).
    const tx = makeFakeRxTx("STRICT", []);

    await expect(
      createAccreditationInTransaction(tx as never, preview, { referentialInput: RX_REFERENTIAL_INPUT })
    ).rejects.toMatchObject({ status: 409, code: "PLANNING_NOT_FOUND" });
    expect(tx.accreditation.create).not.toHaveBeenCalled();
  });

  it("createAccreditation : rejet transactionnel → réponse structurée, rollback complet, aucun e-mail", async () => {
    mockRxEvent("STRICT");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([
      { scope: "SPACE", scopeKey: "SPACE:EXTERIEUR_PALAIS", categoryCode: "TERRE", phase: "MONTAGE", date: "2026-09-06", startTime: "08:00", endTime: "09:00" },
      { scope: "SPACE", scopeKey: "SPACE:EXTERIEUR_PALAIS", categoryCode: "TERRE", phase: "DEMONTAGE", date: "2026-09-14", startTime: "08:00", endTime: "09:00" },
    ]);
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn(makeFakeRxTx("STRICT", [])) // règle supprimée au commit
    );

    const result = await createAccreditation(rxCommand(), { referentialInput: RX_REFERENTIAL_INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("PLANNING_NOT_FOUND");
    }
    expect(sendAccreditationCreationEmail).not.toHaveBeenCalled();
  });

  it("erreur DB pendant la résolution référentiel → 503 propagé, sans fuite de détail Prisma", async () => {
    mockRxEvent("TRANSITION");
    mockedPrisma.exhibitor.findMany.mockRejectedValue(new Error("connection reset by peer"));
    const result = await previewAccreditation(rxCommand(), { referentialInput: RX_REFERENTIAL_INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).not.toContain("connection reset");
    }
  });

  it("status/actorSource restent déduits EXCLUSIVEMENT du contexte serveur, inchangés par la validation RX", async () => {
    mockRxEvent("DISABLED");
    mockedPrisma.exhibitor.findMany.mockResolvedValue([]);
    const result = await previewAccreditation(rxCommand(), {
      currentUserId: "u1",
      currentUserRole: "SUPER_ADMIN",
      referentialInput: { exhibitorName: "Sunseeker" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("ATTENTE");
      expect(result.actorSource).toBe("SUPER_ADMIN");
    }
  });
});

// ── Phase 6C-B-2 : quotas alignés sur extension.categories[] (RX non-DISABLED) ─

describe("Phase 6C-B-2 — quotas alignés sur extension.categories[] (RX non-DISABLED)", () => {
  it("skipMontage=true → aucune candidate MONTAGE, même si le véhicule racine porte une date/heure falsifiée", async () => {
    mockRxEvent("TRANSITION");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]); // repli legacy

    const result = await previewAccreditation(
      rxCommand({
        extension: rxExtension({
          skipMontage: true,
          categories: [
            {
              categoryId: "stand-tente",
              livDate: "",
              livTime: "",
              repDate: "2026-09-14",
              repTime: "08:00-09:00",
              vehicles: [{ vehicleType: "VL", plate: "AB-123-CD" }],
            },
          ],
        }),
        // Véhicule racine falsifié : date/heure de montage arbitraires.
        vehicles: [
          { plate: "AB-123-CD", size: "L", phoneCode: "+33", phoneNumber: "1", date: "2099-01-01", time: "23:00-23:59", city: "Cannes", unloading: "quai", vehicleType: "VL" },
        ],
      }),
      { referentialInput: RX_REFERENTIAL_INPUT }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quotaCandidates.filter((c) => c.key.phase === "MONTAGE")).toHaveLength(0);
      const demontage = result.quotaCandidates.filter((c) => c.key.phase === "DEMONTAGE");
      // ZONE + LOCATION (scope emplacement) pour le même créneau.
      expect(demontage.length).toBeGreaterThanOrEqual(1);
      expect(demontage.every((c) => c.key.date === "2026-09-14")).toBe(true);
      expect(demontage.every((c) => c.key.date !== "2099-01-01")).toBe(true);
      expect(demontage.some((c) => c.key.scopeKey.startsWith("ZONE:"))).toBe(true);
    }
  });

  it("skipDemontage=true → aucune candidate DEMONTAGE, même si le véhicule racine porte des champs rep* falsifiés", async () => {
    mockRxEvent("TRANSITION");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]);

    const result = await previewAccreditation(
      rxCommand({
        extension: rxExtension({
          skipDemontage: true,
          categories: [
            {
              categoryId: "stand-tente",
              livDate: "2026-09-06",
              livTime: "08:00-09:00",
              repDate: "",
              repTime: "",
              vehicles: [{ vehicleType: "VL", plate: "AB-123-CD" }],
            },
          ],
        }),
        vehicles: [
          { plate: "AB-123-CD", size: "L", phoneCode: "+33", phoneNumber: "1", date: "2026-09-06", time: "08:00-09:00", city: "Cannes", unloading: "quai", vehicleType: "VL", repDate: "2099-01-01", repTime: "23:00-23:59", repVehicleType: "PORTEUR" },
        ],
      }),
      { referentialInput: RX_REFERENTIAL_INPUT }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quotaCandidates.filter((c) => c.key.phase === "DEMONTAGE")).toHaveLength(0);
      const montage = result.quotaCandidates.filter((c) => c.key.phase === "MONTAGE");
      // ZONE + LOCATION pour le même créneau.
      expect(montage.length).toBeGreaterThanOrEqual(1);
      expect(montage.some((c) => c.key.scopeKey.startsWith("ZONE:"))).toBe(true);
    }
  });

  it("reprise différente (repSameAsDelivery=false) : la candidate DEMONTAGE utilise le gabarit repVehicleType, pas celui du montage", async () => {
    mockRxEvent("TRANSITION");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]);

    const result = await previewAccreditation(
      rxCommand({
        extension: rxExtension({
          categories: [
            {
              categoryId: "stand-tente",
              livDate: "2026-09-06",
              livTime: "08:00-09:00",
              repDate: "2026-09-14",
              repTime: "08:00-09:00",
              vehicles: [{ vehicleType: "VL", plate: "AB-123-CD", repSameAsDelivery: false, repVehicleType: "PORTEUR" }],
            },
          ],
        }),
      }),
      { referentialInput: RX_REFERENTIAL_INPUT }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const montage = result.quotaCandidates.find((c) => c.key.phase === "MONTAGE");
      const demontage = result.quotaCandidates.find((c) => c.key.phase === "DEMONTAGE");
      expect(montage?.key.vehicleFamily).toBe("LIGHT");
      expect(demontage?.key.vehicleFamily).toBe("HEAVY");
    }
  });

  it("extension.categories[] est la source de vérité : une date/heure racine divergente n'affecte jamais la candidate produite", async () => {
    mockRxEvent("TRANSITION");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]);

    const result = await previewAccreditation(
      rxCommand({
        vehicles: [
          { plate: "AB-123-CD", size: "L", phoneCode: "+33", phoneNumber: "1", date: "2030-06-01", time: "13:00-14:00", city: "Cannes", unloading: "quai", vehicleType: "VL" },
        ],
      }),
      { referentialInput: RX_REFERENTIAL_INPUT }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const montage = result.quotaCandidates.find((c) => c.key.phase === "MONTAGE");
      expect(montage?.key.date).toBe("2026-09-06");
      expect(montage?.key.startTime).toBe("08:00");
      expect(montage?.key.date).not.toBe("2030-06-01");
    }
  });

  it("quota complet (recheck transactionnel après preview) → CapacityQuotaError, rollback complet, aucune écriture", async () => {
    mockRxEvent("TRANSITION");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]);

    const preview = await previewAccreditation(rxCommand(), { referentialInput: RX_REFERENTIAL_INPUT });
    if (!preview.ok) throw new Error("preview should succeed");
    expect(preview.quotaCandidates.length).toBeGreaterThan(0);

    (enforceCapacityQuotas as Mock).mockRejectedValueOnce(
      new CapacityQuotaError({
        phase: "MONTAGE", zone: "LA_BOCCA", date: "2026-09-06", startTime: "08:00", endTime: "09:00",
        vehicleFamily: "LIGHT", remaining: 0, requestedCount: 1,
      })
    );

    const tx = makeFakeRxTx("TRANSITION", []);
    await expect(
      createAccreditationInTransaction(tx as never, preview, { referentialInput: RX_REFERENTIAL_INPUT })
    ).rejects.toThrow(CapacityQuotaError);
    expect(tx.accreditation.create).not.toHaveBeenCalled();
  });
});

// ── Phase 6C-B-2 : intégration réelle route POST (référentiel non fiable — ─
// jamais d'UUID client, cf. `buildRxReferentialInput`) — la route reste fine
// et délègue au moteur ; ces tests exercent le VRAI `POST`, le VRAI moteur,
// et seul `prisma` (structurel) est mocké : ils prouvent le comportement de
// bout en bout, pas une simple délégation simulée.

function rxReqBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...rxCommand(),
    extension: {
      ...rxExtension(),
      exhibitor: { id: "client-supplied-uuid", name: "Sunseeker" },
      location: { code: "PAN 023", type: "TERRE" },
    },
    ...overrides,
  };
}

describe("Phase 6C-B-2 — POST /api/accreditations (intégration réelle route + moteur RX)", () => {
  beforeEach(() => {
    // Écriture transactionnelle réelle (moteur), route utilisant le VRAI
    // `createAccreditationInTransaction` : seul `tx` (structurel) diffère
    // de `prisma` (référentiel/planning RX rechargés fiablement dans `tx`).
    mockedPrisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) =>
      fn(makeFakeRxTx("DISABLED"))
    );
  });

  it("Palais non régressé : aucune lecture exhibitor/exhibitorLocation/logisticsPlanning, 201", async () => {
    const res = await POST(makeReq(baseCommand()));
    expect(res.status).toBe(201);
    expect(mockedPrisma.exhibitor.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.logisticsPlanning.findMany).not.toHaveBeenCalled();
  });

  it("DISABLED : un id exposant fourni par le client n'est jamais transmis au moteur ni utilisé (best-effort non bloquant)", async () => {
    mockRxEvent("DISABLED");
    mockedPrisma.exhibitor.findMany.mockResolvedValue([RX_EXHIBITOR_ROW]);
    mockedPrisma.exhibitorLocation.findMany.mockResolvedValue([RX_LOCATION_ROW]);
    mockedPrisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) =>
      fn(makeFakeRxTx("DISABLED"))
    );

    const res = await POST(makeReq(rxReqBody()));
    expect(res.status).toBe(201);
    // Résolution naturelle (nom/code), jamais l'UUID client "client-supplied-uuid".
    expect(mockedPrisma.exhibitor.findUnique).not.toHaveBeenCalled();
  });

  it("TRANSITION, aucune règle DB : repli legacy serveur validé (jamais de blocage), 201", async () => {
    mockRxEvent("TRANSITION");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]);
    mockedPrisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) =>
      fn(makeFakeRxTx("TRANSITION", []))
    );

    const res = await POST(makeReq(rxReqBody()));
    expect(res.status).toBe(201);
  });

  it("STRICT, date falsifiée hors planning : refusée 400 PLANNING_DATE_INVALID, aucune création", async () => {
    mockRxEvent("STRICT");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([
      { scope: "SPACE", scopeKey: "SPACE:EXTERIEUR_PALAIS", categoryCode: "TERRE", phase: "MONTAGE", date: "2026-09-06", startTime: "08:00", endTime: "09:00" },
      { scope: "SPACE", scopeKey: "SPACE:EXTERIEUR_PALAIS", categoryCode: "TERRE", phase: "DEMONTAGE", date: "2026-09-14", startTime: "08:00", endTime: "09:00" },
    ]);

    const res = await POST(
      makeReq(
        rxReqBody({
          extension: {
            ...rxExtension({
              categories: [
                {
                  categoryId: "stand-tente",
                  livDate: "2099-01-01", // hors planning DB et hors legacy
                  livTime: "08:00-09:00",
                  repDate: "2026-09-14",
                  repTime: "08:00-09:00",
                  vehicles: [{ vehicleType: "VL", plate: "AB-123-CD" }],
                },
              ],
            }),
            exhibitor: { id: "client-supplied-uuid", name: "Sunseeker" },
            location: { code: "PAN 023", type: "TERRE" },
          },
        })
      )
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/hors planning/i);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("STRICT, créneau falsifié (hors grille genSlots) : refusée 400, aucune création", async () => {
    mockRxEvent("STRICT");
    mockValidReferential();
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([
      { scope: "SPACE", scopeKey: "SPACE:EXTERIEUR_PALAIS", categoryCode: "TERRE", phase: "MONTAGE", date: "2026-09-06", startTime: "08:00", endTime: "09:00" },
      { scope: "SPACE", scopeKey: "SPACE:EXTERIEUR_PALAIS", categoryCode: "TERRE", phase: "DEMONTAGE", date: "2026-09-14", startTime: "08:00", endTime: "09:00" },
    ]);

    const res = await POST(
      makeReq(
        rxReqBody({
          extension: {
            ...rxExtension({
              categories: [
                {
                  categoryId: "stand-tente",
                  livDate: "2026-09-06",
                  livTime: "08:15-09:15", // créneau inventé, absent de genSlots
                  repDate: "2026-09-14",
                  repTime: "08:00-09:00",
                  vehicles: [{ vehicleType: "VL", plate: "AB-123-CD" }],
                },
              ],
            }),
            exhibitor: { id: "client-supplied-uuid", name: "Sunseeker" },
            location: { code: "PAN 023", type: "TERRE" },
          },
        })
      )
    );
    expect(res.status).toBe(400);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });
});
