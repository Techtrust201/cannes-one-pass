"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import {
  resolveVehicleTypeLabelFromList,
  resolveVehicleTypeShortLabelFromList,
} from "@/lib/vehicle-type-resolve";
import type { VehicleTypeData } from "@/lib/vehicle-utils";

interface VehicleTypesContextValue {
  types: VehicleTypeData[];
  loading: boolean;
  getLabel: (vehicleType?: string | null, fallbackSize?: string | null) => string;
  getShortLabel: (vehicleType?: string | null, fallbackSize?: string | null) => string;
  needsTrailer: (vehicleType?: string | null) => boolean;
}

const VehicleTypesContext = createContext<VehicleTypesContextValue | null>(null);

export function VehicleTypesProvider({ children }: { children: ReactNode }) {
  const espace = useEspaceSlug();
  const { types, loading } = useVehicleTypes(false, espace);

  const getLabel = (
    vehicleType?: string | null,
    fallbackSize?: string | null
  ) => resolveVehicleTypeLabelFromList(types, vehicleType, fallbackSize);

  const getShortLabel = (
    vehicleType?: string | null,
    fallbackSize?: string | null
  ) => resolveVehicleTypeShortLabelFromList(types, vehicleType, fallbackSize);

  const needsTrailer = (vehicleType?: string | null) => {
    if (!vehicleType) return false;
    const t = types.find(
      (x) => x.code === vehicleType || x.code === vehicleType.toUpperCase()
    );
    return t?.showTrailerPlate ?? false;
  };

  return (
    <VehicleTypesContext.Provider
      value={{ types, loading, getLabel, getShortLabel, needsTrailer }}
    >
      {children}
    </VehicleTypesContext.Provider>
  );
}

export function useVehicleTypesContext(): VehicleTypesContextValue {
  const ctx = useContext(VehicleTypesContext);
  if (!ctx) {
    throw new Error(
      "useVehicleTypesContext must be used inside VehicleTypesProvider"
    );
  }
  return ctx;
}
