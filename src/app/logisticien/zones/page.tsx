"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MapPin,
  Pencil,
  Check,
  X,
  Navigation,
  Globe,
  RotateCcw,
  Loader2,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { invalidateZoneCache } from "@/lib/zone-utils";

interface ZoneData {
  id: number;
  zone: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  isFinalDestination: boolean;
  color: string;
  isActive: boolean;
}

// Coordonnées du Palais des Festivals (référence)
const PALAIS = { lat: 43.5506, lng: 7.0175 };

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceToPalais(lat: number, lng: number): string {
  const d = haversine(lat, lng, PALAIS.lat, PALAIS.lng);
  if (d < 1) return `${Math.round(d * 1000)} m`;
  return `${d.toFixed(1)} km`;
}

/** Palette de couleurs disponibles */
const COLOR_OPTIONS = [
  { value: "orange", label: "Orange", classes: { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", accent: "bg-orange-500", dot: "bg-orange-400" } },
  { value: "green", label: "Vert", classes: { bg: "bg-green-50", border: "border-green-300", text: "text-green-800", accent: "bg-green-500", dot: "bg-green-400" } },
  { value: "blue", label: "Bleu", classes: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-800", accent: "bg-blue-500", dot: "bg-blue-400" } },
  { value: "purple", label: "Violet", classes: { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", accent: "bg-purple-500", dot: "bg-purple-400" } },
  { value: "red", label: "Rouge", classes: { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", accent: "bg-red-500", dot: "bg-red-400" } },
  { value: "yellow", label: "Jaune", classes: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", accent: "bg-yellow-500", dot: "bg-yellow-400" } },
  { value: "pink", label: "Rose", classes: { bg: "bg-pink-50", border: "border-pink-300", text: "text-pink-800", accent: "bg-pink-500", dot: "bg-pink-400" } },
  { value: "indigo", label: "Indigo", classes: { bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-800", accent: "bg-indigo-500", dot: "bg-indigo-400" } },
  { value: "teal", label: "Teal", classes: { bg: "bg-teal-50", border: "border-teal-300", text: "text-teal-800", accent: "bg-teal-500", dot: "bg-teal-400" } },
  { value: "gray", label: "Gris", classes: { bg: "bg-gray-50", border: "border-gray-300", text: "text-gray-800", accent: "bg-gray-500", dot: "bg-gray-400" } },
];

function getColors(colorName: string) {
  const opt = COLOR_OPTIONS.find((c) => c.value === colorName);
  return opt?.classes || COLOR_OPTIONS[COLOR_OPTIONS.length - 1].classes;
}

export default function ZonesPage() {
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<ZoneData>>({});
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    label: "",
    address: "",
    latitude: "",
    longitude: "",
    isFinalDestination: false,
    color: "gray",
  });
  const [creating, setCreating] = useState(false);
  const [geocoding, setGeocoding] = useState<"create" | "edit" | null>(null);

  /** Forward geocoding : adresse → lat/lng */
  const geocodeAddress = async (address: string, target: "create" | "edit") => {
    if (!address.trim()) return;
    setGeocoding(target);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
      if (res.ok) {
        const data = await res.json();
        if (target === "create") {
          setCreateForm((f) => ({
            ...f,
            latitude: String(data.latitude),
            longitude: String(data.longitude),
          }));
        } else {
          setEditForm((f) => ({
            ...f,
            latitude: data.latitude,
            longitude: data.longitude,
          }));
        }
      } else {
        alert("Adresse non trouvée — vérifiez l'orthographe");
      }
    } catch {
      alert("Erreur de géocodage");
    } finally {
      setGeocoding(null);
    }
  };

  /** Reverse geocoding : lat/lng → adresse */
  const reverseGeocode = async (lat: number, lng: number, target: "create" | "edit") => {
    if (!lat || !lng) return;
    setGeocoding(target);
    try {
      const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      if (res.ok) {
        const data = await res.json();
        if (target === "create") {
          setCreateForm((f) => ({ ...f, address: data.address }));
        } else {
          setEditForm((f) => ({ ...f, address: data.address }));
        }
      } else {
        alert("Coordonnées non trouvées");
      }
    } catch {
      alert("Erreur de géocodage inverse");
    } finally {
      setGeocoding(null);
    }
  };

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch("/api/zones");
      if (res.ok) {
        const data = await res.json();
        setZones(data);
      }
    } catch (err) {
      console.error("Erreur chargement zones:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const startEdit = (zone: ZoneData) => {
    setEditingId(zone.id);
    setEditForm({
      label: zone.label,
      address: zone.address,
      latitude: zone.latitude,
      longitude: zone.longitude,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/zones/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingId(null);
        setEditForm({});
        invalidateZoneCache();
        fetchZones();
      } else {
        alert("Erreur lors de la sauvegarde");
      }
    } catch {
      alert("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateZone = async () => {
    if (!createForm.label || !createForm.address || !createForm.latitude || !createForm.longitude) {
      alert("Tous les champs sont requis");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone: createForm.label,
          label: createForm.label,
          address: createForm.address,
          latitude: parseFloat(createForm.latitude),
          longitude: parseFloat(createForm.longitude),
          isFinalDestination: createForm.isFinalDestination,
          color: createForm.color,
        }),
      });
      if (res.ok) {
        setShowCreateForm(false);
        setCreateForm({ label: "", address: "", latitude: "", longitude: "", isFinalDestination: false, color: "gray" });
        invalidateZoneCache();
        fetchZones();
      } else {
        const err = await res.json();
        alert(err.error || "Erreur lors de la création");
      }
    } catch {
      alert("Erreur réseau");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteZone = async (id: number) => {
    if (!confirm("Désactiver cette zone ? Elle ne sera plus utilisable mais restera dans l'historique.")) return;
    try {
      const res = await fetch(`/api/zones/${id}`, { method: "DELETE" });
      if (res.ok) {
        invalidateZoneCache();
        fetchZones();
      }
    } catch {
      alert("Erreur réseau");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="animate-spin" size={24} />
          <span>Chargement des zones...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#4F587E] rounded-xl text-white">
              <MapPin size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Gestion des zones</h1>
              <p className="text-sm text-gray-500">
                Configurez les adresses et coordonnées GPS des zones de stationnement
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#4F587E] text-white rounded-xl text-sm font-semibold hover:bg-[#3B4252] transition shadow-md"
          >
            <PlusCircle size={16} />
            Nouvelle zone
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="max-w-6xl mx-auto mb-8">
          <div className="bg-white rounded-2xl border-2 border-dashed border-[#4F587E]/30 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <PlusCircle size={18} className="text-[#4F587E]" />
              Créer une nouvelle zone
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nom de la zone *</label>
                <input
                  type="text"
                  value={createForm.label}
                  onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
                  placeholder="ex: Zone Nord"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Adresse complète *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={createForm.address}
                    onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                    placeholder="ex: Rue de la Zone, 06400 Cannes"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => geocodeAddress(createForm.address, "create")}
                    disabled={geocoding === "create" || !createForm.address.trim()}
                    className="flex items-center gap-1 px-3 py-2 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold hover:bg-amber-200 transition disabled:opacity-40"
                    title="Rechercher les coordonnées GPS à partir de l'adresse"
                  >
                    {geocoding === "create" ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
                    GPS
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Latitude *</label>
                <input
                  type="number"
                  step="0.0001"
                  value={createForm.latitude}
                  onChange={(e) => setCreateForm({ ...createForm, latitude: e.target.value })}
                  placeholder="ex: 43.5506"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Longitude *</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    value={createForm.longitude}
                    onChange={(e) => setCreateForm({ ...createForm, longitude: e.target.value })}
                    placeholder="ex: 7.0175"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => reverseGeocode(parseFloat(createForm.latitude), parseFloat(createForm.longitude), "create")}
                    disabled={geocoding === "create" || !createForm.latitude || !createForm.longitude}
                    className="flex items-center gap-1 px-3 py-2 bg-blue-100 text-blue-800 border border-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-200 transition disabled:opacity-40"
                    title="Rechercher l'adresse à partir des coordonnées GPS"
                  >
                    {geocoding === "create" ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                    Adresse
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Couleur</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, color: c.value })}
                      className={`w-8 h-8 rounded-full border-2 transition ${c.classes.accent} ${
                        createForm.color === c.value ? "ring-2 ring-offset-2 ring-[#4F587E] border-white" : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 self-end">
                <input
                  type="checkbox"
                  id="isFinal"
                  checked={createForm.isFinalDestination}
                  onChange={(e) => setCreateForm({ ...createForm, isFinalDestination: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-[#4F587E] focus:ring-[#4F587E]"
                />
                <label htmlFor="isFinal" className="text-sm font-medium text-gray-700">
                  Destination finale
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateZone}
                disabled={creating}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#4F587E] text-white rounded-lg text-sm font-semibold hover:bg-[#3B4252] transition disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Créer la zone
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300 transition"
              >
                <X size={14} />
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zone cards grid */}
      <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-2">
        {zones.filter(z => z.isActive).map((zone) => {
          const colors = getColors(zone.color);
          const isEditing = editingId === zone.id;
          const dist = distanceToPalais(zone.latitude, zone.longitude);

          return (
            <div
              key={zone.id}
              className={`relative rounded-2xl border-2 ${colors.border} ${colors.bg} shadow-sm overflow-hidden transition-all ${
                isEditing ? "ring-2 ring-[#4F587E] ring-offset-2" : "hover:shadow-md"
              }`}
            >
              {/* Color accent bar */}
              <div className={`h-1.5 ${colors.accent}`} />

              <div className="p-6">
                {/* Zone name & badges */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${colors.accent} text-white`}>
                      <MapPin size={20} />
                    </div>
                    <div>
                      <h2 className={`text-lg font-bold ${colors.text}`}>
                        {zone.label}
                      </h2>
                      <span className="text-xs text-gray-500 font-mono">
                        {zone.zone}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {zone.isFinalDestination && (
                      <span className="px-2 py-0.5 bg-green-200 text-green-800 text-[10px] font-bold rounded-full uppercase">
                        Destination finale
                      </span>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  /* Edit form */
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Nom d&apos;affichage</label>
                      <input
                        type="text"
                        value={editForm.label || ""}
                        onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Adresse complète</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editForm.address || ""}
                          onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => geocodeAddress(editForm.address || "", "edit")}
                          disabled={geocoding === "edit" || !editForm.address?.trim()}
                          className="flex items-center gap-1 px-3 py-2 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold hover:bg-amber-200 transition disabled:opacity-40"
                          title="Rechercher les coordonnées GPS"
                        >
                          {geocoding === "edit" ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
                          GPS
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Latitude</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={editForm.latitude ?? ""}
                          onChange={(e) => setEditForm({ ...editForm, latitude: parseFloat(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Longitude</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={editForm.longitude ?? ""}
                          onChange={(e) => setEditForm({ ...editForm, longitude: parseFloat(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                        />
                      </div>
                    </div>
                    {/* Bouton reverse geocoding (lat/lng → adresse) */}
                    <button
                      type="button"
                      onClick={() => reverseGeocode(editForm.latitude ?? 0, editForm.longitude ?? 0, "edit")}
                      disabled={geocoding === "edit" || !editForm.latitude || !editForm.longitude}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 border border-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-200 transition disabled:opacity-40"
                      title="Remplir l'adresse à partir des coordonnées GPS"
                    >
                      {geocoding === "edit" ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                      Trouver l&apos;adresse depuis les coordonnées
                    </button>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#4F587E] text-white rounded-lg text-sm font-semibold hover:bg-[#3B4252] transition disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Enregistrer
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300 transition"
                      >
                        <X size={14} />
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div className="space-y-3">
                    {/* Address */}
                    <div className="flex items-start gap-2">
                      <Globe size={14} className="text-gray-400 mt-0.5 shrink-0" />
                      <p className="text-sm text-gray-700">{zone.address}</p>
                    </div>

                    {/* Coordinates */}
                    <div className="flex items-center gap-2">
                      <Navigation size={14} className="text-gray-400 shrink-0" />
                      <code className="text-xs text-gray-600 bg-white/80 px-2 py-1 rounded font-mono">
                        {zone.latitude.toFixed(4)}°N, {zone.longitude.toFixed(4)}°E
                      </code>
                    </div>

                    {/* Distance to Palais */}
                    {!zone.isFinalDestination && (
                      <div className="flex items-center gap-2">
                        <RotateCcw size={14} className="text-gray-400 shrink-0" />
                        <span className="text-xs text-gray-600">
                          <span className="font-semibold">{dist}</span> du Palais des Festivals
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => startEdit(zone)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${colors.text} bg-white/70 border ${colors.border} hover:bg-white transition`}
                      >
                        <Pencil size={12} />
                        Modifier
                      </button>
                      {!zone.isFinalDestination && (
                        <button
                          onClick={() => handleDeleteZone(zone.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-white/70 border border-red-200 hover:bg-red-50 transition"
                        >
                          <Trash2 size={12} />
                          Désactiver
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inactive zones */}
      {zones.filter(z => !z.isActive).length > 0 && (
        <div className="max-w-6xl mx-auto mt-8">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Zones désactivées</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {zones.filter(z => !z.isActive).map((zone) => (
              <div key={zone.id} className="bg-gray-100 rounded-xl p-4 border border-gray-200 opacity-60">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-700">{zone.label}</h4>
                    <span className="text-xs text-gray-400 font-mono">{zone.zone}</span>
                  </div>
                  <button
                    onClick={async () => {
                      await fetch(`/api/zones/${zone.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ isActive: true }),
                      });
                      invalidateZoneCache();
                      fetchZones();
                    }}
                    className="text-xs px-3 py-1 bg-white border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
                  >
                    Réactiver
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {zones.length === 0 && (
        <div className="max-w-6xl mx-auto text-center py-20">
          <MapPin size={48} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-500">Aucune zone configurée</h2>
          <p className="text-sm text-gray-400 mt-1">
            Cliquez sur &quot;Nouvelle zone&quot; pour en créer une.
          </p>
        </div>
      )}
    </div>
  );
}
