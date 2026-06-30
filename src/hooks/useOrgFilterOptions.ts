"use client";

import { useMemo } from "react";
import { useVehicleTypesContext } from "@/contexts/VehicleTypesContext";
import { useEspaceEvents } from "@/hooks/useEspaceEvents";
import { useZones } from "@/hooks/useZones";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import {
  buildVehicleTypeFilterOptions,
  buildEventFilterOptions,
  buildZoneFilterOptions,
  buildStatusFilterOptions,
  type FilterOption,
  type VehicleTypeFilterOption,
} from "@/lib/org-filter-options";

export interface OrgFilterOptions {
  vehicleTypes: VehicleTypeFilterOption[];
  events: FilterOption[];
  zones: FilterOption[];
  statuses: FilterOption[];
  /** true tant que le catalogue gabarits est en cours de chargement */
  loading: boolean;
}

/**
 * Hook unifié qui agrège les trois sources de catalogue org :
 *  - gabarits  → VehicleTypesContext (déjà chargé dans le layout)
 *  - événements → useEspaceEvents
 *  - zones     → useZones
 *
 * Retour stable : les tableaux ne changent que si les données sources changent.
 * Aucun fetch dupliqué : le contexte gabarits est un singleton par layout.
 */
export function useOrgFilterOptions(): OrgFilterOptions {
  const espace = useEspaceSlug();
  const { types, loading } = useVehicleTypesContext();
  const rawEvents = useEspaceEvents(espace);
  const { zones: rawZones } = useZones();

  const vehicleTypes = useMemo(
    () => buildVehicleTypeFilterOptions(types),
    [types]
  );

  const events = useMemo(
    () => buildEventFilterOptions(rawEvents),
    [rawEvents]
  );

  const zones = useMemo(
    () => buildZoneFilterOptions(rawZones),
    [rawZones]
  );

  const statuses = useMemo(() => buildStatusFilterOptions(), []);

  return { vehicleTypes, events, zones, statuses, loading };
}
