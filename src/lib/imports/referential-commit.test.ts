import { describe, it, expect, vi } from "vitest";
import { applyReferentialCommit, deriveLegacyStand } from "./referential-commit";
import type { ReferentialCommitTx } from "./referential-commit";
import type { ParsedExhibitor } from "./referential";

function exhibitor(partial: Partial<ParsedExhibitor> = {}): ParsedExhibitor {
  return {
    name: "Sunseeker",
    nameNormalized: "SUNSEEKER",
    externalReference: null,
    sourceLines: [2],
    locations: [
      {
        type: "TERRE",
        code: "POWER 209",
        codeNormalized: "POWER209",
        portCode: "PORT_CANTO",
        sectorCode: "POWER",
        logisticSpace: "POWER",
        ambiguous: false,
        warningReason: null,
        sourceLines: [2],
      },
    ],
    ...partial,
  };
}

function makeTx() {
  const exhFindFirst = vi.fn<ReferentialCommitTx["exhibitor"]["findFirst"]>(async () => null);
  const exhCreate = vi.fn<ReferentialCommitTx["exhibitor"]["create"]>(async () => ({ id: "exh-1" }));
  const exhUpdate = vi.fn<ReferentialCommitTx["exhibitor"]["update"]>(async () => ({}));
  const locFindFirst = vi.fn<ReferentialCommitTx["exhibitorLocation"]["findFirst"]>(async () => null);
  const locCreate = vi.fn<ReferentialCommitTx["exhibitorLocation"]["create"]>(async () => ({
    id: "loc-1",
  }));
  const locUpdate = vi.fn<ReferentialCommitTx["exhibitorLocation"]["update"]>(async () => ({}));

  const tx: ReferentialCommitTx = {
    exhibitor: { findFirst: exhFindFirst, create: exhCreate, update: exhUpdate },
    exhibitorLocation: { findFirst: locFindFirst, create: locCreate, update: locUpdate },
  };
  return { tx, exhFindFirst, exhCreate, exhUpdate, locFindFirst, locCreate, locUpdate };
}

const CTX = { organizationId: "org-rx", eventId: "evt-1" };

function loc(type: "TERRE" | "FLOT" | "STAND", code: string) {
  return {
    type,
    code,
    codeNormalized: code.replace(/\s+/g, ""),
    portCode: null,
    sectorCode: null,
    logisticSpace: null,
    ambiguous: false,
    sourceLines: [2],
  };
}

describe("deriveLegacyStand", () => {
  it("priorite STAND > TERRE > FLOT", () => {
    expect(deriveLegacyStand(exhibitor({ locations: [loc("FLOT", "F1"), loc("STAND", "S1")] }))).toBe(
      "S1"
    );
  });
  it("TERRE uniquement -> code TERRE", () => {
    expect(deriveLegacyStand(exhibitor({ locations: [loc("TERRE", "PAN 023")] }))).toBe("PAN 023");
  });
  it("FLOT uniquement -> code FLOT", () => {
    expect(deriveLegacyStand(exhibitor({ locations: [loc("FLOT", "POWER 210")] }))).toBe("POWER 210");
  });
  it("TERRE + FLOT -> TERRE (priorite), FLOT conserve comme emplacement", () => {
    const e = exhibitor({ locations: [loc("FLOT", "POWER 210"), loc("TERRE", "POWER 209")] });
    expect(deriveLegacyStand(e)).toBe("POWER 209");
    expect(e.locations.map((l) => l.type).sort()).toEqual(["FLOT", "TERRE"]);
  });
  it("JAMAIS le nom de la societe ; aucun emplacement -> leve", () => {
    expect(() => deriveLegacyStand(exhibitor({ locations: [] }))).toThrow();
  });
});

describe("applyReferentialCommit — creation", () => {
  it("cree exposant + emplacement absents (stand derive)", async () => {
    const { tx, exhCreate, locCreate } = makeTx();
    const res = await applyReferentialCommit(tx, [exhibitor()], CTX);

    expect(exhCreate).toHaveBeenCalledOnce();
    const data = exhCreate.mock.calls[0]![0].data;
    expect(data.stand).toBe("POWER 209");
    expect(data.nameNormalized).toBe("SUNSEEKER");
    expect(locCreate).toHaveBeenCalledOnce();

    expect(res.exhibitorsCreated).toBe(1);
    expect(res.locationsCreated).toBe(1);
    expect(res.counters.created).toBe(2);
    expect(res.counters.deactivated).toBe(0);
  });
});

describe("applyReferentialCommit — FUSION idempotente", () => {
  it("exposant + emplacement identiques -> inchanges", async () => {
    const { tx, exhFindFirst, locFindFirst, exhUpdate, locUpdate } = makeTx();
    exhFindFirst.mockResolvedValueOnce({
      id: "exh-1",
      name: "Sunseeker",
      nameNormalized: "SUNSEEKER",
      externalReference: null,
      stand: "POWER 209",
    });
    locFindFirst.mockResolvedValueOnce({
      id: "loc-1",
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
      isActive: true,
    });

    const res = await applyReferentialCommit(tx, [exhibitor()], CTX);

    expect(exhUpdate).not.toHaveBeenCalled();
    expect(locUpdate).not.toHaveBeenCalled();
    expect(res.exhibitorsUnchanged).toBe(1);
    expect(res.locationsUnchanged).toBe(1);
    expect(res.counters.unchanged).toBe(2);
  });

  it("geographie differente -> emplacement mis a jour, jamais desactive", async () => {
    const { tx, exhFindFirst, locFindFirst, locUpdate } = makeTx();
    exhFindFirst.mockResolvedValueOnce({
      id: "exh-1",
      name: "Sunseeker",
      nameNormalized: "SUNSEEKER",
      externalReference: null,
      stand: "POWER 209",
    });
    locFindFirst.mockResolvedValueOnce({
      id: "loc-1",
      portCode: null,
      sectorCode: null,
      logisticSpace: null,
      isActive: true,
    });

    const res = await applyReferentialCommit(tx, [exhibitor()], CTX);

    expect(locUpdate).toHaveBeenCalledOnce();
    const data = locUpdate.mock.calls[0]![0].data;
    expect(data.portCode).toBe("PORT_CANTO");
    expect(data.isActive).toBe(true);
    expect(res.locationsUpdated).toBe(1);
    expect(res.counters.deactivated).toBe(0);
  });

  it("emplacement precedemment desactive -> reactive (update)", async () => {
    const { tx, exhFindFirst, locFindFirst, locUpdate } = makeTx();
    exhFindFirst.mockResolvedValueOnce({
      id: "exh-1",
      name: "Sunseeker",
      nameNormalized: "SUNSEEKER",
      externalReference: null,
      stand: "POWER 209",
    });
    locFindFirst.mockResolvedValueOnce({
      id: "loc-1",
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
      isActive: false,
    });

    const res = await applyReferentialCommit(tx, [exhibitor()], CTX);
    expect(locUpdate).toHaveBeenCalledOnce();
    expect(locUpdate.mock.calls[0]![0].data.isActive).toBe(true);
    expect(res.locationsUpdated).toBe(1);
  });

  it("fusion scopee org + event + nameNormalized (anti multi-org)", async () => {
    const { tx, exhFindFirst, exhCreate } = makeTx();
    // findFirst renvoie null -> l'exposant homonyme d'un AUTRE event/org n'est
    // pas trouve, donc jamais fusionne : une nouvelle creation a lieu.
    await applyReferentialCommit(tx, [exhibitor()], { organizationId: "org-rx", eventId: "evt-1" });
    expect(exhFindFirst.mock.calls[0]![0].where).toEqual({
      organizationId: "org-rx",
      eventId: "evt-1",
      nameNormalized: "SUNSEEKER",
    });
    expect(exhCreate).toHaveBeenCalledOnce();
    // La creation porte bien organizationId + eventId du contexte serveur.
    const data = exhCreate.mock.calls[0]![0].data;
    expect(data.organizationId).toBe("org-rx");
    expect(data.eventId).toBe("evt-1");
  });

  it("nom d'affichage change -> exposant mis a jour", async () => {
    const { tx, exhFindFirst, locFindFirst, exhUpdate } = makeTx();
    exhFindFirst.mockResolvedValueOnce({
      id: "exh-1",
      name: "SUNSEEKER SA",
      nameNormalized: "SUNSEEKER",
      externalReference: null,
      stand: "POWER 209",
    });
    locFindFirst.mockResolvedValueOnce({
      id: "loc-1",
      portCode: "PORT_CANTO",
      sectorCode: "POWER",
      logisticSpace: "POWER",
      isActive: true,
    });

    const res = await applyReferentialCommit(tx, [exhibitor()], CTX);
    expect(exhUpdate).toHaveBeenCalledOnce();
    expect(exhUpdate.mock.calls[0]![0].data.name).toBe("Sunseeker");
    expect(res.exhibitorsUpdated).toBe(1);
  });
});
