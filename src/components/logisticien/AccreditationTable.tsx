"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { List, Pencil, Trash2, LogIn, LogOut, Clock, CheckSquare, Square, Archive, ArrowRight, Loader2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import StatusPill from "./StatusPill";
import MobileAccreditationList from "./MobileAccreditationList";
import { formatVehicleDate } from "@/lib/date-utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { buildLink } from "@/lib/url";
import { getZoneLabel } from "@/lib/zone-utils";
import type { Accreditation } from "@/types";

/* ---------- Types ---------- */
export interface AccreditationTableProps {
  pageData: Accreditation[];
  currentPage: number;
  totalPages: number;
  filteredCount: number;
  perPage: number;
  searchParams: Record<string, string>;
  /** ID de l'accréditation sélectionnée (param `sel` URL) */
  selectedId?: string;
  sort:
    | "status"
    | "id"
    | "plate"
    | "createdAt"
    | "company"
    | "stand"
    | "event"
    | "entryAt"
    | "exitAt"
    | "duration"
    | "vehicleDate";
  dir: "asc" | "desc";
}

/* ---------- Sort caret ---------- */
function SortCaret({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return (
      <svg
        className="w-3 h-3 text-gray-400 opacity-50 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
        />
      </svg>
    );
  }
  return (
    <svg
      className="w-3 h-3 text-[#4F587E] shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      {dir === "asc" ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      )}
    </svg>
  );
}

/* ---------- Helper: truncate ---------- */
function truncate(text: string | undefined | null, max: number) {
  if (!text) return "-";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export type EventLogoMap = Record<string, { id: string; logo: string | null }>;

function useEventLogoMap(): EventLogoMap {
  const [map, setMap] = useState<EventLogoMap>({});
  useEffect(() => {
    fetch("/api/events")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; slug: string; logo: string | null }[]) => {
        if (!Array.isArray(data)) return;
        const m: EventLogoMap = {};
        for (const e of data) {
          m[e.slug] = { id: e.id, logo: e.logo || `/api/events/${e.id}/logo` };
        }
        setMap(m);
      })
      .catch(() => {});
  }, []);
  return map;
}

function EventLogo({ slug, eventMap }: { slug: string | undefined | null; eventMap: EventLogoMap }) {
  if (!slug) return null;
  const info = eventMap[slug];
  if (!info?.logo) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={info.logo}
      alt=""
      className="w-5 h-5 rounded object-contain shrink-0 bg-white"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

export default function AccreditationTable({
  pageData,
  currentPage,
  totalPages,
  filteredCount,
  perPage,
  searchParams,
  selectedId,
  sort,
  dir,
}: AccreditationTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const eventLogoMap = useEventLogoMap();

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === pageData.length) return new Set();
      return new Set(pageData.map((a) => a.id));
    });
  }, [pageData]);

  const executeBulkAction = useCallback(async (action: string) => {
    if (selectedIds.size === 0) return;
    const label = action === "ARCHIVE" ? "archiver" : `passer en ${action}`;
    if (!confirm(`${label} ${selectedIds.size} accréditation(s) ?`)) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/accreditations/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.failed > 0) {
          alert(`${data.succeeded} réussi(s), ${data.failed} échoué(s)`);
        }
        setSelectedIds(new Set());
        router.refresh();
      } else {
        alert("Erreur lors de l'action groupée");
      }
    } catch {
      alert("Erreur réseau");
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, router]);

  const toggleSort = (
    key:
      | "status"
      | "id"
      | "createdAt"
      | "company"
      | "stand"
      | "event"
      | "entryAt"
      | "exitAt"
      | "duration"
  ) => {
    const nextDir: "asc" | "desc" = sort === key && dir === "asc" ? "desc" : "asc";
    const p = new URLSearchParams(searchParams);
    p.set("page", "1");
    p.set("sort", key);
    p.set("dir", nextDir);
    router.push(`?${p.toString()}`);
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Êtes-vous sûr de vouloir supprimer définitivement cette accréditation ?\n\nCette action est irréversible."
      )
    )
      return;
    const res = await fetch(`/api/accreditations/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else alert("Erreur lors de la suppression");
  };

  /* ---------- Header cell helper ---------- */
  const Th = ({
    label,
    sortKey,
    className = "",
  }: {
    label: string;
    sortKey?: string;
    className?: string;
  }) => {
    const isSortable = !!sortKey;
    return (
      <th
        onClick={isSortable ? () => toggleSort(sortKey as Parameters<typeof toggleSort>[0]) : undefined}
        className={`px-2 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider text-left whitespace-nowrap ${isSortable ? "cursor-pointer select-none hover:text-gray-900 group" : ""} ${className}`}
        aria-sort={
          sort === sortKey ? (dir === "asc" ? "ascending" : "descending") : undefined
        }
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {isSortable && <SortCaret active={sort === sortKey} dir={dir} />}
        </span>
      </th>
    );
  };

  return (
    <>
      {/* ===== MOBILE ===== */}
      <MobileAccreditationList
        pageData={pageData}
        onDelete={handleDelete}
        currentPage={currentPage}
        totalPages={totalPages}
        filteredCount={filteredCount}
        perPage={perPage}
        searchParams={searchParams}
        eventLogoMap={eventLogoMap}
      />

      {/* ===== DESKTOP ===== */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-lg flex-col h-[85vh] hidden md:flex overflow-hidden">
        {/* Header */}
        <div className="bg-[#4F587E] text-white rounded-t-2xl px-5 py-4 flex items-center gap-3">
          <div className="p-1.5 bg-white/20 rounded-lg">
            <List size={18} />
          </div>
          <h1 className="text-sm font-bold">Liste d&apos;accréditations</h1>
          <span className="ml-auto text-xs text-white/70 font-medium">{filteredCount} résultat{filteredCount !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2.5 w-8">
                  <button
                    onClick={toggleAll}
                    className="p-0.5 rounded hover:bg-gray-200 transition"
                    title={selectedIds.size === pageData.length ? "Tout désélectionner" : "Tout sélectionner"}
                  >
                    {selectedIds.size > 0 && selectedIds.size === pageData.length ? (
                      <CheckSquare size={14} className="text-[#4F587E]" />
                    ) : (
                      <Square size={14} className="text-gray-400" />
                    )}
                  </button>
                </th>
                <Th label="Statut" sortKey="status" />
                <Th label="Plaque" sortKey="plate" />
                <Th label="Société" sortKey="company" />
                <Th label="Événement" sortKey="event" />
                <Th label="Date" sortKey="vehicleDate" />
                <Th label="Horaires" sortKey="entryAt" />
                <th className="px-2 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider text-center whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {pageData.map((acc, index) => {
                // Afficher exclusivement le dernier step (toutes zones)
                const displayEntry = acc.lastStepEntryAt || acc.entryAt;
                const displayExit = acc.lastStepExitAt || acc.exitAt;
                const displayZone = acc.lastStepZone || acc.currentZone;
                const isSelected = selectedId === String(acc.id);
                const selectUrl = buildLink(searchParams, currentPage, { sel: String(acc.id) });
                return (
                  <tr
                    key={String(acc.id)}
                    onClick={() => router.push(selectUrl)}
                    className={`border-b border-gray-100 cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? "bg-blue-50 ring-1 ring-inset ring-blue-300 shadow-sm"
                        : index % 2 === 0
                          ? "bg-white hover:bg-blue-50/40"
                          : "bg-gray-50/40 hover:bg-blue-50/40"
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-2 py-2 w-8">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(acc.id); }}
                        className="p-0.5 rounded hover:bg-gray-200 transition"
                      >
                        {selectedIds.has(acc.id) ? (
                          <CheckSquare size={14} className="text-[#4F587E]" />
                        ) : (
                          <Square size={14} className="text-gray-300" />
                        )}
                      </button>
                    </td>

                    {/* Statut (with zone dot) */}
                    <td className="px-2 py-2">
                      <StatusPill
                        status={acc.status as string}
                        zone={acc.currentZone || undefined}
                        compact
                      />
                    </td>

                    {/* Plaque */}
                    <td className="px-2 py-2 max-w-[120px]">
                      {acc.vehicles?.[0]?.plate ? (
                        <div>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-[11px] font-mono font-bold text-gray-700 tracking-wide">
                            {acc.vehicles[0].plate}
                          </span>
                          {acc.vehicles[0].size === "SEMI_REMORQUE" && (
                            <span className="block text-[9px] text-gray-400 mt-0.5 font-mono">
                              R: {acc.vehicles[0].trailerPlate || "—"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Société */}
                    <td
                      className="px-2 py-2 font-medium text-gray-800 max-w-[140px]"
                      title={acc.company || undefined}
                    >
                      <span className="block truncate">{acc.company || "-"}</span>
                    </td>

                    {/* Événement */}
                    <td className="px-2 py-2 text-gray-600 max-w-[130px]">
                      <span className="flex items-center gap-1.5 truncate">
                        <EventLogo slug={acc.event} eventMap={eventLogoMap} />
                        {truncate(acc.event, 16)}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-2 py-2 text-gray-500 whitespace-nowrap">
                      {formatVehicleDate(acc.vehicles?.[0]?.date)}
                    </td>

                    {/* Horaires — dernier step uniquement */}
                    <td className="px-2 py-2">
                      {displayEntry ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <LogIn size={10} className="shrink-0" />
                            {new Date(displayEntry).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {displayExit ? (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <LogOut size={10} className="shrink-0" />
                              {new Date(displayExit).toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-blue-500 text-[10px]">
                              <Clock size={10} className="shrink-0 animate-pulse" />
                              en cours
                            </span>
                          )}
                          {displayZone && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] text-[#4F587E] font-medium">
                              <MapPin size={8} className="shrink-0" />
                              {getZoneLabel(displayZone)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2 text-center">
                      <div className="inline-flex items-center gap-0.5">
                        <Link
                          href={selectUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 hover:bg-[#4F587E]/10 rounded-lg transition text-[#4F587E]"
                          title="Éditer"
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(acc.id); }}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition text-red-400 hover:text-red-600"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {pageData.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                    Aucune accréditation trouvée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 bg-gray-50 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-gray-600 flex-shrink-0 border-t border-gray-200 rounded-b-2xl text-xs">
          <span className="font-medium">
            {filteredCount === 0
              ? 0
              : Math.min((currentPage - 1) * perPage + 1, filteredCount)}
            –{Math.min(currentPage * perPage, filteredCount)} sur{" "}
            {filteredCount}
          </span>

          <Pagination>
            <PaginationContent>
              <PaginationItem>
                {currentPage === 1 ? (
                  <PaginationPrevious href="#" disabled />
                ) : (
                  <PaginationPrevious
                    href={buildLink(searchParams, currentPage - 1)}
                  />
                )}
              </PaginationItem>

              {(() => {
                const pages: number[] = [];
                if (totalPages <= 5) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else if (currentPage <= 3) {
                  pages.push(1, 2, 3, 4, -1, totalPages);
                } else if (currentPage >= totalPages - 2) {
                  pages.push(1, -1);
                  for (let i = totalPages - 3; i <= totalPages; i++)
                    pages.push(i);
                } else {
                  pages.push(
                    1,
                    -1,
                    currentPage - 1,
                    currentPage,
                    currentPage + 1,
                    -1,
                    totalPages
                  );
                }
                return pages.map((p, idx) =>
                  p === -1 ? (
                    <PaginationItem key={`el-${idx}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href={buildLink(searchParams, p)}
                        isActive={p === currentPage}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                );
              })()}

              <PaginationItem>
                {currentPage === totalPages ? (
                  <PaginationNext href="#" disabled />
                ) : (
                  <PaginationNext
                    href={buildLink(searchParams, currentPage + 1)}
                  />
                )}
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>

      {/* ===== BULK ACTION BAR ===== */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="bg-[#3F4660] text-white rounded-2xl shadow-2xl px-6 py-3 flex items-center gap-4">
            <span className="text-sm font-semibold whitespace-nowrap">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
            </span>
            <div className="w-px h-6 bg-white/20" />
            <div className="flex items-center gap-2">
              <button
                onClick={() => executeBulkAction("ATTENTE")}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-semibold hover:bg-yellow-600 transition disabled:opacity-50"
              >
                <ArrowRight size={12} />
                En attente
              </button>
              <button
                onClick={() => executeBulkAction("ENTREE")}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition disabled:opacity-50"
              >
                <ArrowRight size={12} />
                Entrée
              </button>
              <button
                onClick={() => executeBulkAction("SORTIE")}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition disabled:opacity-50"
              >
                <ArrowRight size={12} />
                Sortie
              </button>
              <button
                onClick={() => executeBulkAction("ARCHIVE")}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 text-white rounded-lg text-xs font-semibold hover:bg-gray-700 transition disabled:opacity-50"
              >
                <Archive size={12} />
                Archiver
              </button>
            </div>
            <div className="w-px h-6 bg-white/20" />
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-white/70 hover:text-white transition"
            >
              Annuler
            </button>
            {bulkLoading && <Loader2 size={16} className="animate-spin text-white/70" />}
          </div>
        </div>
      )}
    </>
  );
}
