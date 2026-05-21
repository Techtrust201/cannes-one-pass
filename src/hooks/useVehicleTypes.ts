"use client";

import { useState, useEffect, useCallback } from "react";
import {
  loadVehicleTypes,
  invalidateVehicleTypeCache,
  type VehicleTypeData,
} from "@/lib/vehicle-utils";

export function useVehicleTypes(includeInactive = false) {
  const [types, setTypes] = useState<VehicleTypeData[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      invalidateVehicleTypeCache();
      const url = includeInactive ? "/api/vehicle-types?all=true" : "/api/vehicle-types";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const normalized = data.map((item) => ({
            id: Number(item.id),
            code: String(item.code),
            label: String(item.label),
            gabarit: String(item.gabarit),
            tonnageMini: Number(item.tonnageMini),
            tonnageMoyen: Number(item.tonnageMoyen),
            tonnageMaxi: Number(item.tonnageMaxi),
            co2Coefficient: Number(item.co2Coefficient),
            pdfCode: item.pdfCode as VehicleTypeData["pdfCode"],
            color: String(item.color ?? "gray"),
            showTrailerPlate: Boolean(item.showTrailerPlate),
            sortOrder: Number(item.sortOrder ?? 0),
            isActive: Boolean(item.isActive ?? true),
          }));
          setTypes(includeInactive ? normalized : normalized.filter((t) => t.isActive));
          return;
        }
      }
      const fallback = await loadVehicleTypes(true);
      setTypes(fallback);
    } catch {
      const fallback = await loadVehicleTypes(true);
      setTypes(fallback);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    types,
    loading,
    refresh,
    getLabel: (code: string) =>
      types.find((t) => t.code === code)?.label ?? code.replace(/_/g, " "),
    getColor: (code: string) => types.find((t) => t.code === code)?.color ?? "gray",
  };
}
