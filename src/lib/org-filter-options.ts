/**
 * Helpers de transformation : catalogue org → options de select pour les
 * filtres logisticien (Gabarit, Événement, Zone, Statut).
 *
 * Centralise la logique qui était dupliquée / inline dans plusieurs composants
 * (Liste, Comptage, Bilan carbone). Chaque helper est pur (pas de fetch) et
 * testable sans DOM.
 */
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import type { ZoneConfigData } from "@/lib/zone-utils";
import type { EspaceEventOption } from "@/hooks/useEspaceEvents";
import { ALL_STATUSES } from "@/lib/accreditations-dashboard";

export interface FilterOption {
  value: string;
  label: string;
}

export interface VehicleTypeFilterOption extends FilterOption {
  pdfCode: "A" | "B" | "C" | "D";
  isHeavy: boolean;
}

// Labels lisibles des statuts (alignés avec les autres modules)
const STATUS_LABELS: Record<string, string> = {
  NOUVEAU: "Nouveau",
  ATTENTE: "Validée",
  ENTREE: "Entrée",
  SORTIE: "Sortie",
  REFUS: "Refusé",
  ABSENT: "Absent",
};

/**
 * Construit les options gabarit pour un select de filtre.
 *
 * - Valeur envoyée à l'API : `code` canonique (ex. `PORTEUR_ARTICULE`)
 * - Label affiché : `gabarit` configuré par l'admin (ex. `Porteur articulé`)
 *   → même libellé que la liste accréditations et l'admin Flux véhicules
 * - Ordre : `sortOrder` du catalogue org
 * - Filtrage : uniquement les types actifs (`isActive`)
 * - `isHeavy` : pdfCode C ou D (même règle que accreditations-dashboard.ts)
 */
export function buildVehicleTypeFilterOptions(
  types: VehicleTypeData[]
): VehicleTypeFilterOption[] {
  return types
    .filter((t) => t.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({
      value: t.code,
      label: t.gabarit || t.label || t.code,
      pdfCode: t.pdfCode,
      isHeavy: t.pdfCode === "C" || t.pdfCode === "D",
    }));
}

/**
 * Construit les options événement pour un select de filtre.
 * Valeur = slug, label = nom lisible.
 */
export function buildEventFilterOptions(
  events: EspaceEventOption[]
): FilterOption[] {
  return events.map((e) => ({ value: e.slug, label: e.name }));
}

/**
 * Construit les options zone pour un select de filtre.
 * Valeur = identifiant zone (ex. PALM_BEACH), label = libellé admin.
 */
export function buildZoneFilterOptions(
  zones: ZoneConfigData[]
): FilterOption[] {
  return zones.map((z) => ({ value: z.zone, label: z.label || z.zone }));
}

/**
 * Options statut canoniques, dans l'ordre métier.
 * Exposé comme fonction pour pouvoir ajouter des filtres i18n plus tard.
 */
export function buildStatusFilterOptions(): FilterOption[] {
  return ALL_STATUSES.map((code) => ({
    value: code,
    label: STATUS_LABELS[code] ?? code,
  }));
}
