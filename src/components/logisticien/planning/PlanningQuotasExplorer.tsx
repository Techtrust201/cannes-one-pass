"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCapacityScopeLabel } from "@/lib/rx-capacity-scope";
import { withEspaceQuery } from "@/lib/url";

type EventOption = { id: string; name: string; startDate: string; endDate: string };
type ZoneOption = { code: string; label: string };

type PlanningRule = {
  id: string;
  eventId: string;
  scope: string;
  scopeKey: string;
  scopeLabel: string;
  portCode: string | null;
  sectorCode: string | null;
  spaceCode: string | null;
  categoryCode: string;
  phase: "MONTAGE" | "DEMONTAGE";
  date: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  source: string | null;
};

type QuotaRow = {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: "LIGHT" | "HEAVY";
  capacity: number;
  remaining: number;
  totalUsed: number;
  hasQuota: boolean;
  status: "ok" | "hors_planning" | "illimite";
  zone: string;
};

type PlanningRange = {
  date: string;
  startTime: string;
  endTime: string;
  ruleId: string;
  categoryCode: string;
  isActive: boolean;
};

type Anomaly = {
  type: string;
  message: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  vehicleFamily?: string;
  quotaId?: number;
};

type TabId = "calendrier" | "horaires" | "quotas" | "anomalies";

const TABS: { id: TabId; label: string }[] = [
  { id: "calendrier", label: "Calendrier" },
  { id: "horaires", label: "Horaires" },
  { id: "quotas", label: "Quotas" },
  { id: "anomalies", label: "Anomalies" },
];

const PHASES = ["MONTAGE", "DEMONTAGE"] as const;
const SCOPES = ["EVENT", "PORT", "SECTOR", "SPACE"] as const;
const SLICE_OPTIONS = [15, 30, 60, 120] as const;

const inputClass =
  "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3F4660] focus:ring-1 focus:ring-[#3F4660]";

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Découpe une plage en créneaux de `sliceMin` minutes (côté UI uniquement). */
function sliceRange(
  startTime: string,
  endTime: string,
  sliceMin: number
): Array<{ startTime: string; endTime: string }> {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (!(end > start) || sliceMin <= 0) return [];
  const slots: Array<{ startTime: string; endTime: string }> = [];
  for (let t = start; t + sliceMin <= end; t += sliceMin) {
    slots.push({ startTime: minutesToTime(t), endTime: minutesToTime(t + sliceMin) });
  }
  return slots;
}

export default function PlanningQuotasExplorer({
  events,
  zones,
}: {
  events: EventOption[];
  zones: ZoneOption[];
}) {
  const espace = useEspaceSlug();
  const { hasPermission } = usePermissions();
  const canWriteDates = hasPermission("GESTION_DATES", "write");
  const canWriteQuotas = hasPermission("FLUX_VEHICULES", "write");

  const [tab, setTab] = useState<TabId>("calendrier");
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [phase, setPhase] = useState<"MONTAGE" | "DEMONTAGE">("MONTAGE");
  const [scopeFilter, setScopeFilter] = useState("");
  const [port, setPort] = useState("");
  const [sector, setSector] = useState("");
  const [q, setQ] = useState("");

  const [rules, setRules] = useState<PlanningRule[]>([]);
  const [rulesTotal, setRulesTotal] = useState(0);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState("");

  const [selectedScopeKey, setSelectedScopeKey] = useState("");
  const [zone, setZone] = useState(zones[0]?.code ?? "");

  const [planningRanges, setPlanningRanges] = useState<PlanningRange[]>([]);
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState("");

  const [sliceMin, setSliceMin] = useState<(typeof SLICE_OPTIONS)[number]>(60);
  const [lightCap, setLightCap] = useState("10");
  const [heavyCap, setHeavyCap] = useState("5");
  const [previewSlots, setPreviewSlots] = useState<
    Array<{ date: string; startTime: string; endTime: string }>
  >([]);
  const [generating, setGenerating] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const [showCreateRule, setShowCreateRule] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadRules = useCallback(async () => {
    if (espace !== "rx" || !eventId) return;
    setRulesLoading(true);
    setRulesError("");
    try {
      const params = new URLSearchParams({
        espace,
        eventId,
        phase,
        page: "1",
        pageSize: "200",
      });
      if (scopeFilter) params.set("scope", scopeFilter);
      if (port) params.set("port", port);
      if (sector) params.set("sector", sector);
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/planning/rules?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Chargement impossible");
      setRules(body.items ?? []);
      setRulesTotal(body.total ?? 0);
      setSelectedScopeKey((prev) => prev || body.items?.[0]?.scopeKey || "");
    } catch (err) {
      setRulesError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setRulesLoading(false);
    }
  }, [espace, eventId, phase, scopeFilter, port, sector, q]);

  useEffect(() => {
    void loadRules();
  }, [loadRules, refreshKey]);

  const loadGrid = useCallback(async () => {
    if (espace !== "rx" || !eventId || !selectedScopeKey) {
      setPlanningRanges([]);
      setQuotas([]);
      setAnomalies([]);
      return;
    }
    setGridLoading(true);
    setGridError("");
    try {
      const params = new URLSearchParams({
        espace,
        eventId,
        scopeKey: selectedScopeKey,
        phase,
      });
      if (zone) params.set("zone", zone);
      const res = await fetch(`/api/admin/planning/quota-grid?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Chargement grille impossible");
      setPlanningRanges(body.planningRanges ?? []);
      setQuotas(body.quotas ?? []);
      setAnomalies(body.anomalies ?? []);
    } catch (err) {
      setGridError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setGridLoading(false);
    }
  }, [espace, eventId, selectedScopeKey, phase, zone]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid, refreshKey]);

  const scopeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rules) map.set(r.scopeKey, r.scopeLabel || formatCapacityScopeLabel(r.scopeKey));
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [rules]);

  const calendarDays = useMemo(() => {
    const byDate = new Map<
      string,
      { ranges: PlanningRule[]; quotaCount: number }
    >();
    for (const r of rules) {
      const entry = byDate.get(r.date) ?? { ranges: [], quotaCount: 0 };
      entry.ranges.push(r);
      byDate.set(r.date, entry);
    }
    for (const q of quotas) {
      const entry = byDate.get(q.date) ?? { ranges: [], quotaCount: 0 };
      entry.quotaCount += 1;
      byDate.set(q.date, entry);
    }
    // Compter aussi les quotas liés aux dates planning même si rules filtrées
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));
  }, [rules, quotas]);

  const buildPreview = () => {
    const active = planningRanges.filter((r) => r.isActive);
    const slots: Array<{ date: string; startTime: string; endTime: string }> = [];
    for (const range of active) {
      for (const s of sliceRange(range.startTime, range.endTime, sliceMin)) {
        slots.push({ date: range.date, ...s });
      }
    }
    setPreviewSlots(slots);
    setActionMsg(slots.length ? `${slots.length} créneau(x) prêts` : "Aucune plage active à découper");
  };

  const confirmGenerate = async () => {
    if (!canWriteQuotas || !previewSlots.length) return;
    setGenerating(true);
    setActionMsg("");
    try {
      const light = Number(lightCap);
      const heavy = Number(heavyCap);
      const res = await fetch(withEspaceQuery("/api/admin/planning/quota-grid", espace), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          scopeKey: selectedScopeKey,
          zone,
          phase,
          confirm: true,
          slots: previewSlots.map((s) => ({
            ...s,
            ...(Number.isInteger(light) && light >= 1 ? { lightCapacity: light } : {}),
            ...(Number.isInteger(heavy) && heavy >= 1 ? { heavyCapacity: heavy } : {}),
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Génération refusée");
      setActionMsg(`${body.created ?? 0} quota(s) créé(s)/mis à jour`);
      setPreviewSlots([]);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setGenerating(false);
    }
  };

  const patchRule = async (id: string, data: Record<string, unknown>) => {
    const res = await fetch(withEspaceQuery(`/api/admin/planning/rules/${id}`, espace), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Mise à jour impossible");
    setRefreshKey((k) => k + 1);
  };

  const deleteRule = async (id: string) => {
    if (!window.confirm("Supprimer cette règle d'horaire ?")) return;
    const res = await fetch(withEspaceQuery(`/api/admin/planning/rules/${id}`, espace), {
      method: "DELETE",
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Suppression impossible");
    setRefreshKey((k) => k + 1);
  };

  const patchQuotaCapacity = async (id: number, capacity: number) => {
    const res = await fetch(withEspaceQuery("/api/capacities", espace), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, capacity }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Modification impossible");
    setRefreshKey((k) => k + 1);
  };

  const deleteQuota = async (id: number) => {
    if (!window.confirm("Supprimer ce quota ? Le créneau redeviendra illimité.")) return;
    const res = await fetch(withEspaceQuery("/api/capacities", espace), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Suppression impossible");
    setRefreshKey((k) => k + 1);
  };

  if (espace !== "rx") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Ce module est réservé à l&apos;espace RX.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <CalendarDays size={21} className="text-[#3F4660]" />
            Planning &amp; quotas
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Horaires logistiques et capacités véhicule unifiés pour RX.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputClass}>
            {events.length === 0 && <option value="">Aucun événement</option>}
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value as "MONTAGE" | "DEMONTAGE")}
            className={inputClass}
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>{p === "MONTAGE" ? "Montage" : "Démontage"}</option>
            ))}
          </select>
          <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className={inputClass}>
            <option value="">Tous scopes</option>
            {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input placeholder="Port" value={port} onChange={(e) => setPort(e.target.value)} className={inputClass} />
          <input placeholder="Secteur" value={sector} onChange={(e) => setSector(e.target.value)} className={inputClass} />
          <input placeholder="Recherche…" value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <select
            value={selectedScopeKey}
            onChange={(e) => setSelectedScopeKey(e.target.value)}
            className={inputClass}
          >
            <option value="">Scope quotas…</option>
            {scopeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label} ({o.value})</option>
            ))}
          </select>
          <select value={zone} onChange={(e) => setZone(e.target.value)} className={inputClass}>
            {zones.map((z) => (
              <option key={z.code} value={z.code}>{z.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.id
                ? "border-[#3F4660] text-[#3F4660]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
            {t.id === "anomalies" && anomalies.length > 0 ? ` (${anomalies.length})` : ""}
          </button>
        ))}
      </div>

      {rulesError && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{rulesError}</p>
      )}
      {gridError && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{gridError}</p>
      )}

      {tab === "calendrier" && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {rulesLoading ? (
            <LoaderRow />
          ) : calendarDays.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune plage pour ces filtres.</p>
          ) : (
            <ul className="space-y-3">
              {calendarDays.map((day) => (
                <li key={day.date} className="rounded-lg border border-gray-100 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">{day.date}</span>
                    <span className="rounded-full bg-[#3F4660]/10 px-2.5 py-0.5 text-xs font-medium text-[#3F4660]">
                      {day.quotaCount} quota{day.quotaCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {day.ranges.map((r) => (
                      <li key={r.id} className="flex flex-wrap gap-2">
                        <span className="font-mono">{r.startTime}–{r.endTime}</span>
                        <span>{r.scopeLabel || formatCapacityScopeLabel(r.scopeKey)}</span>
                        {!r.isActive && <span className="text-amber-600">inactif</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-gray-400">{rulesTotal} règle(s) au total</p>
        </section>
      )}

      {tab === "horaires" && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex justify-end">
            {canWriteDates && (
              <button
                type="button"
                onClick={() => setShowCreateRule(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#3F4660] px-3 py-2 text-sm font-semibold text-white hover:bg-[#343a52]"
              >
                <Plus size={14} /> Nouvelle plage
              </button>
            )}
          </div>
          {rulesLoading ? (
            <LoaderRow />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Horaires</th>
                    <th className="px-2 py-2">Portée</th>
                    <th className="px-2 py-2">Catégorie</th>
                    <th className="px-2 py-2">Actif</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50">
                      <td className="px-2 py-2 whitespace-nowrap">{r.date}</td>
                      <td className="px-2 py-2 font-mono whitespace-nowrap">
                        {r.startTime}–{r.endTime}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="text-left text-[#3F4660] hover:underline"
                          onClick={() => {
                            setSelectedScopeKey(r.scopeKey);
                            setTab("quotas");
                          }}
                        >
                          {r.scopeLabel || formatCapacityScopeLabel(r.scopeKey)}
                        </button>
                      </td>
                      <td className="px-2 py-2">{r.categoryCode}</td>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={r.isActive}
                          disabled={!canWriteDates}
                          onChange={(e) => {
                            void patchRule(r.id, { isActive: e.target.checked }).catch((err) =>
                              setRulesError(err instanceof Error ? err.message : "Erreur")
                            );
                          }}
                        />
                      </td>
                      <td className="px-2 py-2 text-gray-500">{r.source ?? "—"}</td>
                      <td className="px-2 py-2">
                        {canWriteDates && (
                          <button
                            type="button"
                            className="text-red-600 hover:text-red-800"
                            onClick={() => {
                              void deleteRule(r.id).catch((err) =>
                                setRulesError(err instanceof Error ? err.message : "Erreur")
                              );
                            }}
                            aria-label="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {showCreateRule && canWriteDates && (
            <CreateRuleForm
              eventId={eventId}
              phase={phase}
              espace={espace}
              onClose={() => setShowCreateRule(false)}
              onCreated={() => {
                setShowCreateRule(false);
                setRefreshKey((k) => k + 1);
              }}
            />
          )}
        </section>
      )}

      {tab === "quotas" && (
        <section className="space-y-4">
          {!selectedScopeKey ? (
            <p className="text-sm text-gray-500">Sélectionnez un scope pour gérer les quotas.</p>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h2 className="mb-1 flex items-center gap-2 font-semibold text-gray-900">
                  <Clock size={16} className="text-[#3F4660]" />
                  Plages planning — {formatCapacityScopeLabel(selectedScopeKey)}
                </h2>
                {gridLoading ? (
                  <LoaderRow />
                ) : planningRanges.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucune plage pour ce scope / phase.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-gray-700">
                    {planningRanges.map((r) => (
                      <li key={r.ruleId} className="font-mono">
                        {r.date} {r.startTime}–{r.endTime}
                        {!r.isActive && <span className="ml-2 text-amber-600">inactif</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canWriteQuotas && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
                    <Gauge size={16} className="text-[#3F4660]" />
                    Générer des quotas
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <label className="text-sm">
                      Découpe
                      <select
                        value={sliceMin}
                        onChange={(e) => setSliceMin(Number(e.target.value) as (typeof SLICE_OPTIONS)[number])}
                        className={`${inputClass} mt-1 w-full`}
                      >
                        {SLICE_OPTIONS.map((m) => (
                          <option key={m} value={m}>{m} min</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Capacité LIGHT
                      <input
                        value={lightCap}
                        onChange={(e) => setLightCap(e.target.value)}
                        className={`${inputClass} mt-1 w-full`}
                      />
                    </label>
                    <label className="text-sm">
                      Capacité HEAVY
                      <input
                        value={heavyCap}
                        onChange={(e) => setHeavyCap(e.target.value)}
                        className={`${inputClass} mt-1 w-full`}
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={buildPreview}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        Aperçu
                      </button>
                      <button
                        type="button"
                        disabled={!previewSlots.length || generating}
                        onClick={() => void confirmGenerate()}
                        className="rounded-lg bg-[#3F4660] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {generating ? "…" : "Confirmer"}
                      </button>
                    </div>
                  </div>
                  {previewSlots.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      Aperçu : {previewSlots.slice(0, 5).map((s) => `${s.date} ${s.startTime}-${s.endTime}`).join(", ")}
                      {previewSlots.length > 5 ? ` … (+${previewSlots.length - 5})` : ""}
                    </p>
                  )}
                  {actionMsg && <p className="mt-2 text-sm text-gray-700">{actionMsg}</p>}
                </div>
              )}

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Créneau</th>
                      <th className="px-2 py-2">Famille</th>
                      <th className="px-2 py-2">Capacité</th>
                      <th className="px-2 py-2">Restant</th>
                      <th className="px-2 py-2">Statut</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {quotas.map((q) => (
                      <tr key={q.id} className="border-b border-gray-50">
                        <td className="px-2 py-2">{q.date}</td>
                        <td className="px-2 py-2 font-mono">{q.startTime}–{q.endTime}</td>
                        <td className="px-2 py-2">{q.vehicleFamily}</td>
                        <td className="px-2 py-2">
                          {q.hasQuota ? q.capacity : <span className="text-gray-400">Illimité</span>}
                        </td>
                        <td className="px-2 py-2">{q.hasQuota ? q.remaining : "—"}</td>
                        <td className="px-2 py-2">
                          <StatusBadge status={q.status} />
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {canWriteQuotas && q.hasQuota && (
                            <>
                              <button
                                type="button"
                                className="mr-2 text-[#3F4660] hover:underline"
                                onClick={() => {
                                  const next = window.prompt("Nouvelle capacité", String(q.capacity));
                                  if (!next) return;
                                  const cap = Number(next);
                                  if (!Number.isInteger(cap) || cap < 1) return;
                                  void patchQuotaCapacity(q.id, cap).catch((err) =>
                                    setActionMsg(err instanceof Error ? err.message : "Erreur")
                                  );
                                }}
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                className="text-red-600 hover:underline"
                                onClick={() => {
                                  void deleteQuota(q.id).catch((err) =>
                                    setActionMsg(err instanceof Error ? err.message : "Erreur")
                                  );
                                }}
                              >
                                Supprimer
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                    {quotas.length === 0 && !gridLoading && (
                      <tr>
                        <td colSpan={7} className="px-2 py-4 text-gray-500">
                          Aucun quota — les sous-plages sans capacité sont <strong>Illimité</strong>.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "anomalies" && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {gridLoading ? (
            <LoaderRow />
          ) : anomalies.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune anomalie détectée pour ce scope.</p>
          ) : (
            <ul className="space-y-2">
              {anomalies.map((a, i) => (
                <li
                  key={`${a.type}-${a.quotaId ?? i}-${a.date}-${a.startTime}`}
                  className="flex gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium uppercase text-xs tracking-wide">{a.type}</span>
                    <p>{a.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function LoaderRow() {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
      <Loader2 className="animate-spin" size={16} /> Chargement…
    </div>
  );
}

function StatusBadge({ status }: { status: QuotaRow["status"] }) {
  if (status === "hors_planning") {
    return <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">Hors planning</span>;
  }
  if (status === "illimite") {
    return <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Illimité</span>;
  }
  return <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">OK</span>;
}

function CreateRuleForm({
  eventId,
  phase,
  espace,
  onClose,
  onCreated,
}: {
  eventId: string;
  phase: string;
  espace: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("EVENT");
  const [portCode, setPortCode] = useState("");
  const [sectorCode, setSectorCode] = useState("");
  const [spaceCode, setSpaceCode] = useState("");
  const [categoryCode, setCategoryCode] = useState("ALL");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(withEspaceQuery("/api/admin/planning/rules", espace), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          scope,
          portCode: portCode || undefined,
          sectorCode: sectorCode || undefined,
          spaceCode: spaceCode || undefined,
          categoryCode,
          phase,
          date,
          startTime,
          endTime,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Création refusée");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={scope} onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])} className={inputClass}>
          {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input placeholder="Port" value={portCode} onChange={(e) => setPortCode(e.target.value)} className={inputClass} />
        <input placeholder="Secteur" value={sectorCode} onChange={(e) => setSectorCode(e.target.value)} className={inputClass} />
        <input placeholder="Espace" value={spaceCode} onChange={(e) => setSpaceCode(e.target.value)} className={inputClass} />
        <input placeholder="Catégorie" value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} className={inputClass} />
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
        <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#3F4660] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "…" : "Créer"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm">
          Annuler
        </button>
      </div>
    </form>
  );
}
