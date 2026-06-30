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
} from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { useAccreditationStream } from "@/hooks/useAccreditationStream";
import type { AccreditationStats } from "@/lib/accreditations-dashboard";

const STATUS_META: { code: string; label: string; bar: string; bg: string; text: string }[] = [
  { code: "NOUVEAU", label: "Nouveau", bar: "bg-amber-400", bg: "bg-amber-100", text: "text-amber-700" },
  { code: "ATTENTE", label: "Validée", bar: "bg-yellow-400", bg: "bg-yellow-100", text: "text-yellow-700" },
  { code: "ENTREE", label: "Entrée", bar: "bg-green-500", bg: "bg-green-100", text: "text-green-700" },
  { code: "SORTIE", label: "Sortie", bar: "bg-red-500", bg: "bg-red-100", text: "text-red-700" },
  { code: "REFUS", label: "Refusé", bar: "bg-rose-500", bg: "bg-red-100", text: "text-red-700" },
  { code: "ABSENT", label: "Absent", bar: "bg-violet-500", bg: "bg-violet-100", text: "text-violet-700" },
];

export default function CountingSection() {
  const espace = useEspaceSlug();
  const [stats, setStats] = useState<AccreditationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Évite les recalculs concurrents déclenchés par le polling SSE.
  const inFlightRef = useRef(false);

  const fetchStats = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      // En rafraîchissement silencieux (SSE), on ne réaffiche pas le gros
      // spinner : on met simplement les compteurs à jour en place.
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (espace) qs.set("espace", espace);
        const res = await fetch(`/api/accreditations/stats?${qs.toString()}`, {
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
    [espace]
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Temps réel : recalcule les compteurs dès qu'une accréditation change
  // (même flux que la liste). Rafraîchissement silencieux pour ne pas
  // faire clignoter l'écran.
  useAccreditationStream({
    espace,
    enabled: true,
    onRefresh: () => fetchStats({ silent: true }),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} />
        Chargement des compteurs…
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
        <AlertCircle className="mx-auto text-red-400 mb-3" size={28} />
        <p className="text-sm text-gray-600 mb-4">{error ?? "Aucune donnée."}</p>
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

  const utilitaires = stats.byVehicleType.filter((t) => !t.isHeavy);
  const poidsLourds = stats.byVehicleType.filter((t) => t.isHeavy);
  const utilitairesVeh = utilitaires.reduce((s, t) => s + t.vehicles, 0);
  const maxStatus = Math.max(1, ...STATUS_META.map((s) => stats.byStatus[s.code] ?? 0));

  return (
    <div className="space-y-6">
      {/* En-tête + rafraîchir */}
      <div className="flex items-center justify-between gap-3">
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
              MAJ {lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
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

      {/* Bandeau totaux */}
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

      {/* Par statut */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900">Par statut</h2>
          <span className="text-xs text-gray-400">
            Total&nbsp;: <strong className="text-gray-700">{stats.totalAccreditations}</strong>
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

      {/* Par gabarit */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Truck size={16} className="text-[#4F587E]" />
            Par gabarit
          </h2>
          <span className="text-xs text-gray-400">
            Total&nbsp;: <strong className="text-gray-700">{stats.totalVehicles}</strong> véhicule
            {stats.totalVehicles > 1 ? "s" : ""}
          </span>
        </div>

        {stats.byVehicleType.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Aucun véhicule comptabilisé.
          </p>
        ) : (
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
        )}
      </section>
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
