"use client";

import { useState, useEffect, useCallback } from "react";
import { Archive, Search, RotateCcw, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import StatusPill from "@/components/logisticien/StatusPill";
import type { Accreditation } from "@/types";

export default function ArchivesPage() {
  const router = useRouter();
  const [accreditations, setAccreditations] = useState<Accreditation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const fetchArchived = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/accreditations?archived=true");
      if (res.ok) {
        const data = await res.json();
        setAccreditations(data);
      }
    } catch (err) {
      console.error("Erreur chargement archives:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchived();
  }, [fetchArchived]);

  const handleUnarchive = async (id: string) => {
    if (!confirm("Désarchiver cette accréditation ?")) return;
    try {
      const res = await fetch(`/api/accreditations/${id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: false }),
      });
      if (res.ok) {
        fetchArchived();
      } else {
        alert("Erreur lors du désarchivage");
      }
    } catch {
      alert("Erreur réseau");
    }
  };

  // Filter & paginate
  const filtered = accreditations.filter((acc) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      acc.company?.toLowerCase().includes(s) ||
      acc.event?.toLowerCase().includes(s) ||
      acc.stand?.toLowerCase().includes(s) ||
      acc.vehicles?.some((v) => v.plate?.toLowerCase().includes(s))
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pageData = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-[#4F587E] rounded-xl text-white">
            <Archive size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Archives</h1>
            <p className="text-sm text-gray-500">
              {filtered.length} accréditation{filtered.length !== 1 ? "s" : ""} archivée{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher par entreprise, plaque, événement..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#4F587E] focus:border-transparent"
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-gray-400" size={32} />
          </div>
        ) : pageData.length === 0 ? (
          <div className="text-center py-20">
            <Archive size={48} className="mx-auto text-gray-300 mb-4" />
            <h2 className="text-lg font-semibold text-gray-500">Aucune accréditation archivée</h2>
            <p className="text-sm text-gray-400 mt-1">
              Les accréditations archivées apparaîtront ici.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Statut</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Décorateur</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Événement</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Plaque(s)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((acc, i) => (
                    <tr key={acc.id} className={`border-b border-gray-100 hover:bg-blue-50/30 transition ${i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                      <td className="px-4 py-3">
                        <StatusPill status={acc.status} zone={acc.currentZone || undefined} compact />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-[160px] truncate">{acc.company}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">{acc.event}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {acc.vehicles?.map((v) => v.plate).join(", ") || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(acc.createdAt).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => router.push(`/logisticien?sel=${acc.id}`)}
                            className="text-xs px-2.5 py-1.5 bg-[#4F587E]/10 text-[#4F587E] rounded-lg hover:bg-[#4F587E]/20 transition font-semibold"
                          >
                            Voir
                          </button>
                          <button
                            onClick={() => handleUnarchive(acc.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition font-semibold"
                          >
                            <RotateCcw size={12} />
                            Désarchiver
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {pageData.map((acc) => (
                <div key={acc.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <StatusPill status={acc.status} zone={acc.currentZone || undefined} compact />
                    <span className="text-xs text-gray-400">
                      {new Date(acc.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-800 text-sm">{acc.company}</p>
                  <p className="text-xs text-gray-500">{acc.event}</p>
                  <p className="text-xs text-gray-400 font-mono mt-1">
                    {acc.vehicles?.map((v) => v.plate).join(", ")}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => router.push(`/logisticien?sel=${acc.id}`)}
                      className="flex-1 text-xs px-3 py-2 bg-[#4F587E]/10 text-[#4F587E] rounded-lg font-semibold"
                    >
                      Voir
                    </button>
                    <button
                      onClick={() => handleUnarchive(acc.id)}
                      className="flex items-center justify-center gap-1 flex-1 text-xs px-3 py-2 bg-green-100 text-green-700 rounded-lg font-semibold"
                    >
                      <RotateCcw size={12} />
                      Désarchiver
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-40 transition"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-gray-600">
                  Page {currentPage} sur {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-40 transition"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
