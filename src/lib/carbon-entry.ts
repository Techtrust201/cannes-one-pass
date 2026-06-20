import {
  COUNTRY_NAME_MAP,
  resolveCity,
  type ResolvedCity,
} from "@/lib/carbon-city";
import { parseRxVehicleContext } from "@/lib/rx-vehicle-context";
import {
  getCo2CoefficientFromList,
  getPdfCodeFromList,
  resolveVehicleTypeLabelFromList,
} from "@/lib/vehicle-type-server";
import type { VehicleTypeData } from "@/lib/vehicle-utils";

export interface CarbonDataEntry {
  id: string;
  evenement: string;
  plaque: string;
  entreprise: string;
  stand: string;
  origine: string;
  type: string;
  pdfCode?: string;
  km: number;
  kgCO2eq: number;
  date: string;
  kmInterZone?: number;
  kgCO2eqInterZone?: number;
  roundTrips?: number;
}

export type CarbonLegInput = {
  city: string;
  country?: string | null;
  estimatedKms?: number | null;
  kms?: string | null;
  vehicleType?: string | null;
  size?: string | null;
  plate?: string | null;
  date?: string | null;
  arrivalDate?: Date | string | null;
};

export type ZoneCoords = { lat: number; lng: number };

export type CarbonTimeSlot = {
  zone: string;
  entryAt: Date;
  exitAt: Date | null;
  stepNumber: number;
};

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

function interZoneRoadDistance(z1: ZoneCoords, z2: ZoneCoords): number {
  const d = haversine(z1.lat, z1.lng, z2.lat, z2.lng);
  const factor = d < 10 ? 1.5 : d < 30 ? 1.4 : 1.3;
  return Math.round(d * factor * 10) / 10;
}

export function resolveKmAllerSimple(
  input: CarbonLegInput,
  resolved: ResolvedCity
): number {
  if (input.estimatedKms && input.estimatedKms > 0) {
    return input.estimatedKms;
  }
  if (input.kms) {
    const parsed = parseInt(input.kms.replace(/\D/g, "")) || 0;
    if (parsed > 0) return parsed;
  }
  return resolved.distance;
}

export function resolveOrigine(
  country: string | null | undefined,
  resolved: ResolvedCity
): string {
  if (country) {
    return COUNTRY_NAME_MAP[country] ?? resolved.countryName;
  }
  return resolved.countryName;
}

export function computeInterZoneKm(
  timeSlots: CarbonTimeSlot[],
  zoneCoords: Record<string, ZoneCoords>
): { kmInterZone: number; roundTrips: number } {
  let kmInterZone = 0;
  let roundTrips = 0;

  if (timeSlots.length > 1) {
    for (let i = 1; i < timeSlots.length; i++) {
      const prev = timeSlots[i - 1];
      const curr = timeSlots[i];
      if (prev.zone === curr.zone) continue;
      const z1 = zoneCoords[prev.zone];
      const z2 = zoneCoords[curr.zone];
      if (z1 && z2) {
        kmInterZone += interZoneRoadDistance(z1, z2);
        roundTrips++;
      }
    }
  }

  return { kmInterZone, roundTrips };
}

function formatLegDate(leg: CarbonLegInput): string {
  if (leg.arrivalDate) {
    const d =
      leg.arrivalDate instanceof Date
        ? leg.arrivalDate
        : new Date(leg.arrivalDate);
    return d.toISOString().split("T")[0];
  }
  return leg.date || new Date().toISOString().split("T")[0];
}

export function buildCarbonLegEntry(params: {
  id: string;
  acc: { event: string; company: string; stand: string };
  leg: CarbonLegInput;
  vehicleTypes: VehicleTypeData[];
  zoneCoords: Record<string, ZoneCoords>;
  cityCache: Map<string, ResolvedCity>;
  timeSlots?: CarbonTimeSlot[];
}): CarbonDataEntry {
  const { id, acc, leg, vehicleTypes, zoneCoords, cityCache, timeSlots = [] } =
    params;

  const vehicleTypeLabel = resolveVehicleTypeLabelFromList(
    vehicleTypes,
    leg.vehicleType,
    leg.size
  );
  // Bilan carbone fiabilisé : pdfCode/CO₂ résolus par CODE technique d'abord
  // (repli par libellé pour le legacy), pour ne jamais dépendre d'un libellé
  // administrable/traduit.
  const pdfCode = getPdfCodeFromList(vehicleTypes, {
    code: leg.vehicleType,
    label: vehicleTypeLabel,
  });

  const rawCity = (leg.city || "").trim();
  const resolved = cityCache.get(rawCity) ?? resolveCity(rawCity);
  const kmAllerSimple = resolveKmAllerSimple(leg, resolved);
  const kmAllerRetour = kmAllerSimple * 2;

  const { kmInterZone, roundTrips } = computeInterZoneKm(timeSlots, zoneCoords);
  const kmTotal = kmAllerRetour + kmInterZone;

  const coeff = getCo2CoefficientFromList(vehicleTypes, {
    code: leg.vehicleType,
    label: vehicleTypeLabel,
  });
  const kgCO2eq = kmTotal > 0 ? Math.round(kmTotal * coeff) : 0;
  const kgCO2eqInterZone =
    kmInterZone > 0 ? Math.round(kmInterZone * coeff) : 0;

  return {
    id,
    evenement: acc.event,
    plaque: leg.plate ?? "",
    entreprise: acc.company,
    stand: acc.stand,
    origine: resolveOrigine(leg.country, resolved),
    type: vehicleTypeLabel,
    pdfCode,
    km: kmTotal,
    kgCO2eq,
    date: formatLegDate(leg),
    kmInterZone,
    kgCO2eqInterZone,
    roundTrips,
  };
}

export function buildCarbonEntriesForVehicle(params: {
  acc: {
    id: string;
    event: string;
    company: string;
    stand: string;
    extension?: unknown;
  };
  vehicle: {
    id: string | number;
    city: string;
    country: string | null;
    estimatedKms: number | null;
    kms: string | null;
    vehicleType: string | null;
    size: string | null;
    plate: string | null;
    date: string | null;
    arrivalDate?: Date | null;
    timeSlots?: CarbonTimeSlot[];
  };
  vehicleTypes: VehicleTypeData[];
  zoneCoords: Record<string, ZoneCoords>;
  cityCache: Map<string, ResolvedCity>;
}): CarbonDataEntry[] {
  const { acc, vehicle, vehicleTypes, zoneCoords, cityCache } = params;
  const timeSlots = vehicle.timeSlots ?? [];

  const deliveryEntry = buildCarbonLegEntry({
    id: `${acc.id}-${vehicle.id}`,
    acc,
    leg: {
      city: vehicle.city,
      country: vehicle.country,
      estimatedKms: vehicle.estimatedKms,
      kms: vehicle.kms,
      vehicleType: vehicle.vehicleType,
      size: vehicle.size,
      plate: vehicle.plate,
      date: vehicle.date,
      arrivalDate: vehicle.arrivalDate,
    },
    vehicleTypes,
    zoneCoords,
    cityCache,
    timeSlots,
  });

  const ctx = parseRxVehicleContext(acc.extension);
  if (ctx?.repSameAsDelivery === false) {
    const repEntry = buildCarbonLegEntry({
      id: `${acc.id}-${vehicle.id}-rep`,
      acc,
      leg: {
        city: ctx.repCity ?? "",
        country: ctx.repCountry,
        estimatedKms: ctx.repEstimatedKms,
        vehicleType: ctx.repVehicleType,
        plate: ctx.repPlate,
        date: ctx.repDate ?? vehicle.date,
      },
      vehicleTypes,
      zoneCoords,
      cityCache,
    });
    return [deliveryEntry, repEntry];
  }

  return [deliveryEntry];
}
