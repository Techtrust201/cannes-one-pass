import { describe, it, expect, vi } from "vitest";
import {
  resolveReferential,
  type ReferentialResolverDb,
  type ResolverExhibitorRow,
  type ResolverLocationRow,
} from "./accreditations-referential-resolver";

const CTX = { organizationId: "org-rx", eventId: "event-rx" };

function exhibitor(overrides: Partial<ResolverExhibitorRow> = {}): ResolverExhibitorRow {
  return {
    id: "exh-1",
    name: "Yacht Co",
    nameNormalized: "YACHT CO",
    externalReference: "EXT-1",
    organizationId: "org-rx",
    eventId: "event-rx",
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

/** Fabrique un db mocke a partir des retours d'exposants/emplacements. */
function makeDb(
  exhibitors: ResolverExhibitorRow[],
  locations: ResolverLocationRow[] = []
): ReferentialResolverDb {
  return {
    exhibitor: { findMany: vi.fn().mockResolvedValue(exhibitors) },
    exhibitorLocation: { findMany: vi.fn().mockResolvedValue(locations) },
  };
}

describe("resolveReferential — resolution referentiel (Phase 4B-1, lecture seule)", () => {
  it("10. externalReference prioritaire : filtre sur externalReference, pas sur le nom", async () => {
    const db = makeDb([exhibitor()], [location()]);
    const res = await resolveReferential(db, CTX, {
      externalReference: "EXT-1",
      name: "Nom Different",
      locationCode: "PAN 001",
    });
    expect(res.ok).toBe(true);
    const where = (db.exhibitor.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.externalReference).toBe("EXT-1");
    expect(where.nameNormalized).toBeUndefined();
    expect(where.organizationId).toBe("org-rx");
    expect(where.eventId).toBe("event-rx");
    expect(where.isActive).toBe(true);
  });

  it("11. fallback nameNormalized quand aucune reference externe", async () => {
    const db = makeDb([exhibitor()], [location()]);
    const res = await resolveReferential(db, CTX, { name: "Yacht Co", locationCode: "PAN 001" });
    expect(res.ok).toBe(true);
    const where = (db.exhibitor.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.nameNormalized).toBe("YACHT CO");
    expect(where.externalReference).toBeUndefined();
  });

  it("12. exposant absent -> EXHIBITOR_NOT_FOUND", async () => {
    const db = makeDb([]);
    const res = await resolveReferential(db, CTX, { name: "Inconnu" });
    expect(res).toMatchObject({ ok: false, code: "EXHIBITOR_NOT_FOUND" });
  });

  it("13. exposant ambigu (>1) -> EXHIBITOR_AMBIGUOUS, jamais de choix arbitraire", async () => {
    const db = makeDb([exhibitor({ id: "exh-1" }), exhibitor({ id: "exh-2" })]);
    const res = await resolveReferential(db, CTX, { name: "Yacht Co" });
    expect(res).toMatchObject({ ok: false, code: "EXHIBITOR_AMBIGUOUS" });
  });

  it("14. emplacement absent -> LOCATION_NOT_FOUND", async () => {
    const db = makeDb([exhibitor()], []);
    const res = await resolveReferential(db, CTX, { externalReference: "EXT-1", locationCode: "PAN 999" });
    expect(res).toMatchObject({ ok: false, code: "LOCATION_NOT_FOUND" });
  });

  it("15. emplacement ambigu (>1) -> LOCATION_AMBIGUOUS", async () => {
    const db = makeDb(
      [exhibitor()],
      [location({ id: "loc-1", type: "FLOT" }), location({ id: "loc-2", type: "TERRE" })]
    );
    const res = await resolveReferential(db, CTX, { externalReference: "EXT-1", locationCode: "PAN 001" });
    expect(res).toMatchObject({ ok: false, code: "LOCATION_AMBIGUOUS" });
  });

  it("16. emplacement appartenant a un autre exposant -> LOCATION_EXHIBITOR_MISMATCH", async () => {
    const db = makeDb([exhibitor({ id: "exh-1" })], [location({ id: "loc-9", exhibitorId: "exh-autre" })]);
    const res = await resolveReferential(db, CTX, { externalReference: "EXT-1", locationCode: "PAN 001" });
    expect(res).toMatchObject({ ok: false, code: "LOCATION_EXHIBITOR_MISMATCH" });
  });

  it("17. organisation differente refusee (aucun exposant renvoye pour le mauvais scope)", async () => {
    // Le db mocke ne renvoie l'exposant que pour le bon scope org/event.
    const db: ReferentialResolverDb = {
      exhibitor: {
        findMany: vi.fn().mockImplementation(async ({ where }) =>
          where.organizationId === "org-rx" ? [exhibitor()] : []
        ),
      },
      exhibitorLocation: { findMany: vi.fn().mockResolvedValue([location()]) },
    };
    const res = await resolveReferential(
      db,
      { organizationId: "org-autre", eventId: "event-rx" },
      { externalReference: "EXT-1" }
    );
    expect(res).toMatchObject({ ok: false, code: "EXHIBITOR_NOT_FOUND" });
  });

  it("18. evenement different refuse (scope eventId applique)", async () => {
    const db: ReferentialResolverDb = {
      exhibitor: {
        findMany: vi.fn().mockImplementation(async ({ where }) =>
          where.eventId === "event-rx" ? [exhibitor()] : []
        ),
      },
      exhibitorLocation: { findMany: vi.fn().mockResolvedValue([location()]) },
    };
    const res = await resolveReferential(
      db,
      { organizationId: "org-rx", eventId: "event-autre" },
      { externalReference: "EXT-1" }
    );
    expect(res).toMatchObject({ ok: false, code: "EXHIBITOR_NOT_FOUND" });
  });

  it("19. snapshot complet construit cote serveur (nom, type, code, port, secteur, espace)", async () => {
    const db = makeDb([exhibitor()], [location()]);
    const res = await resolveReferential(db, CTX, { externalReference: "EXT-1", locationCode: "PAN 001", locationType: "FLOT" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.exhibitorId).toBe("exh-1");
      expect(res.exhibitorLocationId).toBe("loc-1");
      expect(res.locationLabel).toBe("PAN 001");
      expect(res.locationSnapshot).toEqual({
        exhibitorName: "Yacht Co",
        locationType: "FLOT",
        locationCode: "PAN 001",
        portCode: "PORT CANTO",
        sectorCode: "PAN",
        logisticSpace: "PAN",
      });
    }
    // Le type fourni est bien passe au filtre de resolution.
    const locWhere = (db.exhibitorLocation.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(locWhere.type).toBe("FLOT");
    expect(locWhere.codeNormalized).toBe("PAN001");
    expect(locWhere.isActive).toBe(true);
  });

  it("20. aucun UUID lu depuis l'appelant : les identifiants proviennent uniquement de la DB", async () => {
    const db = makeDb([exhibitor({ id: "exh-server" })], [location({ id: "loc-server", exhibitorId: "exh-server" })]);
    // Meme si l'appelant tente de fournir des ids, l'input typé ne les expose
    // pas ; la resolution n'utilise que reference/nom/code.
    const res = await resolveReferential(db, CTX, {
      externalReference: "EXT-1",
      locationCode: "PAN 001",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.exhibitorId).toBe("exh-server");
      expect(res.exhibitorLocationId).toBe("loc-server");
    }
    // Aucun critere d'id n'est present dans les clauses where.
    const exhWhere = (db.exhibitor.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(exhWhere.id).toBeUndefined();
  });

  it("sans critere exposant : EXHIBITOR_NOT_FOUND explicite (jamais de resolution muette)", async () => {
    const db = makeDb([exhibitor()]);
    const res = await resolveReferential(db, CTX, { locationCode: "PAN 001" });
    expect(res).toMatchObject({ ok: false, code: "EXHIBITOR_NOT_FOUND" });
    expect((db.exhibitor.findMany as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("Palais : exposant resolu sans emplacement (locationCode absent) -> exhibitorLocationId null", async () => {
    const db = makeDb([exhibitor()]);
    const res = await resolveReferential(db, CTX, { name: "Yacht Co" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.exhibitorLocationId).toBeNull();
      expect(res.locationLabel).toBeNull();
      expect(res.locationSnapshot.exhibitorName).toBe("Yacht Co");
      expect(res.locationSnapshot.locationCode).toBeNull();
    }
    expect((db.exhibitorLocation.findMany as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
