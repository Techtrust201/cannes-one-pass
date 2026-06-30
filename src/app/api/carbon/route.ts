import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { buildCityResolveCache } from "@/lib/carbon-city";
import {
  buildCarbonEntriesForVehicle,
  type CarbonDataEntry,
} from "@/lib/carbon-entry";
import {
  mapDbVehicleType,
  mapDefaultVehicleTypes,
  buildTypeBreakdownFromList,
  getVehicleTypeColorsFromList,
} from "@/lib/vehicle-type-server";
import type { VehicleTypeData } from "@/lib/vehicle-utils";

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
  // Charger TOUTES les zones (actives + inactives) pour le bilan carbone historique.
  // Une zone désactivée peut encore avoir des timeSlots passés qu'il faut comptabiliser.
  const zones = await prisma.zoneConfig.findMany();
  const coords: Record<string, ZoneCoords> = {};
  for (const z of zones) {
    coords[z.zone] = { lat: z.latitude, lng: z.longitude };
  }
  zoneCoordCache = coords;
  zoneCoordCacheTime = now;
  return coords;
}

interface AggregatedData {
  category: string;
  nbVehicules: number;
  distanceKm: number;
  emissionsKgCO2eq: number;
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
    const session = await requirePermission(req, "BILAN_CARBONE", "read");
    const { searchParams } = new URL(req.url);
    const today = new Date();
    const currentYear = today.getFullYear();
    const todayStr = `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const startDate = searchParams.get("start") || `${currentYear}-01-01`;
    const endDate = searchParams.get("end") || todayStr;
    const search = searchParams.get("search") || "";
    // Filtre événement exact (séparé de la recherche texte libre).
    const eventFilter = searchParams.get("event")?.trim() || "";

    // Cloisonnement multi-tenant : restreindre aux events accessibles à
    // l'utilisateur (avec prise en compte du contexte d'Espace si fourni).
    const espaceParam = searchParams.get("espace")?.trim() || null;
    const { getAccessibleEventIdsForEspace } = await import("@/lib/auth-helpers");
    const accessibleEventIds = await getAccessibleEventIdsForEspace(
      session.user.id,
      espaceParam
    );
    const scopeFilter =
      accessibleEventIds === "ALL"
        ? {}
        : { eventId: { in: accessibleEventIds } };

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
          scopeFilter,
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
          // Filtre événement exact : basé sur le champ `event` de l'accréditation
          // (contient le slug ou le nom de l'événement selon la source).
          eventFilter
            ? { event: { equals: eventFilter, mode: "insensitive" } }
            : {},
        ],
      },
    });

    // Charger les coordonnées des zones pour les calculs inter-zones
    const zoneCoords = await getZoneCoords();

    // Cloisonnement multi-tenant : charger les gabarits PAR organisation. Le
    // même code (ex. « VL ») peut exister chez RX et au Palais avec des
    // libellés et coefficients CO2 différents — on ne doit jamais résoudre une
    // accréditation contre le catalogue d'une autre organisation.
    const orgIds = Array.from(
      new Set(
        accreditations
          .map((a) => a.organizationId)
          .filter((id): id is string => !!id)
      )
    );

    const orgs = orgIds.length
      ? await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, slug: true },
        })
      : [];
    const slugByOrg = new Map(orgs.map((o) => [o.id, o.slug]));

    const dbVehicleTypes = orgIds.length
      ? await prisma.vehicleTypeConfig.findMany({
          where: { isActive: true, organizationId: { in: orgIds } },
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        })
      : [];

    const typesByOrg = new Map<string, VehicleTypeData[]>();
    for (const t of dbVehicleTypes) {
      if (!t.organizationId) continue;
      const arr = typesByOrg.get(t.organizationId) ?? [];
      arr.push(mapDbVehicleType(t));
      typesByOrg.set(t.organizationId, arr);
    }

    const typesForOrg = (orgId: string | null): VehicleTypeData[] => {
      if (orgId && typesByOrg.has(orgId)) return typesByOrg.get(orgId)!;
      return mapDefaultVehicleTypes(orgId ? slugByOrg.get(orgId) : null);
    };

    // Union des libellés/couleurs des organisations visibles, pour les axes
    // d'agrégation. Dé-dupliquée par libellé.
    const allTypes: VehicleTypeData[] = [];
    const seenLabel = new Set<string>();
    for (const orgId of orgIds.length ? orgIds : [null]) {
      for (const t of typesForOrg(orgId)) {
        if (seenLabel.has(t.label)) continue;
        seenLabel.add(t.label);
        allTypes.push(t);
      }
    }
    const typeColors = getVehicleTypeColorsFromList(allTypes);
    const typeLabels = allTypes.map((t) => t.label);

    // Cache de résolution ville (normalisation + distance + pays)
    const cityCache = buildCityResolveCache(accreditations);

    const carbonData: CarbonDataEntry[] = [];

    for (const acc of accreditations) {
      for (const vehicle of acc.vehicles) {
        const entries = buildCarbonEntriesForVehicle({
          acc: {
            id: acc.id,
            event: acc.event,
            company: acc.company,
            stand: acc.stand,
            extension: acc.extension,
          },
          vehicle: {
            id: vehicle.id,
            city: vehicle.city,
            country: vehicle.country,
            estimatedKms: vehicle.estimatedKms,
            kms: vehicle.kms,
            vehicleType: vehicle.vehicleType,
            size: vehicle.size,
            plate: vehicle.plate,
            date: vehicle.date,
            arrivalDate: vehicle.arrivalDate,
            timeSlots: vehicle.timeSlots,
          },
          vehicleTypes: typesForOrg(acc.organizationId),
          zoneCoords,
          cityCache,
        });
        carbonData.push(...entries);
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
    const monthly = monthlyData(filteredData, startDate, endDate, allTypes);

    return Response.json({
      success: true,
      data: {
        detailed: filteredData,
        aggregations,
        monthly,
        period: { start: startDate, end: endDate },
        total: filteredData.length,
        typeColors,
        typeLabels,
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
  endDateStr: string,
  vehicleTypes: VehicleTypeData[]
) {
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  const seen = new Set<string>();
  const months: {
    month: string;
    monthIndex: number;
    year: number;
    nbVehicules: number;
    typeBreakdown: Record<string, number>;
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
        typeBreakdown: buildTypeBreakdownFromList(
          vehicleTypes,
          monthEntries.map((e) => ({ type: e.type }))
        ),
        data: monthEntries,
        uniqueKey: key,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}
