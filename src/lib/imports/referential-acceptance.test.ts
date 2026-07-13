import { describe, it, expect } from "vitest";
import { parseReferentialCsv } from "./referential";

/**
 * Fixture representative du vrai referentiel RX (`CYF26-listeTT`) :
 * colonnes PORT / ZONE T-T / COMPANY NAME / NUM-TERRE / NUM-FLOT, avec
 * TERRE+FLOT simultanes, cellules multi-valeurs "/", variations de casse et
 * d'espaces, et une ligne dupliquee (meme emplacement) a dedoublonner.
 */
const RX_REFERENTIAL_CSV = [
  "PORT,ZONE T-T,COMPANY NAME,NUM-TERRE,NUM-FLOT",
  "PORT CANTO,POWER,Sunseeker,POWER 209,POWER 210", // TERRE + FLOT
  "PORT CANTO,POWER,Ferretti,POWER 211,", // TERRE seul
  "PORT CANTO,SAIL Multicoque,Lagoon,,SAIL 001", // FLOT seul
  "VIEUX PORT,PAN,Multi Stand,PAN 023 / PAN 024,", // multi-valeurs -> 2 TERRE
  "vieux port , jetee ,  Azimut  , jetee 012 ,", // casse/espaces
  "VIEUX PORT,JETEE,Azimut,JETEE 012,", // doublon exact (meme exposant+type+code)
  "PORT CANTO,BROKER & TOYS,Broker One,BT 001,BT 002", // TERRE + FLOT
] .join("\n");

describe("acceptation referentiel RX (fixture representative)", () => {
  const res = parseReferentialCsv(RX_REFERENTIAL_CSV);

  it("aucune erreur, aucune ligne ignoree silencieusement", () => {
    expect(res.errors).toEqual([]);
    expect(res.totalRows).toBe(7); // 7 lignes de donnees
  });

  it("NUM-TERRE et NUM-FLOT lus tous les deux (pas de flot||terre)", () => {
    const sunseeker = res.exhibitors.find((e) => e.name === "Sunseeker")!;
    const types = sunseeker.locations.map((l) => l.type).sort();
    expect(types).toEqual(["FLOT", "TERRE"]);
    expect(sunseeker.locations.find((l) => l.type === "TERRE")!.code).toBe("POWER 209");
    expect(sunseeker.locations.find((l) => l.type === "FLOT")!.code).toBe("POWER 210");
  });

  it("cellule multi-valeurs 'PAN 023 / PAN 024' -> deux emplacements", () => {
    const multi = res.exhibitors.find((e) => e.name === "Multi Stand")!;
    expect(multi.locations.filter((l) => l.type === "TERRE")).toHaveLength(2);
    expect(multi.locations.map((l) => l.code).sort()).toEqual(["PAN 023", "PAN 024"]);
  });

  it("dedoublonnage uniquement sur exhibitor + type + codeNormalized", () => {
    const azimut = res.exhibitors.find((e) => e.name.trim().toUpperCase().includes("AZIMUT"))!;
    // 'jetee 012' (casse/espaces) et 'JETEE 012' = meme emplacement -> 1 seul.
    expect(azimut.locations.filter((l) => l.type === "TERRE")).toHaveLength(1);
  });

  it("compteurs globaux : societes, emplacements, TERRE, FLOT, multi-emplacements", () => {
    const locations = res.exhibitors.flatMap((e) => e.locations);
    const terre = locations.filter((l) => l.type === "TERRE").length;
    const flot = locations.filter((l) => l.type === "FLOT").length;
    const multi = res.exhibitors.filter((e) => e.locations.length > 1).length;

    // 6 societes distinctes (Azimut dedoublonnee).
    expect(res.exhibitors).toHaveLength(6);
    // TERRE : POWER209, POWER211, PAN023, PAN024, JETEE012, BT001 = 6
    expect(terre).toBe(6);
    // FLOT : POWER210, SAIL001, BT002 = 3
    expect(flot).toBe(3);
    // Multi-emplacements : Sunseeker, Multi Stand, Broker One = 3
    expect(multi).toBe(3);
  });
});
