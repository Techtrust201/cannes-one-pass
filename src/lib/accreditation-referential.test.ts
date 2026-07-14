import { describe, it, expect, vi } from "vitest";
import {
  resolveTrustedAccreditationReferential,
  type AccreditationReferentialDb,
  type TrustedExhibitorRow,
  type TrustedLocationRow,
  type TrustedReferentialContext,
} from "./accreditation-referential";

function exhibitorRow(overrides: Partial<TrustedExhibitorRow> = {}): TrustedExhibitorRow {
  return {
    id: "exh-1",
    name: "Yacht Co",
    nameNormalized: "YACHT CO",
    externalReference: "EXT-1",
    organizationId: "org-rx",
    eventId: "event-rx",
    isActive: true,
    ...overrides,
  };
}

function locationRow(overrides: Partial<TrustedLocationRow> = {}): TrustedLocationRow {
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

/** Fabrique un db mocké piloté par des tableaux de résultats (findMany) et des maps id->row (findUnique). */
function makeDb(opts: {
  exhibitorById?: Record<string, TrustedExhibitorRow | null>;
  exhibitorsByQuery?: TrustedExhibitorRow[];
  locationById?: Record<string, TrustedLocationRow | null>;
  locationsByQuery?: TrustedLocationRow[];
} = {}): AccreditationReferentialDb {
  return {
    exhibitor: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
        opts.exhibitorById?.[where.id] ?? null
      ),
      findMany: vi.fn().mockResolvedValue(opts.exhibitorsByQuery ?? []),
    },
    exhibitorLocation: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
        opts.locationById?.[where.id] ?? null
      ),
      findMany: vi.fn().mockResolvedValue(opts.locationsByQuery ?? []),
    },
  };
}

function ctx(mode: TrustedReferentialContext["logisticsPlanningMode"]): TrustedReferentialContext {
  return { organizationId: "org-rx", eventId: "event-rx", logisticsPlanningMode: mode };
}

describe("resolveTrustedAccreditationReferential — résolution référentielle hybride (Phase 6C-B-1, lecture seule)", () => {
  it("1. DISABLED sans UUID ni critère → succès référentiel null, aucune écriture, aucun appel DB inutile", async () => {
    const db = makeDb();
    const res = await resolveTrustedAccreditationReferential(db, ctx("DISABLED"), {});
    expect(res).toEqual({ ok: true, referential: null, exhibitor: null, location: null });
    expect(db.exhibitor.findMany).not.toHaveBeenCalled();
  });

  it("2. DISABLED UUID étranger → ignoré, résolution naturelle best-effort réussie", async () => {
    const db = makeDb({
      exhibitorById: { "foreign-uuid": exhibitorRow({ id: "foreign-uuid", organizationId: "org-autre" }) },
      exhibitorsByQuery: [exhibitorRow()],
    });
    const res = await resolveTrustedAccreditationReferential(db, ctx("DISABLED"), {
      exhibitorId: "foreign-uuid",
      exhibitorName: "Yacht Co",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.referential?.exhibitorId).toBe("exh-1");
      expect(res.referential?.exhibitorLocationId).toBeNull();
    }
  });

  it("3. DISABLED, exposant introuvable : snapshot historique conservé avec FK nulles", async () => {
    const db = makeDb();
    const snapshot = {
      exhibitorName: "Ancien Nom SARL",
      locationType: "FLOT" as const,
      locationCode: "PAN 099",
      portCode: "PORT CANTO",
      sectorCode: "PAN",
      logisticSpace: "PAN",
    };
    const res = await resolveTrustedAccreditationReferential(db, ctx("DISABLED"), {
      legacyLocationLabel: "PAN 099",
      legacyLocationSnapshot: snapshot,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.referential).toEqual({
        exhibitorId: null,
        exhibitorLocationId: null,
        locationLabel: "PAN 099",
        locationSnapshot: snapshot,
      });
      expect(res.exhibitor).toBeNull();
      expect(res.location).toBeNull();
    }
  });

  it("4. TRANSITION sans exposant → 400 EXHIBITOR_REQUIRED, aucun appel DB", async () => {
    const db = makeDb();
    const res = await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {});
    expect(res).toMatchObject({ ok: false, status: 400, code: "EXHIBITOR_REQUIRED" });
    expect(db.exhibitor.findUnique).not.toHaveBeenCalled();
    expect(db.exhibitor.findMany).not.toHaveBeenCalled();
  });

  it("5. STRICT sans emplacement → 400 LOCATION_REQUIRED (exposant pourtant résolu)", async () => {
    const db = makeDb({ exhibitorById: { "exh-1": exhibitorRow() } });
    const res = await resolveTrustedAccreditationReferential(db, ctx("STRICT"), {
      exhibitorId: "exh-1",
    });
    expect(res).toMatchObject({ ok: false, status: 400, code: "LOCATION_REQUIRED" });
  });

  it("6. UUID exposant valide → référentiel résolu avec exhibitorId serveur", async () => {
    const db = makeDb({ exhibitorById: { "exh-1": exhibitorRow() }, locationsByQuery: [locationRow()] });
    const res = await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorId: "exh-1",
      locationCode: "PAN 001",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.exhibitor?.id).toBe("exh-1");
  });

  it("7. UUID exposant d'une autre organisation → refus uniforme (409, message anti-IDOR)", async () => {
    const db = makeDb({ exhibitorById: { "exh-1": exhibitorRow({ organizationId: "org-autre" }) } });
    const res = await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorId: "exh-1",
    });
    expect(res).toMatchObject({ ok: false, status: 409, code: "EXHIBITOR_SCOPE_MISMATCH" });
    if (!res.ok) {
      expect(res.message).not.toMatch(/org-autre|org-rx/);
    }
  });

  it("8. UUID exposant d'un autre événement → refus uniforme (409)", async () => {
    const db = makeDb({ exhibitorById: { "exh-1": exhibitorRow({ eventId: "event-autre" }) } });
    const res = await resolveTrustedAccreditationReferential(db, ctx("STRICT"), {
      exhibitorId: "exh-1",
    });
    expect(res).toMatchObject({ ok: false, status: 409, code: "EXHIBITOR_SCOPE_MISMATCH" });
  });

  it("9. exposant inactif → refus (409 EXHIBITOR_NOT_FOUND, jamais un statut révélateur)", async () => {
    const db = makeDb({ exhibitorById: { "exh-1": exhibitorRow({ isActive: false }) } });
    const res = await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorId: "exh-1",
    });
    expect(res).toMatchObject({ ok: false, status: 409, code: "EXHIBITOR_NOT_FOUND" });
  });

  it("10. UUID location valide → référentiel complet avec exhibitorLocationId serveur", async () => {
    const db = makeDb({
      exhibitorById: { "exh-1": exhibitorRow() },
      locationById: { "loc-1": locationRow() },
    });
    const res = await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorId: "exh-1",
      exhibitorLocationId: "loc-1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.location?.id).toBe("loc-1");
      expect(res.referential?.exhibitorLocationId).toBe("loc-1");
      expect(res.referential?.locationLabel).toBe("PAN 001");
    }
  });

  it("11. location appartenant à un autre exposant → refus (409 LOCATION_EXHIBITOR_MISMATCH)", async () => {
    const db = makeDb({
      exhibitorById: { "exh-1": exhibitorRow() },
      locationById: { "loc-9": locationRow({ id: "loc-9", exhibitorId: "exh-autre" }) },
    });
    const res = await resolveTrustedAccreditationReferential(db, ctx("STRICT"), {
      exhibitorId: "exh-1",
      exhibitorLocationId: "loc-9",
    });
    expect(res).toMatchObject({ ok: false, status: 409, code: "LOCATION_EXHIBITOR_MISMATCH" });
  });

  it("12. location inactive → refus (409 LOCATION_NOT_FOUND, jamais un statut révélateur)", async () => {
    const db = makeDb({
      exhibitorById: { "exh-1": exhibitorRow() },
      locationById: { "loc-1": locationRow({ isActive: false }) },
    });
    const res = await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorId: "exh-1",
      exhibitorLocationId: "loc-1",
    });
    expect(res).toMatchObject({ ok: false, status: 409, code: "LOCATION_NOT_FOUND" });
  });

  it("13. externalReference prioritaire : filtre sur externalReference, pas sur le nom", async () => {
    const db = makeDb({ exhibitorsByQuery: [exhibitorRow()], locationsByQuery: [locationRow()] });
    const res = await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorExternalReference: "EXT-1",
      exhibitorName: "Nom Différent",
      locationCode: "PAN 001",
    });
    expect(res.ok).toBe(true);
    const where = (db.exhibitor.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.externalReference).toBe("EXT-1");
    expect(where.nameNormalized).toBeUndefined();
  });

  it("14. résolution par nameNormalized quand aucune référence externe", async () => {
    const db = makeDb({ exhibitorsByQuery: [exhibitorRow()] });
    await resolveTrustedAccreditationReferential(db, ctx("DISABLED"), { exhibitorName: "Yacht Co" });
    const where = (db.exhibitor.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.nameNormalized).toBe("YACHT CO");
    expect(where.externalReference).toBeUndefined();
  });

  it("15. exposants homonymes → ambiguïté (409 EXHIBITOR_AMBIGUOUS), jamais de choix arbitraire", async () => {
    const db = makeDb({
      exhibitorsByQuery: [exhibitorRow({ id: "exh-1" }), exhibitorRow({ id: "exh-2" })],
    });
    const res = await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorName: "Yacht Co",
    });
    expect(res).toMatchObject({ ok: false, status: 409, code: "EXHIBITOR_AMBIGUOUS" });
  });

  it("16. codeNormalized : le code d'emplacement fourni est normalisé avant recherche", async () => {
    const db = makeDb({ exhibitorsByQuery: [exhibitorRow()], locationsByQuery: [locationRow()] });
    await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorExternalReference: "EXT-1",
      locationCode: "PAN-001",
    });
    const where = (db.exhibitorLocation.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.codeNormalized).toBe("PAN001");
    expect(where.exhibitorId).toBe("exh-1");
    expect(where.isActive).toBe(true);
  });

  it("17. locationType optionnel : transmis au filtre seulement s'il est fourni", async () => {
    const db = makeDb({ exhibitorsByQuery: [exhibitorRow()], locationsByQuery: [locationRow()] });
    await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorExternalReference: "EXT-1",
      locationCode: "PAN 001",
      locationType: "FLOT",
    });
    const where = (db.exhibitorLocation.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.type).toBe("FLOT");

    const db2 = makeDb({ exhibitorsByQuery: [exhibitorRow()], locationsByQuery: [locationRow()] });
    await resolveTrustedAccreditationReferential(db2, ctx("TRANSITION"), {
      exhibitorExternalReference: "EXT-1",
      locationCode: "PAN 001",
    });
    const where2 = (db2.exhibitorLocation.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where2.type).toBeUndefined();
  });

  it("18. locations ambiguës → 409 LOCATION_AMBIGUOUS", async () => {
    const db = makeDb({
      exhibitorsByQuery: [exhibitorRow()],
      locationsByQuery: [locationRow({ id: "loc-1" }), locationRow({ id: "loc-2" })],
    });
    const res = await resolveTrustedAccreditationReferential(db, ctx("STRICT"), {
      exhibitorExternalReference: "EXT-1",
      locationCode: "PAN 001",
    });
    expect(res).toMatchObject({ ok: false, status: 409, code: "LOCATION_AMBIGUOUS" });
  });

  it("19. snapshot reconstruit UNIQUEMENT côté serveur : aucun champ planning/date/créneau/quota/zone", async () => {
    const db = makeDb({ exhibitorsByQuery: [exhibitorRow()], locationsByQuery: [locationRow()] });
    const res = await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorExternalReference: "EXT-1",
      locationCode: "PAN 001",
      locationType: "FLOT",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.referential?.locationSnapshot).toEqual({
        exhibitorName: "Yacht Co",
        locationType: "FLOT",
        locationCode: "PAN 001",
        portCode: "PORT CANTO",
        sectorCode: "PAN",
        logisticSpace: "PAN",
      });
      expect(Object.keys(res.referential!.locationSnapshot!).sort()).toEqual(
        ["exhibitorName", "locationCode", "locationType", "logisticSpace", "portCode", "sectorCode"].sort()
      );
    }
  });

  it("20. erreur DB → 503 REFERENTIAL_VALIDATION_UNAVAILABLE, sans fuite de détail Prisma", async () => {
    const db: AccreditationReferentialDb = {
      exhibitor: {
        findUnique: vi.fn().mockRejectedValue(new Error("connection terminated unexpectedly: secret-dsn")),
        findMany: vi.fn().mockResolvedValue([]),
      },
      exhibitorLocation: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const res = await resolveTrustedAccreditationReferential(db, ctx("TRANSITION"), {
      exhibitorId: "exh-1",
    });
    expect(res).toMatchObject({ ok: false, status: 503, code: "REFERENTIAL_VALIDATION_UNAVAILABLE" });
    if (!res.ok) {
      expect(res.message).not.toMatch(/secret-dsn|Prisma|Error:/);
    }
  });

  it("Palais/DISABLED : exposant résolu sans emplacement (locationCode absent) → exhibitorLocationId null, aucune requête location", async () => {
    const db = makeDb({ exhibitorsByQuery: [exhibitorRow()] });
    const res = await resolveTrustedAccreditationReferential(db, ctx("DISABLED"), {
      exhibitorName: "Yacht Co",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.referential?.exhibitorLocationId).toBeNull();
      expect(res.referential?.locationLabel).toBeNull();
    }
    expect(db.exhibitorLocation.findMany).not.toHaveBeenCalled();
  });
});
