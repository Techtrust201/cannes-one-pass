import type { Zone } from "@/types";

/** Mapping zone enum → libellé français */
const ZONE_LABELS: Record<Zone, string> = {
  LA_BOCCA: "La Bocca",
  PALAIS_DES_FESTIVALS: "Palais des festivals",
  PANTIERO: "Pantiero",
  MACE: "Macé",
};

/** Couleurs associées à chaque zone (Tailwind classes) */
export const ZONE_COLORS: Record<Zone, { bg: string; text: string; border: string }> = {
  LA_BOCCA: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  PALAIS_DES_FESTIVALS: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
  PANTIERO: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
  MACE: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
};

/** Retourne le libellé français d'une zone */
export function getZoneLabel(zone: Zone): string {
  return ZONE_LABELS[zone] ?? zone;
}

/** Retourne toutes les zones disponibles */
export function getAllZones(): Zone[] {
  return ["LA_BOCCA", "PALAIS_DES_FESTIVALS", "PANTIERO", "MACE"];
}

/** Vérifie si c'est la destination finale */
export function isFinalDestination(zone: Zone): boolean {
  return zone === "PALAIS_DES_FESTIVALS";
}

/** Vérifie si c'est une zone intermédiaire */
export function isIntermediateZone(zone: Zone): boolean {
  return zone !== "PALAIS_DES_FESTIVALS";
}

/** Retourne les zones intermédiaires uniquement */
export function getIntermediateZones(): Zone[] {
  return ["LA_BOCCA", "PANTIERO", "MACE"];
}

/** Retourne les zones cibles possibles depuis la zone courante */
export function getTransferTargets(currentZone: Zone): Zone[] {
  return getAllZones().filter((z) => z !== currentZone);
}

/** Formate la durée en millisecondes en texte lisible */
export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "-";
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  if (h > 0) return `${h}h ${min}min`;
  return `${min}min`;
}
