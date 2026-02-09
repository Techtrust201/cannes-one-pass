"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { use } from "react";
import type { Feature, UserRole } from "@prisma/client";
import { PasswordInput } from "@/components/ui/PasswordInput";

interface UserPermission {
  feature: Feature;
  canRead: boolean;
  canWrite: boolean;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  permissions: UserPermission[];
}

const FEATURES: { key: Feature; label: string }[] = [
  { key: "LISTE", label: "Liste des accréditations" },
  { key: "CREER", label: "Créer une accréditation" },
  { key: "PLAQUE", label: "Scanner plaque" },
  { key: "QR_CODE", label: "Scanner QR code" },
  { key: "FLUX_VEHICULES", label: "Flux véhicules" },
  { key: "BILAN_CARBONE", label: "Bilan carbone" },
  { key: "GESTION_ZONES", label: "Gestion zones" },
  { key: "GESTION_DATES", label: "Gestion dates" },
];

const ROLES: { value: UserRole; label: string }[] = [
  { value: "USER", label: "Utilisateur" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
];

export default function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [modifyingPassword, setModifyingPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Formulaire
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("USER");
  const [permissions, setPermissions] = useState<
    Map<Feature, { canRead: boolean; canWrite: boolean }>
  >(new Map());

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/users/${id}`);
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setUser(data);
      setName(data.name);
      setRole(data.role);

      // Initialiser les permissions
      const permsMap = new Map<
        Feature,
        { canRead: boolean; canWrite: boolean }
      >();
      for (const f of FEATURES) {
        const existing = data.permissions.find(
          (p: UserPermission) => p.feature === f.key
        );
        permsMap.set(f.key, {
          canRead: existing?.canRead ?? false,
          canWrite: existing?.canWrite ?? false,
        });
      }
      setPermissions(permsMap);
    } catch {
      setError("Erreur lors du chargement de l'utilisateur");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors de la mise à jour");
        setSaving(false);
        return;
      }

      setSuccess("Utilisateur mis à jour avec succès");
      fetchUser();
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePermissions = async () => {
    setSavingPerms(true);
    setError("");
    setSuccess("");

    try {
      const permsArray = Array.from(permissions.entries()).map(
        ([feature, perm]) => ({
          feature,
          canRead: perm.canRead,
          canWrite: perm.canWrite,
        })
      );

      const res = await fetch(`/api/admin/users/${id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: permsArray }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors de la mise à jour");
        setSavingPerms(false);
        return;
      }

      setSuccess("Permissions mises à jour avec succès");
      fetchUser();
    } catch {
      setError("Erreur réseau");
    } finally {
      setSavingPerms(false);
    }
  };

  const togglePermission = (
    feature: Feature,
    type: "canRead" | "canWrite"
  ) => {
    setPermissions((prev) => {
      const next = new Map(prev);
      const current = next.get(feature) || {
        canRead: false,
        canWrite: false,
      };

      if (type === "canWrite" && !current.canWrite) {
        // Si on active écriture, on active aussi lecture
        next.set(feature, { ...current, canWrite: true, canRead: true });
      } else if (type === "canRead" && current.canRead) {
        // Si on désactive lecture, on désactive aussi écriture
        next.set(feature, { canRead: false, canWrite: false });
      } else {
        next.set(feature, { ...current, [type]: !current[type] });
      }

      return next;
    });
  };

  const toggleAll = (type: "canRead" | "canWrite", value: boolean) => {
    setPermissions((prev) => {
      const next = new Map(prev);
      for (const f of FEATURES) {
        const current = next.get(f.key) || {
          canRead: false,
          canWrite: false,
        };
        if (type === "canWrite") {
          next.set(f.key, {
            ...current,
            canWrite: value,
            canRead: value ? true : current.canRead,
          });
        } else {
          next.set(f.key, {
            canRead: value,
            canWrite: value ? current.canWrite : false,
          });
        }
      }
      return next;
    });
  };

  const handleResetPassword = async () => {
    if (
      !confirm(
        "Êtes-vous sûr de vouloir réinitialiser le mot de passe ? Un nouveau mot de passe aléatoire sera généré et l'utilisateur sera déconnecté."
      )
    ) {
      return;
    }

    setResettingPassword(true);
    setError("");
    setSuccess("");
    setTempPassword(null);

    try {
      const res = await fetch(`/api/admin/users/${id}/password`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors de la réinitialisation");
        setResettingPassword(false);
        return;
      }

      const data = await res.json();
      setTempPassword(data.password);
      setSuccess("Mot de passe réinitialisé avec succès");
    } catch {
      setError("Erreur réseau");
    } finally {
      setResettingPassword(false);
    }
  };

  const handleModifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setModifyingPassword(true);

    try {
      const res = await fetch(`/api/admin/users/${id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors de la modification");
        setModifyingPassword(false);
        return;
      }

      setSuccess("Mot de passe modifié avec succès");
      setShowModifyModal(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Erreur réseau");
    } finally {
      setModifyingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-[#3F4660] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-600">Utilisateur non trouvé</p>
        <Link
          href="/admin/users"
          className="text-[#3F4660] hover:underline mt-2 inline-block"
        >
          Retour à la liste
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 md:mb-6">
        <Link
          href="/admin/users"
          className="text-[#3F4660] hover:underline text-sm min-h-[44px] inline-flex items-center"
        >
          ← Retour à la liste
        </Link>
      </div>

      <div className="flex items-center justify-between mb-4 md:mb-6 gap-3">
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
            {user.name}
          </h2>
          <p className="text-gray-500 text-sm truncate">{user.email}</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
            user.isActive
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              user.isActive ? "bg-green-500" : "bg-red-500"
            }`}
          />
          {user.isActive ? "Actif" : "Inactif"}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Section Info utilisateur */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4">
            Informations
          </h3>
          <form onSubmit={handleSaveUser} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#3F4660] focus:border-transparent outline-none min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rôle
              </label>
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as UserRole)
                }
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#3F4660] focus:border-transparent outline-none min-h-[44px]"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push("/admin/users")}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-[#3F4660] hover:bg-[#2C2F3F] text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>

        {/* Section Permissions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-base md:text-lg font-semibold text-gray-900">
              Permissions
            </h3>
            {user.role === "SUPER_ADMIN" && (
              <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full shrink-0">
                Accès complet
              </span>
            )}
          </div>

          {user.role === "SUPER_ADMIN" ? (
            <p className="text-sm text-gray-500">
              Les Super Admins ont automatiquement accès à toutes les
              fonctionnalités. Les permissions ne peuvent pas être
              modifiées.
            </p>
          ) : (
            <>
              {/* Boutons tout cocher/décocher */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => toggleAll("canRead", true)}
                  className="text-xs px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors min-h-[36px]"
                >
                  Tout lire
                </button>
                <button
                  type="button"
                  onClick={() => toggleAll("canWrite", true)}
                  className="text-xs px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors min-h-[36px]"
                >
                  Tout écrire
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleAll("canRead", false);
                    toggleAll("canWrite", false);
                  }}
                  className="text-xs px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors min-h-[36px]"
                >
                  Tout retirer
                </button>
              </div>

              <div className="space-y-1">
                {FEATURES.map((f) => {
                  const perm = permissions.get(f.key) || {
                    canRead: false,
                    canWrite: false,
                  };
                  return (
                    <div
                      key={f.key}
                      className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-gray-50 min-h-[44px]"
                    >
                      <span className="text-sm text-gray-700 font-medium">
                        {f.label}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <label className="flex items-center gap-1.5 cursor-pointer min-h-[44px]">
                          <input
                            type="checkbox"
                            checked={perm.canRead}
                            onChange={() =>
                              togglePermission(f.key, "canRead")
                            }
                            className="rounded border-gray-300 text-[#3F4660] focus:ring-[#3F4660] w-5 h-5"
                          />
                          <span className="text-xs text-gray-500">
                            Lire
                          </span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer min-h-[44px]">
                          <input
                            type="checkbox"
                            checked={perm.canWrite}
                            onChange={() =>
                              togglePermission(f.key, "canWrite")
                            }
                            className="rounded border-gray-300 text-[#3F4660] focus:ring-[#3F4660] w-5 h-5"
                          />
                          <span className="text-xs text-gray-500">
                            Écrire
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleSavePermissions}
                disabled={savingPerms}
                className="w-full mt-4 bg-[#3F4660] hover:bg-[#2C2F3F] text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {savingPerms
                  ? "Enregistrement..."
                  : "Enregistrer les permissions"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Section Gestion du mot de passe */}
      <div className="mt-4 md:mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4">
          Gestion du mot de passe
        </h3>

        {tempPassword && (
          <div className="mb-4 p-3 md:p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm font-medium text-yellow-800 mb-2">
              Nouveau mot de passe généré :
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-white border border-yellow-300 rounded text-sm font-mono text-gray-900 break-all overflow-x-auto">
                {tempPassword}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(tempPassword);
                  alert("Mot de passe copié dans le presse-papiers");
                }}
                className="shrink-0 px-3 py-2.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded text-sm font-medium transition-colors min-h-[44px]"
              >
                Copier
              </button>
            </div>
            <p className="text-xs text-yellow-700 mt-2">
              Ce mot de passe ne sera affiché qu&apos;une seule fois. Assurez-vous
              de le communiquer à l&apos;utilisateur de manière sécurisée.
            </p>
            <button
              type="button"
              onClick={() => setTempPassword(null)}
              className="mt-2 text-xs text-yellow-700 hover:text-yellow-900 underline"
            >
              Masquer
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={resettingPassword}
            className="w-full sm:w-auto px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {resettingPassword ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
          </button>
          <button
            type="button"
            onClick={() => setShowModifyModal(true)}
            className="w-full sm:w-auto px-4 py-3 bg-[#3F4660] hover:bg-[#2C2F3F] text-white rounded-lg text-sm font-medium transition-colors min-h-[44px]"
          >
            Modifier le mot de passe
          </button>
        </div>
      </div>

      {/* Modal de modification du mot de passe */}
      {showModifyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Modifier le mot de passe
            </h3>
            <form onSubmit={handleModifyPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nouveau mot de passe
                </label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Minimum 8 caractères"
                  className="px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmer le mot de passe
                </label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Répétez le mot de passe"
                  className="px-3 py-2.5 text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModifyModal(false);
                    setNewPassword("");
                    setConfirmPassword("");
                    setError("");
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={modifyingPassword}
                  className="flex-1 bg-[#3F4660] hover:bg-[#2C2F3F] text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  {modifyingPassword ? "Modification..." : "Modifier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
