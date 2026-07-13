import { describe, it, expect } from "vitest";
import { rowsToTable } from "./csv";
import {
  parseAccreditationsTable,
  ACCREDITATION_FORBIDDEN_COLUMNS,
} from "./accreditations";

/**
 * Construit une `ParsedTable` a partir d'une matrice brute (1re ligne =
 * entete), exactement comme `parseImportFile` le ferait pour un CSV OU un
 * XLSX : les deux formats convergent vers `rowsToTable`. Tester via cette
 * fonction couvre donc les deux chemins (aucune dependance a un fichier reel).
 */
function table(rows: string[][]) {
  return rowsToTable(rows);
}

describe("parseAccreditationsTable — parsing & mapping (Phase 4B-1)", () => {
  it("1. resout les alias francais ET anglais vers les memes champs canoniques", () => {
    const fr = parseAccreditationsTable(
      table([
        ["Societe", "Stand", "Plaque", "Taille", "Indicatif", "Telephone", "Date", "Ville", "Dechargement"],
        ["Acme", "A12", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"],
      ]),
      { template: "palais" }
    );
    const en = parseAccreditationsTable(
      table([
        ["Company", "Stand", "Plate", "Size", "Phone Code", "Phone Number", "Date", "City", "Unloading"],
        ["Acme", "A12", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear"],
      ]),
      { template: "palais" }
    );

    expect(fr.errors).toEqual([]);
    expect(en.errors).toEqual([]);
    expect(fr.rows[0]!.accreditation.company).toBe("Acme");
    expect(en.rows[0]!.accreditation.company).toBe("Acme");
    expect(fr.rows[0]!.vehicle.plate).toBe("AB-123-CD");
    expect(en.rows[0]!.vehicle.plate).toBe("AB-123-CD");
    expect(fr.rows[0]!.vehicle.phoneCode).toBe("+33");
    expect(en.rows[0]!.vehicle.phoneCode).toBe("+33");
  });

  it("2. traite indifferemment une table issue de CSV ou de XLSX (meme pivot rowsToTable)", () => {
    const result = parseAccreditationsTable(
      table([
        ["company", "stand", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading"],
        ["Beta", "B02", "XY-999-ZZ", "SEMI_REMORQUE", "+33", "611111111", "2026-05-14", "Nice", "lat+rear"],
      ]),
      { template: "palais" }
    );
    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(1);
    expect(result.rows[0]!.vehicle.unloading).toEqual(["lat", "rear"]);
  });

  it("3. parse les valeurs numeriques et booleennes (poids, kms, scalesAssigned, repSameAsDelivery)", () => {
    const result = parseAccreditationsTable(
      table([
        [
          "company", "stand", "exhibitorName", "locationCode", "contactFirstName", "contactLastName",
          "contactEmail", "contactPhoneCode", "contactPhoneNumber", "space", "categoryId",
          "vehicleType", "phoneCode", "phoneNumber", "livDate", "livTime", "repDate", "repTime",
          "estimatedKms", "emptyWeight", "maxWeight", "currentWeight", "scalesAssigned", "repSameAsDelivery",
        ],
        [
          "Gamma", "PAN 023", "Gamma", "PAN 023", "Jean", "Dupont",
          "jean@gamma.fr", "+33", "600000001", "PAN", "cat1",
          "CAMION_20T", "+33", "600000001", "2026-09-10", "08:00-09:00", "2026-09-20", "08:00-09:00",
          "1200,5", "3", "19", "12", "oui", "non",
        ],
      ]),
      { template: "rx" }
    );
    expect(result.errors).toEqual([]);
    const row = result.rows[0]!;
    expect(row.vehicle.estimatedKms).toBe(1200.5);
    expect(row.vehicle.emptyWeight).toBe(3);
    expect(row.vehicle.maxWeight).toBe(19);
    expect(row.vehicle.currentWeight).toBe(12);
    expect(row.rx!.scalesAssigned).toBe(true);
    expect(row.rx!.rep.repSameAsDelivery).toBe(false);
  });

  it("4. RX : plaque vide acceptee (plate = null, aucune erreur de plaque)", () => {
    const result = parseAccreditationsTable(
      table([
        ["company", "stand", "exhibitorName", "locationCode", "plate", "vehicleType", "phoneCode", "phoneNumber", "livDate"],
        ["Delta", "PAN 024", "Delta", "PAN 024", "", "CAMION_20T", "+33", "600000002", "2026-09-11"],
      ]),
      { template: "rx" }
    );
    expect(result.rows[0]!.vehicle.plate).toBeNull();
    expect(result.errors).toEqual([]);
  });

  it("5. RX : vehicleType manquant signale de maniere structuree (RX_VEHICLE_TYPE_REQUIRED)", () => {
    const result = parseAccreditationsTable(
      table([
        ["company", "stand", "exhibitorName", "locationCode", "plate", "phoneCode", "phoneNumber", "livDate"],
        ["Epsilon", "PAN 025", "Epsilon", "PAN 025", "", "+33", "600000003", "2026-09-12"],
      ]),
      { template: "rx" }
    );
    const issue = result.errors.find((e) => e.reason.startsWith("RX_VEHICLE_TYPE_REQUIRED"));
    expect(issue).toBeDefined();
    expect(issue!.line).toBe(2);
  });

  it("6. colonnes sensibles interdites -> FORBIDDEN_COLUMN (jamais ignorees)", () => {
    const result = parseAccreditationsTable(
      table([
        ["company", "stand", "organizationId", "eventId", "status", "exhibitorId", "exhibitorLocationId", "locationSnapshot", "actorSource"],
        ["Zeta", "Z01", "org-x", "evt-x", "ENTREE", "exh-x", "loc-x", "{}", "SUPER_ADMIN"],
      ]),
      { template: "palais" }
    );
    const forbiddenIssues = result.errors.filter((e) => e.reason.startsWith("FORBIDDEN_COLUMN"));
    // 7 concepts sensibles presents dans l'entete.
    expect(forbiddenIssues.length).toBe(7);
    for (const forbidden of ACCREDITATION_FORBIDDEN_COLUMNS) {
      expect(result.errors.some((e) => e.reason.includes(forbidden.code))).toBe(true);
    }
  });

  it("7. RX : une ligne reconstruit correctement le brouillon d'extension (contact, space, categorie, reprise)", () => {
    const result = parseAccreditationsTable(
      table([
        [
          "company", "stand", "exhibitorName", "locationCode", "locationType",
          "contactFirstName", "contactLastName", "contactEmail", "contactPhoneCode", "contactPhoneNumber",
          "space", "categoryId", "vehicleType", "phoneCode", "phoneNumber",
          "livDate", "livTime", "repDate", "repTime", "manutentionProvider", "repVehicleType",
        ],
        [
          "Yacht Co", "PAN 001", "Yacht Co", "PAN 001", "FLOT",
          "Jean", "Dupont", "contact@yachtco.fr", "+33", "600000001",
          "PAN", "cat1", "CAMION_20T", "+33", "600000001",
          "2026-09-10", "08:00-09:00", "2026-09-20", "10:00-11:00", "Interne", "PORTEUR",
        ],
      ]),
      { template: "rx" }
    );
    expect(result.errors).toEqual([]);
    const rx = result.rows[0]!.rx!;
    expect(rx.contact).toEqual({
      firstName: "Jean",
      lastName: "Dupont",
      email: "contact@yachtco.fr",
      phoneCode: "+33",
      phoneNumber: "600000001",
    });
    expect(rx.space).toBe("PAN");
    expect(rx.category).toEqual({
      categoryId: "cat1",
      livDate: "2026-09-10",
      livTime: "08:00-09:00",
      repDate: "2026-09-20",
      repTime: "10:00-11:00",
    });
    expect(rx.rep.repVehicleType).toBe("PORTEUR");
    expect(rx.manutentionProvider).toBe("Interne");
    expect(result.rows[0]!.referential.locationType).toBe("FLOT");
  });

  it("8. Palais : ne construit jamais de brouillon d'extension RX (rx = null)", () => {
    const result = parseAccreditationsTable(
      table([
        ["company", "stand", "email", "plate", "size", "phoneCode", "phoneNumber", "date", "city", "unloading", "contactEmail"],
        ["Acme", "A12", "contact@acme.fr", "AB-123-CD", "PORTEUR", "+33", "600000000", "2026-05-13", "Cannes", "rear", "ignore@x.fr"],
      ]),
      { template: "palais" }
    );
    expect(result.rows[0]!.rx).toBeNull();
    expect(result.rows[0]!.accreditation.email).toBe("contact@acme.fr");
  });

  it("9. doublons exacts detectes en warning (DUPLICATE_ROWS), jamais supprimes", () => {
    const result = parseAccreditationsTable(
      table([
        ["company", "stand", "exhibitorName", "locationCode", "vehicleType", "phoneCode", "phoneNumber", "livDate"],
        ["Yacht Co", "PAN 001", "Yacht Co", "PAN 001", "CAMION_20T", "+33", "600000001", "2026-09-10"],
        ["Yacht Co", "PAN 001", "Yacht Co", "PAN 001", "CAMION_20T", "+33", "600000001", "2026-09-10"],
      ]),
      { template: "rx" }
    );
    // Les deux lignes sont CONSERVEES (aucune deduplication automatique).
    expect(result.rows.length).toBe(2);
    const dup = result.warnings.find((w) => w.reason.startsWith("DUPLICATE_ROWS"));
    expect(dup).toBeDefined();
    expect(dup!.line).toBe(3);
    expect(dup!.reason).toContain("ligne 2");
  });
});
