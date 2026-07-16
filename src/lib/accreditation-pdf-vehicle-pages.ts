/**
 * Planification pure des pages PDF RX par véhicule physique.
 * Palais et legacy (sans logisticsRole distinct) restent hors de ce planificateur.
 */

export type PdfVehicleRole = "MONTAGE" | "DEMONTAGE" | "BOTH";

export type PdfPhysicalVehicle = {
  id: number;
  logisticsRole?: PdfVehicleRole | null;
  plate?: string | null;
  vehicleType?: string | null;
  size?: string;
  trailerPlate?: string | null;
  phoneCode?: string;
  phoneNumber?: string;
  date?: string;
  time?: string;
  city?: string;
  interveningCompany?: string | null;
};

export type RxPdfPageKind = "both" | "montage" | "demontage" | "legacy";

export type RxPdfPagePlan = {
  kind: RxPdfPageKind;
  /** Véhicule principal affiché sur la page (null uniquement en legacy sans véhicule). */
  vehicle: PdfPhysicalVehicle | null;
  includeMontage: boolean;
  includeDemontage: boolean;
  /** QR accès à émettre sur cette page (phase + vehicleId). */
  qrPhases: Array<"livraison" | "reprise">;
};

/**
 * Construit le plan de pages pour une accréditation RX.
 * - BOTH → 1 page (montage + démontage + 2 QR)
 * - MONTAGE seul / DEMONTAGE seul → 1 page
 * - MONTAGE + DEMONTAGE distincts → 2 pages
 * - sinon → legacy (vehicles[0] + vehicleContext)
 */
export function planRxPdfPages(
  vehicles: PdfPhysicalVehicle[],
  opts: { skipMontage?: boolean; skipDemontage?: boolean } = {}
): RxPdfPagePlan[] {
  const skipMontage = opts.skipMontage === true;
  const skipDemontage = opts.skipDemontage === true;

  const montage = vehicles.find((v) => v.logisticsRole === "MONTAGE");
  const demontage = vehicles.find((v) => v.logisticsRole === "DEMONTAGE");
  const both = vehicles.find((v) => v.logisticsRole === "BOTH");

  const hasSplitRoles = Boolean(montage || demontage || both);

  if (!hasSplitRoles) {
    return [
      {
        kind: "legacy",
        vehicle: vehicles[0] ?? null,
        includeMontage: !skipMontage,
        includeDemontage: !skipDemontage,
        qrPhases: [
          ...(!skipMontage ? (["livraison"] as const) : []),
          ...(!skipDemontage ? (["reprise"] as const) : []),
        ],
      },
    ];
  }

  if (both && !montage && !demontage) {
    const qrPhases: Array<"livraison" | "reprise"> = [];
    if (!skipMontage) qrPhases.push("livraison");
    if (!skipDemontage) qrPhases.push("reprise");
    return [
      {
        kind: "both",
        vehicle: both,
        includeMontage: !skipMontage,
        includeDemontage: !skipDemontage,
        qrPhases,
      },
    ];
  }

  const pages: RxPdfPagePlan[] = [];
  if (montage && !skipMontage) {
    pages.push({
      kind: "montage",
      vehicle: montage,
      includeMontage: true,
      includeDemontage: false,
      qrPhases: ["livraison"],
    });
  }
  if (demontage && !skipDemontage) {
    pages.push({
      kind: "demontage",
      vehicle: demontage,
      includeMontage: false,
      includeDemontage: true,
      qrPhases: ["reprise"],
    });
  }
  // BOTH coexistant avec un autre rôle : page dédiée BOTH (cas rare).
  if (both) {
    const qrPhases: Array<"livraison" | "reprise"> = [];
    if (!skipMontage) qrPhases.push("livraison");
    if (!skipDemontage) qrPhases.push("reprise");
    pages.push({
      kind: "both",
      vehicle: both,
      includeMontage: !skipMontage,
      includeDemontage: !skipDemontage,
      qrPhases,
    });
  }

  if (pages.length === 0) {
    return [
      {
        kind: "legacy",
        vehicle: vehicles[0] ?? null,
        includeMontage: !skipMontage,
        includeDemontage: !skipDemontage,
        qrPhases: [],
      },
    ];
  }
  return pages;
}
