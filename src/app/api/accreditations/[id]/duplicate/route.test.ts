import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────
// Le registry pointe vers l'index complet des templates (steps.tsx, UI JSX),
// incompatible avec l'environnement de test Node. On mocke uniquement le
// registry, mais avec les VRAIS schémas Zod Palais/RX (fichiers purs, sans
// JSX) : ce test vérifie la parité réelle de validation, pas une version
// simplifiée — décisions Phase 4A (statut ATTENTE, e-mail envoyé, extension
// recopiée+enrichie, plaque nullable RX, quotas appliqués).
vi.mock("@/templates/accreditation/registry", async () => {
  const { palaisPayloadSchema } = await vi.importActual<
    typeof import("@/templates/accreditation/palais/schema")
  >("@/templates/accreditation/palais/schema");
  const { rxPayloadSchema } = await vi.importActual<
    typeof import("@/templates/accreditation/rx/schema")
  >("@/templates/accreditation/rx/schema");
  return {
    getTemplate: (slug: string | null | undefined) =>
      (slug ?? "palais").toLowerCase() === "rx"
        ? { slug: "rx", schema: rxPayloadSchema }
        : { slug: "palais", schema: palaisPayloadSchema },
  };
});

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    organization: { findUnique: vi.fn(), findFirst: vi.fn() },
    event: { findUnique: vi.fn() },
    vehicleTypeConfig: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    accreditation: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma: prismaMock, default: prismaMock };
});

vi.mock("@/lib/auth-helpers", () => ({
  requirePermission: vi.fn(),
  assertEventBelongsToOrg: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({
  assertAccreditationAccess: vi.fn(),
}));

vi.mock("@/lib/history-server", () => ({
  writeHistoryDirect: vi.fn(),
}));

vi.mock("@/lib/accreditation-creation-email", () => ({
  sendAccreditationCreationEmail: vi.fn(),
}));

vi.mock("@/lib/capacity-quota-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/capacity-quota-guard")>(
    "@/lib/capacity-quota-guard"
  );
  return { ...actual, enforceCapacityQuotas: vi.fn() };
});

import prisma from "@/lib/prisma";
import { requirePermission, assertEventBelongsToOrg } from "@/lib/auth-helpers";
import { assertAccreditationAccess } from "@/lib/rbac";
import { writeHistoryDirect } from "@/lib/history-server";
import { sendAccreditationCreationEmail } from "@/lib/accreditation-creation-email";
import { POST } from "./route";

type MockedPrisma = {
  organization: { findUnique: Mock; findFirst: Mock };
  event: { findUnique: Mock };
  vehicleTypeConfig: { findMany: Mock };
  user: { findUnique: Mock };
  accreditation: { findUnique: Mock };
  $transaction: Mock;
};
const mockedPrisma = prisma as unknown as MockedPrisma;

function makeFakeTx(overrides: Record<string, unknown> = {}) {
  return {
    stand: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "stand-1" }),
      update: vi.fn(),
    },
    accreditation: {
      create: vi.fn().mockResolvedValue({ id: "new-acc-1" }),
    },
    ...overrides,
  };
}

function makeReq(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

function makeProps(id: string): Parameters<typeof POST>[1] {
  return { params: Promise.resolve({ id }) };
}

const palaisParent = {
  id: "parent-1",
  organizationId: "org-palais",
  eventId: "event-1",
  event: "cannes-2026",
  company: "Acme",
  stand: "PALAIS-001",
  unloading: "quai",
  message: "hello",
  consent: true,
  language: "fr",
  email: "contact@acme.fr",
  category: "STAND_NU" as const,
  extension: null,
  publicToken: "source-public-token",
  exhibitorId: "exh-source",
  exhibitorLocationId: "loc-source",
  locationLabel: "PAN 023",
  locationSnapshot: { portCode: "PORT_CANTO", sectorCode: "POWER" },
};

const rxParent = {
  id: "parent-2",
  organizationId: "org-rx",
  eventId: "event-2",
  event: "yachting-2026",
  company: "Yacht Co",
  stand: "PAN 001",
  unloading: "quai",
  message: null,
  consent: true,
  language: "fr",
  email: null,
  category: null,
  extension: {
    exhibitor: { id: "exh-1", name: "Yacht Co", stand: "PAN 001", sector: "POWER" },
    contact: {
      firstName: "J",
      lastName: "D",
      email: "contact@yachtco.fr",
      phoneCode: "+33",
      phoneNumber: "600000001",
    },
    space: "PAN",
    categories: [
      {
        categoryId: "cat1",
        livDate: "2026-09-10",
        livTime: "08:00-09:00",
        repDate: "2026-09-20",
        repTime: "08:00-09:00",
        vehicles: [],
      },
    ],
    scalesAssigned: false,
    manutentionProvider: "Interne",
  },
};

/**
 * `organization.findUnique` est appelé deux fois avec des clauses `where`
 * différentes : par `id` (adaptateur, pour retrouver `organizationSlug` à
 * partir du parent) puis par `slug` (moteur, dans `previewAccreditation`).
 */
function mockOrganization(organizationId: string, slug: string) {
  mockedPrisma.organization.findFirst.mockResolvedValue(null);
  mockedPrisma.organization.findUnique.mockImplementation(
    async ({ where }: { where: { id?: string; slug?: string } }) => {
      if (where.id === organizationId) return { slug };
      if (where.slug === slug) return { id: organizationId, isActive: true };
      return null;
    }
  );
}

function mockAccreditationLookup(parent: Record<string, unknown>, createdOverrides: Record<string, unknown> = {}) {
  mockedPrisma.accreditation.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      if (where.id === parent.id) return parent;
      if (where.id === "new-acc-1") return { id: "new-acc-1", vehicles: [], ...createdOverrides };
      return null;
    }
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  (requirePermission as Mock).mockResolvedValue({ user: { id: "user-1" } });
  (assertAccreditationAccess as Mock).mockResolvedValue({ accessibleEventIds: "ALL", eventId: "event-1" });
  (assertEventBelongsToOrg as Mock).mockResolvedValue(undefined);
  mockedPrisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
  mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
  (sendAccreditationCreationEmail as Mock).mockResolvedValue("sent");
});

describe("POST /api/accreditations/[id]/duplicate — Phase 4A (adaptateur du moteur unique)", () => {
  it("Palais : passe par le moteur, propage organizationId (régression critique corrigée) et le statut ATTENTE (création interne)", async () => {
    mockAccreditationLookup(palaisParent);
    mockOrganization("org-palais", "palais");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-1", organizationId: "org-palais" });
    const tx = makeFakeTx();
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const vehicle = {
      plate: "AB-123-CD",
      size: "L",
      phoneCode: "+33",
      phoneNumber: "600000000",
      date: "2026-05-13",
      time: "08:00-09:00",
      city: "Cannes",
      unloading: ["rear"],
    };

    const res = await POST(makeReq(vehicle), makeProps("parent-1"));
    expect(res.status).toBe(201);

    expect(tx.accreditation.create).toHaveBeenCalledTimes(1);
    const createArgs = tx.accreditation.create.mock.calls[0]![0].data;
    expect(createArgs.organizationId).toBe("org-palais");
    expect(createArgs.status).toBe("ATTENTE");
    expect(createArgs.standId).toBe("stand-1");
    expect(typeof createArgs.publicToken).toBe("string");
    expect(createArgs.publicToken.length).toBeGreaterThan(0);
    expect(createArgs.category).toBe("STAND_NU");
    expect(createArgs.categorySource).toBe("LOGISTICIEN");
    expect(createArgs.vehicles.create[0].plateNormalized).toBe("AB123CD");

    // Non-régression : champs déjà copiés aujourd'hui restent identiques.
    expect(createArgs.company).toBe("Acme");
    expect(createArgs.stand).toBe("PALAIS-001");
    expect(createArgs.unloading).toBe("quai");
    expect(createArgs.event).toBe("cannes-2026");
    expect(createArgs.message).toBe("hello");
    expect(createArgs.consent).toBe(true);

    expect(sendAccreditationCreationEmail).toHaveBeenCalledWith({
      accreditationId: "new-acc-1",
      recipient: "contact@acme.fr",
    });
    expect(writeHistoryDirect).toHaveBeenCalledWith(
      expect.objectContaining({ accreditationId: "new-acc-1", actorSource: "LOGISTICIEN" }),
      tx
    );

    const body = await res.json();
    expect(body.id).toBe("new-acc-1");
    expect(body.emailOutcome).toBe("sent");
  });

  it("RX : plaque nulle acceptée (alignement moteur), extension recopiée et enrichie (suggestedZone/vehicleContext)", async () => {
    mockAccreditationLookup(rxParent);
    mockOrganization("org-rx", "rx");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-2", organizationId: "org-rx" });
    const tx = makeFakeTx();
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const vehicle = {
      plate: null,
      size: "",
      phoneCode: "+33",
      phoneNumber: "600000001",
      date: "2026-09-11",
      time: "08:00-09:00",
      city: "",
      unloading: ["rear"],
      vehicleType: "CAMION_20T",
    };

    const res = await POST(makeReq(vehicle), makeProps("parent-2"));
    expect(res.status).toBe(201);

    const createArgs = tx.accreditation.create.mock.calls[0]![0].data;
    expect(createArgs.organizationId).toBe("org-rx");
    expect(createArgs.vehicles.create[0].plate).toBeNull();
    // extension enrichie via le chemin splitPerVehicle du moteur (recalcul
    // suggestedZone/vehicleContext), contact RX du parent conservé.
    expect(createArgs.extension.contact.email).toBe("contact@yachtco.fr");
    expect(createArgs.extension.vehicleContext).toBeDefined();
    expect(createArgs.extension.vehicleContext.repVehicleType).toBeNull();

    // E-mail destinataire pris depuis extension.contact (parent.email est null pour RX).
    expect(sendAccreditationCreationEmail).toHaveBeenCalledWith({
      accreditationId: "new-acc-1",
      recipient: "contact@yachtco.fr",
    });
  });

  it("rejette une accréditation RX avec vehicleType manquant (Zod du moteur, pas de fallback vers le check manuel historique)", async () => {
    mockAccreditationLookup(rxParent);
    mockOrganization("org-rx", "rx");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-2", organizationId: "org-rx" });

    const vehicle = {
      plate: null,
      phoneCode: "+33",
      phoneNumber: "600000001",
      date: "2026-09-11",
      unloading: ["rear"],
      // vehicleType manquant → invalide côté rxVehicleSchema.
    };

    const res = await POST(makeReq(vehicle), makeProps("parent-2"));
    expect(res.status).toBe(400);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("quota de capacité plein : 409 avec code CAPACITY_QUOTA_FULL, aucune écriture partielle, aucun e-mail", async () => {
    mockAccreditationLookup(palaisParent);
    mockOrganization("org-palais", "palais");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-1", organizationId: "org-palais" });
    const { CapacityQuotaError } = await vi.importActual<typeof import("@/lib/capacity-quota-guard")>(
      "@/lib/capacity-quota-guard"
    );
    mockedPrisma.$transaction.mockRejectedValue(
      new CapacityQuotaError({
        phase: "MONTAGE",
        zone: "LA_BOCCA",
        date: "2026-05-13",
        startTime: "08:00",
        endTime: "09:00",
        vehicleFamily: "LIGHT",
        remaining: 0,
        requestedCount: 1,
      })
    );

    const vehicle = {
      plate: "AB-123-CD",
      size: "L",
      phoneCode: "+33",
      phoneNumber: "600000000",
      date: "2026-05-13",
      city: "Cannes",
      unloading: ["rear"],
    };

    const res = await POST(makeReq(vehicle), makeProps("parent-1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("CAPACITY_QUOTA_FULL");
    expect(sendAccreditationCreationEmail).not.toHaveBeenCalled();
  });

  it("accréditation parente introuvable : 404", async () => {
    mockedPrisma.accreditation.findUnique.mockResolvedValue(null);

    const res = await POST(makeReq({}), makeProps("missing-id"));
    expect(res.status).toBe(404);
  });

  it("accès refusé à l'accréditation (autre organisation) : passthrough Response 403, jamais d'appel au moteur", async () => {
    (assertAccreditationAccess as Mock).mockRejectedValue(
      new Response("Accès refusé à cette accréditation", { status: 403 })
    );

    const res = await POST(makeReq({}), makeProps("parent-1"));
    expect(res.status).toBe(403);
    expect(mockedPrisma.accreditation.findUnique).not.toHaveBeenCalled();
  });

  it("permission manquante : passthrough du statut/HTTP de requirePermission", async () => {
    (requirePermission as Mock).mockRejectedValue(
      new Response("Accès refusé à la fonctionnalité LISTE", { status: 403 })
    );

    const res = await POST(makeReq({}), makeProps("parent-1"));
    expect(res.status).toBe(403);
  });

  it("parité HTTP événement/organisation : Response texte brut de assertEventBelongsToOrg retournée telle quelle", async () => {
    mockAccreditationLookup(palaisParent);
    mockOrganization("org-palais", "palais");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-1", organizationId: "org-palais" });
    (assertEventBelongsToOrg as Mock).mockRejectedValue(
      new Response("L'event ne correspond pas à l'organisation cible", { status: 400 })
    );

    const vehicle = {
      plate: "AB-123-CD",
      size: "L",
      phoneCode: "+33",
      phoneNumber: "600000000",
      date: "2026-05-13",
      city: "Cannes",
      unloading: ["rear"],
    };

    const res = await POST(makeReq(vehicle), makeProps("parent-1"));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("L'event ne correspond pas à l'organisation cible");
  });

  // ── Référentiel et snapshot (exhibitorId/exhibitorLocationId/locationLabel/locationSnapshot) ──

  it("conserve exhibitorId/exhibitorLocationId/locationLabel/locationSnapshot de la source, un nouveau publicToken distinct, et rien des champs runtime (entryAt/exitAt/sentAt/assignedAt/zoneMovements)", async () => {
    mockAccreditationLookup(palaisParent);
    mockOrganization("org-palais", "palais");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-1", organizationId: "org-palais" });
    const tx = makeFakeTx();
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const vehicle = {
      plate: "AB-123-CD",
      size: "L",
      phoneCode: "+33",
      phoneNumber: "600000000",
      date: "2026-05-13",
      city: "Cannes",
      unloading: ["rear"],
      trailerPlate: "TR-456-EF",
    };

    const res = await POST(makeReq(vehicle), makeProps("parent-1"));
    expect(res.status).toBe(201);

    const createArgs = tx.accreditation.create.mock.calls[0]![0].data;
    expect(createArgs.exhibitorId).toBe("exh-source");
    expect(createArgs.exhibitorLocationId).toBe("loc-source");
    expect(createArgs.locationLabel).toBe("PAN 023");
    expect(createArgs.locationSnapshot).toEqual({ portCode: "PORT_CANTO", sectorCode: "POWER" });

    // Nouveau publicToken, jamais celui de la source.
    expect(createArgs.publicToken).not.toBe("source-public-token");
    expect(typeof createArgs.publicToken).toBe("string");

    // Aucun champ runtime copié depuis la source.
    expect(createArgs.entryAt).toBeUndefined();
    expect(createArgs.exitAt).toBeUndefined();
    expect(createArgs.sentAt).toBeUndefined();
    expect(createArgs.zoneMovements).toBeUndefined();
    expect(createArgs.chatMessages).toBeUndefined();
    expect(createArgs.history).toBeUndefined();
    expect(createArgs.vehicles.create[0].assignedAt).toBeUndefined();
    expect(createArgs.vehicles.create[0].trailerPlateNormalized).toBe("TR456EF");
  });

  it("ignore toute tentative du client d'injecter exhibitorId/exhibitorLocationId/organizationId/eventId/status/actorSource via le corps de la requête", async () => {
    mockAccreditationLookup(palaisParent);
    mockOrganization("org-palais", "palais");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-1", organizationId: "org-palais" });
    const tx = makeFakeTx();
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const vehicle = {
      plate: "AB-123-CD",
      size: "L",
      phoneCode: "+33",
      phoneNumber: "600000000",
      date: "2026-05-13",
      city: "Cannes",
      unloading: ["rear"],
      // Tentative d'injection : ces clés n'existent pas dans le schéma
      // véhicule et ne doivent avoir AUCUN effet sur la commande construite
      // par l'adaptateur (qui ne lit jamais `v` en dehors de `vehicles: [v]`).
      exhibitorId: "attacker-exhibitor",
      exhibitorLocationId: "attacker-location",
      organizationId: "org-attacker",
      eventId: "event-attacker",
      status: "ENTREE",
      actorSource: "SUPER_ADMIN",
    };

    const res = await POST(makeReq(vehicle), makeProps("parent-1"));
    expect(res.status).toBe(201);

    const createArgs = tx.accreditation.create.mock.calls[0]![0].data;
    expect(createArgs.organizationId).toBe("org-palais");
    expect(createArgs.exhibitorId).toBe("exh-source");
    expect(createArgs.exhibitorLocationId).toBe("loc-source");
    expect(createArgs.status).toBe("ATTENTE"); // jamais "ENTREE" injecté par le client
  });

  // ── Traçabilité de la duplication ─────────────────────────────────────

  it("historique : action CREATED avec description/changeReason mentionnant l'id source et diff.channel=DUPLICATION", async () => {
    mockAccreditationLookup(palaisParent);
    mockOrganization("org-palais", "palais");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-1", organizationId: "org-palais" });
    const tx = makeFakeTx();
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const vehicle = {
      plate: "AB-123-CD",
      size: "L",
      phoneCode: "+33",
      phoneNumber: "600000000",
      date: "2026-05-13",
      city: "Cannes",
      unloading: ["rear"],
    };

    await POST(makeReq(vehicle), makeProps("parent-1"));

    expect(writeHistoryDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        accreditationId: "new-acc-1",
        action: "CREATED",
        actorSource: "LOGISTICIEN",
        userId: "user-1",
        description: expect.stringContaining("parent-1"),
        changeReason: expect.stringContaining("parent-1"),
        diff: { channel: "DUPLICATION", sourceAccreditationId: "parent-1" },
      }),
      tx
    );
  });

  // ── Échec du rechargement post-commit ─────────────────────────────────

  it("rechargement post-commit retournant null : répond 201 avec id + emailOutcome (jamais 500, création déjà committée)", async () => {
    mockedPrisma.accreditation.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        if (where.id === "parent-1") return palaisParent;
        return null; // rechargement de la nouvelle accréditation échoue (null)
      }
    );
    mockOrganization("org-palais", "palais");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-1", organizationId: "org-palais" });
    const tx = makeFakeTx();
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const vehicle = {
      plate: "AB-123-CD",
      size: "L",
      phoneCode: "+33",
      phoneNumber: "600000000",
      date: "2026-05-13",
      city: "Cannes",
      unloading: ["rear"],
    };

    const res = await POST(makeReq(vehicle), makeProps("parent-1"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("new-acc-1");
    expect(body.emailOutcome).toBe("sent");
    // L'e-mail a bien été envoyé malgré l'échec du rechargement.
    expect(sendAccreditationCreationEmail).toHaveBeenCalled();
  });

  it("rechargement post-commit qui lève une exception : répond 201 avec id + emailOutcome (jamais 500, jamais de nouvelle tentative de création)", async () => {
    mockedPrisma.accreditation.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        if (where.id === "parent-1") return palaisParent;
        throw new Error("connexion DB perdue");
      }
    );
    mockOrganization("org-palais", "palais");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-1", organizationId: "org-palais" });
    const tx = makeFakeTx();
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const vehicle = {
      plate: "AB-123-CD",
      size: "L",
      phoneCode: "+33",
      phoneNumber: "600000000",
      date: "2026-05-13",
      city: "Cannes",
      unloading: ["rear"],
    };

    const res = await POST(makeReq(vehicle), makeProps("parent-1"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("new-acc-1");
    expect(body.emailOutcome).toBe("sent");
    // Une seule création tentée : jamais de nouvelle tentative après l'échec du rechargement.
    expect(tx.accreditation.create).toHaveBeenCalledTimes(1);
  });

  it("échec avant commit (validation) : vraie erreur HTTP 400, aucun faux succès", async () => {
    mockAccreditationLookup(palaisParent);
    mockOrganization("org-palais", "palais");
    mockedPrisma.event.findUnique.mockResolvedValue({ id: "event-1", organizationId: "org-palais" });

    // Plaque vide : obligatoire pour le template Palais.
    const vehicle = {
      plate: "",
      size: "L",
      phoneCode: "+33",
      phoneNumber: "600000000",
      date: "2026-05-13",
      city: "Cannes",
      unloading: ["rear"],
    };

    const res = await POST(makeReq(vehicle), makeProps("parent-1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/plaque/i);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });
});
