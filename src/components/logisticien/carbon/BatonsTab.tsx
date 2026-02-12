"use client";

import { formatNumber, getMonthAbbr, TYPE_COLORS } from "@/lib/carbonData";
import type { CarbonData, MonthlyData } from "@/hooks/useCarbonData";
import SafeResponsiveBar from "./charts/SafeResponsiveBar";

interface BatonsTabProps {
  data: CarbonData;
  dateRange: unknown;
  searchQuery: unknown;
}

// Fonction pour préparer les données mensuelles pour les graphiques
function prepareMonthlyVehicleData(monthlyData: MonthlyData[]) {
  return monthlyData.map((month) => ({
    month: getMonthAbbr(month.monthIndex),
    year: month.year,
    value: month.nbVehicules,
  }));
}

function prepareMonthlyTypeData(monthlyData: MonthlyData[]) {
  return monthlyData.map((month) => ({
    month: month.month,
    year: month.year,
    monthIndex: month.monthIndex,
    "Porteur": month.typeBreakdown["Porteur"],
    "Porteur articulé": month.typeBreakdown["Porteur articulé"],
    "Semi-remorque": month.typeBreakdown["Semi-remorque"],
  }));
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

function MonthlyVehicleChart({ data }: { data: CarbonData }) {
  const monthlyVehicleData = prepareMonthlyVehicleData(data.monthly);
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 md:p-6 mb-4 md:mb-6">
      <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-3 md:mb-4">NB véhicules</h2>

      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {/* Graphique */}
        <div className="flex-1 h-56 md:h-80">
          <SafeResponsiveBar
            data={monthlyVehicleData}
            keys={["value"]}
            indexBy="month"
            margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
            padding={0.3}
            valueScale={{ type: "linear" }}
            indexScale={{ type: "band", round: true }}
            colors={["#3B82F6"]}
            borderColor={{
              from: "color",
              modifiers: [["darker", 1.6]],
            }}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: -30,
              legend: "",
              legendPosition: "middle",
              legendOffset: 32,
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: "",
              legendPosition: "middle",
              legendOffset: -40,
              format: (value: string | number) => formatNumber(value as number),
            }}
            labelSkipWidth={12}
            labelSkipHeight={12}
            labelTextColor={{
              from: "color",
              modifiers: [["darker", 1.6]],
            }}
            tooltip={({ indexValue, value }: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
              <div className="bg-white px-3 py-2 rounded shadow-lg border text-xs">
                <strong>{indexValue} 2025</strong>
                <br />
                {formatNumber(value as number)} véhicules
              </div>
            )}
            animate={true}
            motionConfig="wobbly"
          />
        </div>

        {/* Colonne des valeurs - en dessous sur mobile */}
        <div className="md:w-32 bg-gray-50 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">Valeurs</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-1 gap-1 md:gap-0 md:space-y-2">
            {monthlyVehicleData.map((item, index) => (
              <div
                key={`monthly-${index}-${item.value}`}
                className="flex justify-between text-xs gap-1"
              >
                <span className="text-gray-600">
                  {item.month} {item.year}
                </span>
                <span className="font-mono text-gray-900">
                  {formatNumber(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeChart({ data }: { data: CarbonData }) {
  const monthlyTypeData = prepareMonthlyTypeData(data.monthly);
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 md:p-6">
      <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-3 md:mb-4">Type</h2>

      {/* Barres groupées pour vue d'ensemble */}
      <div className="h-56 md:h-80 mb-6 md:mb-8">
        <SafeResponsiveBar
          data={monthlyTypeData}
          keys={Object.keys(TYPE_COLORS)}
          indexBy="month"
          margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
          padding={0.3}
          valueScale={{ type: "linear" }}
          indexScale={{ type: "band", round: true }}
          colors={(d) => TYPE_COLORS[d.id as keyof typeof TYPE_COLORS]}
          borderColor={{
            from: "color",
            modifiers: [["darker", 1.6]],
          }}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: -30,
            legend: "",
            legendPosition: "middle",
            legendOffset: 32,
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: "",
            legendPosition: "middle",
            legendOffset: -40,
            format: (value: string | number) => formatNumber(value as number),
          }}
          labelSkipWidth={12}
          labelSkipHeight={12}
          labelTextColor={{
            from: "color",
            modifiers: [["darker", 1.6]],
          }}
          tooltip={({ id, indexValue, value, color }: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
            <div className="bg-white px-3 py-2 rounded shadow-lg border text-xs">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: String(color) }}
                ></div>
                <strong>{id}</strong>
              </div>
              <div>{indexValue}</div>
              <div>{formatNumber(value as number)} véhicules</div>
            </div>
          )}
          animate={true}
          motionConfig="wobbly"
        />
      </div>

      {/* Petits multiples - 12 mini-cartes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
        {monthlyTypeData.map((monthData, index) => (
          <div
            key={`type-month-${index}-${monthData.year}-${monthData.monthIndex}`}
            className="bg-gray-50 rounded-lg p-3 md:p-4 border border-gray-200"
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-2 md:mb-3">
              {monthData.month}
            </h3>
            <div className="space-y-1.5 md:space-y-2">
              {Object.keys(TYPE_COLORS).map((type) => {
                const value = monthData[
                  type as keyof typeof monthData
                ] as number;
                const maxValue = Math.max(
                  ...Object.keys(TYPE_COLORS).map(
                    (t) => monthData[t as keyof typeof monthData] as number
                  )
                );
                // 🔧 FIX: Éviter division par 0 qui donne NaN = 100%
                const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

                return (
                  <div key={type} className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          TYPE_COLORS[type as keyof typeof TYPE_COLORS],
                      }}
                    ></div>
                    <span className="text-xs text-gray-600 flex-1 truncate">{type}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-300"
                          style={{
                            backgroundColor:
                              TYPE_COLORS[type as keyof typeof TYPE_COLORS],
                            width: `${percentage}%`,
                          }}
                        ></div>
                      </div>
                      <span className="text-xs font-mono text-gray-900 w-10 md:w-12 text-right">
                        {formatNumber(value)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BatonsTab({ data }: BatonsTabProps) {
  return (
    <div>
      <InfoBanner />
      <MonthlyVehicleChart data={data} />
      <TypeChart data={data} />
    </div>
  );
}
