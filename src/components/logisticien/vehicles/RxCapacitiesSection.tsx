"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Gauge,
  RefreshCw,
  PlusCircle,
  Check,
  X,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { withEspaceQuery } from "@/lib/url";
import { formatVehicleDate } from "@/lib/date-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Quota {
  id: number;
  organizationId: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  zone: string;
  zoneLabel: string;
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

interface ZoneOption {
  code: string;
  label: string;
}

interface ApiResponse {
  quotas: Quota[];
  events: EventOption[];
  zones: ZoneOption[];
}

interface RxCapacitiesSectionProps {
  canWrite: boolean;
}

// ── Constantes form ───────────────────────────────────────────────────────────

const FAMILIES = ["LIGHT", "HEAVY"] as const;
const PHASES = ["MONTAGE", "DEMONTAGE"] as const;

const FAMILY_LABELS: Record<string, string> = {
  LIGHT: "Véhicules légers",
  HEAVY: "Poids lourds",
};

const PHASE_LABELS: Record<string, string> = {
  MONTAGE: "Montage",
  DEMONTAGE: "Démontage",
};

const TIME_RE = /^\d{2}:\d{2}$/;

/** "HH:MM" → minutes depuis minuit (comparaison horaire fiable). */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function emptyForm() {
  return {
    eventId: "",
    zone: "" as string,
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

  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  // Édition inline de capacity par id
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCapacity, setEditCapacity] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Ref pour le live léger : ne pas écraser une édition en cours au refresh.
  const editingIdRef = useRef<number | null>(null);
  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  const fetchQuotas = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(withEspaceQuery("/api/capacities", espace));
      if (res.ok) {
        const data: ApiResponse = await res.json();
        setQuotas(data.quotas);
        setEvents(data.events);
        setZones(data.zones ?? []);
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

  // ── Live léger : refresh au retour focus / visible / online ──────────────────
  // Aucun polling. On ne fetch pas si l'onglet est caché ou si une édition est
  // en cours (pour ne pas écraser la saisie de l'utilisateur).
  useEffect(() => {
    const maybeRefresh = () => {
      if (document.hidden) return;
      if (editingIdRef.current !== null) return;
      fetchQuotas();
    };
    const onVisibility = () => {
      if (!document.hidden) maybeRefresh();
    };
    window.addEventListener("focus", maybeRefresh);
    window.addEventListener("online", maybeRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      window.removeEventListener("online", maybeRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchQuotas]);

  // ── Zones asynchrones : garantir une zone valide sélectionnée ────────────────
  useEffect(() => {
    if (zones.length === 0) return;
    setForm((f) => {
      if (f.zone && zones.some((z) => z.code === f.zone)) return f;
      return { ...f, zone: zones[0].code };
    });
  }, [zones]);

  const noZones = zones.length === 0;
  const timeRangeValid =
    TIME_RE.test(form.startTime) &&
    TIME_RE.test(form.endTime) &&
    timeToMinutes(form.endTime) > timeToMinutes(form.startTime);
  const timeRangeShown =
    !!form.startTime && !!form.endTime && !timeRangeValid;

  // ── Ajout / upsert ──────────────────────────────────────────────────────────

  const handleAdd = async () => {
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch(withEspaceQuery("/api/capacities", espace), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          capacity: Number(form.capacity),
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

  const startEdit = (q: Quota) => {
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
    const cap = Number(editCapacity);
    if (!Number.isInteger(cap) || cap < 1) {
      setEditError("Entier >= 1 requis");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(withEspaceQuery("/api/capacities", espace), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, capacity: cap }),
      });
      if (res.ok) {
        const updated: Quota = await res.json();
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

  // ── Suppression ──────────────────────────────────────────────────────────────

  const handleDelete = async (q: Quota) => {
    const ok = window.confirm(
      "Supprimer ce quota ? Le créneau ne sera plus limité et ne bloquera plus les demandes."
    );
    if (!ok) return;
    setActionError("");
    setDeletingId(q.id);
    try {
      const res = await fetch(withEspaceQuery("/api/capacities", espace), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: q.id }),
      });
      if (res.ok) {
        // Refresh complet pour recalculer remaining/isFull proprement.
        fetchQuotas();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error || "Suppression impossible.");
      }
    } catch {
      setActionError("Erreur réseau lors de la suppression.");
    } finally {
      setDeletingId(null);
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
            <h2 className="text-base font-bold text-gray-800">
              Capacités véhicules
            </h2>
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
          <p className="text-[11px] text-gray-400 mt-1 ml-5">
            Le calcul des capacités dépend des dates, créneaux et zones
            renseignés sur les accréditations.
          </p>
          <p className="text-[11px] text-gray-400 mt-1 ml-5">
            Si aucun quota n&apos;est configuré pour un créneau, les demandes
            restent libres comme avant.
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

      {actionError && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
          {actionError}
        </div>
      )}

      {/* Formulaire ajout */}
      {showAddForm && canWrite && (
        <div className="mb-6 bg-white rounded-2xl border-2 border-dashed border-[#4F587E]/30 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <PlusCircle size={16} className="text-[#4F587E]" />
            Ajouter / mettre à jour un quota
          </h3>

          {noZones && (
            <p className="mb-4 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
              Aucune zone active n&apos;est configurée pour cet espace.
            </p>
          )}

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
                disabled={noZones}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
              >
                {noZones ? (
                  <option value="">— Aucune zone —</option>
                ) : (
                  zones.map((z) => (
                    <option key={z.code} value={z.code}>
                      {z.label}
                    </option>
                  ))
                )}
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
                step={1}
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

          {timeRangeShown && (
            <p className="text-amber-600 text-xs mb-3">
              L&apos;heure de fin doit être strictement après l&apos;heure de
              début.
            </p>
          )}
          {addError && (
            <p className="text-red-500 text-xs mb-3">{addError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={
                adding ||
                !form.eventId ||
                !form.date ||
                noZones ||
                !form.zone ||
                !timeRangeValid
              }
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
              : "Aucun quota n'est configuré pour cet espace."}
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
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
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
                        {q.zoneLabel ?? q.zone}
                      </td>
                      <td
                        className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs"
                        title={q.date}
                      >
                        {formatVehicleDate(q.date)}
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
                              step={1}
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
                        {q.remaining < 0 ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              Quota dépassé
                            </span>
                            <p className="text-[10px] text-red-600 mt-1 max-w-[220px] leading-snug">
                              Quota déjà dépassé de {Math.abs(q.remaining)} véhicule
                              {Math.abs(q.remaining) > 1 ? "s" : ""}. Les demandes
                              existantes sont conservées, mais les nouvelles
                              demandes seront bloquées.
                            </p>
                          </div>
                        ) : q.isFull ? (
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
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEdit(q)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-[#4F587E] hover:bg-gray-100 transition"
                                title="Modifier la capacité"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(q)}
                                disabled={deletingId === q.id}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                title="Supprimer le quota"
                              >
                                {deletingId === q.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            </div>
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
