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
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCapacityScopeLabel } from "@/lib/rx-capacity-scope";
import { withEspaceQuery } from "@/lib/url";
import PageHelp from "@/components/logisticien/help/PageHelp";
import FieldHint from "@/components/logisticien/help/FieldHint";
import NumberedSteps from "@/components/logisticien/help/NumberedSteps";
import Glossary from "@/components/logisticien/help/Glossary";

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

type TabId = "calendrier" | "horaires" | "quotas" | "anomalies" | "processus";

const TABS: { id: TabId; label: string }[] = [
  { id: "calendrier", label: "Calendrier" },
  { id: "horaires", label: "Horaires" },
  { id: "quotas", label: "Quotas" },
  { id: "anomalies", label: "Anomalies" },
  { id: "processus", label: "Processus véhicules" },
];

const PHASES = ["MONTAGE", "DEMONTAGE"] as const;
const SCOPES = ["EVENT", "PORT", "SECTOR", "SPACE"] as const;
const SCOPE_LABELS: Record<(typeof SCOPES)[number], string> = {
  EVENT: "Tout l’événement",
  PORT: "Port",
  SECTOR: "Secteur",
  SPACE: "Espace logistique",
};
const SLICE_OPTIONS = [15, 30, 60, 120] as const;

const PLANNING_GLOSSARY = [
  {
    term: "Horaire",
    definition:
      "Plage autorisée (date + heures) pendant laquelle les véhicules peuvent venir pour le montage ou le démontage.",
  },
  {
    term: "Quota",
    definition:
      "Nombre maximum de véhicules autorisés sur un créneau. Sans quota, le créneau est « Illimité ».",
  },
  {
    term: "Illimité",
    definition:
      "Aucun plafond de véhicules n’est défini. Les dates et horaires restent contrôlés par le planning.",
  },
  {
    term: "Hors planning",
    definition:
      "Quota qui ne correspond plus à un horaire actif. À corriger : il n’est plus utilisable tant que le conflit n’est pas résolu.",
  },
  {
    term: "Véhicule léger / lourd",
    definition:
      "Deux familles de véhicules (léger = utilitaires/voitures ; lourd = poids lourds). Chaque famille a sa propre capacité.",
  },
  {
    term: "Périmètre",
    definition:
      "Niveau d’application de l’horaire ou du quota : événement, port, secteur, espace, ou un emplacement précis.",
  },
];

function familyLabel(family: "LIGHT" | "HEAVY"): string {
  return family === "LIGHT" ? "Léger" : "Lourd";
}

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
  const [showMoreFilters, setShowMoreFilters] = useState(false);
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
    <div className="mx-auto w-full max-w-7xl px-0.5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900 sm:text-xl">
            <CalendarDays size={21} className="shrink-0 text-[#3F4660]" />
            Planning &amp; quotas
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Définissez quand les véhicules peuvent venir, puis combien au maximum.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0"
        >
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      <PageHelp storageKey="rx-planning" glossaryHref="#lexique-planning">
        <p>
          Cette page définit <strong>quand</strong> les véhicules peuvent venir (horaires) et{" "}
          <strong>combien</strong> (quotas).
        </p>
        <p>
          Sans quota → affichage « Illimité » : les dates restent contrôlées, pas le nombre de véhicules.
        </p>
        <p>
          Parcours simple : choisir l’événement et le montage/démontage → consulter le calendrier →
          ajuster les horaires → générer les quotas.
        </p>
      </PageHelp>

      <Glossary id="lexique-planning" title="Lexique — Planning & quotas" terms={PLANNING_GLOSSARY} />

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Événement</span>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={`${inputClass} w-full`}>
              {events.length === 0 && <option value="">Aucun événement</option>}
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Phase</span>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value as "MONTAGE" | "DEMONTAGE")}
              className={`${inputClass} w-full`}
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>{p === "MONTAGE" ? "Montage" : "Démontage"}</option>
              ))}
            </select>
            <FieldHint>Montage = installation ; Démontage = reprise / départ.</FieldHint>
          </label>
        </div>

        <button
          type="button"
          onClick={() => setShowMoreFilters((v) => !v)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto sm:min-h-0"
        >
          <SlidersHorizontal size={15} />
          {showMoreFilters ? "Masquer les filtres" : "Plus de filtres"}
        </button>

        {showMoreFilters && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Type de périmètre</span>
              <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className={`${inputClass} w-full`}>
                <option value="">Tous</option>
                {SCOPES.map((s) => (
                  <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Port</span>
              <input placeholder="ex. PORT_CANTO" value={port} onChange={(e) => setPort(e.target.value)} className={`${inputClass} w-full`} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Secteur</span>
              <input placeholder="ex. POWER" value={sector} onChange={(e) => setSector(e.target.value)} className={`${inputClass} w-full`} />
            </label>
            <label className="block text-sm sm:col-span-2 lg:col-span-3">
              <span className="mb-1 block font-medium text-gray-700">Recherche</span>
              <input placeholder="Périmètre, catégorie…" value={q} onChange={(e) => setQ(e.target.value)} className={`${inputClass} w-full`} />
            </label>
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Périmètre des quotas</span>
            <select
              value={selectedScopeKey}
              onChange={(e) => setSelectedScopeKey(e.target.value)}
              className={`${inputClass} w-full`}
            >
              <option value="">Choisir un périmètre…</option>
              {scopeOptions.map((o) => (
                <option key={o.value} value={o.value} title={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <FieldHint>Le périmètre indique où s’applique le plafond (port, secteur, etc.).</FieldHint>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Zone logistique</span>
            <select value={zone} onChange={(e) => setZone(e.target.value)} className={`${inputClass} w-full`}>
              {zones.map((z) => (
                <option key={z.code} value={z.code}>{z.label}</option>
              ))}
            </select>
            <FieldHint>Zone de contrôle associée aux quotas (ex. La Bocca).</FieldHint>
          </label>
        </div>
      </div>

      <div className="mb-4 -mx-0.5 overflow-x-auto border-b border-gray-200">
        <div className="flex min-w-max gap-1 px-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-11 shrink-0 px-4 py-2 text-sm font-medium border-b-2 -mb-px sm:min-h-0 ${
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
          <NumberedSteps
            steps={[
              { title: "Choisir le périmètre", description: "Port, secteur ou espace ci-dessus." },
              { title: "Découper", description: "Découpez la plage en créneaux (15 à 120 min)." },
              { title: "Capacités", description: "Indiquez le max léger et lourd." },
              { title: "Confirmer", description: "Aperçu puis confirmation — rien n’est créé sans ça." },
            ]}
          />
          {!selectedScopeKey ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Choisissez d’abord un <strong>périmètre des quotas</strong> dans les filtres ci-dessus.
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h2 className="mb-1 flex items-center gap-2 font-semibold text-gray-900">
                  <Clock size={16} className="text-[#3F4660]" />
                  Horaires du planning — {formatCapacityScopeLabel(selectedScopeKey)}
                </h2>
                <p className="mb-2 text-xs text-gray-500">
                  Ces plages viennent de l’onglet Horaires. Les quotas se calquent dessus.
                </p>
                {gridLoading ? (
                  <LoaderRow />
                ) : planningRanges.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucune plage pour ce périmètre / phase.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-gray-700">
                    {planningRanges.map((r) => (
                      <li key={r.ruleId} className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs sm:text-sm">
                        {r.date} {r.startTime}–{r.endTime}
                        {!r.isActive && <span className="ml-2 font-sans text-amber-600">inactif</span>}
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
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-sm">
                      <span className="font-medium text-gray-700">Découpe</span>
                      <select
                        value={sliceMin}
                        onChange={(e) => setSliceMin(Number(e.target.value) as (typeof SLICE_OPTIONS)[number])}
                        className={`${inputClass} mt-1 w-full`}
                      >
                        {SLICE_OPTIONS.map((m) => (
                          <option key={m} value={m}>{m} minutes</option>
                        ))}
                      </select>
                      <FieldHint>Ex. 60 min découpe 08:00–12:00 en 4 créneaux d’une heure.</FieldHint>
                    </label>
                    <label className="text-sm">
                      <span className="font-medium text-gray-700">Max. véhicules légers</span>
                      <input
                        value={lightCap}
                        onChange={(e) => setLightCap(e.target.value)}
                        inputMode="numeric"
                        className={`${inputClass} mt-1 w-full`}
                      />
                      <FieldHint>Laisser vide pour ne pas créer de quota léger.</FieldHint>
                    </label>
                    <label className="text-sm">
                      <span className="font-medium text-gray-700">Max. véhicules lourds</span>
                      <input
                        value={heavyCap}
                        onChange={(e) => setHeavyCap(e.target.value)}
                        inputMode="numeric"
                        className={`${inputClass} mt-1 w-full`}
                      />
                      <FieldHint>Laisser vide pour ne pas créer de quota lourd.</FieldHint>
                    </label>
                    <div className="flex flex-col gap-2 sm:justify-end">
                      <button
                        type="button"
                        onClick={buildPreview}
                        className="min-h-11 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 sm:min-h-0"
                      >
                        1. Voir l’aperçu
                      </button>
                      <button
                        type="button"
                        disabled={!previewSlots.length || generating}
                        onClick={() => void confirmGenerate()}
                        className="min-h-11 rounded-lg bg-[#3F4660] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:min-h-0"
                      >
                        {generating ? "…" : "2. Confirmer la création"}
                      </button>
                    </div>
                  </div>
                  {previewSlots.length > 0 && (
                    <p className="mt-3 rounded-lg bg-[#3F4660]/5 px-3 py-2 text-xs text-[#3F4660]">
                      Aperçu : {previewSlots.slice(0, 5).map((s) => `${s.date} ${s.startTime}-${s.endTime}`).join(", ")}
                      {previewSlots.length > 5 ? ` … (+${previewSlots.length - 5})` : ""}
                    </p>
                  )}
                  {actionMsg && <p className="mt-2 text-sm text-gray-700">{actionMsg}</p>}
                </div>
              )}

              {/* Mobile cards */}
              <div className="space-y-2 md:hidden">
                {quotas.map((q) => (
                  <article key={q.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{q.date}</p>
                        <p className="font-mono text-xs text-gray-600">{q.startTime}–{q.endTime}</p>
                      </div>
                      <StatusBadge status={q.status} />
                    </div>
                    <p className="mt-2 text-sm text-gray-700">
                      {familyLabel(q.vehicleFamily)} ·{" "}
                      {q.hasQuota ? (
                        <>
                          {q.capacity} places · reste {q.remaining}
                        </>
                      ) : (
                        <span className="text-gray-400">Illimité</span>
                      )}
                    </p>
                    {canWriteQuotas && q.hasQuota && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="min-h-11 flex-1 rounded-lg border px-3 text-sm text-[#3F4660]"
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
                          className="min-h-11 flex-1 rounded-lg border border-red-200 px-3 text-sm text-red-600"
                          onClick={() => {
                            void deleteQuota(q.id).catch((err) =>
                              setActionMsg(err instanceof Error ? err.message : "Erreur")
                            );
                          }}
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </article>
                ))}
                {quotas.length === 0 && !gridLoading && (
                  <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
                    Aucun quota — sans capacité le créneau reste <strong>Illimité</strong>.
                  </p>
                )}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:block">
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
                        <td className="px-2 py-2">{familyLabel(q.vehicleFamily)}</td>
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
      {tab === "processus" && <VehicleProcessTab espace={espace} canWrite={canWriteQuotas} />}
    </div>
  );
}

type ProcessConfig = {
  family: "LIGHT" | "HEAVY";
  title: string;
  zoneCode: string | null;
  maxParkingMinutes: number | null;
  requiresReceiver: boolean;
  requiresHeavyUnloadingDetails: boolean;
  instructions: string[];
};

function VehicleProcessTab({ espace, canWrite }: { espace: string; canWrite: boolean }) {
  const [items, setItems] = useState<ProcessConfig[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<"LIGHT" | "HEAVY" | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(withEspaceQuery("/api/admin/rx-vehicle-process", espace));
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Chargement impossible");
      setItems(body.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    }
  }, [espace]);
  useEffect(() => { void load(); }, [load]);
  const patch = (family: ProcessConfig["family"], values: Partial<ProcessConfig>) =>
    setItems((previous) =>
      previous.map((item) => item.family === family ? { ...item, ...values } : item)
    );
  const save = async (item: ProcessConfig) => {
    setSaving(item.family);
    setError("");
    try {
      const response = await fetch(withEspaceQuery("/api/admin/rx-vehicle-process", espace), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Enregistrement impossible");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setSaving(null);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-600">Instructions affichées aux exposants selon la famille du véhicule.</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {(["LIGHT", "HEAVY"] as const).map((family) => {
        const item = items.find((value) => value.family === family);
        if (!item) return <LoaderRow key={family} />;
        return (
          <article key={family} className="rounded-lg border border-gray-200 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">Titre<input disabled={!canWrite} value={item.title} onChange={(e) => patch(family, { title: e.target.value })} className={`${inputClass} mt-1 w-full`} /></label>
              <label className="text-sm">Zone<input disabled={!canWrite} value={item.zoneCode ?? ""} onChange={(e) => patch(family, { zoneCode: e.target.value || null })} className={`${inputClass} mt-1 w-full`} /></label>
              <label className="text-sm">Durée max. (min)<input disabled={!canWrite} type="number" value={item.maxParkingMinutes ?? ""} onChange={(e) => patch(family, { maxParkingMinutes: e.target.value ? Number(e.target.value) : null })} className={`${inputClass} mt-1 w-full`} /></label>
              <label className="text-sm">Instructions (une par ligne)<textarea disabled={!canWrite} value={item.instructions.join("\n")} onChange={(e) => patch(family, { instructions: e.target.value.split("\n").filter(Boolean) })} className={`${inputClass} mt-1 min-h-24 w-full`} /></label>
            </div>
            {canWrite && <button type="button" disabled={saving === family} onClick={() => void save(item)} className="mt-3 rounded-lg bg-[#3F4660] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Enregistrer {family === "LIGHT" ? "léger" : "lourd"}</button>}
          </article>
        );
      })}
    </section>
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
    <form onSubmit={onSubmit} className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
      <p className="text-sm font-semibold text-gray-900">Nouvelle plage horaire</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          <span className="font-medium text-gray-700">Périmètre</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])} className={`${inputClass} mt-1 w-full`}>
            {SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700">Port</span>
          <input placeholder="si périmètre Port / Secteur" value={portCode} onChange={(e) => setPortCode(e.target.value)} className={`${inputClass} mt-1 w-full`} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700">Secteur</span>
          <input placeholder="si périmètre Secteur" value={sectorCode} onChange={(e) => setSectorCode(e.target.value)} className={`${inputClass} mt-1 w-full`} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700">Espace logistique</span>
          <input placeholder="si périmètre Espace" value={spaceCode} onChange={(e) => setSpaceCode(e.target.value)} className={`${inputClass} mt-1 w-full`} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700">Catégorie</span>
          <input placeholder="ALL, TERRE…" value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} className={`${inputClass} mt-1 w-full`} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700">Date</span>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} mt-1 w-full`} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700">Début</span>
          <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${inputClass} mt-1 w-full`} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700">Fin</span>
          <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className={`${inputClass} mt-1 w-full`} />
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-lg bg-[#3F4660] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:min-h-0"
        >
          {saving ? "…" : "Créer la plage"}
        </button>
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg border px-4 py-2 text-sm sm:min-h-0">
          Annuler
        </button>
      </div>
    </form>
  );
}
