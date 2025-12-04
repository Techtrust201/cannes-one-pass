"use client";

import { Search, Download, Calendar, RefreshCw } from "lucide-react";
import type { DateRange } from "@/app/logisticien/carbon/page";

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
  // Fonction pour définir des plages de dates prédéfinies
  const setPresetDateRange = (preset: string) => {
    const today = new Date();
    const formatDate = (date: Date) =>
      `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;

    switch (preset) {
      case "thisYear":
        onDateRangeChange({
          start: `01/01/${today.getFullYear()}`,
          end: formatDate(today),
        });
        break;
      case "lastYear":
        onDateRangeChange({
          start: `01/01/${today.getFullYear() - 1}`,
          end: `31/12/${today.getFullYear() - 1}`,
        });
        break;
      case "last12Months":
        const last12 = new Date(today);
        last12.setFullYear(today.getFullYear() - 1);
        onDateRangeChange({
          start: formatDate(last12),
          end: formatDate(today),
        });
        break;
    }
  };
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        {/* Recherche améliorée à gauche */}
        <div className="relative flex-shrink-0">
          <Search
            className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 transition-colors ${
              isSearching ? "text-blue-500 animate-pulse" : "text-gray-400"
            }`}
          />
          <input
            type="text"
            placeholder="Rechercher entreprise, événement, plaque, stand..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`pl-10 pr-12 py-2.5 border-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-80 bg-gray-50 focus:bg-white transition-all ${
              isSearching ? "border-blue-300" : "border-gray-300"
            }`}
          />
          {searchQuery && !isSearching && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Effacer la recherche"
            >
              ×
            </button>
          )}
          {isSearching && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
            </div>
          )}
          {searchQuery && !isSearching && (
            <div className="absolute top-full left-0 mt-1 text-xs text-gray-500 bg-white px-2 py-1 rounded shadow-sm border">
              🔍 Recherche active: &quot;{searchQuery}&quot;
            </div>
          )}
        </div>

        {/* Dates au centre */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="jj / mm / aaaa"
              value={dateRange.start}
              onChange={(e) =>
                onDateRangeChange({ ...dateRange, start: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-32 text-center"
            />
            <span className="text-gray-500">–</span>
            <input
              type="text"
              placeholder="jj / mm / aaaa"
              value={dateRange.end}
              onChange={(e) =>
                onDateRangeChange({ ...dateRange, end: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-32 text-center"
            />
          </div>

          {/* Raccourcis de dates */}
          <div className="flex gap-1">
            <button
              onClick={() => setPresetDateRange("thisYear")}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
              title="Cette année"
            >
              2024
            </button>
            <button
              onClick={() => setPresetDateRange("lastYear")}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
              title="Année dernière"
            >
              2023
            </button>
            <button
              onClick={() => setPresetDateRange("last12Months")}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
              title="12 derniers mois"
            >
              12M
            </button>
          </div>
        </div>

        {/* Actions à droite */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Exporter
          </button>
        </div>
      </div>
    </div>
  );
}
