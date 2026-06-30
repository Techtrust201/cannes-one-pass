import { describe, it, expect } from "vitest";
import {
  filterAccreditations,
  filterAndSortAccreditations,
  accreditationMatchesVehicleType,
  computeAccreditationStats,
  buildVehiclePredicate,
  paginate,
} from "./accreditations-dashboard";
import type { Accreditation, Vehicle, AccreditationStatus } from "@/types";
import type { VehicleTypeData } from "./vehicle-utils";

function makeType(
  o: Partial<VehicleTypeData> & { code: string; label: string; gabarit: string }
): VehicleTypeData {
  return {
    id: 1,
    tonnageMini: 0,
    tonnageMoyen: 0,
    tonnageMaxi: 0,
    co2Coefficient: 0,
    pdfCode: "B",
    color: "gray",
    showTrailerPlate: false,
    rxPalmBeachAtCanto: false,
    rxZoneCanto: null,
    rxZoneVieuxPort: null,
    sortOrder: 1,
    isActive: true,
    ...o,
  };
}

function makeVehicle(o: Partial<Vehicle>): Vehicle {
  return {
    id: 1,
    plate: "",
    size: "",
    phoneCode: "+33",
    phoneNumber: "",
    date: "",
    time: "",
    city: "",
    unloading: [],
    ...o,
  };
}

function makeAcc(
  id: string,
  status: AccreditationStatus,
  vehicles: Partial<Vehicle>[]
): Accreditation {
  return {
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    company: `Société ${id}`,
    stand: "A1",
    unloading: "",
    event: "evt",
    consent: true,
    status,
    vehicles: vehicles.map((v, i) => makeVehicle({ id: i + 1, ...v })),
  };
}

// Référentiel canonique (Palais)
const canonicalTypes: VehicleTypeData[] = [
  makeType({ id: 1, code: "VL", label: "VL", gabarit: "VL", pdfCode: "A", sortOrder: 1 }),
  makeType({ id: 2, code: "GROS_PORTEUR", label: "20 m³", gabarit: "20 m³", pdfCode: "B", sortOrder: 2 }),
  makeType({ id: 3, code: "PORTEUR", label: "Porteur", gabarit: "15 m³", pdfCode: "C", sortOrder: 3 }),
  makeType({ id: 4, code: "SEMI_REMORQUE", label: "Semi-remorque", gabarit: "~90 m³", pdfCode: "D", sortOrder: 4 }),
];

// Référentiel prod RX (codes = libellés)
const rxTypes: VehicleTypeData[] = [
  makeType({ id: 1, code: "VL", label: "VL", gabarit: "VL", pdfCode: "A", sortOrder: 1 }),
  makeType({ id: 2, code: "20 m³", label: "20 m³", gabarit: "20 m³", pdfCode: "B", sortOrder: 2 }),
  makeType({ id: 3, code: "Porteur", label: "Porteur", gabarit: "Porteur", pdfCode: "C", sortOrder: 3 }),
  makeType({ id: 4, code: "Semi remorque", label: "Semi remorque", gabarit: "Semi remorque", pdfCode: "D", sortOrder: 4 }),
];

describe("filterAccreditations — statut NOUVEAU", () => {
  const data = [
    makeAcc("1", "NOUVEAU", [{ vehicleType: "VL" }]),
    makeAcc("2", "ATTENTE", [{ vehicleType: "VL" }]),
    makeAcc("3", "NOUVEAU", [{ vehicleType: "PORTEUR" }]),
  ];

  it("inclut les NOUVEAU sans filtre statut", () => {
    expect(filterAccreditations(data, {}, canonicalTypes)).toHaveLength(3);
  });

  it("filtre status=NOUVEAU ne confond pas avec ATTENTE", () => {
    const res = filterAccreditations(data, { status: "NOUVEAU" }, canonicalTypes);
    expect(res.map((a) => a.id).sort()).toEqual(["1", "3"]);
  });

  it("filtre status=ATTENTE n'inclut pas les NOUVEAU", () => {
    const res = filterAccreditations(data, { status: "ATTENTE" }, canonicalTypes);
    expect(res.map((a) => a.id)).toEqual(["2"]);
  });
});

describe("accreditationMatchesVehicleType — poids lourds / legacy", () => {
  it("match exact vehicleType", () => {
    const acc = makeAcc("1", "NOUVEAU", [{ vehicleType: "PORTEUR" }]);
    expect(accreditationMatchesVehicleType(canonicalTypes, acc, "PORTEUR")).toBe(true);
  });

  it("match via size quand vehicleType est null (RX legacy)", () => {
    const acc = makeAcc("1", "NOUVEAU", [{ vehicleType: undefined, size: "Porteur" }]);
    expect(accreditationMatchesVehicleType(rxTypes, acc, "Porteur")).toBe(true);
  });

  it("bridge canonique <-> libellé : filtre 'Semi remorque' matche vehicleType SEMI_REMORQUE", () => {
    const acc = makeAcc("1", "NOUVEAU", [{ vehicleType: "SEMI_REMORQUE" }]);
    // Référentiel RX (filtre = libellé), donnée canonique (legacy) → doit matcher
    expect(accreditationMatchesVehicleType(rxTypes, acc, "Semi remorque")).toBe(true);
  });

  it("bridge inverse : filtre SEMI_REMORQUE matche size 'Semi remorque'", () => {
    const acc = makeAcc("1", "NOUVEAU", [{ vehicleType: undefined, size: "Semi remorque" }]);
    expect(accreditationMatchesVehicleType(canonicalTypes, acc, "SEMI_REMORQUE")).toBe(true);
  });

  it("multi-véhicules : match si au moins un véhicule correspond", () => {
    const acc = makeAcc("1", "NOUVEAU", [
      { vehicleType: "VL" },
      { vehicleType: "PORTEUR" },
    ]);
    expect(accreditationMatchesVehicleType(canonicalTypes, acc, "PORTEUR")).toBe(true);
  });

  it("ne matche pas un gabarit absent", () => {
    const acc = makeAcc("1", "NOUVEAU", [{ vehicleType: "VL" }]);
    expect(accreditationMatchesVehicleType(canonicalTypes, acc, "SEMI_REMORQUE")).toBe(false);
  });
});

describe("filterAccreditations — un NOUVEAU poids lourd n'est pas exclu du comptage", () => {
  it("filtre gabarit poids lourd compte bien le NOUVEAU", () => {
    const data = [
      makeAcc("1", "NOUVEAU", [{ vehicleType: undefined, size: "Semi remorque" }]),
      makeAcc("2", "ENTREE", [{ vehicleType: "SEMI_REMORQUE" }]),
      makeAcc("3", "ATTENTE", [{ vehicleType: "VL" }]),
    ];
    const res = filterAccreditations(data, { vehicleType: "SEMI_REMORQUE" }, canonicalTypes);
    expect(res.map((a) => a.id).sort()).toEqual(["1", "2"]);
    // Le NOUVEAU (id 1) est bien comptabilisé
    expect(res.some((a) => a.id === "1" && a.status === "NOUVEAU")).toBe(true);
  });
});

describe("computeAccreditationStats", () => {
  const data = [
    makeAcc("1", "NOUVEAU", [{ vehicleType: "VL" }]),
    makeAcc("2", "NOUVEAU", [{ vehicleType: "PORTEUR" }]),
    makeAcc("3", "ATTENTE", [{ vehicleType: "SEMI_REMORQUE" }, { vehicleType: "VL" }]),
    makeAcc("4", "ENTREE", [{ vehicleType: "GROS_PORTEUR" }]),
  ];

  it("compte par statut, NOUVEAU inclus", () => {
    const s = computeAccreditationStats(data, canonicalTypes);
    expect(s.byStatus.NOUVEAU).toBe(2);
    expect(s.byStatus.ATTENTE).toBe(1);
    expect(s.byStatus.ENTREE).toBe(1);
    expect(s.totalAccreditations).toBe(4);
  });

  it("compte les véhicules et identifie les poids lourds (pdf C/D)", () => {
    const s = computeAccreditationStats(data, canonicalTypes);
    expect(s.totalVehicles).toBe(5);
    // Porteur (C) + Semi-remorque (D) = 2 véhicules poids lourds
    expect(s.heavyVehicles).toBe(2);
    // Accréditations avec >=1 poids lourd : id 2 (Porteur) + id 3 (Semi) = 2
    expect(s.heavyAccreditations).toBe(2);
  });

  it("agrège par gabarit (accréditations + véhicules)", () => {
    const s = computeAccreditationStats(data, canonicalTypes);
    const vl = s.byVehicleType.find((t) => t.code === "VL");
    expect(vl?.vehicles).toBe(2);
    expect(vl?.accreditations).toBe(2);
    expect(vl?.isHeavy).toBe(false);
    const semi = s.byVehicleType.find((t) => t.code === "SEMI_REMORQUE");
    expect(semi?.vehicles).toBe(1);
    expect(semi?.isHeavy).toBe(true);
  });
});

describe("computeAccreditationStats — filtre véhicule (famille / gabarit)", () => {
  // id 3 = accréditation MIXTE (1 poids lourd SEMI + 1 utilitaire VL)
  const data = [
    makeAcc("1", "NOUVEAU", [{ vehicleType: "VL" }]),
    makeAcc("2", "NOUVEAU", [{ vehicleType: "PORTEUR" }]),
    makeAcc("3", "ATTENTE", [{ vehicleType: "SEMI_REMORQUE" }, { vehicleType: "VL" }]),
    makeAcc("4", "ENTREE", [{ vehicleType: "GROS_PORTEUR" }]),
  ];

  it("famille=heavy : ne compte que les véhicules poids lourds (accréditation mixte)", () => {
    const scoped = filterAccreditations(data, { vehicleFamily: "heavy" }, canonicalTypes);
    // Accréditations gardées : id 2 (Porteur) + id 3 (Semi+VL) = 2
    expect(scoped).toHaveLength(2);
    const filter = buildVehiclePredicate(canonicalTypes, { vehicleFamily: "heavy" });
    const s = computeAccreditationStats(scoped, canonicalTypes, { vehicleFilter: filter });
    // On ne compte QUE les PL : Porteur (id2) + Semi (id3) = 2, et PAS le VL de id3
    expect(s.totalVehicles).toBe(2);
    expect(s.heavyVehicles).toBe(2);
    expect(s.byVehicleType.every((t) => t.isHeavy)).toBe(true);
  });

  it("famille=light : ne compte que les utilitaires", () => {
    const scoped = filterAccreditations(data, { vehicleFamily: "light" }, canonicalTypes);
    const filter = buildVehiclePredicate(canonicalTypes, { vehicleFamily: "light" });
    const s = computeAccreditationStats(scoped, canonicalTypes, { vehicleFilter: filter });
    // Utilitaires : VL (id1), VL (id3), GROS_PORTEUR (id4) = 3
    expect(s.totalVehicles).toBe(3);
    expect(s.heavyVehicles).toBe(0);
    expect(s.byVehicleType.every((t) => !t.isHeavy)).toBe(true);
  });

  it("sans filtre véhicule : compte tout (predicate null)", () => {
    expect(buildVehiclePredicate(canonicalTypes, {})).toBeNull();
    const s = computeAccreditationStats(data, canonicalTypes);
    expect(s.totalVehicles).toBe(5);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 33 }, (_, i) => i);
  it("découpe correctement et borne la page", () => {
    expect(paginate(items, 1, 15).items).toHaveLength(15);
    expect(paginate(items, 3, 15).items).toHaveLength(3);
    expect(paginate(items, 99, 15).currentPage).toBe(3);
    expect(paginate(items, 1, 15).totalPages).toBe(3);
  });
});

describe("filterAndSortAccreditations — ne mute pas l'entrée", () => {
  it("retourne une copie triée", () => {
    const data = [
      makeAcc("1", "NOUVEAU", [{ date: "2026-01-01" }]),
      makeAcc("2", "NOUVEAU", [{ date: "2026-03-01" }]),
    ];
    const original = [...data];
    const res = filterAndSortAccreditations(data, { sort: "vehicleDate", dir: "asc" }, canonicalTypes);
    expect(res).toHaveLength(2);
    expect(data).toEqual(original);
  });
});
