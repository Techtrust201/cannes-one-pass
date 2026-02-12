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
} from "lucide-react";

interface ZoneData {
  id: number;
  zone: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
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

const ZONE_COLORS: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  LA_BOCCA: { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", accent: "bg-orange-500" },
  PALAIS_DES_FESTIVALS: { bg: "bg-green-50", border: "border-green-300", text: "text-green-800", accent: "bg-green-500" },
  PANTIERO: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-800", accent: "bg-blue-500" },
  MACE: { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", accent: "bg-purple-500" },
};

function getColors(zone: string) {
  return ZONE_COLORS[zone] || { bg: "bg-gray-50", border: "border-gray-300", text: "text-gray-800", accent: "bg-gray-500" };
}

export default function ZonesPage() {
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<ZoneData>>({});
  const [saving, setSaving] = useState(false);

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
        <div className="flex items-center gap-3 mb-2">
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
      </div>

      {/* Zone cards grid */}
      <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-2">
        {zones.map((zone) => {
          const colors = getColors(zone.zone);
          const isEditing = editingId === zone.id;
          const isPalais = zone.zone === "PALAIS_DES_FESTIVALS";
          const dist = distanceToPalais(zone.latitude, zone.longitude);

          return (
            <div
              key={zone.id}
              className={`relative rounded-2xl border-2 ${colors.border} ${colors.bg} shadow-sm overflow-hidden transition-all ${
                isEditing ? "ring-2 ring-[#4F587E] ring-offset-2" : "hover:shadow-md"
              } ${!zone.isActive ? "opacity-60" : ""}`}
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
                    {isPalais && (
                      <span className="px-2 py-0.5 bg-green-200 text-green-800 text-[10px] font-bold rounded-full uppercase">
                        Destination finale
                      </span>
                    )}
                    {!zone.isActive && (
                      <span className="px-2 py-0.5 bg-red-200 text-red-800 text-[10px] font-bold rounded-full uppercase">
                        Inactive
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
                      <input
                        type="text"
                        value={editForm.address || ""}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                      />
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
                    {!isPalais && (
                      <div className="flex items-center gap-2">
                        <RotateCcw size={14} className="text-gray-400 shrink-0" />
                        <span className="text-xs text-gray-600">
                          <span className="font-semibold">{dist}</span> du Palais des Festivals
                        </span>
                      </div>
                    )}

                    {/* Edit button */}
                    <div className="pt-2">
                      <button
                        onClick={() => startEdit(zone)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${colors.text} bg-white/70 border ${colors.border} hover:bg-white transition`}
                      >
                        <Pencil size={12} />
                        Modifier
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {zones.length === 0 && (
        <div className="max-w-6xl mx-auto text-center py-20">
          <MapPin size={48} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-500">Aucune zone configurée</h2>
          <p className="text-sm text-gray-400 mt-1">
            Les zones apparaîtront ici une fois initialisées.
          </p>
        </div>
      )}
    </div>
  );
}
