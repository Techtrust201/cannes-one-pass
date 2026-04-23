"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Users,
  Settings,
  Loader2,
  Save,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import MultiSelectDialog from "@/components/admin/MultiSelectDialog";
import { usePermissions } from "@/hooks/usePermissions";

interface EventInOrg {
  id: string;
  name: string;
  slug: string;
  startDate: string;
  endDate: string;
  isArchived: boolean;
}

interface UserInOrg {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  color: string;
  description: string | null;
  isActive: boolean;
  events: EventInOrg[];
  members: { user: UserInOrg; createdAt: string }[];
}

type Tab = "infos" | "events" | "members";

export default function EspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = usePermissions();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [tab, setTab] = useState<Tab>("infos");
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/organizations/${id}`);
      if (!res.ok) throw new Error(await res.text());
      setOrg(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        {error ?? "Espace introuvable"}
        <div className="mt-2">
          <Link href="/admin/espaces" className="text-[#4F587E] hover:underline">
            ← Retour aux Espaces
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/admin/espaces"
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
          aria-label="Retour"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ backgroundColor: org.color }}
          >
            {org.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logo} alt="" className="w-full h-full object-cover rounded-xl" />
            ) : (
              org.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
              {org.name}
            </h1>
            <p className="text-xs text-gray-500">/espaces/{org.slug}</p>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-1 -mb-px whitespace-nowrap">
          {([
            { id: "infos", label: "Infos", Icon: Settings },
            { id: "events", label: `Events (${org.events.length})`, Icon: Calendar },
            { id: "members", label: `Membres (${org.members.length})`, Icon: Users },
          ] as const).map(({ id: tabId, label, Icon }) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition min-h-[44px] ${
                tab === tabId
                  ? "border-[#4F587E] text-[#4F587E]"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenu */}
      {tab === "infos" && (
        <InfosTab
          org={org}
          onSaved={reload}
          onDeleted={() => router.push("/admin/espaces")}
          canDeleteSpace={isSuperAdmin}
        />
      )}
      {tab === "events" && <EventsTab org={org} onSaved={reload} />}
      {tab === "members" && (
        <MembersTab org={org} onSaved={reload} canManageMembers={isSuperAdmin} />
      )}
    </div>
  );
}

function InfosTab({
  org,
  onSaved,
  onDeleted,
  canDeleteSpace,
}: {
  org: OrganizationDetail;
  onSaved: () => void;
  onDeleted: () => void;
  canDeleteSpace: boolean;
}) {
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [color, setColor] = useState(org.color);
  const [description, setDescription] = useState(org.description ?? "");
  const [isActive, setIsActive] = useState(org.isActive);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          color,
          description: description || null,
          isActive,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Erreur");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Erreur");
      }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-sm">
      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">Nom *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] outline-none text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">Slug</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] outline-none text-sm font-mono"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">Couleur</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-14 h-11 rounded-xl border border-gray-300 cursor-pointer"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] outline-none text-sm font-mono"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] outline-none text-sm resize-none"
        />
      </div>
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="w-5 h-5 rounded border-gray-300 text-[#4F587E] focus:ring-[#4F587E]"
        />
        <span className="text-sm font-medium text-gray-800">Espace actif</span>
      </label>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
        {canDeleteSpace ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-700 font-semibold text-sm hover:bg-red-50 transition disabled:opacity-50 min-h-[44px]"
          >
            <Trash2 size={14} /> Supprimer
          </button>
        ) : (
          <div className="min-h-[44px]" />
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#4F587E] text-white font-semibold text-sm hover:bg-[#3B4252] transition disabled:opacity-50 min-h-[44px]"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Enregistrer
        </button>
      </div>

      {canDeleteSpace && confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <h3 className="font-bold text-gray-900">Supprimer cet Espace ?</h3>
            </div>
            <p className="text-sm text-gray-600">
              Cette action est irréversible. Les events contenus dans cet Espace seront
              détachés et devront être rattachés ailleurs.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 min-h-[44px]"
              >
                Annuler
              </button>
              <button
                onClick={remove}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
              >
                {saving ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventsTab({
  org,
  onSaved,
}: {
  org: OrganizationDetail;
  onSaved: () => void;
}) {
  const [allEvents, setAllEvents] = useState<EventInOrg[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/events");
      if (res.ok) setAllEvents(await res.json());
    })();
  }, []);

  async function saveSelection(eventIds: string[]) {
    setSaving(true);
    try {
      await fetch(`/api/admin/organizations/${org.id}/events`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIds }),
      });
      setDialogOpen(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          <Building2 size={14} className="inline -mt-0.5 mr-1" />
          Events rattachés à cet Espace
        </p>
        <button
          onClick={() => setDialogOpen(true)}
          className="text-sm font-semibold text-[#4F587E] hover:underline min-h-[44px] px-2"
        >
          Gérer la liste
        </button>
      </div>

      {org.events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <Calendar size={28} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            Aucun event rattaché pour l&apos;instant
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {org.events.map((e) => (
            <div
              key={e.id}
              className="rounded-xl border border-gray-200 bg-white p-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{e.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Du {new Date(e.startDate).toLocaleDateString("fr-FR")} au{" "}
                  {new Date(e.endDate).toLocaleDateString("fr-FR")}
                </p>
              </div>
              {e.isArchived && (
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-1 rounded-full shrink-0">
                  Archivé
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <MultiSelectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Events de cet Espace"
        description="Sélectionnez les events à rattacher à cet Espace. Un event retiré retourne au pool 'sans Espace'."
        items={allEvents.map((e) => ({
          id: e.id,
          label: e.name,
          sublabel: `${new Date(e.startDate).toLocaleDateString("fr-FR")} — ${e.slug}`,
        }))}
        initialSelection={org.events.map((e) => e.id)}
        onSave={saveSelection}
        saving={saving}
      />
    </div>
  );
}

function MembersTab({
  org,
  onSaved,
  canManageMembers,
}: {
  org: OrganizationDetail;
  onSaved: () => void;
  canManageMembers: boolean;
}) {
  const [allUsers, setAllUsers] = useState<UserInOrg[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canManageMembers) return;
    (async () => {
      const res = await fetch("/api/admin/users");
      if (res.ok) setAllUsers(await res.json());
    })();
  }, [canManageMembers]);

  async function saveSelection(userIds: string[]) {
    setSaving(true);
    try {
      await fetch(`/api/admin/organizations/${org.id}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
      });
      setDialogOpen(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          <Users size={14} className="inline -mt-0.5 mr-1" />
          Utilisateurs membres de cet Espace
        </p>
        {canManageMembers ? (
          <button
            onClick={() => setDialogOpen(true)}
            className="text-sm font-semibold text-[#4F587E] hover:underline min-h-[44px] px-2"
          >
            Gérer la liste
          </button>
        ) : (
          <p className="text-xs text-gray-500 max-w-md text-right">
            Seul un Super Admin peut ajouter ou retirer des membres.
          </p>
        )}
      </div>

      {org.members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <Users size={28} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">Aucun membre pour l&apos;instant</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {org.members.map(({ user }) => (
            <div
              key={user.id}
              className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${
                  user.role === "SUPER_ADMIN"
                    ? "bg-purple-100 text-purple-700"
                    : user.role === "ADMIN"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {user.role}
              </span>
            </div>
          ))}
        </div>
      )}

      {canManageMembers && (
        <MultiSelectDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Membres de cet Espace"
          description="Les membres voient automatiquement tous les events rattachés à cet Espace."
          items={allUsers.map((u) => ({
            id: u.id,
            label: u.name,
            sublabel: `${u.email} — ${u.role}`,
          }))}
          initialSelection={org.members.map(({ user }) => user.id)}
          onSave={saveSelection}
          saving={saving}
        />
      )}
    </div>
  );
}
