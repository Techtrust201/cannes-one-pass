import { describe, it, expect } from "vitest";
import {
  parseAccessRulesCsv,
  prepareAccessRules,
  type AccessRulesParseResult,
} from "./access-rules";
import type { ReferentialResolverDb } from "./accreditations-referential-resolver";

const HEADERS = [
  "EVENT",
  "COMPANY",
  "LOCATION TYPE",
  "LOCATION CODE",
  "PORT",
  "SECTOR",
  "LOGISTIC SPACE",
  "WAITING ZONE",
  "PHASE",
  "DATE START",
  "DATE END",
  "START TIME",
  "END TIME",
  "VEHICLE FAMILY",
  "ALLOWED VEHICLE TYPES",
  "CAPACITY",
  "COMMENT",
].join(",");

function csv(rows: string): string {
  return `${HEADERS}\n${rows}`;
}

function mockDb(opts: {
  exhibitors?: Array<{
    id: string;
    name: string;
    nameNormalized: string;
    externalReference?: string | null;
  }>;
  locations?: Array<{
    id: string;
    exhibitorId: string;
    type: "TERRE" | "FLOT" | "STAND";
    code: string;
    codeNormalized: string;
  }>;
}): ReferentialResolverDb {
  const exhibitors = opts.exhibitors ?? [
    {
      id: "ex-1",
      name: "Sunseeker",
      nameNormalized: "SUNSEEKER",
      externalReference: null,
    },
  ];
  const locations = opts.locations ?? [
    {
      id: "loc-1",
      exhibitorId: "ex-1",
      type: "TERRE" as const,
      code: "POWER 209",
      codeNormalized: "POWER209",
    },
  ];

  return {
    exhibitor: {
      async findMany({ where }) {
        return exhibitors
          .filter((e) => {
            if (where.nameNormalized && e.nameNormalized !== where.nameNormalized) return false;
            if (where.externalReference && e.externalReference !== where.externalReference) {
              return false;
            }
            return true;
          })
          .map((e) => ({
            id: e.id,
            name: e.name,
            nameNormalized: e.nameNormalized,
            externalReference: e.externalReference ?? null,
            organizationId: "org-1",
            eventId: "evt-1",
          }));
      },
    },
    exhibitorLocation: {
      async findMany({ where }) {
        return locations
          .filter((l) => {
            if (where.exhibitorId && l.exhibitorId !== where.exhibitorId) return false;
            if (where.codeNormalized && l.codeNormalized !== where.codeNormalized) return false;
            if (where.type && l.type !== where.type) return false;
            return true;
          })
          .map((l) => ({
            id: l.id,
            exhibitorId: l.exhibitorId,
            type: l.type,
            code: l.code,
            codeNormalized: l.codeNormalized,
            portCode: "PORT_CANTO",
            sectorCode: "POWER",
            logisticSpace: "POWER",
            isActive: true,
          }));
      },
    },
  };
}

async function prepare(
  parseResult: AccessRulesParseResult,
  db: ReferentialResolverDb = mockDb({})
) {
  return prepareAccessRules(parseResult, {
    organizationId: "org-1",
    eventId: "evt-1",
    validZoneCodes: new Set(["LA_BOCCA"]),
    validVehicleTypeCodes: new Set(["VL", "PORTEUR"]),
    db,
  });
}

describe("parseAccessRulesCsv / prepareAccessRules", () => {
  it("dry-run parse : ligne valide → draft planning prêt à résoudre", () => {
    const parsed = parseAccessRulesCsv(
      csv(
        "CYF26,Sunseeker,TERRE,POWER 209,PORT CANTO,POWER,POWER,LA_BOCCA,MONTAGE,2026-09-10,2026-09-10,08:00,18:00,LIGHT,VL,,Commentaire"
      )
    );
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.drafts).toHaveLength(1);
    expect(parsed.drafts[0]).toMatchObject({
      companyNormalized: "SUNSEEKER",
      locationCodeNormalized: "POWER209",
      phase: "MONTAGE",
      date: "2026-09-10",
      startTime: "08:00",
      endTime: "18:00",
      capacity: null,
      categoryCode: "ALL",
    });
  });

  it("multi-day : DATE START..DATE END produit une ligne par jour", () => {
    const parsed = parseAccessRulesCsv(
      csv(
        "CYF26,Sunseeker,TERRE,POWER 209,,,,LA_BOCCA,MONTAGE,2026-09-10,2026-09-12,08:00,12:00,,,,"
      )
    );
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.drafts.map((d) => d.date)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("exhibitor manquant → erreur EXHIBITOR_NOT_FOUND, aucun planning", async () => {
    const parsed = parseAccessRulesCsv(
      csv(
        "CYF26,Inconnu SA,TERRE,POWER 209,,,,LA_BOCCA,MONTAGE,2026-09-10,2026-09-10,08:00,18:00,,,,"
      )
    );
    expect(parsed.errors).toHaveLength(0);
    const prepared = await prepare(parsed, mockDb({ exhibitors: [], locations: [] }));
    expect(prepared.planningRows).toHaveLength(0);
    expect(prepared.errors.some((e) => e.reason.includes("EXHIBITOR_NOT_FOUND"))).toBe(true);
  });

  it("CAPACITY vide/absent → planning seul, pas de RxCapacity", async () => {
    const parsed = parseAccessRulesCsv(
      csv(
        "CYF26,Sunseeker,TERRE,POWER 209,,,,LA_BOCCA,MONTAGE,2026-09-10,2026-09-10,08:00,18:00,LIGHT,VL,,"
      )
    );
    const prepared = await prepare(parsed);
    expect(prepared.errors).toHaveLength(0);
    expect(prepared.planningRows).toHaveLength(1);
    expect(prepared.planningRows[0]).toMatchObject({
      scope: "LOCATION",
      scopeKey: "LOCATION:loc-1",
      exhibitorLocationId: "loc-1",
      zoneCode: "LA_BOCCA",
    });
    expect(prepared.capacityRows).toHaveLength(0);
  });

  it("CAPACITY valide → planning + capacité LOCATION atomiques", async () => {
    const parsed = parseAccessRulesCsv(
      csv(
        "CYF26,Sunseeker,TERRE,POWER 209,,,,LA_BOCCA,DEMONTAGE,2026-09-16,2026-09-16,12:00,17:00,HEAVY,PORTEUR,2,Note"
      )
    );
    const prepared = await prepare(parsed);
    expect(prepared.errors).toHaveLength(0);
    expect(prepared.planningRows).toHaveLength(1);
    expect(prepared.capacityRows).toEqual([
      expect.objectContaining({
        scopeKey: "LOCATION:loc-1",
        zone: "LA_BOCCA",
        vehicleFamily: "HEAVY",
        phase: "DEMONTAGE",
        capacity: 2,
      }),
    ]);
  });

  it("CAPACITY invalide → rejette toute la ligne (pas de draft planning)", () => {
    const parsed = parseAccessRulesCsv(
      csv(
        "CYF26,Sunseeker,TERRE,POWER 209,,,,LA_BOCCA,MONTAGE,2026-09-10,2026-09-10,08:00,18:00,LIGHT,VL,0,"
      )
    );
    expect(parsed.drafts).toHaveLength(0);
    expect(parsed.errors.some((e) => e.reason.includes("INVALID_CAPACITY"))).toBe(true);
  });
});
