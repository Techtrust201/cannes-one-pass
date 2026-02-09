"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import { formatNumber } from "@/lib/carbonData";
import type { CarbonData, AggregatedData } from "@/hooks/useCarbonData";
import FilterInstructions from "./FilterInstructions";

interface TableauTabProps {
  data: CarbonData;
  dateRange: unknown;
  searchQuery: unknown;
}

interface SectionProps {
  title: string;
  data: AggregatedData[];
  defaultOpen?: boolean;
}

function AggregatedSection({ title, data, defaultOpen = true }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [sortBy, setSortBy] = useState<keyof AggregatedData>("nbVehicules");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // 🔧 FIX: Fonction de tri
  const handleSort = (column: keyof AggregatedData) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  // Trier les données
  const sortedData = [...data].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortOrder === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    }

    return 0;
  });

  // Calculer le total
  const total = data.reduce(
    (acc, item) => ({
      category: "TOTAL",
      nbVehicules: acc.nbVehicules + item.nbVehicules,
      distanceKm: acc.distanceKm + item.distanceKm,
      emissionsKgCO2eq: acc.emissionsKgCO2eq + item.emissionsKgCO2eq,
    }),
    { category: "TOTAL", nbVehicules: 0, distanceKm: 0, emissionsKgCO2eq: 0 }
  );

  const allData = [...sortedData, total];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 md:px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-sm font-medium text-gray-900 hover:bg-gray-100 min-h-[44px]"
      >
        <span>{title}</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {isOpen && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2 md:px-4 md:py-3 text-left font-medium text-gray-900">
                  <button
                    className="flex items-center gap-1 hover:text-gray-700"
                    onClick={() => handleSort("category")}
                  >
                    <span className="truncate max-w-[100px] md:max-w-none">{title}</span>
                    {sortBy === "category" ? (
                      sortOrder === "asc" ? (
                        <ChevronUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 shrink-0" />
                    )}
                  </button>
                </th>
                <th className="px-2 py-2 md:px-4 md:py-3 text-right font-medium text-gray-900">
                  <button
                    className="flex items-center gap-1 hover:text-gray-700 ml-auto"
                    onClick={() => handleSort("nbVehicules")}
                  >
                    <span className="hidden sm:inline">NB véhicules</span>
                    <span className="sm:hidden">Véh.</span>
                    {sortBy === "nbVehicules" ? (
                      sortOrder === "asc" ? (
                        <ChevronUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 shrink-0" />
                    )}
                  </button>
                </th>
                <th className="px-2 py-2 md:px-4 md:py-3 text-right font-medium text-gray-900">
                  <button
                    className="flex items-center gap-1 hover:text-gray-700 ml-auto"
                    onClick={() => handleSort("distanceKm")}
                  >
                    <span className="hidden sm:inline">Distance Km</span>
                    <span className="sm:hidden">Km</span>
                    {sortBy === "distanceKm" ? (
                      sortOrder === "asc" ? (
                        <ChevronUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 shrink-0" />
                    )}
                  </button>
                </th>
                <th className="px-2 py-2 md:px-4 md:py-3 text-right font-medium text-gray-900">
                  <button
                    className="flex items-center gap-1 hover:text-gray-700 ml-auto"
                    onClick={() => handleSort("emissionsKgCO2eq")}
                  >
                    <span className="hidden sm:inline">Emissions (kgCO2eq)</span>
                    <span className="sm:hidden">CO₂</span>
                    {sortBy === "emissionsKgCO2eq" ? (
                      sortOrder === "asc" ? (
                        <ChevronUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 shrink-0" />
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {allData.map((item, index) => (
                <tr
                  key={item.category}
                  className={`
                    border-b border-gray-100 last:border-b-0 hover:bg-gray-50
                    ${index % 2 === 0 ? "bg-white" : "bg-gray-50/30"}
                    ${item.category === "TOTAL" ? "font-semibold bg-gray-100" : ""}
                  `}
                >
                  <td className="px-2 py-2 md:px-4 md:py-3 text-gray-900 truncate max-w-[120px] md:max-w-none">{item.category}</td>
                  <td className="px-2 py-2 md:px-4 md:py-3 text-right text-gray-900 font-mono">
                    {formatNumber(item.nbVehicules)}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3 text-right text-gray-900 font-mono">
                    {formatNumber(item.distanceKm)}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3 text-right text-gray-900 font-mono">
                    {formatNumber(item.emissionsKgCO2eq)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TableauTab({ data }: TableauTabProps) {
  return (
    <div className="space-y-4 md:space-y-6">
      <FilterInstructions />
      <AggregatedSection title="Pays" data={data.aggregations.pays} />
      <AggregatedSection title="Événement" data={data.aggregations.evenement} />
      <AggregatedSection
        title="Entreprise"
        data={data.aggregations.entreprise}
      />
      <AggregatedSection title="Type" data={data.aggregations.type} />
    </div>
  );
}
