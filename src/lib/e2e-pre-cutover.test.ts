/**
 * Test E2E pré-cutover (Phase 8) — simule le cycle complet
 * "référentiel importé → planning résolu → fusionné dans le formulaire →
 * accréditation rattachée → organisation purgée" en utilisant les VRAIES
 * fonctions pures de chaque phase, sans base de données réelle.
 *
 * Ce test ne mocke jamais la logique métier elle-même (resolvePlanning,
 * applyPlanningOverrides, computePurgeCounts, executeOrganizationPurge) —
 * seule la couche de persistance (Prisma) est simulée en mémoire, exactement
 * comme le permettent les délégués `PurgeDb` / les paramètres purs de
 * `resolvePlanning`.
 */
import { describe, it, expect, vi } from "vitest";
import { resolvePlanning, type PlanningRuleRow } from "@/lib/logistics-planning";
import { applyPlanningOverrides } from "@/templates/accreditation/rx/planning-bridge";
import type { RxSpaceDef } from "@/templates/accreditation/rx/config";
import {
  computePurgeCounts,
  executeOrganizationPurge,
  validatePurgeGuards,
  type PurgeDb,
} from "@/lib/purge-organization";

describe("E2E pré-cutover — import référentiel → planning → formulaire → purge", () => {
  const ORG_RX = "org-rx-e2e";
  const EXHIBITOR_ID = "exhibitor-sunseeker";
  const LOCATION_ID = "location-pan-023";

  it("un emplacement importé (PAN 023, secteur POWER) retrouve ses règles de planning importées, et l'espace RX statique est fusionné sans être modifié", () => {
    // 1) Référentiel "importé" (simule le résultat d'un commit référentiel Phase 3/4B).
    const importedLocation = {
      id: LOCATION_ID,
      exhibitorId: EXHIBITOR_ID,
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
    };

    // 2) Planning "importé" (simule le résultat d'un commit planning Phase 3/5).
    const importedPlanningRows: PlanningRuleRow[] = [
      {
        scope: "SPACE",
        scopeKey: `SPACE:${importedLocation.logisticSpace}`,
        phase: "MONTAGE",
        categoryCode: "PONTON_PRIVATIF",
        date: "2026-09-13",
        startTime: "08:00",
        endTime: "12:00",
      },
      {
        scope: "SPACE",
        scopeKey: `SPACE:${importedLocation.logisticSpace}`,
        phase: "DEMONTAGE",
        categoryCode: "PONTON_PRIVATIF",
        date: "2026-09-16",
        startTime: "12:00",
        endTime: "23:00",
      },
    ];

    // 3) Résolution planning réelle (mode TRANSITION — donnée DB préférée, repli legacy sinon).
    const montageResolution = resolvePlanning({
      mode: "TRANSITION",
      phase: "MONTAGE",
      categoryCode: "PONTON_PRIVATIF",
      location: {
        logisticSpace: importedLocation.logisticSpace,
        sectorCode: importedLocation.sectorCode,
        portCode: importedLocation.portCode,
      },
      rows: importedPlanningRows,
    });
    expect(montageResolution.source).toBe("DB");
    expect(montageResolution.slots).toEqual({ "2026-09-13": "08:00-12:00" });

    const demontageResolution = resolvePlanning({
      mode: "TRANSITION",
      phase: "DEMONTAGE",
      categoryCode: "PONTON_PRIVATIF",
      location: {
        logisticSpace: importedLocation.logisticSpace,
        sectorCode: importedLocation.sectorCode,
        portCode: importedLocation.portCode,
      },
      rows: importedPlanningRows,
    });
    expect(demontageResolution.source).toBe("DB");
    expect(demontageResolution.slots).toEqual({ "2026-09-16": "12:00-23:00" });

    // 4) Fusion dans l'espace RX statique (simule StepDeliveryRx / StepPickupRx).
    const legacySpace: RxSpaceDef = {
      id: "POWER",
      label: "Power Boat Marina",
      categories: [
        {
          id: "ponton-privatif",
          name: "Ponton privatif",
          liv: { "1999-01-01": "00:00-01:00" }, // valeur legacy volontairement "fausse" pour prouver le remplacement
          rep: { "1999-01-01": "00:00-01:00" },
          scales: false,
        },
      ],
    };
    const legacySnapshotBeforeMerge = JSON.parse(JSON.stringify(legacySpace));

    const mergedForMontage = applyPlanningOverrides(
      legacySpace,
      { "ponton-privatif": montageResolution },
      "liv"
    );
    const mergedForDemontage = applyPlanningOverrides(
      legacySpace,
      { "ponton-privatif": demontageResolution },
      "rep"
    );

    expect(mergedForMontage?.categories[0].liv).toEqual({ "2026-09-13": "08:00-12:00" });
    expect(mergedForDemontage?.categories[0].rep).toEqual({ "2026-09-16": "12:00-23:00" });
    // L'espace statique source n'a JAMAIS été modifié (immutabilité garantie).
    expect(legacySpace).toEqual(legacySnapshotBeforeMerge);
  });

  it("en mode STRICT, un emplacement sans règle importée perd la catégorie (jamais de créneau inventé)", () => {
    const resolution = resolvePlanning({
      mode: "STRICT",
      phase: "MONTAGE",
      categoryCode: "PONTON_PRIVATIF",
      location: { logisticSpace: "AUCUNE_REGLE", sectorCode: null, portCode: null },
      rows: [],
    });
    expect(resolution.error?.code).toBe("PLANNING_NOT_FOUND");

    const space: RxSpaceDef = {
      id: "AUCUNE_REGLE",
      label: "Espace sans règle",
      categories: [{ id: "ponton-privatif", name: "Ponton privatif", liv: { "2026-01-01": "08:00-12:00" }, rep: {}, scales: false }],
    };
    const merged = applyPlanningOverrides(space, { "ponton-privatif": resolution }, "liv");
    expect(merged?.categories[0].liv).toEqual({});
  });

  it("la purge de l'organisation RX ne supprime que ses propres données, jamais celles d'une autre organisation (isolation multi-tenant)", async () => {
    // Simule deux organisations dans la même base : RX (à purger) et Palais (jamais touchée).
    const rows = {
      accreditation: [
        { id: "acc-rx-1", organizationId: ORG_RX },
        { id: "acc-palais-1", organizationId: "org-palais" },
      ],
      exhibitor: [
        { id: EXHIBITOR_ID, organizationId: ORG_RX },
        { id: "exhibitor-palais", organizationId: "org-palais" },
      ],
    };

    function scoped<T extends { organizationId: string }>(list: T[], organizationId: string): T[] {
      return list.filter((r) => r.organizationId === organizationId);
    }

    const countModel = () => ({ count: vi.fn(async () => 0), deleteMany: vi.fn(async () => ({ count: 0 })) });
    const db: PurgeDb = {
      accreditation: {
        findMany: vi.fn(async ({ where }: { where: { organizationId: string } }) =>
          scoped(rows.accreditation, where.organizationId).map((r) => ({ id: r.id }))
        ),
        count: vi.fn(async ({ where }: { where: { organizationId: string } }) =>
          scoped(rows.accreditation, where.organizationId).length
        ),
        deleteMany: vi.fn(async ({ where }: { where: { organizationId: string } }) => {
          const before = rows.accreditation.length;
          rows.accreditation = rows.accreditation.filter((r) => r.organizationId !== where.organizationId);
          return { count: before - rows.accreditation.length };
        }),
      },
      accreditationHistoryArchive: countModel(),
      supportTicket: countModel(),
      exhibitorLocation: countModel(),
      exhibitor: {
        count: vi.fn(async ({ where }: { where: { organizationId: string } }) =>
          scoped(rows.exhibitor, where.organizationId).length
        ),
        deleteMany: vi.fn(async ({ where }: { where: { organizationId: string } }) => {
          const before = rows.exhibitor.length;
          rows.exhibitor = rows.exhibitor.filter((r) => r.organizationId !== where.organizationId);
          return { count: before - rows.exhibitor.length };
        }),
      },
      stand: countModel(),
      rxCapacity: countModel(),
      logisticsPlanning: countModel(),
      importBatch: countModel(),
    };

    // Guard : conjonction exacte requise, sinon refus (jamais de suppression).
    const guard = validatePurgeGuards({
      args: {
        orgId: ORG_RX,
        orgSlug: "rx",
        confirmSlug: "rx",
        execute: true,
        backupConfirmed: true,
      },
      envAllowed: true,
      organization: { id: ORG_RX, slug: "rx" },
    });
    expect(guard).toEqual({ ok: true });

    const before = await computePurgeCounts(db, ORG_RX);
    expect(before.accreditations).toBe(1);
    expect(before.exhibitors).toBe(1);

    await executeOrganizationPurge(db, ORG_RX);

    const after = await computePurgeCounts(db, ORG_RX);
    expect(after.accreditations).toBe(0);
    expect(after.exhibitors).toBe(0);

    // Palais totalement intact.
    expect(rows.accreditation).toEqual([{ id: "acc-palais-1", organizationId: "org-palais" }]);
    expect(rows.exhibitor).toEqual([{ id: "exhibitor-palais", organizationId: "org-palais" }]);
  });

  it("la purge est refusée pour l'organisation Palais quels que soient les arguments (défense en profondeur)", () => {
    const guard = validatePurgeGuards({
      args: {
        orgId: "org-palais",
        orgSlug: "palais",
        confirmSlug: "palais",
        execute: true,
        backupConfirmed: true,
      },
      envAllowed: true,
      organization: { id: "org-palais", slug: "palais" },
    });
    expect(guard.ok).toBe(false);
    expect((guard as { code: string }).code).toBe("FORBIDDEN_SLUG_PALAIS");
  });
});
