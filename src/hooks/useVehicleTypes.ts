"use client";

import { useState, useEffect, useCallback } from "react";
import {
  loadVehicleTypes,
  invalidateVehicleTypeCache,
  setVehicleTypesForScope,
  type VehicleTypeData,
} from "@/lib/vehicle-utils";
import { withEspaceQuery } from "@/lib/url";
import type { LangCode } from "@/lib/translations";
import {
  parseVehicleTypeDbTranslations,
  resolveVehicleTypeDisplayLabel,
} from "@/lib/vehicle-type-i18n";

export function useVehicleTypes(includeInactive = false, espaceSlug?: string | null) {
  const [types, setTypes] = useState<VehicleTypeData[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      invalidateVehicleTypeCache();
      const base = includeInactive
        ? "/api/vehicle-types?all=true"
        : "/api/vehicle-types";
      const url = withEspaceQuery(base, espaceSlug);
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
            rxPalmBeachAtCanto: Boolean(item.rxPalmBeachAtCanto ?? false),
            rxZoneCanto: (item.rxZoneCanto as string | null) ?? null,
            rxZoneVieuxPort: (item.rxZoneVieuxPort as string | null) ?? null,
            displayLabels: parseVehicleTypeDbTranslations(item.displayLabels),
            sortOrder: Number(item.sortOrder ?? 0),
            isActive: Boolean(item.isActive ?? true),
          }));
          const active = includeInactive ? normalized : normalized.filter((t) => t.isActive);
          if (active.length > 0) {
            setTypes(active);
            // Synchronise le cache synchrone scopé pour que les helpers basés
            // sur le scope (tables, PDF…) restent cohérents avec cet Espace.
            setVehicleTypesForScope(espaceSlug, active);
            return;
          }
        }
      }
      const fallback = await loadVehicleTypes(true, espaceSlug);
      setTypes(fallback);
    } catch {
      const fallback = await loadVehicleTypes(true, espaceSlug);
      setTypes(fallback);
    } finally {
      setLoading(false);
    }
  }, [includeInactive, espaceSlug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    types,
    loading,
    refresh,
    getLabel: (code: string) => {
      const t = types.find((x) => x.code === code);
      return t?.gabarit?.trim() || t?.label || code.replace(/_/g, " ");
    },
    getDisplayLabel: (code: string, lang: LangCode) => {
      const t = types.find((x) => x.code === code);
      return resolveVehicleTypeDisplayLabel({
        code,
        lang,
        dbTranslations: t?.displayLabels,
        dbLabel: t?.label,
        dbGabarit: t?.gabarit,
      });
    },
    getGabarit: (code: string) =>
      types.find((x) => x.code === code)?.gabarit ?? code.replace(/_/g, " "),
    getColor: (code: string) => types.find((t) => t.code === code)?.color ?? "gray",
  };
}
