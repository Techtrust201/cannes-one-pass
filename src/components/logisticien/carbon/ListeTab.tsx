"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatNumber } from "@/lib/carbonData";
import type { DateRange } from "@/app/logisticien/carbon/page";
import type { CarbonData, CarbonDataEntry } from "@/hooks/useCarbonData";

interface ListeTabProps {
  data: CarbonData;
  dateRange: DateRange;
  searchQuery: string;
}

// Utiliser CarbonDataEntry directement

// Fonction pour grouper les données par mois
function groupDataByMonth(monthlyData: any[]): {
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
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <p className="text-sm text-blue-800">
        <span className="font-bold">•</span> Affiche les résultats des 12 mois
        précédant l'année de la seconde date sélectionnée. (Ex 11/12/23 →
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
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-sm font-medium text-gray-900 hover:bg-gray-100"
      >
        <span>{month}</span>
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
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-mono">
                    {formatNumber(item.kgCO2eq)}
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
      )}
    </div>
  );
}

export default function ListeTab({
  data,
  dateRange,
  searchQuery,
}: ListeTabProps) {
  const monthlyDetailedData = groupDataByMonth(data.monthly);

  return (
    <div>
      <InfoBanner />
      <div className="space-y-4">
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
