import type { CarbonDataEntry } from "@/hooks/useCarbonData";

/** Mapping type app → gabarit PDF (A/B/C/D) */
const GABARIT_PDF_MAP: Record<string, string> = {
  "Porteur": "C",
  "Porteur articulé": "C",
  "Semi-remorque": "D",
};

function mapToGabaritPdf(type: string): string {
  return GABARIT_PDF_MAP[type] ?? "C";
}

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Export CSV détaillé (aligné structure PDF) */
export function exportDetailedCsv(
  data: CarbonDataEntry[],
  eventLabel: string
): void {
  const BOM = "\uFEFF";
  const sep = ";";
  const headers = [
    "Num",
    "Événement",
    "Plaque",
    "Société",
    "Stand",
    "Origine",
    "Rotation",
    "Distance Km",
    "Type",
    "KgCO₂eq",
    "Date",
  ];

  const rows = data.map((e, i) => [
    i + 1,
    e.evenement,
    e.plaque,
    e.entreprise,
    e.stand,
    e.origine,
    e.roundTrips && e.roundTrips > 0 ? "A/R" : "A/R",
    e.km,
    mapToGabaritPdf(e.type),
    e.kgCO2eq,
    e.date,
  ]);

  const totalKm = data.reduce((s, e) => s + e.km, 0);
  const totalKgCO2eq = data.reduce((s, e) => s + e.kgCO2eq, 0);

  const lines = [
    headers.join(sep),
    ...rows.map((r) => r.map(escapeCsvCell).join(sep)),
    "",
    ["Total", "", "", "", "", "", "", totalKm, "", totalKgCO2eq, ""]
      .map(escapeCsvCell)
      .join(sep),
  ];

  const csv = BOM + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  const eventSlug = eventLabel?.toString().replace(/\s+/g, "-") || "global";
  link.download = `bilan-carbone-${eventSlug}-${dateStr}-detail.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface SimplifiedAggregation {
  category: string;
  nbVehicules: number;
  distanceKm: number;
  emissionsKgCO2eq: number;
}

export interface SocieteRow {
  societe: string;
  nbVehicules: number;
  gabarits: string;
  kgCO2eq: number;
}

/** Export CSV simplifié (sections: gabarit, société, total) */
export function exportSimplifiedCsv(
  typeAggregation: SimplifiedAggregation[],
  societeRows: SocieteRow[],
  totalVehicules: number,
  totalKm: number,
  totalKgCO2eq: number
): void {
  const BOM = "\uFEFF";
  const sep = ";";

  const sections: string[] = [];

  sections.push("Synthèse par gabarit");
  sections.push(["Gabarit", "Nb véhicules", "Km", "KgCO₂eq"].join(sep));
  for (const r of typeAggregation) {
    sections.push(
      [r.category, r.nbVehicules, r.distanceKm, r.emissionsKgCO2eq]
        .map(escapeCsvCell)
        .join(sep)
    );
  }
  sections.push("");

  sections.push("Synthèse par société");
  sections.push(["Société", "Nb véhicules", "Gabarits utilisés", "KgCO₂eq"].join(sep));
  for (const r of societeRows) {
    sections.push(
      [r.societe, r.nbVehicules, r.gabarits, r.kgCO2eq]
        .map(escapeCsvCell)
        .join(sep)
    );
  }
  sections.push("");

  sections.push("Total");
  sections.push(
    ["Total", totalVehicules, totalKm, totalKgCO2eq].map(escapeCsvCell).join(sep)
  );

  const csv = BOM + sections.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  link.download = `bilan-carbone-simplifie-${dateStr}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Exporte le graphique actuel en PNG (doit être appelé après capture du DOM) */
export async function exportChartAsPng(): Promise<void> {
  const { toPng } = await import("html-to-image");
  const contentElement = document.querySelector(
    "[data-export-content]"
  ) as HTMLElement;

  if (!contentElement) {
    throw new Error("Contenu à exporter non trouvé");
  }

  const imageDataUrl = await toPng(contentElement, {
    quality: 1.0,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });

  const link = document.createElement("a");
  link.download = `bilan-carbone-simplifie-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = imageDataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
