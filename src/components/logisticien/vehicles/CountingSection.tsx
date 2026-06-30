"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  RotateCcw,
  Truck,
  AlertCircle,
  FileCheck2,
  Boxes,
  Weight,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { useAccreditationStream } from "@/hooks/useAccreditationStream";
import type { AccreditationStats } from "@/lib/accreditations-dashboard";

const STATUS_META: {
  code: string;
  label: string;
  bar: string;
  bg: string;
  text: string;
}[] = [
  { code: "NOUVEAU", label: "Nouveau", bar: "bg-amber-400", bg: "bg-amber-100", text: "text-amber-700" },
  { code: "ATTENTE", label: "Validée", bar: "bg-yellow-400", bg: "bg-yellow-100", text: "text-yellow-700" },
  { code: "ENTREE", label: "Entrée", bar: "bg-green-500", bg: "bg-green-100", text: "text-green-700" },
  { code: "SORTIE", label: "Sortie", bar: "bg-red-500", bg: "bg-red-100", text: "text-red-700" },
  { code: "REFUS", label: "Refusé", bar: "bg-rose-500", bg: "bg-red-100", text: "text-red-700" },
  { code: "ABSENT", label: "Absent", bar: "bg-violet-500", bg: "bg-violet-100", text: "text-violet-700" },
];

interface Filters {
  event: string;
  from: string;
  to: string;
  status: string;
  vehicleType: string;
  vehicleFamily: string;
  company: string;
  stand: string;
  zone: string;
}

const EMPTY_FILTERS: Filters = {
  event: "",
  from: "",
  to: "",
  status: "",
  vehicleType: "",
  vehicleFamily: "",
  company: "",
  stand: "",
  zone: "",
};

function countActiveFilters(f: Filters): number {
  return Object.values(f).filter(Boolean).length;
}

function buildQueryString(espace: string | null, filters: Filters): string {
  const qs = new URLSearchParams();
  if (espace) qs.set("espace", espace);
  if (filters.event) qs.set("event", filters.event);
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.status) qs.set("status", filters.status);
  if (filters.vehicleType) qs.set("vehicleType", filters.vehicleType);
  if (filters.vehicleFamily) qs.set("vehicleFamily", filters.vehicleFamily);
  if (filters.company) qs.set("company", filters.company);
  if (filters.stand) qs.set("stand", filters.stand);
  if (filters.zone) qs.set("zone", filters.zone);
  return qs.toString();
}

export default function CountingSection() {
  const espace = useEspaceSlug();
  const [stats, setStats] = useState<AccreditationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlightRef = useRef(false);

  // Filtres
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const activeFilterCount = countActiveFilters(filters);

  // Listes de référence pour les selects
  const [events, setEvents] = useState<{ slug: string; name: string }[]>([]);
  const [zones, setZones] = useState<{ zone: string; label: string }[]>([]);

  // Charger les événements
  useEffect(() => {
    if (!espace) return;
    fetch(`/api/events?espace=${encodeURIComponent(espace)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { slug?: string; name?: string }[]) => {
        if (!Array.isArray(data)) return;
        setEvents(
          data
            .map((e) => ({ slug: e.slug ?? "", name: e.name ?? e.slug ?? "" }))
            .filter((e) => e.slug)
        );
      })
      .catch(() => setEvents([]));
  }, [espace]);

  // Charger les zones (permission GESTION_ZONES requise, gracieux si absent)
  useEffect(() => {
    const url = espace
      ? `/api/zones?espace=${encodeURIComponent(espace)}`
      : "/api/zones";
    fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { zone?: string; label?: string }[]) => {
        if (!Array.isArray(data)) return;
        setZones(
          data
            .map((z) => ({ zone: z.zone ?? "", label: z.label ?? z.zone ?? "" }))
            .filter((z) => z.zone)
        );
      })
      .catch(() => setZones([]));
  }, [espace]);

  const fetchStats = useCallback(
    async (opts?: { silent?: boolean; overrideFilters?: Filters }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const activeFilters = opts?.overrideFilters ?? filters;
        const qs = buildQueryString(espace, activeFilters);
        const res = await fetch(`/api/accreditations/stats?${qs}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setStats(await res.json());
        setLastUpdated(new Date());
      } catch {
        if (!opts?.silent) setError("Impossible de charger les compteurs.");
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [espace, filters]
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useAccreditationStream({
    espace,
    enabled: true,
    onRefresh: () => fetchStats({ silent: true }),
  });

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
  };

  // Extraire les gabarits connus depuis les stats
  const knownVehicleTypes = stats?.byVehicleType ?? [];

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} />
        Chargement des compteurs…
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
        <AlertCircle className="mx-auto text-red-400 mb-3" size={28} />
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => fetchStats()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4F587E] text-white text-sm font-semibold hover:bg-[#3B4252] transition"
        >
          <RotateCcw size={15} />
          Réessayer
        </button>
      </div>
    );
  }

  const utilitaires = (stats?.byVehicleType ?? []).filter((t) => !t.isHeavy);
  const poidsLourds = (stats?.byVehicleType ?? []).filter((t) => t.isHeavy);
  const utilitairesVeh = utilitaires.reduce((s, t) => s + t.vehicles, 0);
  const maxStatus = Math.max(
    1,
    ...STATUS_META.map((s) => stats?.byStatus[s.code] ?? 0)
  );

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            En direct
          </span>
          {lastUpdated && (
            <span className="text-[11px] text-gray-400 truncate">
              MAJ{" "}
              {lastUpdated.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          )}
          {loading && stats && (
            <Loader2 size={13} className="animate-spin text-gray-400" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition shrink-0 ${
              panelOpen || activeFilterCount > 0
                ? "border-[#4F587E] bg-[#4F587E]/10 text-[#4F587E]"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Filter size={13} />
            Filtres
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#4F587E] text-white text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
            {panelOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button
            type="button"
            onClick={() => fetchStats()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition shrink-0"
            title="Rafraîchir les compteurs"
          >
            <RotateCcw size={13} />
            Rafraîchir
          </button>
        </div>
      </div>

      {/* Panneau filtres */}
      {panelOpen && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Filter size={14} className="text-[#4F587E]" />
              Filtres
            </h3>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium transition"
              >
                <X size={12} />
                Réinitialiser
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Événement */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Événement
              </label>
              <div className="relative">
                <select
                  value={filters.event}
                  onChange={(e) => handleFilterChange("event", e.target.value)}
                  className="w-full pl-2.5 pr-7 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4F587E] appearance-none"
                >
                  <option value="">Tous les événements</option>
                  {events.map((ev) => (
                    <option key={ev.slug} value={ev.slug}>
                      {ev.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              </div>
            </div>

            {/* Statut */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Statut
              </label>
              <div className="relative">
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange("status", e.target.value)}
                  className="w-full pl-2.5 pr-7 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4F587E] appearance-none"
                >
                  <option value="">Tous les statuts</option>
                  {STATUS_META.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              </div>
            </div>

            {/* Famille véhicule */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Famille véhicule
              </label>
              <div className="flex gap-1.5">
                {[
                  { value: "", label: "Tous" },
                  { value: "light", label: "Utilitaires" },
                  { value: "heavy", label: "Poids lourds" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleFilterChange("vehicleFamily", opt.value)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      filters.vehicleFamily === opt.value
                        ? "border-[#4F587E] bg-[#4F587E] text-white"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Gabarit */}
            {knownVehicleTypes.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Gabarit
                </label>
                <div className="relative">
                  <select
                    value={filters.vehicleType}
                    onChange={(e) =>
                      handleFilterChange("vehicleType", e.target.value)
                    }
                    className="w-full pl-2.5 pr-7 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4F587E] appearance-none"
                  >
                    <option value="">Tous les gabarits</option>
                    {knownVehicleTypes.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                </div>
              </div>
            )}

            {/* Zone */}
            {zones.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Zone actuelle
                </label>
                <div className="relative">
                  <select
                    value={filters.zone}
                    onChange={(e) => handleFilterChange("zone", e.target.value)}
                    className="w-full pl-2.5 pr-7 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4F587E] appearance-none"
                  >
                    <option value="">Toutes les zones</option>
                    {zones.map((z) => (
                      <option key={z.zone} value={z.zone}>
                        {z.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                </div>
              </div>
            )}

            {/* Société */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Société
              </label>
              <input
                type="text"
                placeholder="Nom exact de la société"
                value={filters.company}
                onChange={(e) => handleFilterChange("company", e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4F587E]"
              />
            </div>

            {/* Stand */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Stand
              </label>
              <input
                type="text"
                placeholder="N° ou nom de stand"
                value={filters.stand}
                onChange={(e) => handleFilterChange("stand", e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4F587E]"
              />
            </div>

            {/* Période */}
            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Période (date véhicule)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => handleFilterChange("from", e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#4F587E]"
                />
                <span className="text-gray-400 text-xs shrink-0">→</span>
                <input
                  type="date"
                  value={filters.to}
                  min={filters.from}
                  onChange={(e) => handleFilterChange("to", e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#4F587E]"
                />
              </div>
            </div>
          </div>

          {/* Badges filtres actifs */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
              {Object.entries(filters)
                .filter(([, v]) => v)
                .map(([key, value]) => {
                  let displayValue = value;
                  if (key === "event") {
                    displayValue =
                      events.find((e) => e.slug === value)?.name ?? value;
                  } else if (key === "status") {
                    displayValue =
                      STATUS_META.find((s) => s.code === value)?.label ?? value;
                  } else if (key === "vehicleFamily") {
                    displayValue =
                      value === "heavy" ? "Poids lourds" : "Utilitaires";
                  } else if (key === "zone") {
                    displayValue =
                      zones.find((z) => z.zone === value)?.label ?? value;
                  } else if (key === "vehicleType") {
                    displayValue =
                      knownVehicleTypes.find((t) => t.code === value)?.label ??
                      value;
                  }
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 rounded-full bg-[#4F587E]/10 text-[#4F587E] text-[11px] font-semibold px-2 py-0.5"
                    >
                      {displayValue}
                      <button
                        type="button"
                        onClick={() =>
                          handleFilterChange(key as keyof Filters, "")
                        }
                        className="hover:text-red-600 transition"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Bandeau totaux */}
      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <TotalCard
              icon={FileCheck2}
              label="Accréditations"
              value={stats.totalAccreditations}
            />
            <TotalCard icon={Boxes} label="Véhicules" value={stats.totalVehicles} />
            <TotalCard
              icon={Weight}
              label="Poids lourds"
              value={stats.heavyVehicles}
              hint={`${stats.heavyAccreditations} accréditation${stats.heavyAccreditations > 1 ? "s" : ""}`}
              accent
            />
            <TotalCard
              icon={Truck}
              label="Utilitaires"
              value={utilitairesVeh}
              hint="VL · 10/15/20 m³"
            />
          </div>

          {/* État vide */}
          {stats.totalAccreditations === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
              <p className="text-sm text-gray-500">
                Aucune accréditation ne correspond aux filtres actifs.
              </p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#4F587E] font-semibold hover:underline"
                >
                  <X size={12} />
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          )}

          {/* Par statut */}
          {stats.totalAccreditations > 0 && (
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900">Par statut</h2>
                <span className="text-xs text-gray-400">
                  Total&nbsp;:{" "}
                  <strong className="text-gray-700">
                    {stats.totalAccreditations}
                  </strong>
                </span>
              </div>
              <div className="space-y-2.5">
                {STATUS_META.map((s) => {
                  const n = stats.byStatus[s.code] ?? 0;
                  const pct =
                    stats.totalAccreditations > 0
                      ? Math.round((n / stats.totalAccreditations) * 100)
                      : 0;
                  return (
                    <div key={s.code} className="flex items-center gap-3">
                      <span
                        className={`w-20 shrink-0 inline-flex justify-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${s.bg} ${s.text}`}
                      >
                        {s.label}
                      </span>
                      <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${s.bar} transition-all`}
                          style={{ width: `${(n / maxStatus) * 100}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-sm font-bold tabular-nums text-gray-900">
                        {n}
                      </span>
                      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Par gabarit */}
          {stats.byVehicleType.length > 0 && (
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Truck size={16} className="text-[#4F587E]" />
                  Par gabarit
                </h2>
                <span className="text-xs text-gray-400">
                  Total&nbsp;:{" "}
                  <strong className="text-gray-700">{stats.totalVehicles}</strong>{" "}
                  véhicule{stats.totalVehicles > 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-5">
                <VehicleTypeGroup
                  title="Utilitaires"
                  rows={utilitaires}
                  totalLabel="Sous-total utilitaires"
                />
                <VehicleTypeGroup
                  title="Poids lourds"
                  rows={poidsLourds}
                  totalLabel="Sous-total poids lourds"
                  highlight
                />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TotalCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Truck;
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent ? "border-[#4F587E]/30 bg-[#4F587E]/5" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-2 text-gray-500">
        <Icon size={15} className={accent ? "text-[#4F587E]" : "text-gray-400"} />
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className="mt-1.5 text-3xl font-bold leading-none text-gray-900 tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function VehicleTypeGroup({
  title,
  rows,
  totalLabel,
  highlight,
}: {
  title: string;
  rows: { code: string; label: string; accreditations: number; vehicles: number }[];
  totalLabel: string;
  highlight?: boolean;
}) {
  if (rows.length === 0) return null;
  const totalVeh = rows.reduce((s, r) => s + r.vehicles, 0);
  const totalAccr = rows.reduce((s, r) => s + r.accreditations, 0);

  return (
    <div>
      <h3
        className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${
          highlight ? "text-[#4F587E]" : "text-gray-400"
        }`}
      >
        {title}
      </h3>
      <div className="overflow-hidden rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="text-left font-semibold px-3 py-2">Gabarit</th>
              <th className="text-right font-semibold px-3 py-2 w-28">Véhicules</th>
              <th className="text-right font-semibold px-3 py-2 w-28">Accréditations</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-800">{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900 font-semibold">
                  {r.vehicles}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {r.accreditations}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr
              className={`border-t-2 ${
                highlight
                  ? "border-[#4F587E]/30 bg-[#4F587E]/5"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <td className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-600">
                {totalLabel}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">
                {totalVeh}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-700">
                {totalAccr}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
