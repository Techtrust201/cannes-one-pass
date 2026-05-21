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
}

export const DEFAULT_VEHICLE_TYPES: DefaultVehicleType[] = [
  {
    code: "VL",
    label: "Fourgon / VL",
    gabarit: "VL",
    tonnageMini: 1.8,
    tonnageMoyen: 2.8,
    tonnageMaxi: 3.5,
    co2Coefficient: 0.12,
    pdfCode: "A",
    color: "gray",
    showTrailerPlate: false,
    sortOrder: 1,
  },
  {
    code: "PORTEUR_LEGER",
    label: "Porteur léger (10 m³)",
    gabarit: "10 m³",
    tonnageMini: 7.5,
    tonnageMoyen: 10,
    tonnageMaxi: 12,
    co2Coefficient: 0.18,
    pdfCode: "B",
    color: "green",
    showTrailerPlate: false,
    sortOrder: 2,
  },
  {
    code: "PORTEUR",
    label: "Porteur moyen (15 m³)",
    gabarit: "15 m³",
    tonnageMini: 12,
    tonnageMoyen: 15,
    tonnageMaxi: 19,
    co2Coefficient: 0.22,
    pdfCode: "C",
    color: "blue",
    showTrailerPlate: false,
    sortOrder: 3,
  },
  {
    code: "GROS_PORTEUR",
    label: "Gros porteur (20 m³)",
    gabarit: "20 m³",
    tonnageMini: 16,
    tonnageMoyen: 19,
    tonnageMaxi: 26,
    co2Coefficient: 0.3,
    pdfCode: "C",
    color: "orange",
    showTrailerPlate: false,
    sortOrder: 4,
  },
  {
    code: "PORTEUR_ARTICULE",
    label: "Porteur articulé",
    gabarit: "~100 m³",
    tonnageMini: 12,
    tonnageMoyen: 19,
    tonnageMaxi: 26,
    co2Coefficient: 0.385,
    pdfCode: "C",
    color: "yellow",
    showTrailerPlate: false,
    sortOrder: 5,
  },
  {
    code: "SEMI_REMORQUE",
    label: "Semi-remorque",
    gabarit: "~90 m³",
    tonnageMini: 15,
    tonnageMoyen: 29.5,
    tonnageMaxi: 44,
    co2Coefficient: 0.485,
    pdfCode: "D",
    color: "red",
    showTrailerPlate: true,
    sortOrder: 6,
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
