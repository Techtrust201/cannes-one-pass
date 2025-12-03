"use client";

import { formatNumber } from "@/lib/carbonData";
import type { CarbonData } from "@/hooks/useCarbonData";

interface CarbonStatsProps {
  data: CarbonData | null;
  loading: boolean;
}

export default function CarbonStats({ data, loading }: CarbonStatsProps) {
  if (loading) {
    return (
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-center gap-8">
          <div className="animate-pulse flex space-x-4">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="h-4 bg-gray-200 rounded w-20"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // Calculer les totaux
  const totalVehicules = data.detailed.length;
  const totalKm = data.detailed.reduce((sum, item) => sum + item.km, 0);
  const totalCO2 = data.detailed.reduce((sum, item) => sum + item.kgCO2eq, 0);
  const avgCO2PerVehicle = totalVehicules > 0 ? totalCO2 / totalVehicules : 0;

  const stats = [
    {
      label: "Véhicules",
      value: formatNumber(totalVehicules),
      color: "text-blue-600",
    },
    {
      label: "Distance totale",
      value: `${formatNumber(totalKm)} km`,
      color: "text-green-600",
    },
    {
      label: "Émissions CO₂",
      value: `${formatNumber(totalCO2)} kg`,
      color: "text-orange-600",
    },
    {
      label: "Moyenne par véhicule",
      value: `${formatNumber(Math.round(avgCO2PerVehicle))} kg`,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-center gap-8">
        {stats.map((stat, index) => (
          <div key={index} className="text-center">
            <div className={`text-lg font-semibold ${stat.color}`}>
              {stat.value}
            </div>
            <div className="text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


