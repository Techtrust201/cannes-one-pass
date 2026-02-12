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
}

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
        const vehicleType = mapVehicleType(vehicle.vehicleType || null, vehicle.size);

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

        // Émissions CO₂ — utiliser le coefficient du type réel
        const validTypes = Object.keys(CO2_COEFFICIENTS);
        const finalType = validTypes.includes(vehicleType) ? vehicleType : "Porteur";
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
