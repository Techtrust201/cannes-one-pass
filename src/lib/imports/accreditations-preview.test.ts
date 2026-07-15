import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── Mocks (mêmes principes que accreditation-service.test.ts) ────────────
// Registry : schémas RÉELS (Palais/RX) importés directement — on veut une
// validation Zod authentique pour prouver que le mapping construit des
// commandes réellement valides, sans les effets de bord JSX du registry.
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
    // Phase 6C-B-4 : revalidation référentielle/planning RX (previewAccreditation).
    exhibitor: { findUnique: vi.fn(), findMany: vi.fn() },
    exhibitorLocation: { findUnique: vi.fn(), findMany: vi.fn() },
    logisticsPlanning: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma: prismaMock, default: prismaMock };
});

vi.mock("@/lib/auth-helpers", () => ({
  assertEventBelongsToOrg: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/history-server", () => ({ writeHistoryDirect: vi.fn() }));
vi.mock("@/lib/accreditation-creation-email", () => ({
  sendAccreditationCreationEmail: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { sendAccreditationCreationEmail } from "@/lib/accreditation-creation-email";
import { rowsToTable } from "./csv";
import { parseAccreditationsTable } from "./accreditations";
import {
  previewAccreditationsBatch,
  type AccreditationsPreviewContext,
  type AvailabilityReader,
} from "./accreditations-preview";
import type {
  ReferentialResolverDb,
  ResolverExhibitorRow,
  ResolverLocationRow,
} from "./accreditations-referential-resolver";
import type { RxAvailabilityResult } from "@/lib/rx-capacity-service";

type MockedPrisma = {
  organization: { findUnique: Mock; findFirst: Mock };
  event: { findUnique: Mock };
  vehicleTypeConfig: { findMany: Mock };
  exhibitor: { findUnique: Mock; findMany: Mock };
  exhibitorLocation: { findUnique: Mock; findMany: Mock };
  logisticsPlanning: { findMany: Mock };
  $transaction: Mock;
};
const mockedPrisma = prisma as unknown as MockedPrisma;

const ORG_ID = "org-1";
const EVENT_ID = "event-1";

function table(rows: string[][]) {
  return rowsToTable(rows);
}

function exhibitor(overrides: Partial<ResolverExhibitorRow> = {}): ResolverExhibitorRow {
  return {
    id: "exh-1",
    name: "Yacht Co",
    nameNormalized: "YACHT CO",
    externalReference: null,
    organizationId: ORG_ID,
    eventId: EVENT_ID,
    ...overrides,
  };
}

function location(overrides: Partial<ResolverLocationRow> = {}): ResolverLocationRow {
  return {
    id: "loc-1",
    exhibitorId: "exh-1",
    type: "FLOT",
    code: "PAN 001",
    codeNormalized: "PAN001",
    portCode: "PORT CANTO",
    sectorCode: "PAN",
    logisticSpace: "PAN",
    isActive: true,
    ...overrides,
  };
}

/**
 * Db référentiel mocké (résolution naturelle propre à l'import) — SEUL
 * `findMany` existe : toute tentative d'écriture plante.
 *
 * Phase 6C-B-4 : le moteur unique REVÉRIFIE ensuite l'exposant/emplacement
 * ainsi résolu via `prisma.exhibitor/exhibitorLocation.findUnique(id)`
 * (`referentialInput`, RX uniquement) — on rejoue donc le MÊME jeu de
 * données sur `mockedPrisma` pour que cette revalidation retrouve exactement
 * l'exposant/emplacement déjà résolu naturellement ci-dessus (jamais un
 * second jeu de données divergent).
 */
function makeDb(
  exhibitors: ResolverExhibitorRow[],
  locations: ResolverLocationRow[] = []
): ReferentialResolverDb {
  mockedPrisma.exhibitor.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      const row = exhibitors.find((e) => e.id === where.id);
      return row ? { ...row, isActive: true } : null;
    }
  );
  mockedPrisma.exhibitorLocation.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) =>
      locations.find((l) => l.id === where.id) ?? null
  );
  return {
    exhibitor: { findMany: vi.fn().mockResolvedValue(exhibitors) },
    exhibitorLocation: { findMany: vi.fn().mockResolvedValue(locations) },
  };
}

const NO_QUOTA: RxAvailabilityResult = {
  hasQuota: false,
  capacity: 0,
  provisionalUsed: 0,
  confirmedUsed: 0,
  inZoneUsed: 0,
  totalUsed: 0,
  remaining: 0,
  isFull: false,
};

function noQuotaReader(): AvailabilityReader {
  return vi.fn().mockResolvedValue(NO_QUOTA);
}

function palaisCtx(overrides: Partial<AccreditationsPreviewContext> = {}): AccreditationsPreviewContext {
  return {
    organizationId: ORG_ID,
    organizationSlug: "palais",
    eventId: EVENT_ID,
    eventSlug: "cannes-2026",
    template: "palais",
    importMode: "PENDING",
    ...overrides,
  };
}

function rxCtx(overrides: Partial<AccreditationsPreviewContext> = {}): AccreditationsPreviewContext {
  return {
    organizationId: ORG_ID,
    organizationSlug: "rx",
    eventId: EVENT_ID,
    eventSlug: "cannes-2026",
    template: "rx",
    importMode: "PENDING",
    ...overrides,
  };
}

const RX_HEADERS = [
  "company", "stand", "exhibitorName", "locationCode", "locationType",
  "contactFirstName", "contactLastName", "contactEmail", "contactPhoneCode", "contactPhoneNumber",
  "space", "categoryId", "vehicleType", "phoneCode", "phoneNumber",
  "livDate", "livTime", "repDate", "repTime", "manutentionProvider", "unloading",
];

function rxRow(overrides: Record<string, string> = {}): string[] {
  const base: Record<string, string> = {
    company: "Yacht Co",
    stand: "PAN 001",
    exhibitorName: "Yacht Co",
    locationCode: "PAN 001",
    locationType: "FLOT",
    contactFirstName: "Jean",
    contactLastName: "Dupont",
    contactEmail: "contact@yachtco.fr",
    contactPhoneCode: "+33",
    contactPhoneNumber: "600000001",
    space: "PAN",
    categoryId: "cat1",
    vehicleType: "VL",
    phoneCode: "+33",
    phoneNumber: "600000001",
    livDate: "2026-09-10",
    livTime: "08:00-09:00",
    repDate: "2026-09-20",
    repTime: "10:00-11:00",
    manutentionProvider: "Interne",
    unloading: "rear",
    ...overrides,
  };
  return RX_HEADERS.map((h) => base[h] ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.organization.findUnique.mockResolvedValue({ id: ORG_ID, isActive: true });
  mockedPrisma.organization.findFirst.mockResolvedValue(null);
  mockedPrisma.event.findUnique.mockResolvedValue({ id: EVENT_ID, organizationId: ORG_ID });
  mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([]);
  mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]);
});

describe("previewAccreditationsBatch — preview de lot (Phase 4B-2)", () => {
  it("1. preview Palais valide : ligne acceptée, statut NOUVEAU, actorSource CSV_IMPORT", async () => {
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading"],
        ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"],
      ]),
      { template: "palais" }
    );
    const db = makeDb([]);
    const result = await previewAccreditationsBatch(db, parseResult, palaisCtx(), noQuotaReader());

    expect(result.public.ok).toBe(true);
    expect(result.public.lines).toHaveLength(1);
    expect(result.public.lines[0]!.valid).toBe(true);
    expect(result.public.lines[0]!.status).toBe("NOUVEAU");
    expect(result.public.lines[0]!.actorSource).toBe("CSV_IMPORT");
    expect(result.public.lines[0]!.referential).toBeNull();
  });

  it("2. preview RX valide avec extension reconstruite (exhibitor/contact/categories/space)", async () => {
    const parseResult = parseAccreditationsTable(
      table([RX_HEADERS, rxRow()]),
      { template: "rx" }
    );
    const db = makeDb([exhibitor()], [location()]);
    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect(result.public.lines[0]!.errors).toEqual([]);
    expect(result.public.lines[0]!.valid).toBe(true);
    expect(result.public.lines[0]!.referential).toEqual({
      exhibitorId: "exh-1",
      exhibitorLocationId: "loc-1",
      locationLabel: "PAN 001",
    });
    const plan = result.internalLinePlans[0]!;
    expect(plan.command.extension).toMatchObject({
      exhibitor: { id: "exh-1", name: "Yacht Co", sector: "PAN" },
      contact: { firstName: "Jean", lastName: "Dupont", email: "contact@yachtco.fr" },
      space: "PAN",
    });
  });

  it("3. RX sans exposant (aucun critère) → erreur EXHIBITOR_NOT_FOUND, ligne invalide", async () => {
    const parseResult = parseAccreditationsTable(
      table([RX_HEADERS, rxRow({ exhibitorName: "", locationCode: "" })]),
      { template: "rx" }
    );
    const db = makeDb([]);
    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect(result.public.lines[0]!.valid).toBe(false);
    expect(result.public.lines[0]!.errors[0]!.reason).toContain("EXHIBITOR_NOT_FOUND");
    expect(result.public.ok).toBe(false);
  });

  it("4. RX sans emplacement (locationCode vide, exposant résolu) → LOCATION_NOT_FOUND obligatoire pour RX", async () => {
    const parseResult = parseAccreditationsTable(
      table([RX_HEADERS, rxRow({ locationCode: "" })]),
      { template: "rx" }
    );
    const db = makeDb([exhibitor()]);
    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect(result.public.lines[0]!.valid).toBe(false);
    expect(result.public.lines[0]!.errors[0]!.reason).toContain("LOCATION_NOT_FOUND");
  });

  it("5. Palais sans référentiel (aucun critère fourni) accepté sans erreur", async () => {
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading"],
        ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"],
      ]),
      { template: "palais" }
    );
    const db = makeDb([]);
    const result = await previewAccreditationsBatch(db, parseResult, palaisCtx(), noQuotaReader());

    expect(result.public.lines[0]!.valid).toBe(true);
    expect(result.public.lines[0]!.referential).toBeNull();
    expect(db.exhibitor.findMany).not.toHaveBeenCalled();
  });

  it("6. Palais avec référence exposant invalide (fournie mais introuvable) → erreur explicite, jamais ignorée", async () => {
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading", "exhibitorName"],
        ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear", "Inconnu"],
      ]),
      { template: "palais" }
    );
    const db = makeDb([]);
    const result = await previewAccreditationsBatch(db, parseResult, palaisCtx(), noQuotaReader());

    expect(result.public.lines[0]!.valid).toBe(false);
    expect(result.public.lines[0]!.errors[0]!.reason).toContain("EXHIBITOR_NOT_FOUND");
  });

  it("7. organisation et événement toujours issus du contexte serveur (jamais du fichier)", async () => {
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading"],
        ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"],
      ]),
      { template: "palais" }
    );
    const ctx = palaisCtx({ organizationSlug: "palais", eventSlug: "edition-2027" });
    const result = await previewAccreditationsBatch(makeDb([]), parseResult, ctx, noQuotaReader());

    const plan = result.internalLinePlans[0]!;
    expect(plan.command.organizationSlug).toBe("palais");
    expect(plan.command.event).toBe("edition-2027");
  });

  it("8. mode PENDING affiché NOUVEAU + CSV_IMPORT", async () => {
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading"],
        ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"],
      ]),
      { template: "palais" }
    );
    const result = await previewAccreditationsBatch(
      makeDb([]),
      parseResult,
      palaisCtx({ importMode: "PENDING" }),
      noQuotaReader()
    );
    expect(result.public.importMode).toBe("PENDING");
    expect(result.public.lines[0]!.status).toBe("NOUVEAU");
    expect(result.public.lines[0]!.actorSource).toBe("CSV_IMPORT");
  });

  it("9. mode VALIDATED affiché ATTENTE + CSV_IMPORT", async () => {
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading"],
        ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"],
      ]),
      { template: "palais" }
    );
    const result = await previewAccreditationsBatch(
      makeDb([]),
      parseResult,
      palaisCtx({ importMode: "VALIDATED" }),
      noQuotaReader()
    );
    expect(result.public.importMode).toBe("VALIDATED");
    expect(result.public.lines[0]!.status).toBe("ATTENTE");
    expect(result.public.lines[0]!.actorSource).toBe("CSV_IMPORT");
  });

  it("10. erreurs Zod (moteur) remontées avec le numéro de ligne exact", async () => {
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading"],
        ["Acme", "A12", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"],
      ]),
      { template: "palais" }
    );
    const result = await previewAccreditationsBatch(makeDb([]), parseResult, palaisCtx(), noQuotaReader());

    expect(result.public.lines[0]!.valid).toBe(false);
    expect(result.public.lines[0]!.line).toBe(2);
    expect(result.public.lines[0]!.errors[0]!.line).toBe(2);
    expect(result.public.lines[0]!.errors[0]!.reason).toMatch(/e-mail/i);
  });

  it("11. warnings DUPLICATE_ROWS (Phase 4B-1) préservés dans le résultat de ligne", async () => {
    const rowValues = ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"];
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading"],
        rowValues,
        rowValues,
      ]),
      { template: "palais" }
    );
    const result = await previewAccreditationsBatch(makeDb([]), parseResult, palaisCtx(), noQuotaReader());

    expect(result.public.lines[1]!.warnings.some((w) => w.reason.startsWith("DUPLICATE_ROWS"))).toBe(true);
    expect(result.public.lines[1]!.valid).toBe(true);
  });

  it("12. deux lignes avec la même candidate quota → requestedCount agrégé à 2", async () => {
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([
      { code: "VL", pdfCode: "A", vehicleFamily: "LIGHT", rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: "LA_BOCCA" },
    ]);
    const parseResult = parseAccreditationsTable(
      table([RX_HEADERS, rxRow(), rxRow({ locationCode: "PAN 001" })]),
      { template: "rx" }
    );
    const db = makeDb([exhibitor()], [location()]);
    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect(result.public.lines.every((l) => l.valid)).toBe(true);
    // Agrégation sur le scope ZONE (LOCATION peut produire des groupes distincts).
    const montageGroups = result.public.quotaGroups.filter(
      (g) => g.key.phase === "MONTAGE" && g.key.scopeKey.startsWith("ZONE:")
    );
    expect(montageGroups).toHaveLength(1);
    expect(montageGroups[0]!.requestedCount).toBe(2);
    expect(montageGroups[0]!.lines).toEqual([2, 3]);
  });

  it("13. cinq lignes / trois places disponibles → exceededBy=2 et BATCH_CAPACITY_EXCEEDED", async () => {
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([
      { code: "VL", pdfCode: "A", vehicleFamily: "LIGHT", rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: "LA_BOCCA" },
    ]);
    const rows = Array.from({ length: 5 }, () => rxRow());
    const parseResult = parseAccreditationsTable(table([RX_HEADERS, ...rows]), { template: "rx" });
    const db = makeDb([exhibitor()], [location()]);
    const getAvailability: AvailabilityReader = vi.fn().mockResolvedValue({
      ...NO_QUOTA,
      hasQuota: true,
      capacity: 3,
      remaining: 3,
    });

    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), getAvailability);

    expect(result.public.ok).toBe(false);
    const montageError = result.public.batchCapacityErrors.find((e) => e.phase === "MONTAGE");
    expect(montageError).toBeDefined();
    expect(montageError!.code).toBe("BATCH_CAPACITY_EXCEEDED");
    expect(montageError!.exceededBy).toBe(2);
    expect(montageError!.requestedCount).toBe(5);
  });

  it("14. lignes concernées présentes dans l'erreur BATCH_CAPACITY_EXCEEDED", async () => {
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([
      { code: "VL", pdfCode: "A", vehicleFamily: "LIGHT", rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: "LA_BOCCA" },
    ]);
    const rows = Array.from({ length: 5 }, () => rxRow());
    const parseResult = parseAccreditationsTable(table([RX_HEADERS, ...rows]), { template: "rx" });
    const db = makeDb([exhibitor()], [location()]);
    const getAvailability: AvailabilityReader = vi.fn().mockResolvedValue({
      ...NO_QUOTA,
      hasQuota: true,
      capacity: 3,
      remaining: 3,
    });

    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), getAvailability);

    expect(result.public.batchCapacityErrors[0]!.lines).toEqual([2, 3, 4, 5, 6]);
  });

  it("15. montage et démontage séparés (deux groupes distincts pour la même ligne)", async () => {
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([
      { code: "VL", pdfCode: "A", vehicleFamily: "LIGHT", rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: "LA_BOCCA" },
    ]);
    const parseResult = parseAccreditationsTable(table([RX_HEADERS, rxRow()]), { template: "rx" });
    const db = makeDb([exhibitor()], [location()]);
    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    const phases = [
      ...new Set(
        result.public.quotaGroups
          .filter((g) => g.key.scopeKey.startsWith("ZONE:"))
          .map((g) => g.key.phase)
      ),
    ].sort();
    expect(phases).toEqual(["DEMONTAGE", "MONTAGE"]);
  });

  it("16. LIGHT et HEAVY séparés (deux gabarits distincts → deux groupes)", async () => {
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([
      { code: "VL", pdfCode: "A", vehicleFamily: "LIGHT", rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: "LA_BOCCA" },
      { code: "SEMI_REMORQUE", pdfCode: "D", vehicleFamily: "HEAVY", rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: "LA_BOCCA" },
    ]);
    const parseResult = parseAccreditationsTable(
      table([RX_HEADERS, rxRow(), rxRow({ vehicleType: "SEMI_REMORQUE" })]),
      { template: "rx" }
    );
    const db = makeDb([exhibitor()], [location()]);
    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    const montageGroups = result.public.quotaGroups.filter(
      (g) => g.key.phase === "MONTAGE" && g.key.scopeKey.startsWith("ZONE:")
    );
    const families = montageGroups.map((g) => g.key.vehicleFamily).sort();
    expect(families).toEqual(["HEAVY", "LIGHT"]);
  });

  it("17. deux créneaux différents ne fusionnent pas en un seul groupe", async () => {
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([
      { code: "VL", pdfCode: "A", vehicleFamily: "LIGHT", rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: "LA_BOCCA" },
    ]);
    const parseResult = parseAccreditationsTable(
      table([RX_HEADERS, rxRow(), rxRow({ livTime: "09:00-10:00" })]),
      { template: "rx" }
    );
    const db = makeDb([exhibitor()], [location()]);
    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    const montageGroups = result.public.quotaGroups.filter(
      (g) => g.key.phase === "MONTAGE" && g.key.scopeKey.startsWith("ZONE:")
    );
    expect(montageGroups).toHaveLength(2);
    expect(montageGroups.every((g) => g.requestedCount === 1)).toBe(true);
  });

  it("18. quota absent (hasQuota=false) n'est jamais bloquant", async () => {
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([
      { code: "VL", pdfCode: "A", vehicleFamily: "LIGHT", rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: "LA_BOCCA" },
    ]);
    const rows = Array.from({ length: 5 }, () => rxRow());
    const parseResult = parseAccreditationsTable(table([RX_HEADERS, ...rows]), { template: "rx" });
    const db = makeDb([exhibitor()], [location()]);

    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect(result.public.quotaGroups.every((g) => g.exceededBy === 0)).toBe(true);
    expect(result.public.batchCapacityErrors).toEqual([]);
    expect(result.public.ok).toBe(true);
  });

  it("19. toutes les disponibilités sont vérifiées, même quand le premier groupe dépasse déjà", async () => {
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([
      { code: "VL", pdfCode: "A", vehicleFamily: "LIGHT", rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: "LA_BOCCA" },
    ]);
    const parseResult = parseAccreditationsTable(
      table([RX_HEADERS, rxRow(), rxRow({ livTime: "09:00-10:00" })]),
      { template: "rx" }
    );
    const db = makeDb([exhibitor()], [location()]);
    const getAvailability: AvailabilityReader = vi.fn().mockResolvedValue({
      ...NO_QUOTA,
      hasQuota: true,
      capacity: 0,
      remaining: 0,
    });

    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), getAvailability);

    const montageGroups = result.public.quotaGroups.filter(
      (g) => g.key.phase === "MONTAGE" && g.key.scopeKey.startsWith("ZONE:")
    );
    expect(montageGroups).toHaveLength(2);
    expect(getAvailability).toHaveBeenCalledTimes(result.public.quotaGroups.length);
  });

  it("20. aucune transaction Prisma n'est ouverte pendant le preview", async () => {
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading"],
        ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"],
      ]),
      { template: "palais" }
    );
    await previewAccreditationsBatch(makeDb([]), parseResult, palaisCtx(), noQuotaReader());
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("21. aucune création DB (le db référentiel n'expose que findMany, toute écriture échouerait)", async () => {
    const parseResult = parseAccreditationsTable(table([RX_HEADERS, rxRow()]), { template: "rx" });
    const db = makeDb([exhibitor()], [location()]);
    await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect((db.exhibitor as unknown as Record<string, unknown>).create).toBeUndefined();
    expect((db.exhibitorLocation as unknown as Record<string, unknown>).create).toBeUndefined();
  });

  it("22. aucun e-mail n'est envoyé pendant le preview", async () => {
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading"],
        ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"],
      ]),
      { template: "palais" }
    );
    await previewAccreditationsBatch(makeDb([]), parseResult, palaisCtx(), noQuotaReader());
    expect(sendAccreditationCreationEmail).not.toHaveBeenCalled();
  });

  it("23. le résultat public est sérialisable avec JSON.stringify (aucune fonction, aucun objet Prisma)", async () => {
    const parseResult = parseAccreditationsTable(table([RX_HEADERS, rxRow()]), { template: "rx" });
    const db = makeDb([exhibitor()], [location()]);
    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect(() => JSON.stringify(result.public)).not.toThrow();
    const roundTrip = JSON.parse(JSON.stringify(result.public));
    expect(roundTrip.lines[0].status).toBe("NOUVEAU");
  });

  // ── Phase 6C-B-4 : référentiel/planning RX RÉELLEMENT revalidés par le
  // moteur unique au preview (pas seulement fait confiance à la résolution
  // naturelle propre à l'import) ─────────────────────────────────────────

  it("25. TRANSITION : exposant devenu inactif entre résolution naturelle et revalidation moteur → ligne invalide (referentiel revalidé, pas de confiance aveugle)", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: EVENT_ID, organizationId: ORG_ID, logisticsPlanningMode: "TRANSITION",
    });
    const parseResult = parseAccreditationsTable(table([RX_HEADERS, rxRow()]), { template: "rx" });
    const db = makeDb([exhibitor()], [location()]);
    // La revalidation moteur (indépendante du fixture `db` de résolution
    // naturelle ci-dessus) découvre un exposant désormais inactif.
    mockedPrisma.exhibitor.findUnique.mockResolvedValueOnce({ ...exhibitor(), isActive: false });

    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect(result.public.lines[0]!.valid).toBe(false);
    expect(result.public.lines[0]!.errors[0]!.reason).toContain("EXHIBITOR_NOT_FOUND");
    expect(result.public.ok).toBe(false);
  });

  it("26. TRANSITION : emplacement hors périmètre lors de la revalidation moteur → ligne invalide (409)", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: EVENT_ID, organizationId: ORG_ID, logisticsPlanningMode: "TRANSITION",
    });
    const parseResult = parseAccreditationsTable(table([RX_HEADERS, rxRow()]), { template: "rx" });
    const db = makeDb([exhibitor()], [location()]);
    mockedPrisma.exhibitorLocation.findUnique.mockResolvedValueOnce({
      ...location(),
      exhibitorId: "exh-other",
    });

    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect(result.public.lines[0]!.valid).toBe(false);
    expect(result.public.lines[0]!.errors[0]!.reason).toContain("LOCATION_EXHIBITOR_MISMATCH");
  });

  it("27. STRICT : planning actuel absent pour la catégorie de la ligne → ligne invalide (revalidation planning, pas de confiance à la source)", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: EVENT_ID, organizationId: ORG_ID, logisticsPlanningMode: "STRICT",
    });
    const parseResult = parseAccreditationsTable(
      table([RX_HEADERS, rxRow({ categoryId: "stand-tente", space: "EXTERIEUR_PALAIS" })]),
      { template: "rx" }
    );
    const db = makeDb([exhibitor()], [location({ logisticSpace: "EXTERIEUR_PALAIS" })]);
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([]); // aucune règle DB : STRICT n'accepte aucun repli

    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect(result.public.lines[0]!.valid).toBe(false);
    expect(result.public.lines[0]!.errors[0]!.reason).toContain("PLANNING_NOT_FOUND");
  });

  it("28. TRANSITION : référentiel et planning valides → ligne acceptée, quotas calculés depuis la projection canonique extension.categories[]", async () => {
    mockedPrisma.event.findUnique.mockResolvedValue({
      id: EVENT_ID, organizationId: ORG_ID, logisticsPlanningMode: "TRANSITION",
    });
    mockedPrisma.vehicleTypeConfig.findMany.mockResolvedValue([
      { code: "VL", pdfCode: "A", vehicleFamily: "LIGHT", rxPalmBeachAtCanto: false, rxZoneCanto: null, rxZoneVieuxPort: "LA_BOCCA" },
    ]);
    mockedPrisma.logisticsPlanning.findMany.mockResolvedValue([
      { scope: "SPACE", scopeKey: "SPACE:EXTERIEUR_PALAIS", categoryCode: "TERRE", phase: "MONTAGE", date: "2026-09-06", startTime: "08:00", endTime: "09:00" },
      { scope: "SPACE", scopeKey: "SPACE:EXTERIEUR_PALAIS", categoryCode: "TERRE", phase: "DEMONTAGE", date: "2026-09-14", startTime: "08:00", endTime: "09:00" },
    ]);
    const parseResult = parseAccreditationsTable(
      table([
        RX_HEADERS,
        rxRow({
          categoryId: "stand-tente",
          space: "EXTERIEUR_PALAIS",
          livDate: "2026-09-06",
          livTime: "08:00-09:00",
          repDate: "2026-09-14",
          repTime: "08:00-09:00",
        }),
      ]),
      { template: "rx" }
    );
    const db = makeDb([exhibitor()], [location({ logisticSpace: "EXTERIEUR_PALAIS" })]);

    const result = await previewAccreditationsBatch(db, parseResult, rxCtx(), noQuotaReader());

    expect(result.public.lines[0]!.valid).toBe(true);
    expect(result.public.lines[0]!.errors).toEqual([]);
    expect(result.public.lines[0]!.quotaCandidates.length).toBeGreaterThan(0);
  });

  it("24. aucune donnée client (colonnes informatives ORGANIZATION/EVENT) n'influence le contexte serveur", async () => {
    const parseResult = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading", "organization", "event"],
        ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear", "AUTRE_ORG", "AUTRE_EVENT"],
      ]),
      { template: "palais" }
    );
    const ctx = palaisCtx({ organizationSlug: "palais", eventSlug: "cannes-2026" });
    const result = await previewAccreditationsBatch(makeDb([]), parseResult, ctx, noQuotaReader());

    const plan = result.internalLinePlans[0]!;
    expect(plan.command.organizationSlug).toBe("palais");
    expect(plan.command.event).toBe("cannes-2026");
    expect(result.public.lines[0]!.valid).toBe(true);
  });
});
