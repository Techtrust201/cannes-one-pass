import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { findCity } from "@/lib/city-search";
import { requirePermission } from "@/lib/auth-helpers";

// ── Types ────────────────────────────────────────────────────────────
interface CarbonDataEntry {
  id: string;
  evenement: string;
  plaque: string;
  entreprise: string;
  stand: string;
  origine: string;
  type: string;
  km: number;
  kgCO2eq: number;
  date: string;
  /** Km supplémentaires dus aux allers-retours inter-zones */
  kmInterZone?: number;
  /** CO₂ supplémentaire dû aux allers-retours inter-zones */
  kgCO2eqInterZone?: number;
  /** Nombre d'allers-retours */
  roundTrips?: number;
}

// ── Coordonnées zone cache (TTL 5 minutes pour éviter données obsolètes) ──
interface ZoneCoords {
  lat: number;
  lng: number;
}
let zoneCoordCache: Record<string, ZoneCoords> | null = null;
let zoneCoordCacheTime = 0;
const ZONE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getZoneCoords(): Promise<Record<string, ZoneCoords>> {
  const now = Date.now();
  if (zoneCoordCache && now - zoneCoordCacheTime < ZONE_CACHE_TTL) {
    return zoneCoordCache;
  }
  const zones = await prisma.zoneConfig.findMany({ where: { isActive: true } });
  const coords: Record<string, ZoneCoords> = {};
  for (const z of zones) {
    coords[z.zone] = { lat: z.latitude, lng: z.longitude };
  }
  zoneCoordCache = coords;
  zoneCoordCacheTime = now;
  return coords;
}

/** Haversine entre deux points GPS → distance à vol d'oiseau en km */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance routière estimée entre deux zones (facteur ×1.5 pour trajets courts urbains) */
function interZoneRoadDistance(z1: ZoneCoords, z2: ZoneCoords): number {
  const d = haversine(z1.lat, z1.lng, z2.lat, z2.lng);
  // Trajets urbains/périurbains courts → facteur 1.5
  const factor = d < 10 ? 1.5 : d < 30 ? 1.4 : 1.3;
  return Math.round(d * factor * 10) / 10;
}

/** Tonnage moyen par type de véhicule pour le calcul CO₂ inter-zones */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const AVG_TONNAGE: Record<string, number> = {
  "Porteur": 19,               // (12 + 26) / 2
  "Porteur articulé": 19,      // (12 + 26) / 2
  "Semi-remorque": 29.5,       // (15 + 44) / 2
};

interface AggregatedData {
  category: string;
  nbVehicules: number;
  distanceKm: number;
  emissionsKgCO2eq: number;
}

// ── Coefficients CO₂ (ADEME 2024, diesel poids lourds) ──────────────
// Basés sur les vrais types de véhicules du Palais des Festivals
const CO2_COEFFICIENTS = {
  "Porteur": 0.265,           // Camion porteur rigide ~12-26t
  "Porteur articulé": 0.385,  // Porteur articulé ~12-26t
  "Semi-remorque": 0.485,     // Tracteur + semi-remorque ~15-44t
} as const;

// ── Haversine amélioré (même que distance/route.ts) ──────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calculateRoadDistance(lat: number, lng: number): number {
  const CANNES = { lat: 43.5506, lng: 7.0175 };
  const R = 6371;
  const dLat = ((CANNES.lat - lat) * Math.PI) / 180;
  const dLng = ((CANNES.lng - lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat * Math.PI) / 180) *
      Math.cos((CANNES.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  let factor: number;
  if (d < 50) factor = 1.5;
  else if (d < 200) factor = 1.4;
  else if (d < 500) factor = 1.3;
  else if (d < 1000) factor = 1.25;
  else factor = 1.2;
  return Math.round(d * factor);
}

// ── Mapping type véhicule → libellé réel ────────────────────────────
function mapVehicleType(vehicleType: string | null, fallbackSize?: string): string {
  // Priorité 1 : champ vehicleType (enum Prisma)
  if (vehicleType) {
    switch (vehicleType) {
      case "PORTEUR": return "Porteur";
      case "PORTEUR_ARTICULE": return "Porteur articulé";
      case "SEMI_REMORQUE": return "Semi-remorque";
      default: break;
    }
  }
  // Priorité 2 : champ size (peut contenir l'enum directement)
  if (fallbackSize) {
    const s = fallbackSize.toUpperCase();
    if (s.includes("SEMI")) return "Semi-remorque";
    if (s.includes("ARTICUL")) return "Porteur articulé";
    if (s.includes("PORTEUR")) return "Porteur";
  }
  // Défaut : Porteur (véhicule le plus courant)
  return "Porteur";
}

// ── Mapping pays : nom brut ou code → pays en français ──────────────
const COUNTRY_NAME_MAP: Record<string, string> = {
  FRANCE: "France", ESPAGNE: "Espagne", ITALIE: "Italie",
  ALLEMAGNE: "Allemagne", BELGIQUE: "Belgique", SUISSE: "Suisse",
  ROYAUME_UNI: "Royaume-Uni", PAYS_BAS: "Pays-Bas", PORTUGAL: "Portugal",
  AUTRE: "Autre",
};

const COUNTRY_KEYWORD_MAP: Record<string, string> = {
  france: "France", pologne: "Pologne", italie: "Italie",
  espagne: "Espagne", allemagne: "Allemagne", belgique: "Belgique",
  suisse: "Suisse", portugal: "Portugal", turquie: "Turquie",
  lituanie: "Lituanie", lettonie: "Lettonie", hongrie: "Hongrie",
  bulgarie: "Bulgarie", roumanie: "Roumanie", danemark: "Danemark",
  autriche: "Autriche", irlande: "Irlande", russie: "Russie",
  ukraine: "Ukraine",
  "royaume-uni": "Royaume-Uni", "royaume-unis": "Royaume-Uni",
  "pays-bas": "Pays-Bas",
  "république tchèque": "République tchèque", "république tchéque": "République tchèque",
  uk: "Royaume-Uni", poland: "Pologne", polska: "Pologne",
  italy: "Italie", spain: "Espagne", germany: "Allemagne",
  belgium: "Belgique", "united kingdom": "Royaume-Uni",
  turkey: "Turquie", turquir: "Turquie",
};

/**
 * Normalise un champ city brut en : { cityName, countryName, distance }
 * Gère les formats : "Nice, France" | "POLOGNE" | "lo,don" | "78 GUYANCOURT" | etc.
 */
interface ResolvedCity {
  cityName: string;
  countryName: string;
  distance: number;
}

function resolveCity(rawCity: string): ResolvedCity {
  const trimmed = (rawCity || "").trim();
  if (!trimmed) return { cityName: "", countryName: "Origine non renseignée", distance: 0 };

  const MANUAL_FIX: Record<string, string> = {
    "lo,don": "London", "kawe,": "Cannes", "Gones": "Gonesse",
    "Brignet": "Brignoles", "wiszkow": "Wyszków", "wisekow": "Wyszków",
    "wischkow  pologne": "Wyszków", "PERPIGNANT": "Perpignan",
    "TURQUIR": "Turquie", "Caros, Pérou": "Carros",
    "CELOREO PORTUGAL": "Porto", "mtx": "Cannes", "Po": "Pologne",
    "En Provence, États-Unis d'Amérique": "Aix-en-Provence",
    "Cannes la Bocca": "Cannes", "Cannes-la-Bocca, France": "Cannes",
    "Frejus, France": "Fréjus", "Prade, France": "Prades",
    "Greater London, United Kingdom": "London",
    "Lithuanian National Drama Theatre, Lituanie": "Vilnius",
    "Belgium, Belgium": "Belgique",
    "Czech, Pologne": "Częstochowa",
    "78 GUYANCOURT": "Versailles", "78 GUYANTCOURT": "Versailles",
    "Guyancourt": "Versailles",
    "Pegomas": "Pégomas", "PUGET": "Puget-sur-Argens",
    "CARROS": "Carros", "carros": "Carros",
    "Cannes": "Cannes", "Brignais": "Brignais",
    "Varsovie": "Varsovie", "Pologne": "Pologne",
    "République Tchéque": "République tchèque",
    "Royaume-Unis": "Royaume-Uni",
    "london": "London",
  };

  const input = MANUAL_FIX[trimmed] || trimmed;

  // Format "Ville, Pays" → extraire la partie ville
  let cityPart = input;
  let countryPart = "";
  const commaIdx = input.indexOf(", ");
  if (commaIdx > 0) {
    cityPart = input.substring(0, commaIdx).trim();
    countryPart = input.substring(commaIdx + 2).trim();
  }

  // Si c'est un code postal / département seul (91, 54, 69530, etc.)
  if (/^\d{2,5}$/.test(cityPart.replace(/\s/g, ""))) {
    return { cityName: cityPart, countryName: "France", distance: 863 };
  }
  // "78 GUYANCOURT" → "Guyancourt"
  if (/^\d{2}\s+\w/.test(cityPart)) {
    cityPart = cityPart.replace(/^\d{2,5}\s+/, "");
  }

  // Vérifier si c'est un nom de pays seul (pas une ville)
  const lowerFull = input.toLowerCase().replace(/,\s*/g, "").trim();
  const lowerCity = cityPart.toLowerCase().trim();
  const countryFromKeyword = COUNTRY_KEYWORD_MAP[lowerFull] || COUNTRY_KEYWORD_MAP[lowerCity];
  if (countryFromKeyword) {
    // "Pologne, Pologne" ou "POLOGNE" ou "POLSKA" → pays connu, distance = capitale
    const capitalDistances: Record<string, number> = {
      "Pologne": 1700, "Italie": 629, "Espagne": 1189, "Portugal": 1743,
      "Turquie": 2188, "Lituanie": 2168, "Lettonie": 2294, "Hongrie": 1239,
      "Bulgarie": 1589, "Roumanie": 1832, "Danemark": 1686, "Autriche": 1112,
      "Irlande": 1752, "Russie": 3067, "Ukraine": 2316,
      "Royaume-Uni": 1240, "Pays-Bas": 1241, "Belgique": 1045,
      "Allemagne": 1324, "France": 863, "Suisse": 574,
      "République tchèque": 1148,
    };
    return {
      cityName: countryFromKeyword,
      countryName: countryFromKeyword,
      distance: capitalDistances[countryFromKeyword] ?? 1500,
    };
  }

  // Essayer findCity sur la partie ville
  const match = findCity(cityPart);
  if (match) {
    return { cityName: match.n, countryName: match.p, distance: match.d };
  }

  // findCity sur l'input complet (au cas où)
  const matchFull = findCity(input);
  if (matchFull) {
    return { cityName: matchFull.n, countryName: matchFull.p, distance: matchFull.d };
  }

  // Villes/communes non présentes dans european-cities.json (distances pré-calculées vers Cannes)
  // Distances routières pré-calculées vers Cannes (Palais des Festivals)
  const EXTRA_CITIES: Record<string, { country: string; distance: number }> = {
    // France — proches Cannes
    "cannes": { country: "France", distance: 0 },
    "cannes la bocca": { country: "France", distance: 4 },
    "carros": { country: "France", distance: 30 },
    "pégomas": { country: "France", distance: 15 },
    "pegomas": { country: "France", distance: 15 },
    "roquebrune": { country: "France", distance: 20 },
    "la roquette": { country: "France", distance: 18 },
    "la roquette-sur-siagne": { country: "France", distance: 18 },
    "saint-laurent-du-var": { country: "France", distance: 22 },
    "montauroux": { country: "France", distance: 34 },
    "puget-sur-argens": { country: "France", distance: 52 },
    "puget": { country: "France", distance: 52 },
    // France — Var / PACA
    "flassans-sur-issole": { country: "France", distance: 88 },
    "brignoles": { country: "France", distance: 98 },
    "la farlède": { country: "France", distance: 140 },
    "prades": { country: "France", distance: 480 },
    // France — Rhône-Alpes
    "brignais": { country: "France", distance: 465 },
    "cornier": { country: "France", distance: 360 },
    // France — Île-de-France / nord
    "gonesse": { country: "France", distance: 879 },
    "dugny": { country: "France", distance: 875 },
    "versailles": { country: "France", distance: 870 },
    "guyancourt": { country: "France", distance: 875 },
    "montlhéry": { country: "France", distance: 845 },
    "savigny": { country: "France", distance: 863 },
    // France — départements / régions
    "essonne": { country: "France", distance: 863 },
    "seine-saint-denis": { country: "France", distance: 875 },
    "yvelines": { country: "France", distance: 880 },
    "meurthe-et-moselle": { country: "France", distance: 719 },
    // France — nord / divers
    "wimille": { country: "France", distance: 1120 },
    "pérenchies": { country: "France", distance: 1060 },
    "flers": { country: "France", distance: 1050 },
    // Belgique
    "turnhout": { country: "Belgique", distance: 1090 },
    "genappe": { country: "Belgique", distance: 1010 },
    // Allemagne
    "langenlonsheim": { country: "Allemagne", distance: 920 },
    // Italie
    "pianoro": { country: "Italie", distance: 480 },
    "casalfiumanese": { country: "Italie", distance: 490 },
    // Lituanie
    "klaipeda": { country: "Lituanie", distance: 2500 },
    // Ukraine
    "dnipro": { country: "Ukraine", distance: 2700 },
    // Espagne
    "ajalvir": { country: "Espagne", distance: 1215 },
    // Portugal
    "guarda": { country: "Portugal", distance: 1525 },
    // Pays-Bas
    "meppel": { country: "Pays-Bas", distance: 1280 },
    "boxtel": { country: "Pays-Bas", distance: 1150 },
    // Roumanie
    "rovinari": { country: "Roumanie", distance: 1850 },
    // Pologne
    "wyszków": { country: "Pologne", distance: 1755 },
    "wyszkow": { country: "Pologne", distance: 1755 },
  };

  const lookupKey = cityPart.toLowerCase().trim();
  const extra = EXTRA_CITIES[lookupKey];
  if (extra) {
    return { cityName: cityPart, countryName: extra.country, distance: extra.distance };
  }

  // Déduire le pays depuis la partie countryPart
  const countryFromPart = COUNTRY_KEYWORD_MAP[countryPart.toLowerCase()];
  const fallbackCountry = countryFromPart || countryPart || "Origine non renseignée";

  // Dernière chance : si on a un pays, estimer la distance depuis la capitale
  const capitalDistanceFallback: Record<string, number> = {
    "France": 863, "Pologne": 1700, "Italie": 629, "Espagne": 1189,
    "Allemagne": 1324, "Belgique": 1045, "Royaume-Uni": 1240,
    "Portugal": 1743, "Pays-Bas": 1241, "Suisse": 574,
    "Lituanie": 2168, "Turquie": 2188, "République tchèque": 1148,
    "Roumanie": 1832, "Bulgarie": 1589, "Hongrie": 1239,
    "Lettonie": 2294, "Danemark": 1686, "Autriche": 1112,
    "Irlande": 1752, "Ukraine": 2316, "Russie": 3067,
  };

  return {
    cityName: cityPart,
    countryName: fallbackCountry,
    distance: capitalDistanceFallback[fallbackCountry] ?? 0,
  };
}

/** Cache de résolution ville pour éviter de recalculer */
function buildCityResolveCache(
  accreditations: Array<{ vehicles: Array<{ city: string }> }>
): Map<string, ResolvedCity> {
  const cache = new Map<string, ResolvedCity>();
  for (const acc of accreditations) {
    for (const v of acc.vehicles) {
      const raw = (v.city || "").trim();
      if (raw && !cache.has(raw)) {
        cache.set(raw, resolveCity(raw));
      }
    }
  }
  return cache;
}

// ── Parsing date (supporte ISO YYYY-MM-DD et dd/mm/yyyy) ────────────
function parseDate(dateStr: string): Date {
  if (dateStr.includes("/")) {
    const [day, month, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
  }
  // Format ISO YYYY-MM-DD — attention au timezone, on parse en local
  const [y, m, d] = dateStr.split("-").map(Number);
  if (y && m && d) return new Date(y, m - 1, d);
  return new Date(dateStr);
}

function filterByDateRange(
  data: CarbonDataEntry[],
  startDateStr: string,
  endDateStr: string
): CarbonDataEntry[] {
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);
  // Sécurité : si dates invalides, retourner tout
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return data;
  return data.filter((e) => {
    const d = parseDate(e.date);
    return d >= startDate && d <= endDate;
  });
}

// ── GET /api/carbon ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "BILAN_CARBONE", "read");
    const { searchParams } = new URL(req.url);
    const today = new Date();
    const currentYear = today.getFullYear();
    const todayStr = `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const startDate = searchParams.get("start") || `${currentYear}-01-01`;
    const endDate = searchParams.get("end") || todayStr;
    const search = searchParams.get("search") || "";

    // Récupérer les accréditations ENTREE ou SORTIE (+ time slots pour round trips)
    const accreditations = await prisma.accreditation.findMany({
      include: {
        vehicles: {
          include: {
            timeSlots: { orderBy: { entryAt: "asc" } },
          },
        },
      },
      where: {
        AND: [
          { status: { in: ["ENTREE", "SORTIE"] } },
          search
            ? {
                OR: [
                  { company: { contains: search, mode: "insensitive" } },
                  { event: { contains: search, mode: "insensitive" } },
                  { stand: { contains: search, mode: "insensitive" } },
                  { vehicles: { some: { plate: { contains: search, mode: "insensitive" } } } },
                ],
              }
            : {},
        ],
      },
    });

    // Charger les coordonnées des zones pour les calculs inter-zones
    const zoneCoords = await getZoneCoords();

    // Cache de résolution ville (normalisation + distance + pays)
    const cityCache = buildCityResolveCache(accreditations);

    const carbonData: CarbonDataEntry[] = [];

    for (const acc of accreditations) {
      for (const vehicle of acc.vehicles) {
        const vehicleType = mapVehicleType(vehicle.vehicleType || null, vehicle.size);

        // Résoudre la ville (normalisation, distance, pays)
        const rawCity = (vehicle.city || "").trim();
        const resolved = cityCache.get(rawCity) ?? resolveCity(rawCity);

        // Distance aller simple : estimatedKms > kms (texte) > base locale
        let kmAllerSimple = 0;
        if (vehicle.estimatedKms && vehicle.estimatedKms > 0) {
          kmAllerSimple = vehicle.estimatedKms;
        } else if (vehicle.kms) {
          const parsed = parseInt(vehicle.kms.replace(/\D/g, "")) || 0;
          if (parsed > 0) kmAllerSimple = parsed;
        }
        if (kmAllerSimple === 0) {
          kmAllerSimple = resolved.distance;
        }

        // Distance A/R (aller-retour) : le camion vient et repart
        const kmAllerRetour = kmAllerSimple * 2;

        // ── Calcul inter-zones (transferts entre zones sur place) ──
        let kmInterZone = 0;
        let roundTrips = 0;
        const timeSlots = (vehicle as typeof vehicle & { timeSlots: Array<{ zone: string; entryAt: Date; exitAt: Date | null; stepNumber: number }> }).timeSlots || [];

        if (timeSlots.length > 1) {
          for (let i = 1; i < timeSlots.length; i++) {
            const prev = timeSlots[i - 1];
            const curr = timeSlots[i];
            if (prev.zone === curr.zone) continue;
            const z1 = zoneCoords[prev.zone];
            const z2 = zoneCoords[curr.zone];
            if (z1 && z2) {
              const dist = interZoneRoadDistance(z1, z2);
              kmInterZone += dist;
              roundTrips++;
            }
          }
        }

        // Distance totale = A/R principal + inter-zones
        const kmTotal = kmAllerRetour + kmInterZone;

        // Émissions CO₂
        const validTypes = Object.keys(CO2_COEFFICIENTS);
        const finalType = validTypes.includes(vehicleType) ? vehicleType : "Porteur";
        const coeff = CO2_COEFFICIENTS[finalType as keyof typeof CO2_COEFFICIENTS];
        const kgCO2eq = kmTotal > 0 ? Math.round(kmTotal * coeff) : 0;
        const kgCO2eqInterZone = kmInterZone > 0 ? Math.round(kmInterZone * coeff) : 0;

        // Pays : depuis le champ country (enum) ou depuis la résolution ville
        let origine = "Origine non renseignée";
        if (vehicle.country) {
          origine = COUNTRY_NAME_MAP[vehicle.country] ?? resolved.countryName;
        } else {
          origine = resolved.countryName;
        }

        // Date
        let dateFormatted = vehicle.date || new Date().toISOString().split("T")[0];
        if (vehicle.arrivalDate) {
          dateFormatted = new Date(vehicle.arrivalDate).toISOString().split("T")[0];
        }

        carbonData.push({
          id: `${acc.id}-${vehicle.id}`,
          evenement: acc.event,
          plaque: vehicle.plate,
          entreprise: acc.company,
          stand: acc.stand,
          origine,
          type: vehicleType,
          km: kmTotal,
          kgCO2eq,
          date: dateFormatted,
          kmInterZone,
          kgCO2eqInterZone,
          roundTrips,
        });
      }
    }

    // Filtrer par la plage de dates choisie par l'utilisateur
    const filteredData = filterByDateRange(carbonData, startDate, endDate);

    // Agrégations
    const aggregations = {
      pays: aggregate(filteredData, "origine"),
      evenement: aggregate(filteredData, "evenement"),
      entreprise: aggregate(filteredData, "entreprise"),
      type: aggregate(filteredData, "type"),
    };

    // Données mensuelles (entre start et end)
    const monthly = monthlyData(filteredData, startDate, endDate);

    return Response.json({
      success: true,
      data: {
        detailed: filteredData,
        aggregations,
        monthly,
        period: { start: startDate, end: endDate },
        total: filteredData.length,
      },
    });
  } catch (error) {
    console.error("Erreur API bilan carbone:", error);
    return Response.json(
      { success: false, error: "Erreur lors de la récupération des données" },
      { status: 500 }
    );
  }
}

// ── Agrégation ───────────────────────────────────────────────────────
function aggregate(data: CarbonDataEntry[], field: keyof CarbonDataEntry): AggregatedData[] {
  const groups: Record<string, { nbVehicules: number; distanceKm: number; emissionsKgCO2eq: number }> = {};
  for (const e of data) {
    const key = String(e[field]);
    if (!groups[key]) groups[key] = { nbVehicules: 0, distanceKm: 0, emissionsKgCO2eq: 0 };
    groups[key].nbVehicules += 1;
    groups[key].distanceKm += e.km;
    groups[key].emissionsKgCO2eq += e.kgCO2eq;
  }
  return Object.entries(groups)
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.nbVehicules - a.nbVehicules);
}

// ── Données mensuelles (entre start et end) ─────────────────────────
function monthlyData(
  data: CarbonDataEntry[],
  startDateStr: string,
  endDateStr: string
) {
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  // Calculer le nombre de mois entre start et end
  const seen = new Set<string>();
  const months: {
    month: string;
    monthIndex: number;
    year: number;
    nbVehicules: number;
    typeBreakdown: {
      "Porteur": number;
      "Porteur articulé": number;
      "Semi-remorque": number;
    };
    data: CarbonDataEntry[];
    uniqueKey: string;
  }[] = [];

  // Itérer mois par mois de start à end
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const limit = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cursor <= limit) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth()).padStart(2, "0")}`;
    if (!seen.has(key)) {
      seen.add(key);

      const name = new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
      }).format(cursor);

      const curMonth = cursor.getMonth();
      const curYear = cursor.getFullYear();

      const monthEntries = data.filter((e) => {
        const ed = parseDate(e.date);
        return ed.getMonth() === curMonth && ed.getFullYear() === curYear;
      });

      months.push({
        month: name,
        monthIndex: curMonth,
        year: curYear,
        nbVehicules: monthEntries.length,
        typeBreakdown: {
          "Porteur": monthEntries.filter((e) => e.type === "Porteur").length,
          "Porteur articulé": monthEntries.filter((e) => e.type === "Porteur articulé").length,
          "Semi-remorque": monthEntries.filter((e) => e.type === "Semi-remorque").length,
        },
        data: monthEntries,
        uniqueKey: key,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}
