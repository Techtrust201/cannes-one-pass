import { describe, it, expect } from "vitest";
import type { ResolvedCity } from "@/lib/carbon-city";
import {
  buildCarbonEntriesForVehicle,
  resolveKmAllerSimple,
} from "@/lib/carbon-entry";
import { mapDefaultVehicleTypes } from "@/lib/vehicle-type-server";

const vehicleTypes = mapDefaultVehicleTypes();
const zoneCoords = {};

describe("résolution scopée par organisation", () => {
  // Simule deux catalogues divergents pour un MÊME code : la résolution carbone
  // doit utiliser strictement la liste fournie (celle de l'org de l'accréditation)
  // et ne jamais piocher dans le catalogue d'une autre organisation.
  const makeVL = (suffix: string, coeff: number) => [
    {
      id: 1,
      code: "VL",
      label: `VL-${suffix}`,
      gabarit: `VL-${suffix}`,
      tonnageMini: 1.8,
      tonnageMoyen: 2.8,
      tonnageMaxi: 3.5,
      co2Coefficient: coeff,
      pdfCode: "A" as const,
      color: "gray",
      showTrailerPlate: false,
      rxPalmBeachAtCanto: false,
      rxZoneCanto: null,
      rxZoneVieuxPort: null,
      sortOrder: 1,
      isActive: true,
    },
  ];

  it("résout libellé et coefficient CO2 depuis la liste de l'org fournie", () => {
    const cityCache = mockCache({
      Paris: { cityName: "Paris", countryName: "France", distance: 930 },
    });

    const orgA = buildCarbonEntriesForVehicle({
      acc: { ...baseAcc, extension: null },
      vehicle: baseVehicle,
      vehicleTypes: makeVL("A", 0.1),
      zoneCoords,
      cityCache,
    });
    const orgB = buildCarbonEntriesForVehicle({
      acc: { ...baseAcc, extension: null },
      vehicle: baseVehicle,
      vehicleTypes: makeVL("B", 0.5),
      zoneCoords,
      cityCache,
    });

    // km A/R = 930 × 2 = 1860 ; émissions = 1860 × coeff de SA liste.
    expect(orgA[0].type).toBe("VL-A");
    expect(orgA[0].kgCO2eq).toBe(186);
    expect(orgB[0].type).toBe("VL-B");
    expect(orgB[0].kgCO2eq).toBe(930);
  });
});

function mockCache(entries: Record<string, ResolvedCity>): Map<string, ResolvedCity> {
  return new Map(Object.entries(entries));
}

// Lot 3 (RX) — le bilan carbone doit résoudre CO₂/pdfCode par CODE technique,
// pas par libellé : deux gabarits peuvent partager un même libellé (ou un
// libellé personnalisé/traduit) sans fausser les émissions.
describe("bilan carbone résolu par code (anti-régression libellé)", () => {
  const mkType = (
    id: number,
    code: string,
    label: string,
    co2: number,
    pdf: "A" | "B" | "C" | "D"
  ) => ({
    id,
    code,
    label,
    gabarit: label,
    tonnageMini: 12,
    tonnageMoyen: 19,
    tonnageMaxi: 26,
    co2Coefficient: co2,
    pdfCode: pdf,
    color: "blue",
    showTrailerPlate: false,
    rxPalmBeachAtCanto: false,
    rxZoneCanto: null,
    rxZoneVieuxPort: null,
    sortOrder: id,
    isActive: true,
  });

  it("utilise le CO₂/pdfCode du CODE sélectionné même si un autre gabarit a le même libellé", () => {
    // Deux gabarits au même libellé « Porteur » : l'ancien lookup par libellé
    // aurait pris le premier (PORTEUR, 0.22). Le lookup par code doit prendre
    // GROS_PORTEUR (0.30, pdf C).
    const types = [
      mkType(1, "PORTEUR", "Porteur", 0.22, "B"),
      mkType(2, "GROS_PORTEUR", "Porteur", 0.3, "C"),
    ];
    const cityCache = mockCache({
      Paris: { cityName: "Paris", countryName: "France", distance: 1000 },
    });

    const entries = buildCarbonEntriesForVehicle({
      acc: { ...baseAcc, extension: null },
      vehicle: { ...baseVehicle, vehicleType: "GROS_PORTEUR", estimatedKms: 1000 },
      vehicleTypes: types,
      zoneCoords,
      cityCache,
    });

    // km A/R = 1000 × 2 = 2000 ; émissions = 2000 × 0.30 = 600 (et non 440).
    expect(entries[0].kgCO2eq).toBe(600);
    expect(entries[0].pdfCode).toBe("C");
  });
});

const baseAcc = {
  id: "acc-1",
  event: "RX Test",
  company: "Acme",
  stand: "A1",
};

const baseVehicle = {
  id: "veh-1",
  city: "Paris",
  country: "FRANCE" as const,
  estimatedKms: 930,
  kms: null,
  vehicleType: "VL",
  size: null,
  plate: "AB-123-CD",
  date: "2026-06-01",
};

describe("resolveKmAllerSimple", () => {
  it("priorise estimatedKms", () => {
    const resolved: ResolvedCity = {
      cityName: "Paris",
      countryName: "France",
      distance: 500,
    };
    expect(
      resolveKmAllerSimple({ city: "Paris", estimatedKms: 930 }, resolved)
    ).toBe(930);
  });
});

describe("buildCarbonEntriesForVehicle", () => {
  it("RX reprise identique → 1 entrée, km A/R ×2, origine France", () => {
    const cityCache = mockCache({
      Paris: { cityName: "Paris", countryName: "France", distance: 930 },
    });

    const entries = buildCarbonEntriesForVehicle({
      acc: {
        ...baseAcc,
        extension: {
          vehicleContext: { repSameAsDelivery: true },
        },
      },
      vehicle: baseVehicle,
      vehicleTypes,
      zoneCoords,
      cityCache,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("acc-1-veh-1");
    expect(entries[0].km).toBe(1860);
    expect(entries[0].origine).toBe("France");
  });

  it("RX reprise différente → 2 entrées, km A/R ×2 chacune, origines distinctes", () => {
    const cityCache = mockCache({
      Paris: { cityName: "Paris", countryName: "France", distance: 930 },
      Lyon: { cityName: "Lyon", countryName: "France", distance: 450 },
    });

    const entries = buildCarbonEntriesForVehicle({
      acc: {
        ...baseAcc,
        extension: {
          vehicleContext: {
            repSameAsDelivery: false,
            repCity: "Lyon",
            repCountry: "FRANCE",
            repEstimatedKms: 450,
            repVehicleType: "VL",
            repPlate: "XY-999-ZZ",
            repDate: "2026-06-05",
          },
        },
      },
      vehicle: baseVehicle,
      vehicleTypes,
      zoneCoords,
      cityCache,
    });

    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe("acc-1-veh-1");
    expect(entries[0].km).toBe(1860);
    expect(entries[0].origine).toBe("France");

    expect(entries[1].id).toBe("acc-1-veh-1-rep");
    expect(entries[1].km).toBe(900);
    expect(entries[1].origine).toBe("France");
    expect(entries[1].plaque).toBe("XY-999-ZZ");
    expect(entries[1].date).toBe("2026-06-05");
  });

  it("RX reprise différente, repCity vide → 2 entrées, reprise km=0", () => {
    const cityCache = mockCache({
      Paris: { cityName: "Paris", countryName: "France", distance: 930 },
    });

    const entries = buildCarbonEntriesForVehicle({
      acc: {
        ...baseAcc,
        extension: {
          vehicleContext: {
            repSameAsDelivery: false,
            repCity: "",
          },
        },
      },
      vehicle: baseVehicle,
      vehicleTypes,
      zoneCoords,
      cityCache,
    });

    expect(entries).toHaveLength(2);
    expect(entries[1].km).toBe(0);
    expect(entries[1].origine).toBe("Origine non renseignée");
  });

  it("Palais sans vehicleContext → 1 entrée (non-régression)", () => {
    const cityCache = mockCache({
      Nice: { cityName: "Nice", countryName: "France", distance: 0 },
    });

    const entries = buildCarbonEntriesForVehicle({
      acc: { ...baseAcc, extension: null },
      vehicle: {
        ...baseVehicle,
        id: "veh-2",
        city: "Nice",
        estimatedKms: null,
        country: null,
      },
      vehicleTypes,
      zoneCoords,
      cityCache,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("acc-1-veh-2");
    expect(entries[0].km).toBe(0);
  });

  it("inter-zones appliqués uniquement à l'entrée livraison", () => {
    const cityCache = mockCache({
      Paris: { cityName: "Paris", countryName: "France", distance: 930 },
      Lyon: { cityName: "Lyon", countryName: "France", distance: 450 },
    });

    const entries = buildCarbonEntriesForVehicle({
      acc: {
        ...baseAcc,
        extension: {
          vehicleContext: {
            repSameAsDelivery: false,
            repCity: "Lyon",
            repEstimatedKms: 450,
          },
        },
      },
      vehicle: {
        ...baseVehicle,
        timeSlots: [
          {
            zone: "A",
            entryAt: new Date("2026-06-01T08:00:00Z"),
            exitAt: new Date("2026-06-01T09:00:00Z"),
            stepNumber: 1,
          },
          {
            zone: "B",
            entryAt: new Date("2026-06-01T09:00:00Z"),
            exitAt: null,
            stepNumber: 2,
          },
        ],
      },
      vehicleTypes,
      zoneCoords: {
        A: { lat: 43.5528, lng: 7.0174 },
        B: { lat: 43.56, lng: 7.03 },
      },
      cityCache,
    });

    expect(entries[0].kmInterZone).toBeGreaterThan(0);
    expect(entries[1].kmInterZone).toBe(0);
    expect(entries[1].roundTrips).toBe(0);
  });
});
