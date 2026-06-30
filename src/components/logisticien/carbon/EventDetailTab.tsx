"use client";

import { formatNumber } from "@/lib/carbonData";
import type { CarbonData, CarbonDataEntry } from "@/hooks/useCarbonData";
import VehicleTypeReferenceTable from "@/components/accreditation/VehicleTypeReferenceTable";
import type { FilterOption } from "@/lib/org-filter-options";

interface EventDetailTabProps {
  data: CarbonData;
  dateRange: unknown;
  searchQuery: unknown;
  selectedEvent?: string;
  events?: FilterOption[];
}

/** Top N libellés d'un compteur, formatés "Libellé (n)". */
function topEntries(counts: Record<string, number>, limit = 3): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, n]) => `${label} (${n})`)
    .join(", ");
}

/**
 * Construit, pour chaque événement (clé = valeur brute `evenement`), le top des
 * gabarits et des sociétés à partir des entrées détaillées.
 */
function buildEventBreakdowns(detailed: CarbonDataEntry[]) {
  const map = new Map<
    string,
    { gabarits: Record<string, number>; societes: Record<string, number> }
  >();
  for (const e of detailed) {
    const key = e.evenement || "—";
    let agg = map.get(key);
    if (!agg) {
      agg = { gabarits: {}, societes: {} };
      map.set(key, agg);
    }
    const type = e.type || "—";
    agg.gabarits[type] = (agg.gabarits[type] ?? 0) + 1;
    const soc = e.entreprise || "Non renseigné";
    agg.societes[soc] = (agg.societes[soc] ?? 0) + 1;
  }
  return map;
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
  return Object.entries(bySociete)
    .map(([societe, v]) => ({
      societe,
      nbVehicules: v.nbVehicules,
      km: v.km,
      kgCO2eq: v.kgCO2eq,
      gabarits: Array.from(v.gabarits).sort().join(", "),
    }))
    .sort((a, b) => b.nbVehicules - a.nbVehicules);
}

/** Synthèse "tous les événements" — une ligne par événement */
function AllEventsView({
  data,
  nameForSlug,
}: {
  data: CarbonData;
  nameForSlug: (slug: string) => string;
}) {
  const rows = data.aggregations.evenement;
  const breakdowns = buildEventBreakdowns(data.detailed);
  const totalVehicules = rows.reduce((s, r) => s + r.nbVehicules, 0);
  const totalKm = rows.reduce((s, r) => s + r.distanceKm, 0);
  const totalKg = rows.reduce((s, r) => s + r.emissionsKgCO2eq, 0);

  if (!rows.length) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800 text-sm">
        Aucune donnée événement disponible pour la période sélectionnée.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Comparaison de tous les événements sur la période sélectionnée.
      </p>

      {/* Tableau desktop */}
      <section className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <h2 className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-900">
          Synthèse par événement
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-900">Événement</th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">Véhicules</th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">Km total</th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">KgCO₂eq</th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">Moy. / véh.</th>
                <th className="px-4 py-3 text-left font-medium text-gray-900">Principaux gabarits</th>
                <th className="px-4 py-3 text-left font-medium text-gray-900">Principales sociétés</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const avgKg = row.nbVehicules > 0 ? row.emissionsKgCO2eq / row.nbVehicules : 0;
                const bd = breakdowns.get(row.category);
                return (
                  <tr key={row.category} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {nameForSlug(row.category)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {formatNumber(row.nbVehicules)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {formatNumber(row.distanceKm)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {formatNumber(row.emissionsKgCO2eq)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">
                      {formatNumber(avgKg)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {bd ? topEntries(bd.gabarits) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {bd ? topEntries(bd.societes) : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-100 font-semibold">
                <td className="px-4 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-right font-mono">{formatNumber(totalVehicules)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatNumber(totalKm)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatNumber(totalKg)}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-600">
                  {totalVehicules > 0 ? formatNumber(totalKg / totalVehicules) : "—"}
                </td>
                <td className="px-4 py-3" colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Cards mobile */}
      <section className="md:hidden space-y-3">
        <h2 className="font-medium text-gray-900">Synthèse par événement</h2>
        {rows.map((row) => {
          const avgKg = row.nbVehicules > 0 ? row.emissionsKgCO2eq / row.nbVehicules : 0;
          const pct = totalKg > 0 ? (row.emissionsKgCO2eq / totalKg) * 100 : 0;
          const bd = breakdowns.get(row.category);
          return (
            <div key={row.category} className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium text-gray-900 flex-1 mr-2">
                  {nameForSlug(row.category)}
                </p>
                <span className="text-sm font-mono text-orange-600 shrink-0">
                  {formatNumber(row.emissionsKgCO2eq)} kg
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-2">
                <span>{formatNumber(row.nbVehicules)} véh.</span>
                <span>{formatNumber(row.distanceKm)} km</span>
                <span>moy. {formatNumber(avgKg)} kg/véh.</span>
              </div>
              {bd && (
                <div className="text-xs text-gray-500 space-y-0.5 mb-2">
                  <p>
                    <span className="text-gray-400">Gabarits :</span> {topEntries(bd.gabarits)}
                  </p>
                  <p className="truncate">
                    <span className="text-gray-400">Sociétés :</span> {topEntries(bd.societes)}
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 tabular-nums">{pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
        <div className="bg-gray-100 rounded-lg p-3 text-sm font-semibold flex justify-between">
          <span>Total</span>
          <span className="font-mono">{formatNumber(totalKg)} kgCO₂eq</span>
        </div>
      </section>

      <VehicleTypeReferenceTable />
    </div>
  );
}

/** Vue détail d'un événement sélectionné */
function SingleEventView({
  data,
  eventLabel,
}: {
  data: CarbonData;
  eventLabel: string;
}) {
  const { detailed, aggregations } = data;
  const totalKm = detailed.reduce((s, e) => s + e.km, 0);
  const totalKgCO2eq = detailed.reduce((s, e) => s + e.kgCO2eq, 0);
  const avgKg = data.total > 0 ? totalKgCO2eq / data.total : 0;
  const bySociete = aggregateBySociete(detailed);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Résumé événement */}
      <section className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <h2 className="font-medium text-emerald-900 mb-3">{eventLabel}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-white rounded-md p-3 border border-emerald-100">
            <p className="text-xs text-gray-500 mb-1">Véhicules</p>
            <p className="text-xl font-bold text-gray-900">{formatNumber(data.total)}</p>
          </div>
          <div className="bg-white rounded-md p-3 border border-emerald-100">
            <p className="text-xs text-gray-500 mb-1">Km total</p>
            <p className="text-xl font-bold text-gray-900">{formatNumber(totalKm)}</p>
          </div>
          <div className="bg-white rounded-md p-3 border border-emerald-100">
            <p className="text-xs text-gray-500 mb-1">CO₂eq total</p>
            <p className="text-xl font-bold text-orange-600">{formatNumber(totalKgCO2eq)} kg</p>
          </div>
          <div className="bg-white rounded-md p-3 border border-emerald-100">
            <p className="text-xs text-gray-500 mb-1">Moy. / véhicule</p>
            <p className="text-xl font-bold text-gray-700">{formatNumber(avgKg)} kg</p>
          </div>
        </div>
      </section>

      {/* Répartition par gabarit */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <h2 className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-900">
          Répartition par gabarit
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-900">Gabarit</th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">Nb véhicules</th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">Km</th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">KgCO₂eq</th>
              </tr>
            </thead>
            <tbody>
              {aggregations.type.map((row) => (
                <tr key={row.category} className="border-b border-gray-100 hover:bg-gray-50">
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
                <td className="px-4 py-3 text-right font-mono">{formatNumber(data.total)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatNumber(totalKm)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatNumber(totalKgCO2eq)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Répartition par société — Desktop */}
      <section className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <h2 className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-900">
          Répartition par société
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-900">Société</th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">Nb véhicules</th>
                <th className="px-4 py-3 text-left font-medium text-gray-900">Gabarits utilisés</th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">KgCO₂eq</th>
              </tr>
            </thead>
            <tbody>
              {bySociete.map((row) => (
                <tr key={row.societe} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 truncate max-w-[200px]">{row.societe}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">
                    {formatNumber(row.nbVehicules)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{row.gabarits}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">
                    {formatNumber(row.kgCO2eq)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Répartition par société — Mobile cards */}
      <section className="md:hidden space-y-3">
        <h2 className="px-2 font-medium text-gray-900">Répartition par société</h2>
        {bySociete.map((row) => (
          <div key={row.societe} className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex justify-between items-start mb-1">
              <p className="font-medium text-gray-900 truncate flex-1 mr-2">{row.societe}</p>
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

      <VehicleTypeReferenceTable />
    </div>
  );
}

export default function EventDetailTab({
  data,
  selectedEvent,
  events = [],
}: EventDetailTabProps) {
  // Mappe une valeur brute d'événement (slug stocké dans `acc.event`) vers son
  // nom lisible si on le connaît, sinon retourne la valeur telle quelle.
  const nameForSlug = (slug: string): string => {
    const match = events.find(
      (e) => e.value.toLowerCase() === slug.toLowerCase()
    );
    return match?.label ?? slug;
  };

  if (!selectedEvent) {
    return <AllEventsView data={data} nameForSlug={nameForSlug} />;
  }

  return (
    <SingleEventView data={data} eventLabel={nameForSlug(selectedEvent)} />
  );
}
