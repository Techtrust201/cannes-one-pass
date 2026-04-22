"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Calendar, Plus } from "lucide-react";
import MultiSelectDialog from "./MultiSelectDialog";

interface OrganizationMini {
  id: string;
  name: string;
  slug: string;
  color: string;
  logo: string | null;
  isActive: boolean;
}

interface EventMini {
  id: string;
  name: string;
  slug: string;
  color: string;
  startDate: string;
  endDate: string;
  organization?: { id: string; name: string } | null;
}

interface Props {
  userId: string;
}

/**
 * Bloc de la page /admin/users/[id] permettant à un super-admin de gérer :
 *   1. les Espaces dont l'utilisateur est membre (accès automatique à tous leurs events)
 *   2. les events supplémentaires accordés ponctuellement hors Espaces
 */
export default function UserEspacesSection({ userId }: Props) {
  const [memberships, setMemberships] = useState<OrganizationMini[]>([]);
  const [allOrgs, setAllOrgs] = useState<OrganizationMini[]>([]);
  const [grants, setGrants] = useState<EventMini[]>([]);
  const [allEvents, setAllEvents] = useState<EventMini[]>([]);
  const [dialog, setDialog] = useState<"orgs" | "grants" | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, orgsRes, grantsRes, eventsRes] = await Promise.all([
        fetch(`/api/admin/users/${userId}/organizations`),
        fetch("/api/admin/organizations"),
        fetch(`/api/admin/users/${userId}/event-grants`),
        fetch("/api/events"),
      ]);
      if (membersRes.ok) setMemberships(await membersRes.json());
      if (orgsRes.ok) setAllOrgs(await orgsRes.json());
      if (grantsRes.ok) setGrants(await grantsRes.json());
      if (eventsRes.ok) setAllEvents(await eventsRes.json());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function saveOrgs(ids: string[]) {
    setSaving(true);
    try {
      await fetch(`/api/admin/users/${userId}/organizations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationIds: ids }),
      });
      setDialog(null);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function saveGrants(ids: string[]) {
    setSaving(true);
    try {
      await fetch(`/api/admin/users/${userId}/event-grants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIds: ids }),
      });
      setDialog(null);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  // Les events "extra" disponibles = tous les events qui ne sont PAS déjà
  // couverts par les Espaces sélectionnés (pas besoin de les grant en extra
  // puisqu'ils sont déjà accessibles).
  const orgIds = new Set(memberships.map((o) => o.id));
  const eventsForGrantPicker = allEvents.filter(
    (e) => !e.organization || !orgIds.has(e.organization.id)
  );

  return (
    <div className="mt-4 md:mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 space-y-6">
      {/* Espaces */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Building2 size={18} className="text-[#4F587E]" />
              Espaces
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              L&apos;utilisateur voit automatiquement tous les events de ces Espaces.
            </p>
          </div>
          <button
            onClick={() => setDialog("orgs")}
            disabled={loading}
            className="text-sm font-semibold text-[#4F587E] hover:underline min-h-[44px] px-2 shrink-0"
          >
            Modifier
          </button>
        </div>
        {loading ? (
          <div className="h-16 rounded-xl bg-gray-50 animate-pulse" />
        ) : memberships.length === 0 ? (
          <button
            onClick={() => setDialog("orgs")}
            className="w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 py-4 text-sm text-gray-500 hover:bg-gray-100 transition flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Plus size={14} /> Rattacher à un Espace
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {memberships.map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1.5 rounded-full text-xs font-semibold px-3 py-1.5 text-white"
                style={{ backgroundColor: o.color }}
              >
                <Building2 size={12} />
                {o.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Events extra */}
      <div className="pt-6 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar size={18} className="text-[#4F587E]" />
              Events supplémentaires
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Accès ponctuel à un event d&apos;un autre Espace, sans y être membre.
            </p>
          </div>
          <button
            onClick={() => setDialog("grants")}
            disabled={loading}
            className="text-sm font-semibold text-[#4F587E] hover:underline min-h-[44px] px-2 shrink-0"
          >
            Modifier
          </button>
        </div>
        {loading ? (
          <div className="h-12 rounded-xl bg-gray-50 animate-pulse" />
        ) : grants.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            Aucun event supplémentaire attribué.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {grants.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1.5 rounded-full text-xs font-semibold px-3 py-1.5 bg-gray-100 text-gray-800 border border-gray-200"
              >
                <Calendar size={12} className="text-gray-500" />
                {e.name}
                {e.organization && (
                  <span className="text-[10px] text-gray-500 ml-1">
                    ({e.organization.name})
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <MultiSelectDialog
        open={dialog === "orgs"}
        onClose={() => setDialog(null)}
        title="Espaces de l'utilisateur"
        description="Les events rattachés à ces Espaces seront visibles sans configuration supplémentaire."
        items={allOrgs.map((o) => ({
          id: o.id,
          label: o.name,
          sublabel: `/${o.slug}${o.isActive ? "" : " — inactif"}`,
        }))}
        initialSelection={memberships.map((o) => o.id)}
        onSave={saveOrgs}
        saving={saving}
      />

      <MultiSelectDialog
        open={dialog === "grants"}
        onClose={() => setDialog(null)}
        title="Events supplémentaires"
        description="Sélectionnez des events qui ne sont pas déjà couverts par les Espaces de l'utilisateur."
        items={eventsForGrantPicker.map((e) => ({
          id: e.id,
          label: e.name,
          sublabel:
            (e.organization?.name ? `${e.organization.name} — ` : "") +
            `${new Date(e.startDate).toLocaleDateString("fr-FR")}`,
        }))}
        initialSelection={grants.map((e) => e.id)}
        onSave={saveGrants}
        saving={saving}
      />
    </div>
  );
}
