"use client";

import Link from "next/link";
import { List, Pencil, Trash2, LogIn, LogOut, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import StatusPill from "./StatusPill";
import MobileAccreditationList from "./MobileAccreditationList";
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
import type { Accreditation, Zone } from "@/types";

/* ---------- Types ---------- */
export interface AccreditationTableProps {
  pageData: Accreditation[];
  currentPage: number;
  totalPages: number;
  filteredCount: number;
  perPage: number;
  searchParams: Record<string, string>;
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
    | "duration";
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

/* ---------- Helper: format duration ---------- */
function fmtDuration(entryAt: Date | string | null | undefined, exitAt: Date | string | null | undefined) {
  if (!entryAt || !exitAt) return null;
  const ms = +new Date(exitAt) - +new Date(entryAt);
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const min = Math.floor(ms / 60000) % 60;
  if (h > 0) return `${h}h${min > 0 ? `${String(min).padStart(2, "0")}` : ""}`;
  return `${min}min`;
}

/* ---------- Helper: truncate ---------- */
function truncate(text: string | undefined | null, max: number) {
  if (!text) return "-";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export default function AccreditationTable({
  pageData,
  currentPage,
  totalPages,
  filteredCount,
  perPage,
  searchParams,
  sort,
  dir,
}: AccreditationTableProps) {
  const router = useRouter();

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
                <Th label="Statut" sortKey="status" />
                <Th label="Société" sortKey="company" />
                <Th label="Événement" sortKey="event" />
                <Th label="Date" sortKey="createdAt" />
                <Th label="Horaires" sortKey="entryAt" />
                <th className="px-2 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider text-center whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {pageData.map((acc, index) => {
                const duration = fmtDuration(acc.entryAt, acc.exitAt);
                return (
                  <tr
                    key={String(acc.id)}
                    className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                    }`}
                  >
                    {/* Statut (with zone dot) */}
                    <td className="px-2 py-2">
                      <StatusPill
                        status={acc.status as string}
                        zone={acc.currentZone as Zone | undefined}
                        compact
                      />
                    </td>

                    {/* Société */}
                    <td
                      className="px-2 py-2 font-medium text-gray-800 max-w-[140px]"
                      title={acc.company || undefined}
                    >
                      <span className="block truncate">{acc.company || "-"}</span>
                    </td>

                    {/* Événement */}
                    <td className="px-2 py-2 text-gray-600 max-w-[100px]">
                      <span className="block truncate">{truncate(acc.event, 16)}</span>
                    </td>

                    {/* Date */}
                    <td className="px-2 py-2 text-gray-500 whitespace-nowrap">
                      {acc.createdAt
                        ? new Date(acc.createdAt).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                          })
                        : "-"}
                    </td>

                    {/* Horaires (merged: entry + duration/exit) */}
                    <td className="px-2 py-2">
                      {acc.entryAt ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <LogIn size={10} className="shrink-0" />
                            {new Date(acc.entryAt).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {acc.exitAt ? (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <LogOut size={10} className="shrink-0" />
                              {new Date(acc.exitAt).toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          ) : duration ? (
                            <span className="inline-flex items-center gap-1 text-gray-400">
                              <Clock size={10} className="shrink-0" />
                              {duration}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-blue-500 text-[10px]">
                              <Clock size={10} className="shrink-0 animate-pulse" />
                              en cours
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
                          href={buildLink(searchParams, currentPage, {
                            sel: String(acc.id),
                          })}
                          className="p-1.5 hover:bg-[#4F587E]/10 rounded-lg transition text-[#4F587E]"
                          title="Éditer"
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          onClick={() => handleDelete(acc.id)}
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
                  <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
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
    </>
  );
}
