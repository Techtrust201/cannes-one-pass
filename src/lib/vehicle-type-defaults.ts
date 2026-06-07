/** Gabarits véhicules par défaut — source unique pour seed API et fallback client */
export interface DefaultVehicleType {
  code: string;
  label: string;
  gabarit: string;
  tonnageMini: number;
  tonnageMoyen: number;
  tonnageMaxi: number;
  co2Coefficient: number;
  pdfCode: "A" | "B" | "C" | "D";
  color: string;
  showTrailerPlate: boolean;
  sortOrder: number;
  /** RX : suggestion Palm Beach au Port Canto pour ce gabarit. */
  rxPalmBeachAtCanto?: boolean;
}

export const DEFAULT_VEHICLE_TYPES: DefaultVehicleType[] = [
  {
    code: "VL",
    label: "VL",
    gabarit: "VL",
    tonnageMini: 1.8,
    tonnageMoyen: 2.8,
    tonnageMaxi: 3.5,
    co2Coefficient: 0.12,
    pdfCode: "A",
    color: "gray",
    showTrailerPlate: false,
    sortOrder: 1,
    rxPalmBeachAtCanto: true,
  },
  {
    code: "PORTEUR_LEGER",
    label: "10 m³",
    gabarit: "10 m³",
    tonnageMini: 7.5,
    tonnageMoyen: 10,
    tonnageMaxi: 12,
    co2Coefficient: 0.18,
    pdfCode: "B",
    color: "green",
    showTrailerPlate: false,
    sortOrder: 2,
    rxPalmBeachAtCanto: true,
  },
  {
    code: "PORTEUR",
    label: "15 m³",
    gabarit: "15 m³",
    tonnageMini: 12,
    tonnageMoyen: 15,
    tonnageMaxi: 19,
    co2Coefficient: 0.22,
    pdfCode: "C",
    color: "blue",
    showTrailerPlate: false,
    sortOrder: 3,
    rxPalmBeachAtCanto: false,
  },
  {
    code: "GROS_PORTEUR",
    label: "20 m³",
    gabarit: "20 m³",
    tonnageMini: 16,
    tonnageMoyen: 19,
    tonnageMaxi: 26,
    co2Coefficient: 0.3,
    pdfCode: "C",
    color: "orange",
    showTrailerPlate: false,
    sortOrder: 4,
    rxPalmBeachAtCanto: true,
  },
  {
    code: "PORTEUR_ARTICULE",
    label: "~100 m³ Porteur articulé",
    gabarit: "~100 m³",
    tonnageMini: 12,
    tonnageMoyen: 19,
    tonnageMaxi: 26,
    co2Coefficient: 0.385,
    pdfCode: "C",
    color: "yellow",
    showTrailerPlate: false,
    sortOrder: 5,
    rxPalmBeachAtCanto: false,
  },
  {
    code: "SEMI_REMORQUE",
    label: "~90 m³ Semi-remorque",
    gabarit: "~90 m³",
    tonnageMini: 15,
    tonnageMoyen: 29.5,
    tonnageMaxi: 44,
    co2Coefficient: 0.485,
    pdfCode: "D",
    color: "red",
    showTrailerPlate: true,
    sortOrder: 6,
    rxPalmBeachAtCanto: false,
  },
];

export function generateVehicleTypeCode(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "TYPE_VEHICULE";
}

/** Construit le set de codes RX dirigés vers Palm Beach au Port Canto. */
export function buildPalmBeachAtCantoCodes(
  types: Array<{ code: string; rxPalmBeachAtCanto?: boolean }>
): Set<string> {
  return new Set(
    types.filter((t) => t.rxPalmBeachAtCanto).map((t) => t.code.trim().toUpperCase())
  );
}

/** Fallback historique si la config BDD n'est pas disponible. */
export const DEFAULT_PALM_BEACH_AT_CANTO_CODES = buildPalmBeachAtCantoCodes(
  DEFAULT_VEHICLE_TYPES
);
