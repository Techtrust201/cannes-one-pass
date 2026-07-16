/**
 * Source de vérité unique des instructions process LIGHT / HEAVY (RX).
 * Fallback code si aucune RxVehicleProcessConfig n'est en base.
 */

import type { VehicleFamily } from "@prisma/client";

export type RxVehicleProcessInstructions = {
  family: VehicleFamily;
  title: string;
  zoneCode: string | null;
  zoneLabel: string;
  maxParkingMinutes: number | null;
  requiresReceiver: boolean;
  requiresHeavyUnloadingDetails: boolean;
  instructions: string[];
};

export type RxVehicleProcessConfigRow = {
  vehicleFamily: VehicleFamily;
  zoneCode: string | null;
  maxParkingMinutes: number | null;
  requiresReceiver: boolean;
  requiresHeavyUnloadingDetails: boolean;
  title: string;
  instructions: unknown;
  isActive: boolean;
};

const FALLBACK_LIGHT: RxVehicleProcessInstructions = {
  family: "LIGHT",
  title: "Véhicule léger — Zone 1",
  zoneCode: null,
  zoneLabel: "Liégeard / Grand Parking de la Plage",
  maxParkingMinutes: 120,
  requiresReceiver: false,
  requiresHeavyUnloadingDetails: false,
  instructions: [
    "Stationnement ou déchargement temporaire en Zone 1.",
    "Durée maximale : 120 minutes.",
    "Pas de procédure lourde de réceptionnaire.",
  ],
};

const FALLBACK_HEAVY: RxVehicleProcessInstructions = {
  family: "HEAVY",
  title: "Poids lourd — Zone 2",
  zoneCode: null,
  zoneLabel: "Parking du Stade Coubertin",
  maxParkingMinutes: null,
  requiresReceiver: true,
  requiresHeavyUnloadingDetails: true,
  instructions: [
    "Aire de rétention Zone 2 (Parking du Stade Coubertin).",
    "Contacter le réceptionnaire avant toute manœuvre.",
    "Autorisation logistique obligatoire avant départ vers le Palais.",
  ],
};

function parseInstructions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Produit les instructions process pour une famille, à partir d'une config DB
 * optionnelle (sinon fallback centralisé).
 */
export function getRxVehicleProcessInstructions(
  family: VehicleFamily,
  config?: RxVehicleProcessConfigRow | null,
  zoneLabelOverride?: string | null
): RxVehicleProcessInstructions {
  const fallback = family === "HEAVY" ? FALLBACK_HEAVY : FALLBACK_LIGHT;
  if (!config || !config.isActive) {
    return {
      ...fallback,
      zoneLabel: zoneLabelOverride?.trim() || fallback.zoneLabel,
    };
  }
  const instructions = parseInstructions(config.instructions);
  return {
    family,
    title: config.title.trim() || fallback.title,
    zoneCode: config.zoneCode?.trim() || null,
    zoneLabel: zoneLabelOverride?.trim() || fallback.zoneLabel,
    maxParkingMinutes: config.maxParkingMinutes,
    requiresReceiver: config.requiresReceiver,
    requiresHeavyUnloadingDetails: config.requiresHeavyUnloadingDetails,
    instructions: instructions.length > 0 ? instructions : fallback.instructions,
  };
}

export function getDefaultRxVehicleProcessFallback(
  family: VehicleFamily
): RxVehicleProcessInstructions {
  return family === "HEAVY" ? { ...FALLBACK_HEAVY } : { ...FALLBACK_LIGHT };
}
