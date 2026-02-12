"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatNumber } from "@/lib/carbonData";
import type { CarbonData, CarbonDataEntry } from "@/hooks/useCarbonData";

interface ListeTabProps {
  data: CarbonData;
  dateRange: unknown;
  searchQuery: unknown;
}

// Fonction pour grouper les données par mois
function groupDataByMonth(monthlyData: CarbonData["monthly"]): {
  [key: string]: CarbonDataEntry[];
} {
  const grouped: { [key: string]: CarbonDataEntry[] } = {};

  for (const month of monthlyData) {
    grouped[month.month] = month.data || [];
  }

  return grouped;
}

function InfoBanner() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 md:p-4 mb-4 md:mb-6">
      <p className="text-xs md:text-sm text-blue-800">
        <span className="font-bold">•</span> Affiche les résultats des 12 mois
        précédant l&apos;année de la seconde date sélectionnée. (Ex 11/12/23 →
        25/03/25 va afficher les résultats de Mars 2024 à Mars 2025).
      </p>
    </div>
  );
}

interface MonthlyAccordionProps {
  month: string;
  data: CarbonDataEntry[];
  defaultOpen?: boolean;
}

function MonthlyAccordion({
  month,
  data,
  defaultOpen = false,
}: MonthlyAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Calculer les totaux
  const totalKm = data.reduce((sum, item) => sum + item.km, 0);
  const totalKgCO2eq = data.reduce((sum, item) => sum + item.kgCO2eq, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-3 md:mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 md:px-6 py-3 md:py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-sm font-medium text-gray-900 hover:bg-gray-100 min-h-[44px]"
      >
        <span>{month}</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {isOpen && (
        <>
          {/* Desktop: Table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Événement
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    #ID
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Plaque
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Entreprise
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Stand
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Origine
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Type
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-900">
                    Km
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-900">
                    KgCO₂eq
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, index) => (
                  <tr
                    key={`${item.id}-${index}`}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-900">{item.evenement}</td>
                    <td className="px-4 py-3 text-gray-900 font-mono">
                      {item.id}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-mono">
                      {item.plaque}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{item.entreprise}</td>
                    <td className="px-4 py-3 text-gray-900">{item.stand}</td>
                    <td className="px-4 py-3 text-gray-900">{item.origine}</td>
                    <td className="px-4 py-3 text-gray-900">{item.type}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-mono">
                      {formatNumber(item.km)}
                      {item.roundTrips ? (
                        <span className="block text-[10px] text-blue-500 font-normal">
                          dont {formatNumber(item.kmInterZone ?? 0)} inter-zones ({item.roundTrips} A/R)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 font-mono">
                      {formatNumber(item.kgCO2eq)}
                      {item.kgCO2eqInterZone ? (
                        <span className="block text-[10px] text-blue-500 font-normal">
                          dont {formatNumber(item.kgCO2eqInterZone)} inter-zones
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {/* Ligne Total */}
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold">
                  <td className="px-4 py-3 text-gray-900" colSpan={7}>
                    Total
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-mono">
                    {formatNumber(totalKm)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-mono">
                    {formatNumber(totalKgCO2eq)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile: Card view */}
          <div className="md:hidden divide-y divide-gray-100">
            {data.map((item, index) => (
              <div key={`mobile-${item.id}-${index}`} className="p-3 hover:bg-gray-50">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.entreprise}</p>
                    <p className="text-xs text-gray-500 truncate">{item.evenement}</p>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    <p className="text-sm font-mono font-semibold text-orange-600">{formatNumber(item.kgCO2eq)} kg</p>
                    <p className="text-xs font-mono text-gray-500">{formatNumber(item.km)} km</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-mono">#{item.id}</span>
                  <span>•</span>
                  <span className="font-mono">{item.plaque}</span>
                  <span>•</span>
                  <span>{item.type}</span>
                </div>
                {item.roundTrips ? (
                  <p className="text-[10px] text-blue-500 mt-1">
                    {item.roundTrips} A/R inter-zones (+{formatNumber(item.kmInterZone ?? 0)} km, +{formatNumber(item.kgCO2eqInterZone ?? 0)} kg CO₂)
                  </p>
                ) : null}
              </div>
            ))}
            {/* Total mobile */}
            <div className="p-3 bg-gray-100 font-semibold">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-900">Total</span>
                <div className="text-right">
                  <span className="text-sm font-mono text-orange-600">{formatNumber(totalKgCO2eq)} kg CO₂</span>
                  <span className="text-xs font-mono text-gray-500 ml-2">{formatNumber(totalKm)} km</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ListeTab({ data }: ListeTabProps) {
  const monthlyDetailedData = groupDataByMonth(data.monthly);

  return (
    <div>
      <InfoBanner />
      <div className="space-y-3 md:space-y-4">
        {data.monthly.map((month, index) => {
          const monthData = monthlyDetailedData[month.month] || [];
          return (
            <MonthlyAccordion
              key={`month-accordion-${index}-${month.year}-${month.monthIndex}`}
              month={month.month}
              data={monthData}
              defaultOpen={index === 0} // Premier mois ouvert par défaut
            />
          );
        })}
      </div>
    </div>
  );
}
