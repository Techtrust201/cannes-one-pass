"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Users, Calendar, Building2, Search } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  color: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { events: number; members: number };
}

export default function EspacesListPage() {
  const { user } = usePermissions();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [orgs, setOrgs] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/organizations");
        if (!res.ok) throw new Error(await res.text());
        setOrgs(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = query.trim()
    ? orgs.filter(
        (o) =>
          o.name.toLowerCase().includes(query.toLowerCase()) ||
          o.slug.toLowerCase().includes(query.toLowerCase())
      )
    : orgs;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={24} className="text-[#4F587E]" />
            Espaces
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Regroupements d&apos;events par organisation (Palais, RX, etc.)
          </p>
        </div>
        {isSuperAdmin && (
          <Link
            href="/admin/espaces/nouveau"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#4F587E] text-white font-semibold text-sm hover:bg-[#3B4252] transition shadow-sm min-h-[44px]"
          >
            <Plus size={16} /> Nouvel Espace
          </Link>
        )}
      </div>

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          placeholder="Rechercher un Espace..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] outline-none text-sm bg-white shadow-sm"
        />
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 bg-white p-5 animate-pulse h-36"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <Building2 size={36} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            {query
              ? "Aucun Espace ne correspond à votre recherche"
              : "Aucun Espace pour l'instant"}
          </p>
          {!query && (
            <Link
              href="/admin/espaces/nouveau"
              className="inline-flex items-center gap-2 mt-4 text-sm text-[#4F587E] hover:underline font-semibold"
            >
              <Plus size={14} /> Créer le premier Espace
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((org) => (
            <Link
              key={org.id}
              href={`/admin/espaces/${org.id}`}
              className="group rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-all hover:-translate-y-0.5"
            >
              <div
                className="h-1.5"
                style={{ backgroundColor: org.color }}
              />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
                    style={{ backgroundColor: org.color }}
                  >
                    {org.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={org.logo}
                        alt=""
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      org.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  {!org.isActive && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                      Inactif
                    </span>
                  )}
                </div>
                <h2 className="font-bold text-gray-900 text-base truncate">
                  {org.name}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">/{org.slug}</p>
                {org.description && (
                  <p className="text-xs text-gray-600 mt-2 line-clamp-2">
                    {org.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={14} className="text-gray-400" />
                    <span className="font-semibold text-gray-800">
                      {org._count.events}
                    </span>{" "}
                    event{org._count.events > 1 ? "s" : ""}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={14} className="text-gray-400" />
                    <span className="font-semibold text-gray-800">
                      {org._count.members}
                    </span>{" "}
                    membre{org._count.members > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
