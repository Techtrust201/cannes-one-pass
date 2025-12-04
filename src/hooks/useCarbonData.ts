"use client";

import { useState, useEffect } from "react";
import type { DateRange } from "@/app/logisticien/carbon/page";

export interface CarbonDataEntry {
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

export interface AggregatedData {
  category: string;
  nbVehicules: number;
  distanceKm: number;
  emissionsKgCO2eq: number;
}

export interface MonthlyData {
  month: string;
  monthIndex: number;
  year: number;
  nbVehicules: number;
  typeBreakdown: {
    "<10m3": number;
    "10-15m3": number;
    "15-20m3": number;
    ">20m3": number;
  };
  data: CarbonDataEntry[];
}

export interface CarbonData {
  detailed: CarbonDataEntry[];
  aggregations: {
    pays: AggregatedData[];
    evenement: AggregatedData[];
    entreprise: AggregatedData[];
    type: AggregatedData[];
  };
  monthly: MonthlyData[];
  period: { start: string; end: string };
  total: number;
}

interface UseCarbonDataResult {
  data: CarbonData | null;
  loading: boolean;
  error: string | null;
  isSearching: boolean;
  refetch: () => void;
}

export function useCarbonData(
  dateRange: DateRange,
  searchQuery: string
): UseCarbonDataResult {
  const [data, setData] = useState<CarbonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [isSearching, setIsSearching] = useState(false);

  // 🔧 FIX: Debounce pour la recherche (500ms)
  useEffect(() => {
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setIsSearching(false);
    }, 500);

    return () => {
      clearTimeout(timer);
      setIsSearching(false);
    };
  }, [searchQuery]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        start: dateRange.start,
        end: dateRange.end,
      });

      if (debouncedSearchQuery.trim()) {
        params.append("search", debouncedSearchQuery.trim());
      }

      const response = await fetch(`/api/carbon?${params}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Response error:", response.status, errorText);
        throw new Error(
          `Erreur ${response.status}: ${errorText || "Erreur lors de la récupération des données"}`
        );
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Erreur inconnue");
      }

      // Vérifier que les données sont valides
      if (!result.data) {
        throw new Error("Aucune donnée reçue du serveur");
      }

      setData(result.data);
    } catch (err) {
      console.error("Erreur useCarbonData:", err);
      setError(err instanceof Error ? err.message : "Erreur inconnue");

      // En cas d'erreur, on peut mettre des données vides pour éviter le blocage
      setData({
        detailed: [],
        aggregations: {
          pays: [],
          evenement: [],
          entreprise: [],
          type: [],
        },
        monthly: [],
        period: { start: dateRange.start, end: dateRange.end },
        total: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end, debouncedSearchQuery]);

  return {
    data,
    loading,
    error,
    isSearching,
    refetch: fetchData,
  };
}
