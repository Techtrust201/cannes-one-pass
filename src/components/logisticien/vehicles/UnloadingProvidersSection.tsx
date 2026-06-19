"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Truck,
  Pencil,
  Check,
  X,
  Loader2,
  PlusCircle,
  Power,
  PowerOff,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { withEspaceQuery } from "@/lib/url";

interface UnloadingProvider {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

interface UnloadingProvidersSectionProps {
  canWrite: boolean;
}

/**
 * Section "Prestataires de déchargement" de l'écran Flux véhicules.
 *
 * Extraction directe (sans modification de logique) du contenu historique
 * de `/logisticien/vehicles` pour permettre son intégration dans la barre
 * d'onglets `VehiclesTabs`.
 */
export default function UnloadingProvidersSection({
  canWrite,
}: UnloadingProvidersSectionProps) {
  const espace = useEspaceSlug();

  const [providers, setProviders] = useState<UnloadingProvider[]>([]);
  const [inactiveProviders, setInactiveProviders] = useState<UnloadingProvider[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [reordering, setReordering] = useState(false);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const base = canWrite
        ? "/api/unloading-providers?all=true"
        : "/api/unloading-providers";
      const res = await fetch(withEspaceQuery(base, espace));
      if (res.ok) {
        const data: UnloadingProvider[] = await res.json();
        setProviders(data.filter((p) => p.isActive));
        setInactiveProviders(data.filter((p) => !p.isActive));
      }
    } catch (err) {
      console.error("Erreur chargement prestataires:", err);
    } finally {
      setLoading(false);
    }
  }, [canWrite, espace]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError("");
    // Nouveau prestataire ajouté en fin de liste (ordre = max + 1).
    const nextSortOrder = providers.length
      ? Math.max(...providers.map((p) => p.sortOrder ?? 0)) + 1
      : 0;
    try {
      const res = await fetch(withEspaceQuery("/api/unloading-providers", espace), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          sortOrder: nextSortOrder,
        }),
      });
      if (res.ok || res.status === 200) {
        setShowCreateForm(false);
        setNewName("");
        fetchProviders();
      } else {
        const err = await res.json();
        setCreateError(err.error || "Erreur lors de la création");
      }
    } catch {
      setCreateError("Erreur réseau");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (provider: UnloadingProvider) => {
    setEditingId(provider.id);
    setEditName(provider.name);
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/unloading-providers/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        cancelEdit();
        fetchProviders();
      } else {
        const err = await res.json();
        setEditError(err.error || "Erreur lors de la sauvegarde");
      }
    } catch {
      setEditError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  // Réordonnancement par flèches : on échange le prestataire avec son voisin,
  // puis on renumérote 0..n et on persiste uniquement les positions modifiées.
  // L'UI est mise à jour de façon optimiste pour un ressenti « live ».
  const moveProvider = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (reordering || target < 0 || target >= providers.length) return;

    const previous = providers;
    const reordered = [...providers];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const withOrder = reordered.map((p, i) => ({ ...p, sortOrder: i }));
    setProviders(withOrder);
    setReordering(true);

    try {
      const changed = withOrder.filter((p) => {
        const before = previous.find((x) => x.id === p.id);
        return !before || before.sortOrder !== p.sortOrder;
      });
      const results = await Promise.all(
        changed.map((p) =>
          fetch(`/api/unloading-providers/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: p.sortOrder }),
          })
        )
      );
      if (results.some((r) => !r.ok)) {
        setProviders(previous);
      }
    } catch {
      setProviders(previous);
    } finally {
      setReordering(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/unloading-providers/${id}`, {
        method: "DELETE",
      });
      if (res.ok) fetchProviders();
    } catch {
      alert("Erreur réseau");
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/unloading-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (res.ok) fetchProviders();
    } catch {
      alert("Erreur réseau");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} /> Chargement…
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-[#4F587E] rounded-full" />
          <h2 className="text-base font-bold text-gray-800">
            Prestataires de déchargement
          </h2>
          <span className="text-xs text-gray-400 font-medium ml-1">
            {providers.length} actif{providers.length > 1 ? "s" : ""}
          </span>
        </div>
        {canWrite && (
          <button
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setCreateError("");
              setNewName("");
            }}
            className="flex items-center gap-2 px-3 py-2 bg-[#4F587E] text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-[#3B4252] transition shadow-sm"
          >
            <PlusCircle size={14} />
            <span className="hidden sm:inline">Nouveau prestataire</span>
            <span className="sm:hidden">Ajouter</span>
          </button>
        )}
      </div>

      {canWrite && providers.length > 1 && (
        <p className="mb-4 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <ChevronUp size={13} className="text-[#4F587E]" />
          <ChevronDown size={13} className="-ml-1.5 text-[#4F587E]" />
          Utilisez les flèches pour ordonner la liste. L&apos;ordre s&apos;applique
          automatiquement au formulaire des chauffeurs (mise à jour en direct).
        </p>
      )}

      {showCreateForm && canWrite && (
        <div className="mb-6 bg-white rounded-2xl border-2 border-dashed border-[#4F587E]/30 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <PlusCircle size={16} className="text-[#4F587E]" />
            Ajouter un prestataire
          </h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setCreateError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              placeholder="Nom du prestataire (ex: BBO)"
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#4F587E] text-white rounded-lg text-sm font-semibold hover:bg-[#3B4252] transition disabled:opacity-50"
            >
              {creating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Créer
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setNewName("");
                setCreateError("");
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300 transition"
            >
              <X size={14} />
            </button>
          </div>
          {createError && (
            <p className="text-red-500 text-xs mt-2">{createError}</p>
          )}
        </div>
      )}

      {providers.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider, index) => {
            const isEditing = editingId === provider.id;
            return (
              <div
                key={provider.id}
                className={`bg-white rounded-xl border shadow-sm transition-all ${
                  isEditing
                    ? "border-[#4F587E] ring-2 ring-[#4F587E]/20"
                    : "border-gray-200 hover:shadow-md"
                }`}
              >
                <div className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => {
                          setEditName(e.target.value);
                          setEditError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
                        autoFocus
                      />
                      {editError && (
                        <p className="text-red-500 text-xs">{editError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={saving || !editName.trim()}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#4F587E] text-white rounded-lg text-xs font-semibold hover:bg-[#3B4252] transition disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          Enregistrer
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-300 transition"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {canWrite && (
                          <div className="flex flex-col -my-1">
                            <button
                              onClick={() => moveProvider(index, -1)}
                              disabled={index === 0 || reordering}
                              className="p-0.5 rounded text-gray-300 hover:text-[#4F587E] hover:bg-gray-100 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300"
                              title="Monter"
                              aria-label="Monter"
                            >
                              <ChevronUp size={15} />
                            </button>
                            <button
                              onClick={() => moveProvider(index, 1)}
                              disabled={index === providers.length - 1 || reordering}
                              className="p-0.5 rounded text-gray-300 hover:text-[#4F587E] hover:bg-gray-100 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300"
                              title="Descendre"
                              aria-label="Descendre"
                            >
                              <ChevronDown size={15} />
                            </button>
                          </div>
                        )}
                        <div className="w-2 h-2 bg-green-400 rounded-full shrink-0" />
                        <span className="font-semibold text-gray-800 truncate">
                          {provider.name}
                        </span>
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEdit(provider)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#4F587E] hover:bg-gray-100 transition"
                            title="Modifier"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeactivate(provider.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                            title="Désactiver"
                          >
                            <PowerOff size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Truck size={40} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-sm font-semibold text-gray-500">
            Aucun prestataire configuré
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {canWrite
              ? "Cliquez sur \"Nouveau prestataire\" pour en ajouter un."
              : "Contactez un administrateur pour configurer les prestataires."}
          </p>
        </div>
      )}

      {canWrite && inactiveProviders.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Prestataires désactivés
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inactiveProviders.map((provider) => (
              <div
                key={provider.id}
                className="bg-gray-100 rounded-xl p-4 border border-gray-200 opacity-60"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-gray-400 rounded-full shrink-0" />
                    <span className="font-semibold text-gray-600">
                      {provider.name}
                    </span>
                  </div>
                  <button
                    onClick={() => handleReactivate(provider.id)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
                  >
                    <Power size={12} />
                    Réactiver
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
