"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, MapPin, Plus, Search, X } from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";

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
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Building2 size={21} className="text-[#3F4660]" />
            Exposants &amp; emplacements
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Référentiel RX des sociétés et de leurs emplacements logistiques.
          </p>
        </div>
        <button
          type="button"
          disabled={!eventId}
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#3F4660] px-4 py-2 text-sm font-semibold text-white hover:bg-[#343a52] disabled:opacity-50"
        >
          <Plus size={16} /> Nouvel exposant
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <Counter label="Exposants actifs" value={result.counters.exhibitors} icon={<Building2 size={18} />} />
        <Counter label="Emplacements actifs" value={result.counters.locations} icon={<MapPin size={18} />} />
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputClass}>
            {events.length === 0 && <option value="">Aucun événement RX</option>}
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
          <label className="relative lg:col-span-2">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Société ou emplacement" className={`${inputClass} w-full pl-9`} />
          </label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            <option value="">Tous types</option>
            <option value="TERRE">TERRE</option>
            <option value="FLOT">FLOT</option>
            <option value="STAND">STAND</option>
          </select>
          <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="Port" className={inputClass} />
          <input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Secteur" className={inputClass} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
            <option value="all">Tous statuts</option>
          </select>
          {knownSpaces.length > 0 && (
            <span className="self-center text-xs text-gray-400 sm:col-span-2 lg:col-span-5">
              Espaces visibles : {knownSpaces.join(", ")}
            </span>
          )}
        </div>
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

      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <span>{result.total} résultat{result.total > 1 ? "s" : ""}</span>
        <div className="flex items-center gap-2">
          <button className="rounded border px-3 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
          <span>{page} / {pageCount}</span>
          <button className="rounded border px-3 py-1.5 disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Suivant</button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Nouvel exposant</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input required placeholder="Raison sociale *" className={`${inputClass} sm:col-span-2`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Référence externe" className={`${inputClass} sm:col-span-2`} value={form.externalReference} onChange={(e) => setForm({ ...form, externalReference: e.target.value })} />
          <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option>TERRE</option><option>FLOT</option><option>STAND</option>
          </select>
          <input required placeholder="Code emplacement *" className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <input placeholder="Port" className={inputClass} value={form.portCode} onChange={(e) => setForm({ ...form, portCode: e.target.value })} />
          <input placeholder="Secteur" className={inputClass} value={form.sectorCode} onChange={(e) => setForm({ ...form, sectorCode: e.target.value })} />
          <input placeholder="Espace logistique" className={`${inputClass} sm:col-span-2`} value={form.logisticSpace} onChange={(e) => setForm({ ...form, logisticSpace: e.target.value })} />
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Annuler</button>
          <button disabled={saving} className="rounded-lg bg-[#3F4660] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Création…" : "Créer"}
          </button>
        </div>
      </form>
    </div>
  );
}
