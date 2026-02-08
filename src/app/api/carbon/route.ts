import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { findCity } from "@/lib/city-search";

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
}

interface AggregatedData {
  category: string;
  nbVehicules: number;
  distanceKm: number;
  emissionsKgCO2eq: number;
}

// ── Coefficients CO₂ (ADEME 2024, diesel utilitaires) ────────────────
const CO2_COEFFICIENTS = {
  "<10m3": 0.185,   // Fourgonnette <3.5t
  "10-15m3": 0.265, // Fourgon moyen 3.5-7.5t
  "15-20m3": 0.385, // Camion porteur 7.5-16t
  ">20m3": 0.485,   // Poids lourd >16t
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

// ── Mapping type véhicule ────────────────────────────────────────────
function mapVehicleTypeToSize(vehicleType: string | null, fallbackSize?: string): string {
  if (vehicleType) {
    switch (vehicleType) {
      case "PETIT": return "<10m3";
      case "MOYEN": return "10-15m3";
      case "GRAND": return "15-20m3";
      case "TRES_GRAND": return ">20m3";
      default: return "10-15m3";
    }
  }
  if (fallbackSize) {
    const s = fallbackSize.toUpperCase();
    if (s.includes("PETIT") || s.includes("SMALL") || s.includes("<10")) return "<10m3";
    if (s.includes("MOYEN") || s.includes("MEDIUM") || s.includes("10-15")) return "10-15m3";
    if (s.includes("GRAND") || s.includes("LARGE") || s.includes("15-20")) return "15-20m3";
    if (s.includes("TRES") || s.includes("XL") || s.includes(">20")) return ">20m3";
  }
  return "10-15m3";
}

// ── Mapping pays ─────────────────────────────────────────────────────
function mapCountryToFrench(country: string | null, fallbackCity?: string): string {
  if (country) {
    const MAP: Record<string, string> = {
      FRANCE: "France", ESPAGNE: "Espagne", ITALIE: "Italie",
      ALLEMAGNE: "Allemagne", BELGIQUE: "Belgique", SUISSE: "Suisse",
      ROYAUME_UNI: "Royaume-Uni", PAYS_BAS: "Pays-Bas", PORTUGAL: "Portugal",
      AUTRE: "Autre",
    };
    return MAP[country] ?? "France";
  }
  // Essayer la base locale pour le pays
  if (fallbackCity) {
    const match = findCity(fallbackCity);
    if (match) return match.p;
  }
  return fallbackCity || "Origine non renseignée";
}

// ── Distance depuis une ville (base locale prioritaire) ──────────────
async function getDistanceFromCity(
  cityName: string,
  apiOrigin: string
): Promise<number> {
  // 1. Base locale (< 1ms)
  const match = findCity(cityName);
  if (match) return match.d;

  // 2. Fallback API (rare)
  try {
    const resp = await fetch(
      `${apiOrigin}/api/distance?city=${encodeURIComponent(cityName)}`
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.distance > 0) return data.distance;
    }
  } catch {
    // Ignore
  }

  return 0;
}

// ── Parsing date ─────────────────────────────────────────────────────
function parseDate(dateStr: string): Date {
  if (dateStr.includes("/")) {
    const [day, month, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(dateStr);
}

function filterTwelveMonths(data: CarbonDataEntry[], endDateStr: string): CarbonDataEntry[] {
  const endDate = parseDate(endDateStr);
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 11);
  startDate.setDate(1);
  return data.filter((e) => {
    const d = parseDate(e.date);
    return d >= startDate && d <= endDate;
  });
}

// ── GET /api/carbon ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("start") || "01/01/2024";
    const endDate = searchParams.get("end") || "31/12/2024";
    const search = searchParams.get("search") || "";

    // Récupérer les accréditations ENTREE ou SORTIE
    const accreditations = await prisma.accreditation.findMany({
      include: { vehicles: true },
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

    const carbonData: CarbonDataEntry[] = [];

    for (const acc of accreditations) {
      for (const vehicle of acc.vehicles) {
        const vehicleType = mapVehicleTypeToSize(vehicle.vehicleType || null, vehicle.size);

        // Distance : estimatedKms > kms (texte) > base locale > API
        let km = 0;
        if (vehicle.estimatedKms && vehicle.estimatedKms > 0) {
          km = vehicle.estimatedKms;
        } else if (vehicle.kms) {
          const parsed = parseInt(vehicle.kms.replace(/\D/g, "")) || 0;
          if (parsed > 0) km = parsed;
        }
        if (km === 0 && vehicle.city) {
          km = await getDistanceFromCity(vehicle.city, req.nextUrl.origin);
        }

        // Émissions CO₂
        const validTypes = Object.keys(CO2_COEFFICIENTS);
        const finalType = validTypes.includes(vehicleType) ? vehicleType : "10-15m3";
        const coeff = CO2_COEFFICIENTS[finalType as keyof typeof CO2_COEFFICIENTS];
        const kgCO2eq = km > 0 ? Math.round(km * coeff) : 0;

        // Pays
        const origine = mapCountryToFrench(vehicle.country || null, vehicle.city);

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
          km,
          kgCO2eq,
          date: dateFormatted,
        });
      }
    }

    // Filtrer 12 mois
    const filteredData = filterTwelveMonths(carbonData, endDate);

    // Agrégations
    const aggregations = {
      pays: aggregate(filteredData, "origine"),
      evenement: aggregate(filteredData, "evenement"),
      entreprise: aggregate(filteredData, "entreprise"),
      type: aggregate(filteredData, "type"),
    };

    // Données mensuelles
    const monthly = monthlyData(filteredData, endDate);

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

// ── Données mensuelles ───────────────────────────────────────────────
function monthlyData(data: CarbonDataEntry[], endDateStr: string) {
  const endDate = parseDate(endDateStr);
  const seen = new Set<string>();
  const months: {
    month: string; monthIndex: number; year: number;
    nbVehicules: number;
    typeBreakdown: { "<10m3": number; "10-15m3": number; "15-20m3": number; ">20m3": number };
    data: CarbonDataEntry[];
    uniqueKey: string;
  }[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(endDate);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const name = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(d);
    const monthEntries = data.filter((e) => {
      const ed = parseDate(e.date);
      return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear();
    });

    months.push({
      month: name,
      monthIndex: d.getMonth(),
      year: d.getFullYear(),
      nbVehicules: monthEntries.length,
      typeBreakdown: {
        "<10m3": monthEntries.filter((e) => e.type === "<10m3").length,
        "10-15m3": monthEntries.filter((e) => e.type === "10-15m3").length,
        "15-20m3": monthEntries.filter((e) => e.type === "15-20m3").length,
        ">20m3": monthEntries.filter((e) => e.type === ">20m3").length,
      },
      data: monthEntries,
      uniqueKey: key,
    });
  }
  return months;
}
