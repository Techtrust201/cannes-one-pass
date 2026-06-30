import { describe, it, expect } from "vitest";
import {
  buildVehicleTypeFilterOptions,
  buildEventFilterOptions,
  buildZoneFilterOptions,
  buildStatusFilterOptions,
} from "./org-filter-options";
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import { PALAIS_DEFAULT_VEHICLE_TYPES } from "@/lib/vehicle-type-defaults";
import type { ZoneConfigData } from "@/lib/zone-utils";
import type { EspaceEventOption } from "@/hooks/useEspaceEvents";

function makeType(
  o: Partial<VehicleTypeData> & { code: string; gabarit: string }
): VehicleTypeData {
  return {
    id: 1,
    label: o.gabarit,
    tonnageMini: 0,
    tonnageMoyen: 0,
    tonnageMaxi: 0,
    co2Coefficient: 0,
    pdfCode: "A",
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

// Catalogue Palais reconstruit depuis les defaults (simule ce que l'API retourne)
const palaisTypes: VehicleTypeData[] = PALAIS_DEFAULT_VEHICLE_TYPES.map(
  (t, i) => ({
    id: i + 1,
    code: t.code,
    label: t.label,
    gabarit: t.gabarit,
    tonnageMini: t.tonnageMini,
    tonnageMoyen: t.tonnageMoyen,
    tonnageMaxi: t.tonnageMaxi,
    co2Coefficient: t.co2Coefficient,
    pdfCode: t.pdfCode,
    color: t.color,
    showTrailerPlate: t.showTrailerPlate,
    rxPalmBeachAtCanto: false,
    rxZoneCanto: null,
    rxZoneVieuxPort: null,
    sortOrder: t.sortOrder,
    isActive: true,
  })
);

describe("buildVehicleTypeFilterOptions — catalogue Palais", () => {
  const opts = buildVehicleTypeFilterOptions(palaisTypes);

  it("retourne tous les types actifs (6 pour Palais dans les defaults)", () => {
    expect(opts).toHaveLength(6);
  });

  it("respecte l'ordre sortOrder", () => {
    const codes = opts.map((o) => o.value);
    expect(codes[0]).toBe("VL");
    expect(codes[codes.length - 1]).toBe("SEMI_REMORQUE");
  });

  it("label = gabarit (pas le code interne)", () => {
    const vl = opts.find((o) => o.value === "VL");
    expect(vl?.label).toBe("VL");

    const porteur = opts.find((o) => o.value === "PORTEUR");
    expect(porteur?.label).toBe("15 m³");

    const porteurArticule = opts.find((o) => o.value === "PORTEUR_ARTICULE");
    expect(porteurArticule?.label).not.toBe("PORTEUR_ARTICULE");
  });

  it("isHeavy = true pour pdfCode C ou D uniquement", () => {
    const lightCodes = opts.filter((o) => !o.isHeavy).map((o) => o.value);
    const heavyCodes = opts.filter((o) => o.isHeavy).map((o) => o.value);
    // Palais : VL(A), PORTEUR_LEGER(B) = légers ; PORTEUR(C), GROS_PORTEUR(C), PORTEUR_ARTICULE(C), SEMI_REMORQUE(D) = lourds
    expect(lightCodes).toEqual(expect.arrayContaining(["VL", "PORTEUR_LEGER"]));
    expect(heavyCodes).toEqual(
      expect.arrayContaining(["PORTEUR", "GROS_PORTEUR", "PORTEUR_ARTICULE", "SEMI_REMORQUE"])
    );
  });

  it("exclut les types inactifs", () => {
    const withInactive = [
      ...palaisTypes,
      makeType({ id: 99, code: "CUSTOM", gabarit: "Custom", isActive: false, sortOrder: 99 }),
    ];
    const result = buildVehicleTypeFilterOptions(withInactive);
    expect(result.find((o) => o.value === "CUSTOM")).toBeUndefined();
    expect(result).toHaveLength(6);
  });
});

describe("buildEventFilterOptions", () => {
  const events: EspaceEventOption[] = [
    { slug: "cannes-lions-2025", name: "Cannes Lions 2025" },
    { slug: "mipcom-2025", name: "MIPCOM 2025" },
  ];

  it("slug en value, nom lisible en label", () => {
    const opts = buildEventFilterOptions(events);
    expect(opts).toHaveLength(2);
    expect(opts[0]).toEqual({ value: "cannes-lions-2025", label: "Cannes Lions 2025" });
  });
});

describe("buildZoneFilterOptions", () => {
  const zones: ZoneConfigData[] = [
    {
      id: 1, zone: "PALM_BEACH", label: "Palm Beach", address: "", latitude: 0,
      longitude: 0, isFinalDestination: false, color: "blue", isActive: true,
    },
    {
      id: 2, zone: "LA_BOCCA", label: "La Bocca", address: "", latitude: 0,
      longitude: 0, isFinalDestination: true, color: "gray", isActive: true,
    },
  ];

  it("zone en value, label admin en label", () => {
    const opts = buildZoneFilterOptions(zones);
    expect(opts[0]).toEqual({ value: "PALM_BEACH", label: "Palm Beach" });
    expect(opts[1]).toEqual({ value: "LA_BOCCA", label: "La Bocca" });
  });
});

describe("buildStatusFilterOptions", () => {
  it("contient les 6 statuts dans l'ordre métier", () => {
    const opts = buildStatusFilterOptions();
    const codes = opts.map((o) => o.value);
    expect(codes).toEqual(["NOUVEAU", "ATTENTE", "ENTREE", "SORTIE", "REFUS", "ABSENT"]);
  });

  it("label lisible et distinct du code", () => {
    const opts = buildStatusFilterOptions();
    const nouveau = opts.find((o) => o.value === "NOUVEAU");
    expect(nouveau?.label).toBe("Nouveau");
    const attente = opts.find((o) => o.value === "ATTENTE");
    expect(attente?.label).toBe("Validée");
  });
});
