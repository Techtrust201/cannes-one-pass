"use client";

import { Search, Download, RefreshCw } from "lucide-react";
import type { DateRange } from "@/app/logisticien/carbon/page";
import { useMemo } from "react";

interface CarbonHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  onExport: () => void;
  loading?: boolean;
  isSearching?: boolean;
  onRefresh?: () => void;
}

/** Formate YYYY-MM-DD en "jj/mm/aaaa" pour affichage lisible */
function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface Preset {
  key: string;
  label: string;
  start: string;
  end: string;
}

function buildPresets(): Preset[] {
  const today = new Date();
  const year = today.getFullYear();

  const last12Start = new Date(today);
  last12Start.setFullYear(today.getFullYear() - 1);

  return [
    {
      key: "thisYear",
      label: String(year),
      start: `${year}-01-01`,
      end: toIso(today),
    },
    {
      key: "lastYear",
      label: String(year - 1),
      start: `${year - 1}-01-01`,
      end: `${year - 1}-12-31`,
    },
    {
      key: "last12Months",
      label: "12 mois",
      start: toIso(last12Start),
      end: toIso(today),
    },
  ];
}

export default function CarbonHeader({
  searchQuery,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  onExport,
  loading = false,
  isSearching = false,
  onRefresh,
}: CarbonHeaderProps) {
  const presets = useMemo(() => buildPresets(), []);

  // Détermine quel preset est actif (comparaison exacte start+end)
  const activePreset = useMemo(() => {
    return presets.find(
      (p) => p.start === dateRange.start && p.end === dateRange.end
    )?.key ?? null;
  }, [presets, dateRange]);

  return (
    <div className="bg-white border-b border-gray-200 px-3 md:px-6 py-3 md:py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        {/* Recherche */}
        <div className="relative w-full md:flex-shrink-0 md:w-auto">
          <Search
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${
              isSearching ? "text-blue-500 animate-pulse" : "text-gray-400"
            }`}
          />
          <input
            type="text"
            placeholder="Rechercher entreprise, événement, plaque..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`pl-10 pr-10 py-2.5 border-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full md:w-80 bg-gray-50 focus:bg-white transition-all ${
              isSearching ? "border-blue-300" : "border-gray-300"
            }`}
          />
          {searchQuery && !isSearching && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Effacer la recherche"
            >
              ×
            </button>
          )}
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 flex-shrink-0">
          {/* Inputs date natifs */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) =>
                onDateRangeChange({ ...dateRange, start: e.target.value })
              }
              className="px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-h-[40px]"
            />
            <span className="text-gray-400 text-sm">→</span>
            <input
              type="date"
              value={dateRange.end}
              min={dateRange.start}
              onChange={(e) =>
                onDateRangeChange({ ...dateRange, end: e.target.value })
              }
              className="px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-h-[40px]"
            />
          </div>

          {/* Raccourcis — état actif visible */}
          <div className="flex gap-1">
            {presets.map((preset) => {
              const isActive = activePreset === preset.key;
              return (
                <button
                  key={preset.key}
                  onClick={() =>
                    onDateRangeChange({
                      start: preset.start,
                      end: preset.end,
                    })
                  }
                  className={`px-2.5 py-1.5 text-xs rounded font-medium transition-colors min-h-[36px] sm:min-h-0 sm:py-1 ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 min-h-[40px]"
              title="Actualiser les données"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          )}
          <button
            onClick={onExport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 min-h-[40px]"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exporter</span>
          </button>
        </div>
      </div>
    </div>
  );
}
