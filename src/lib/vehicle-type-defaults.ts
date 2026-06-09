/** Gabarits véhicules par défaut — sources de seed et fallback client.
 *
 * Multi-tenant : RX et Palais ont des catalogues distincts. Les champs
 * techniques (codes, tonnages, CO2, couleurs…) sont partagés via `TECH_SPECS`
 * pour éviter toute dérive, mais les libellés et le routage RX divergent :
 *  - RX : libellés « volume » + matrice Palm Beach / zones (Port Canto, Vieux
 *    Port).
 *  - Palais : libellés descriptifs historiques, AUCUN champ de routage RX.
 */
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
  /** RX : suggestion Palm Beach au Port Canto pour ce gabarit (legacy/repli). */
  rxPalmBeachAtCanto?: boolean;
  /** RX : code ZoneConfig cible au Port Canto (table de routage configurable). */
  rxZoneCanto?: string | null;
  /** RX : code ZoneConfig cible au Vieux Port (table de routage configurable). */
  rxZoneVieuxPort?: string | null;
}

/** Spécifications techniques communes aux deux organisations. */
type VehicleTechSpec = Pick<
  DefaultVehicleType,
  | "code"
  | "gabarit"
  | "tonnageMini"
  | "tonnageMoyen"
  | "tonnageMaxi"
  | "co2Coefficient"
  | "pdfCode"
  | "color"
  | "showTrailerPlate"
  | "sortOrder"
>;

const TECH_SPECS: VehicleTechSpec[] = [
  {
    code: "VL",
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

/** Libellés « volume » RX par code. */
const RX_LABELS: Record<string, string> = {
  VL: "VL",
  PORTEUR_LEGER: "10 m³",
  PORTEUR: "15 m³",
  GROS_PORTEUR: "20 m³",
  PORTEUR_ARTICULE: "~100 m³ Porteur articulé",
  SEMI_REMORQUE: "~90 m³ Semi-remorque",
};

/** Routage RX par code (matrice Mathieu §8.4) : Port Canto / Vieux Port. */
const RX_ROUTING: Record<
  string,
  { palmBeach: boolean; canto: string; vieuxPort: string }
> = {
  VL: { palmBeach: true, canto: "PALM_BEACH", vieuxPort: "LA_BOCCA" },
  PORTEUR_LEGER: { palmBeach: true, canto: "PALM_BEACH", vieuxPort: "LA_BOCCA" },
  PORTEUR: { palmBeach: false, canto: "LA_BOCCA", vieuxPort: "LA_BOCCA" },
  GROS_PORTEUR: { palmBeach: true, canto: "PALM_BEACH", vieuxPort: "LA_BOCCA" },
  PORTEUR_ARTICULE: { palmBeach: false, canto: "LA_BOCCA", vieuxPort: "LA_BOCCA" },
  SEMI_REMORQUE: { palmBeach: false, canto: "LA_BOCCA", vieuxPort: "LA_BOCCA" },
};

/** Libellés descriptifs historiques du Palais (migration initiale). */
const PALAIS_LABELS: Record<string, string> = {
  VL: "Fourgon / VL",
  PORTEUR_LEGER: "Porteur léger (10 m³)",
  PORTEUR: "Porteur moyen (15 m³)",
  GROS_PORTEUR: "Gros porteur (20 m³)",
  PORTEUR_ARTICULE: "Porteur articulé",
  SEMI_REMORQUE: "Semi-remorque",
};

/** Catalogue RX : libellés volume + routage Palm Beach / zones. */
export const RX_DEFAULT_VEHICLE_TYPES: DefaultVehicleType[] = TECH_SPECS.map(
  (spec) => {
    const routing = RX_ROUTING[spec.code];
    return {
      ...spec,
      label: RX_LABELS[spec.code] ?? spec.gabarit,
      rxPalmBeachAtCanto: routing?.palmBeach ?? false,
      rxZoneCanto: routing?.canto ?? null,
      rxZoneVieuxPort: routing?.vieuxPort ?? null,
    };
  }
);

/** Catalogue Palais : libellés descriptifs, aucun champ de routage RX. */
export const PALAIS_DEFAULT_VEHICLE_TYPES: DefaultVehicleType[] = TECH_SPECS.map(
  (spec) => ({
    ...spec,
    label: PALAIS_LABELS[spec.code] ?? spec.gabarit,
    rxPalmBeachAtCanto: false,
    rxZoneCanto: null,
    rxZoneVieuxPort: null,
  })
);

/**
 * Catalogue par défaut « générique ». Reste aligné sur RX (catalogue le plus
 * complet) pour le seed des nouvelles organisations et la rétrocompatibilité
 * des tests. Préférez `getDefaultVehicleTypesForScope(slug)` quand le contexte
 * d'organisation est connu.
 */
export const DEFAULT_VEHICLE_TYPES: DefaultVehicleType[] =
  RX_DEFAULT_VEHICLE_TYPES;

const PALAIS_SLUGS = new Set(["palais-des-festivals", "palais"]);

/**
 * Sélectionne le catalogue par défaut selon le slug d'organisation.
 * - `rx` → catalogue RX (routage zones).
 * - `palais-des-festivals` / `palais` → catalogue Palais (sans champ RX).
 * - inconnu / global → catalogue générique (RX).
 */
export function getDefaultVehicleTypesForScope(
  orgSlug?: string | null
): DefaultVehicleType[] {
  const slug = orgSlug?.trim().toLowerCase();
  if (slug && PALAIS_SLUGS.has(slug)) return PALAIS_DEFAULT_VEHICLE_TYPES;
  return RX_DEFAULT_VEHICLE_TYPES;
}

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
  RX_DEFAULT_VEHICLE_TYPES
);
