"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Truck, AlertCircle } from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import type { AccreditationStats } from "@/lib/accreditations-dashboard";

const STATUS_META: { code: string; label: string; bg: string; text: string }[] = [
  { code: "NOUVEAU", label: "Nouveau", bg: "bg-amber-100", text: "text-amber-700" },
  { code: "ATTENTE", label: "Validée", bg: "bg-yellow-100", text: "text-yellow-700" },
  { code: "ENTREE", label: "Entrée", bg: "bg-green-100", text: "text-green-700" },
  { code: "SORTIE", label: "Sortie", bg: "bg-red-100", text: "text-red-700" },
  { code: "REFUS", label: "Refusé", bg: "bg-red-100", text: "text-red-700" },
  { code: "ABSENT", label: "Absent", bg: "bg-violet-100", text: "text-violet-700" },
];

export default function CountingSection() {
  const espace = useEspaceSlug();
  const [stats, setStats] = useState<AccreditationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (espace) qs.set("espace", espace);
      const res = await fetch(`/api/accreditations/stats?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch {
      setError("Impossible de charger les compteurs.");
    } finally {
      setLoading(false);
    }
  }, [espace]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
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
          onClick={fetchStats}
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

  return (
    <div className="space-y-6">
      {/* Bandeau totaux */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TotalCard label="Accréditations" value={stats.totalAccreditations} />
        <TotalCard label="Véhicules" value={stats.totalVehicles} />
        <TotalCard
          label="Poids lourds"
          value={stats.heavyVehicles}
          hint={`${stats.heavyAccreditations} accr.`}
          accent
        />
        <TotalCard label="Nouveau" value={stats.byStatus.NOUVEAU ?? 0} />
      </div>

      {/* Par statut */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900">Par statut</h2>
          <button
            type="button"
            onClick={fetchStats}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition"
            title="Rafraîchir"
          >
            <RotateCcw size={13} />
            Rafraîchir
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {STATUS_META.map((s) => (
            <div
              key={s.code}
              className="flex flex-col items-center justify-center rounded-xl border border-gray-100 py-3"
            >
              <span className="text-2xl font-bold text-gray-900">
                {stats.byStatus[s.code] ?? 0}
              </span>
              <span
                className={`mt-1.5 inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ${s.bg} ${s.text}`}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Par gabarit */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Truck size={16} className="text-[#4F587E]" />
          Par gabarit
        </h2>

        {stats.byVehicleType.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Aucun véhicule comptabilisé.
          </p>
        ) : (
          <div className="space-y-5">
            <VehicleTypeGroup title="Utilitaires" rows={utilitaires} />
            <VehicleTypeGroup title="Poids lourds" rows={poidsLourds} highlight />
          </div>
        )}
      </section>
    </div>
  );
}

function TotalCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? "border-[#4F587E]/30 bg-[#4F587E]/5"
          : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900 leading-none">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function VehicleTypeGroup({
  title,
  rows,
  highlight,
}: {
  title: string;
  rows: { code: string; label: string; accreditations: number; vehicles: number }[];
  highlight?: boolean;
}) {
  if (rows.length === 0) return null;
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
              <th className="text-right font-semibold px-3 py-2">Véhicules</th>
              <th className="text-right font-semibold px-3 py-2">Accréditations</th>
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
        </table>
      </div>
    </div>
  );
}
