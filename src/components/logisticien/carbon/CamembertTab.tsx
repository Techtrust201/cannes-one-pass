"use client";

import { formatNumber, TYPE_COLORS } from "@/lib/carbonData";
import type { DateRange } from "@/app/logisticien/carbon/page";
import type { CarbonData, AggregatedData } from "@/hooks/useCarbonData";
import SafeResponsivePie from "./charts/SafeResponsivePie";

interface CamembertTabProps {
  data: CarbonData;
  dateRange: DateRange;
  searchQuery: string;
}

interface DonutChartProps {
  title: string;
  data: AggregatedData[];
  metric: keyof Pick<
    AggregatedData,
    "nbVehicules" | "distanceKm" | "emissionsKgCO2eq"
  >;
  colors?: { [key: string]: string };
}

function DonutChart({ title, data, metric, colors }: DonutChartProps) {
  // Préparer les données pour Nivo
  const chartData = data.map((item) => ({
    id: item.category,
    label: item.category,
    value: item[metric],
  }));

  // Calculer le total pour les pourcentages
  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  // Trier les données par valeur décroissante pour la mini-table
  const sortedData = [...chartData].sort((a, b) => b.value - a.value);

  // Fonction pour obtenir la couleur
  const getColor = (id: string) => {
    if (colors && colors[id]) {
      return colors[id];
    }
    // Couleurs par défaut pour les autres catégories
    const defaultColors = [
      "#3B82F6",
      "#22C55E",
      "#F59E0B",
      "#EF4444",
      "#8B5CF6",
    ];
    const index = data.findIndex((item) => item.category === id);
    return defaultColors[index % defaultColors.length];
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-4 text-center">
        {title}
      </h3>

      {/* Donut Chart */}
      <div className="h-64 mb-4">
        <SafeResponsivePie
          data={chartData}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          innerRadius={0.5}
          padAngle={0.7}
          cornerRadius={3}
          activeOuterRadiusOffset={8}
          colors={(d) => getColor(d.id as string)}
          borderWidth={1}
          borderColor={{
            from: "color",
            modifiers: [["darker", 0.2]],
          }}
          enableArcLinkLabels={false}
          enableArcLabels={false}
          tooltip={({ datum }) => (
            <div className="bg-white px-3 py-2 rounded shadow-lg border text-xs">
              <strong>{datum.label}</strong>
              <br />
              {formatNumber(datum.value)} –{" "}
              {Math.round((datum.value / total) * 100)}%
            </div>
          )}
          animate={true}
          motionConfig="wobbly"
        />
      </div>

      {/* Mini-table */}
      <div className="border-t border-gray-200 pt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-600">
              <th className="text-left pb-2">Catégorie</th>
              <th className="text-right pb-2">Valeur</th>
              <th className="text-right pb-2">%</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((item) => (
              <tr key={item.id} className="border-t border-gray-100">
                <td className="py-1 text-gray-900">{item.label}</td>
                <td className="py-1 text-right text-gray-900 font-mono">
                  {formatNumber(item.value)}
                </td>
                <td className="py-1 text-right text-gray-900 font-mono">
                  {Math.round((item.value / total) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CamembertSection({
  title,
  data,
  colors,
}: {
  title: string;
  data: AggregatedData[];
  colors?: { [key: string]: string };
}) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <DonutChart
          title="NB véhicules"
          data={data}
          metric="nbVehicules"
          colors={colors}
        />
        <DonutChart
          title="Distance Km"
          data={data}
          metric="distanceKm"
          colors={colors}
        />
        <DonutChart
          title="Emissions (kgCO2eq)"
          data={data}
          metric="emissionsKgCO2eq"
          colors={colors}
        />
      </div>
    </div>
  );
}

export default function CamembertTab({
  data,
  dateRange,
  searchQuery,
}: CamembertTabProps) {
  return (
    <div className="space-y-8">
      <CamembertSection title="Pays" data={data.aggregations.pays} />
      <CamembertSection title="Événement" data={data.aggregations.evenement} />
      <CamembertSection
        title="Entreprise"
        data={data.aggregations.entreprise}
      />
      <CamembertSection
        title="Type"
        data={data.aggregations.type}
        colors={TYPE_COLORS}
      />
    </div>
  );
}
