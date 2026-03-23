"use client";

import { formatNumber } from "@/lib/carbonData";
import type { CarbonData, CarbonDataEntry } from "@/hooks/useCarbonData";

interface EventDetailTabProps {
  data: CarbonData;
  dateRange: unknown;
  searchQuery: unknown;
}

/** Agrège par société avec gabarits utilisés */
function aggregateBySociete(detailed: CarbonDataEntry[]) {
  const bySociete: Record<
    string,
    { nbVehicules: number; km: number; kgCO2eq: number; gabarits: Set<string> }
  > = {};
  for (const e of detailed) {
    const key = e.entreprise || "Non renseigné";
    if (!bySociete[key]) {
      bySociete[key] = { nbVehicules: 0, km: 0, kgCO2eq: 0, gabarits: new Set() };
    }
    bySociete[key].nbVehicules += 1;
    bySociete[key].km += e.km;
    bySociete[key].kgCO2eq += e.kgCO2eq;
    bySociete[key].gabarits.add(e.type);
  }
  return Object.entries(bySociete).map(([societe, v]) => ({
    societe,
    nbVehicules: v.nbVehicules,
    km: v.km,
    kgCO2eq: v.kgCO2eq,
    gabarits: Array.from(v.gabarits).sort().join(", "),
  }));
}

export default function EventDetailTab({
  data,
  searchQuery,
}: EventDetailTabProps) {
  const { detailed, aggregations } = data;
  const totalKm = detailed.reduce((s, e) => s + e.km, 0);
  const totalKgCO2eq = detailed.reduce((s, e) => s + e.kgCO2eq, 0);
  const bySociete = aggregateBySociete(detailed);

  const eventLabel = searchQuery ? String(searchQuery) : "Tous les événements";

  return (
    <div className="space-y-4 md:space-y-6">
      <p className="text-sm text-gray-600">
        Données filtrées pour : <strong>{eventLabel}</strong>
      </p>

      {/* Véhicules par gabarit */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <h2 className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-900">
          Véhicules par gabarit
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-900">
                  Gabarit
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">
                  Nb véhicules
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
              {aggregations.type.map((row) => (
                <tr
                  key={row.category}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-gray-900">{row.category}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">
                    {formatNumber(row.nbVehicules)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">
                    {formatNumber(row.distanceKm)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">
                    {formatNumber(row.emissionsKgCO2eq)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-100 font-semibold">
                <td className="px-4 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-right font-mono text-gray-900">
                  {formatNumber(data.total)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-900">
                  {formatNumber(totalKm)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-900">
                  {formatNumber(totalKgCO2eq)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Répartition par société - Desktop */}
      <section className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <h2 className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-900">
          Répartition par société
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-900">
                  Société
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">
                  Nb véhicules
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-900">
                  Gabarits utilisés
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">
                  KgCO₂eq
                </th>
              </tr>
            </thead>
            <tbody>
              {bySociete
                .sort((a, b) => b.nbVehicules - a.nbVehicules)
                .map((row) => (
                  <tr
                    key={row.societe}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-gray-900 truncate max-w-[200px]">
                      {row.societe}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {formatNumber(row.nbVehicules)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {row.gabarits}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {formatNumber(row.kgCO2eq)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Répartition par société - Mobile cards */}
      <section className="md:hidden space-y-3">
        <h2 className="px-2 font-medium text-gray-900">
          Répartition par société
        </h2>
        {bySociete
          .sort((a, b) => b.nbVehicules - a.nbVehicules)
          .map((row) => (
            <div
              key={row.societe}
              className="bg-white rounded-lg border border-gray-200 p-3"
            >
              <div className="flex justify-between items-start mb-1">
                <p className="font-medium text-gray-900 truncate flex-1 mr-2">
                  {row.societe}
                </p>
                <span className="text-sm font-mono text-orange-600 shrink-0">
                  {formatNumber(row.kgCO2eq)} kg
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{formatNumber(row.nbVehicules)} véh.</span>
                <span>•</span>
                <span>{row.gabarits}</span>
              </div>
            </div>
          ))}
      </section>

      {/* Total événement */}
      <section className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <h2 className="font-medium text-emerald-900 mb-2">
          Total {eventLabel}
        </h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            <strong>{formatNumber(data.total)}</strong> véhicules
          </span>
          <span>
            <strong>{formatNumber(totalKm)}</strong> km
          </span>
          <span>
            <strong>{formatNumber(totalKgCO2eq)}</strong> kg CO₂eq
          </span>
        </div>
      </section>
    </div>
  );
}
