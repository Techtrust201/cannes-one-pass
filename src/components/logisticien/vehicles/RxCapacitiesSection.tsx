"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Gauge,
  RefreshCw,
  PlusCircle,
  Check,
  X,
  Loader2,
  Pencil,
} from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { withEspaceQuery } from "@/lib/url";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RxQuota {
  id: number;
  organizationId: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  zone: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: "LIGHT" | "HEAVY";
  phase: "MONTAGE" | "DEMONTAGE";
  capacity: number;
  remaining: number;
  isFull: boolean;
}

interface EventOption {
  id: string;
  name: string;
  slug: string;
}

interface ApiResponse {
  quotas: RxQuota[];
  events: EventOption[];
}

interface RxCapacitiesSectionProps {
  canWrite: boolean;
}

// ── Constantes form ───────────────────────────────────────────────────────────

const ZONES = ["LA_BOCCA", "PALM_BEACH"] as const;
const FAMILIES = ["LIGHT", "HEAVY"] as const;
const PHASES = ["MONTAGE", "DEMONTAGE"] as const;

const ZONE_LABELS: Record<string, string> = {
  LA_BOCCA: "La Bocca",
  PALM_BEACH: "Palm Beach",
};

const FAMILY_LABELS: Record<string, string> = {
  LIGHT: "Léger",
  HEAVY: "Lourd",
};

const PHASE_LABELS: Record<string, string> = {
  MONTAGE: "Montage",
  DEMONTAGE: "Démontage",
};

function emptyForm() {
  return {
    eventId: "",
    zone: "LA_BOCCA" as string,
    date: "",
    startTime: "",
    endTime: "",
    vehicleFamily: "LIGHT" as string,
    phase: "MONTAGE" as string,
    capacity: "1",
  };
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function RxCapacitiesSection({
  canWrite,
}: RxCapacitiesSectionProps) {
  const espace = useEspaceSlug();

  const [quotas, setQuotas] = useState<RxQuota[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  // Édition inline de capacity par id
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCapacity, setEditCapacity] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const fetchQuotas = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(withEspaceQuery("/api/rx/capacities", espace));
      if (res.ok) {
        const data: ApiResponse = await res.json();
        setQuotas(data.quotas);
        setEvents(data.events);
      } else {
        setLoadError("Impossible de charger les quotas.");
      }
    } catch {
      setLoadError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }, [espace]);

  useEffect(() => {
    fetchQuotas();
  }, [fetchQuotas]);

  // ── Ajout / upsert ──────────────────────────────────────────────────────────

  const handleAdd = async () => {
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch(withEspaceQuery("/api/rx/capacities", espace), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          capacity: Math.round(Number(form.capacity)),
        }),
      });
      if (res.ok) {
        setShowAddForm(false);
        setForm(emptyForm());
        fetchQuotas();
      } else {
        const err = await res.json();
        setAddError(err.error || "Erreur lors de l'ajout");
      }
    } catch {
      setAddError("Erreur réseau");
    } finally {
      setAdding(false);
    }
  };

  // ── Édition inline capacity ─────────────────────────────────────────────────

  const startEdit = (q: RxQuota) => {
    setEditingId(q.id);
    setEditCapacity(String(q.capacity));
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditCapacity("");
    setEditError("");
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    const cap = Math.round(Number(editCapacity));
    if (!Number.isFinite(cap) || cap < 1) {
      setEditError("Entier >= 1 requis");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(withEspaceQuery("/api/rx/capacities", espace), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, capacity: cap }),
      });
      if (res.ok) {
        const updated: RxQuota = await res.json();
        setQuotas((prev) =>
          prev.map((q) => (q.id === updated.id ? updated : q))
        );
        cancelEdit();
      } else {
        const err = await res.json();
        setEditError(err.error || "Erreur sauvegarde");
      }
    } catch {
      setEditError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  // ── Rendu ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* En-tête */}
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#4F587E] rounded-full" />
            <h2 className="text-base font-bold text-gray-800">Capacités RX</h2>
            {!loading && (
              <span className="text-xs text-gray-400 font-medium ml-1">
                {quotas.length} quota{quotas.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 ml-5">
            Gérer les places disponibles par zone, créneau, phase et type de
            véhicule.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchQuotas}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 bg-white rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
            title="Rafraîchir"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Rafraîchir</span>
          </button>
          {canWrite && (
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                setAddError("");
                setForm(emptyForm());
              }}
              className="flex items-center gap-2 px-3 py-2 bg-[#4F587E] text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-[#3B4252] transition shadow-sm"
            >
              <PlusCircle size={14} />
              <span className="hidden sm:inline">Ajouter un quota</span>
              <span className="sm:hidden">Ajouter</span>
            </button>
          )}
        </div>
      </div>

      {/* Formulaire ajout */}
      {showAddForm && canWrite && (
        <div className="mb-6 bg-white rounded-2xl border-2 border-dashed border-[#4F587E]/30 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <PlusCircle size={16} className="text-[#4F587E]" />
            Ajouter / mettre à jour un quota
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {/* Événement */}
            <div className="col-span-2 sm:col-span-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Événement
              </label>
              <select
                value={form.eventId}
                onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
              >
                <option value="">— Choisir un événement —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Zone */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Zone
              </label>
              <select
                value={form.zone}
                onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
              >
                {ZONES.map((z) => (
                  <option key={z} value={z}>
                    {ZONE_LABELS[z]}
                  </option>
                ))}
              </select>
            </div>
            {/* Phase */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Phase
              </label>
              <select
                value={form.phase}
                onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
              >
                {PHASES.map((p) => (
                  <option key={p} value={p}>
                    {PHASE_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            {/* Type véhicule */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Type
              </label>
              <select
                value={form.vehicleFamily}
                onChange={(e) => setForm((f) => ({ ...f, vehicleFamily: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
              >
                {FAMILIES.map((fam) => (
                  <option key={fam} value={fam}>
                    {FAMILY_LABELS[fam]}
                  </option>
                ))}
              </select>
            </div>
            {/* Capacité */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Capacité
              </label>
              <input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
              />
            </div>
            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
              />
            </div>
            {/* Début */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Début (HH:MM)
              </label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
              />
            </div>
            {/* Fin */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Fin (HH:MM)
              </label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
              />
            </div>
          </div>

          {addError && (
            <p className="text-red-500 text-xs mb-3">{addError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !form.eventId || !form.date}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#4F587E] text-white rounded-lg text-sm font-semibold hover:bg-[#3B4252] transition disabled:opacity-50"
            >
              {adding ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Ajouter / mettre à jour
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setForm(emptyForm());
                setAddError("");
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300 transition"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Corps */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="animate-spin mr-2" size={20} /> Chargement…
        </div>
      ) : loadError ? (
        <div className="py-12 text-center text-red-500 text-sm">{loadError}</div>
      ) : quotas.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Gauge size={40} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-sm font-semibold text-gray-500">
            Aucun quota configuré
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {canWrite
              ? "Cliquez sur « Ajouter un quota » pour créer le premier créneau."
              : "Aucun quota RX n'est configuré pour cet espace."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Événement</th>
                  <th className="text-left px-4 py-3 font-medium">Zone</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Créneau</th>
                  <th className="text-left px-4 py-3 font-medium">Phase</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-right px-4 py-3 font-medium">Capacité</th>
                  <th className="text-right px-4 py-3 font-medium">Restant</th>
                  <th className="text-left px-4 py-3 font-medium">Statut</th>
                  {canWrite && (
                    <th className="text-left px-4 py-3 font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {quotas.map((q) => {
                  const isEditing = editingId === q.id;
                  return (
                    <tr
                      key={q.id}
                      className={`transition-colors ${
                        isEditing ? "bg-[#4F587E]/5" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">
                        {q.eventName}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {ZONE_LABELS[q.zone] ?? q.zone}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">
                        {q.date}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">
                        {q.startTime}–{q.endTime}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                            q.phase === "MONTAGE"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-purple-50 text-purple-700"
                          }`}
                        >
                          {PHASE_LABELS[q.phase]}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                            q.vehicleFamily === "LIGHT"
                              ? "bg-gray-100 text-gray-700"
                              : "bg-gray-200 text-gray-800"
                          }`}
                        >
                          {FAMILY_LABELS[q.vehicleFamily]}
                        </span>
                      </td>

                      {/* Capacité : champ éditable inline */}
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              min={1}
                              value={editCapacity}
                              onChange={(e) => {
                                setEditCapacity(e.target.value);
                                setEditError("");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                                if (e.key === "Escape") cancelEdit();
                              }}
                              className="w-20 px-2 py-1 border border-[#4F587E] rounded text-sm text-right focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                              autoFocus
                            />
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="p-1.5 rounded bg-[#4F587E] text-white hover:bg-[#3B4252] transition disabled:opacity-50"
                              title="Enregistrer"
                            >
                              {saving ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Check size={12} />
                              )}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                              title="Annuler"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold text-gray-800">
                            {q.capacity}
                          </span>
                        )}
                        {isEditing && editError && (
                          <p className="text-red-500 text-xs mt-1 text-right">
                            {editError}
                          </p>
                        )}
                      </td>

                      {/* Restant */}
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-semibold ${
                            q.isFull ? "text-orange-600" : "text-teal-600"
                          }`}
                        >
                          {q.remaining}
                        </span>
                      </td>

                      {/* Statut */}
                      <td className="px-4 py-3">
                        {q.isFull ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            Complet
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">
                            Disponible
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      {canWrite && (
                        <td className="px-4 py-3">
                          {!isEditing && (
                            <button
                              onClick={() => startEdit(q)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-[#4F587E] hover:bg-gray-100 transition"
                              title="Modifier la capacité"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
