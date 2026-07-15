"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, MapPin, Pencil, Plus, X } from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";

type Location = {
  id: string;
  type: "TERRE" | "FLOT" | "STAND";
  code: string;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
  isActive: boolean;
};
type FormState = {
  type: Location["type"];
  code: string;
  portCode: string;
  sectorCode: string;
  logisticSpace: string;
};
type Warning = { exhibitorIds: string[]; codes: string[] };

const EMPTY_FORM: FormState = {
  type: "TERRE",
  code: "",
  portCode: "",
  sectorCode: "",
  logisticSpace: "",
};

export default function ExhibitorLocationsPanel({
  exhibitorId,
  initialLocations,
}: {
  exhibitorId: string;
  initialLocations: Location[];
}) {
  const espace = useEspaceSlug();
  const [locations, setLocations] = useState(initialLocations);
  const [editing, setEditing] = useState<Location | "new" | null>(null);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [error, setError] = useState("");

  if (espace !== "rx") return null;

  async function toggle(location: Location) {
    setError("");
    const response = await fetch(
      `/api/admin/referential/locations/${location.id}?espace=rx`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !location.isActive }),
      }
    );
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Modification impossible");
      return;
    }
    setLocations((items) =>
      items.map((item) => (item.id === location.id ? body.location : item))
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Emplacements</h2>
          <p className="text-xs text-gray-500">Aucune suppression définitive : désactivez un emplacement si nécessaire.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-lg bg-[#3F4660] px-3 py-2 text-sm font-semibold text-white hover:bg-[#343a52]"
        >
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {warning && (
        <div className="mb-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <strong>Collision d&apos;emplacement détectée.</strong>
            <div>Codes : {warning.codes.join(", ")} · Autres exposants : {warning.exhibitorIds.join(", ")}</div>
          </div>
          <button type="button" onClick={() => setWarning(null)} className="ml-auto self-start"><X size={16} /></button>
        </div>
      )}
      {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {locations.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Aucun emplacement.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {locations.map((location) => (
              <div key={location.id} className={`flex items-center gap-3 p-4 ${location.isActive ? "" : "bg-gray-50 opacity-65"}`}>
                <div className="rounded-lg bg-[#3F4660]/10 p-2 text-[#3F4660]"><MapPin size={17} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-gray-900">{location.code}</strong>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{location.type}</span>
                    {!location.isActive && <span className="text-[10px] font-semibold text-gray-400">INACTIF</span>}
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {[location.portCode, location.sectorCode, location.logisticSpace].filter(Boolean).join(" · ") || "Sans détail logistique"}
                  </p>
                </div>
                <button type="button" onClick={() => setEditing(location)} title="Modifier" className="rounded-lg border p-2 text-gray-500 hover:text-[#3F4660]"><Pencil size={15} /></button>
                <button
                  type="button"
                  onClick={() => void toggle(location)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${location.isActive ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-700"}`}
                >
                  {location.isActive ? "Désactiver" : "Réactiver"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <LocationModal
          exhibitorId={exhibitorId}
          location={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(location, collision) => {
            setLocations((items) =>
              editing === "new"
                ? [...items, location]
                : items.map((item) => (item.id === location.id ? location : item))
            );
            setWarning(collision ?? null);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function LocationModal({
  exhibitorId,
  location,
  onClose,
  onSaved,
}: {
  exhibitorId: string;
  location: Location | null;
  onClose: () => void;
  onSaved: (location: Location, warning?: Warning) => void;
}) {
  const [form, setForm] = useState<FormState>(
    location
      ? {
          type: location.type,
          code: location.code,
          portCode: location.portCode ?? "",
          sectorCode: location.sectorCode ?? "",
          logisticSpace: location.logisticSpace ?? "",
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputClass =
    "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3F4660] focus:ring-1 focus:ring-[#3F4660]";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const url = location
        ? `/api/admin/referential/locations/${location.id}?espace=rx`
        : `/api/admin/referential/exhibitors/${exhibitorId}/locations?espace=rx`;
      const response = await fetch(url, {
        method: location ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Enregistrement impossible");
      onSaved(body.location, body.collisionWarning);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{location ? "Modifier l'emplacement" : "Ajouter un emplacement"}</h3>
          <button type="button" onClick={onClose} className="text-gray-400"><X size={20} /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Location["type"] })}>
            <option>TERRE</option><option>FLOT</option><option>STAND</option>
          </select>
          <input required className={inputClass} placeholder="Code *" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <input className={inputClass} placeholder="Port" value={form.portCode} onChange={(e) => setForm({ ...form, portCode: e.target.value })} />
          <input className={inputClass} placeholder="Secteur" value={form.sectorCode} onChange={(e) => setForm({ ...form, sectorCode: e.target.value })} />
          <input className={`${inputClass} sm:col-span-2`} placeholder="Espace logistique" value={form.logisticSpace} onChange={(e) => setForm({ ...form, logisticSpace: e.target.value })} />
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Annuler</button>
          <button disabled={saving} className="rounded-lg bg-[#3F4660] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}
