"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, MapPin, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import PageHelp from "@/components/logisticien/help/PageHelp";
import FieldHint from "@/components/logisticien/help/FieldHint";
import Glossary from "@/components/logisticien/help/Glossary";

type EventOption = { id: string; name: string; startDate: string; endDate: string };
type Location = {
  id: string;
  type: "TERRE" | "FLOT" | "STAND";
  code: string;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
  isActive: boolean;
};
type Exhibitor = {
  id: string;
  name: string;
  externalReference: string | null;
  isActive: boolean;
  stand: string;
  sector: string | null;
  zone: string | null;
  locationsCount: number;
  locations: Location[];
};
type Result = {
  items: Exhibitor[];
  total: number;
  page: number;
  pageSize: number;
  counters: { exhibitors: number; locations: number };
};

const EMPTY: Result = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
  counters: { exhibitors: 0, locations: 0 },
};

export default function ExhibitorsExplorer({ events }: { events: EventOption[] }) {
  const espace = useEspaceSlug();
  const inputClass =
    "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3F4660] focus:ring-1 focus:ring-[#3F4660]";
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [port, setPort] = useState("");
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => setPage(1), [eventId, q, type, port, sector, status]);

  useEffect(() => {
    if (espace !== "rx" || !eventId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        espace,
        eventId,
        status,
        page: String(page),
        pageSize: "25",
      });
      if (q) params.set("q", q);
      if (type) params.set("type", type);
      if (port) params.set("port", port);
      if (sector) params.set("sector", sector);
      try {
        const response = await fetch(
          `/api/admin/referential/exhibitors?${params.toString()}`,
          { signal: controller.signal }
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Chargement impossible");
        setResult(body);
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(fetchError instanceof Error ? fetchError.message : "Erreur réseau");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [espace, eventId, q, type, port, sector, status, page, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const knownSpaces = useMemo(
    () =>
      [...new Set(result.items.flatMap((item) => item.locations.map((l) => l.logisticSpace)).filter(Boolean))] as string[],
    [result.items]
  );

  if (espace !== "rx") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Ce module est réservé à l&apos;espace RX.
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900 sm:text-xl">
            <Building2 size={21} className="shrink-0 text-[#3F4660]" />
            Exposants &amp; emplacements
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Retrouvez une société, corrigez un emplacement, activez ou désactivez.
          </p>
        </div>
        <button
          type="button"
          disabled={!eventId}
          onClick={() => setShowCreate(true)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#3F4660] px-4 py-2 text-sm font-semibold text-white hover:bg-[#343a52] disabled:opacity-50 sm:w-auto sm:min-h-0"
        >
          <Plus size={16} /> Nouvel exposant
        </button>
      </div>

      <PageHelp storageKey="rx-referentiel" glossaryId="lexique-referentiel">
        <p>
          Ici vous gérez les <strong>sociétés exposantes</strong> et leurs{" "}
          <strong>emplacements</strong> (terre, flot, stand).
        </p>
        <p>
          Pour corriger un code (ex. POWER215) : ouvrez l’exposant → Emplacements → Modifier.
          Pour retirer un emplacement sans le perdre : désactivez-le.
        </p>
      </PageHelp>

      <Glossary
        id="lexique-referentiel"
        title="Lexique — Exposants"
        terms={[
          { term: "Emplacement TERRE", definition: "Place à terre (numéro terre / zone terre-terre)." },
          { term: "Emplacement FLOT", definition: "Place à flot (ponton, numéro flot)." },
          { term: "Emplacement STAND", definition: "Stand ou espace d’exposition lié à une société." },
          {
            term: "Désactiver",
            definition:
              "L’emplacement n’est plus proposé dans le formulaire, mais reste en base (pas de suppression définitive).",
          },
        ]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <Counter label="Exposants actifs" value={result.counters.exhibitors} icon={<Building2 size={18} />} />
        <Counter label="Emplacements actifs" value={result.counters.locations} icon={<MapPin size={18} />} />
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block font-medium text-gray-700">Événement</span>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={`${inputClass} w-full`}>
              {events.length === 0 && <option value="">Aucun événement RX</option>}
              {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </label>
          <label className="relative block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Recherche</span>
            <Search size={15} className="absolute left-3 top-9 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Société ou code emplacement"
              className={`${inputClass} w-full pl-9`}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto sm:min-h-0"
        >
          <SlidersHorizontal size={15} />
          {showFilters ? "Masquer les filtres" : "Filtres"}
        </button>
        {showFilters && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} w-full`}>
                <option value="">Tous types</option>
                <option value="TERRE">Terre</option>
                <option value="FLOT">Flot</option>
                <option value="STAND">Stand</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Port</span>
              <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="ex. PORT_CANTO" className={`${inputClass} w-full`} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Secteur</span>
              <input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="ex. POWER" className={`${inputClass} w-full`} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Statut</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-full`}>
                <option value="active">Actifs</option>
                <option value="inactive">Inactifs</option>
                <option value="all">Tous</option>
              </select>
            </label>
          </div>
        )}
        {knownSpaces.length > 0 && (
          <p className="mt-2 text-xs text-gray-400">Espaces visibles : {knownSpaces.join(", ")}</p>
        )}
      </div>

      {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Chargement…</div>
        ) : result.items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">Aucun exposant trouvé.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {result.items.map((item) => (
              <Link
                key={item.id}
                href={`/logisticien/referentiel/${item.id}?espace=rx`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-gray-900">{item.name}</span>
                    {!item.isActive && <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">INACTIF</span>}
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {item.locations.map((location) => `${location.type} · ${location.code}`).join("  |  ") || "Aucun emplacement"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#3F4660]/10 px-2.5 py-1 text-xs font-semibold text-[#3F4660]">
                  {item.locationsCount}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <span>{result.total} résultat{result.total > 1 ? "s" : ""}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="min-h-11 flex-1 rounded-lg border px-3 py-2 disabled:opacity-40 sm:min-h-0 sm:flex-none"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </button>
          <span className="shrink-0">{page} / {pageCount}</span>
          <button
            type="button"
            className="min-h-11 flex-1 rounded-lg border px-3 py-2 disabled:opacity-40 sm:min-h-0 sm:flex-none"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateModal
          eventId={eventId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setRefreshKey((key) => key + 1);
          }}
        />
      )}
    </>
  );
}

function Counter({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[#3F4660]">{icon}<span className="text-2xl font-bold">{value}</span></div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );
}

function CreateModal({
  eventId,
  onClose,
  onCreated,
}: {
  eventId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "", externalReference: "", type: "TERRE", code: "", portCode: "", sectorCode: "", logisticSpace: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputClass =
    "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3F4660] focus:ring-1 focus:ring-[#3F4660]";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/referential/exhibitors?espace=rx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId,
          name: form.name,
          externalReference: form.externalReference,
          locations: [{
            type: form.type,
            code: form.code,
            portCode: form.portCode,
            sectorCode: form.sectorCode,
            logisticSpace: form.logisticSpace,
          }],
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Création impossible");
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <form
        onSubmit={submit}
        className="flex max-h-[95dvh] w-full max-w-xl flex-col overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        style={{ paddingBottom: "max(1.25rem, var(--safe-bottom))" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Nouvel exposant</h2>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center text-gray-400 hover:text-gray-700" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Un exposant nécessite au moins un emplacement (terre, flot ou stand).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm">
            <span className="mb-1 block font-medium text-gray-700">Raison sociale *</span>
            <input required className={`${inputClass} w-full`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="sm:col-span-2 text-sm">
            <span className="mb-1 block font-medium text-gray-700">Référence externe</span>
            <input className={`${inputClass} w-full`} value={form.externalReference} onChange={(e) => setForm({ ...form, externalReference: e.target.value })} />
            <FieldHint>Identifiant optionnel (fichier client, ERP…).</FieldHint>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Type d’emplacement</span>
            <select className={`${inputClass} w-full`} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="TERRE">Terre</option>
              <option value="FLOT">Flot</option>
              <option value="STAND">Stand</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Code emplacement *</span>
            <input required className={`${inputClass} w-full`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <FieldHint>Ex. POWER215, QML12…</FieldHint>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Port</span>
            <input className={`${inputClass} w-full`} value={form.portCode} onChange={(e) => setForm({ ...form, portCode: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Secteur</span>
            <input className={`${inputClass} w-full`} value={form.sectorCode} onChange={(e) => setForm({ ...form, sectorCode: e.target.value })} />
          </label>
          <label className="sm:col-span-2 text-sm">
            <span className="mb-1 block font-medium text-gray-700">Espace logistique</span>
            <input className={`${inputClass} w-full`} value={form.logisticSpace} onChange={(e) => setForm({ ...form, logisticSpace: e.target.value })} />
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border px-4 py-2 text-sm sm:min-h-0">Annuler</button>
          <button disabled={saving} className="min-h-11 rounded-lg bg-[#3F4660] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:min-h-0">
            {saving ? "Création…" : "Créer"}
          </button>
        </div>
      </form>
    </div>
  );
}
