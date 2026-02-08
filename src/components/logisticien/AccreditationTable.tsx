"use client";

import Link from "next/link";
import { List, Pencil, Trash2 } from "lucide-react";
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
import { getZoneLabel, isFinalDestination, ZONE_COLORS } from "@/lib/zone-utils";
import { truncateText } from "@/lib/utils";

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

/* ---------- Caret moderne ---------- */
function SortCaret({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return (
      <svg
        className="w-4 h-4 text-gray-400 opacity-60 group-hover:opacity-80 transition-opacity"
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
      className={`w-4 h-4 transition-all duration-200 ${
        active ? "text-[#4F587E]" : "text-gray-400"
      }`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      {dir === "asc" ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      )}
    </svg>
  );
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

  /* ----- tri (client) ----- */
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
    const nextDir: "asc" | "desc" =
      sort === key && dir === "asc" ? "desc" : "asc";
    const p = new URLSearchParams(searchParams);
    p.set("page", "1");
    p.set("sort", key);
    p.set("dir", nextDir);
    router.push(`?${p.toString()}`);
  };

  /* ----- suppression ----- */
  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Êtes-vous sûr de vouloir supprimer définitivement cette accréditation ?\n\nCette action est irréversible et supprimera toutes les données associées."
      )
    )
      return;
    const res = await fetch(`/api/accreditations/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else alert("Erreur lors de la suppression");
  };

  return (
    <>
      {/* ===== VERSION MOBILE ===== */}
      <MobileAccreditationList pageData={pageData} onDelete={handleDelete} />

      {/* ===== VERSION DESKTOP ===== */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl flex flex-col h-[85vh] hidden sm:flex overflow-hidden">
        {/* En-tête violet */}
        <div className="bg-[#4F587E] text-white rounded-t-2xl px-8 py-5 shadow flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <List size={22} />
            </div>
            Liste d&apos;accréditations
          </h1>
        </div>

        {/* Tableau */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto bg-white">
          <table className="min-w-full text-xs md:text-base border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-white text-gray-900 shadow-lg border-b border-gray-200">
                {/* COLONNE STATUT (triable) */}
                <th
                  onClick={() => toggleSort("status")}
                  className="group px-2 md:px-6 py-3 md:py-4 font-semibold text-xs md:text-sm first:pl-2 md:first:pl-8 text-center cursor-pointer select-none hover:bg-white/10 transition-all duration-200 border-r border-white/20"
                  aria-sort={
                    sort === "status"
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Statut</span>
                    <SortCaret active={sort === "status"} dir={dir} />
                  </div>
                </th>

                {/* COLONNE ZONE */}
                <th className="px-2 md:px-4 py-3 md:py-4 font-semibold text-xs md:text-sm text-center border-r border-white/20">
                  <span>Zone</span>
                </th>

                {/* COLONNE SOCIÉTÉ (triable) */}
                <th
                  onClick={() => toggleSort("company")}
                  className="group px-2 md:px-6 py-3 md:py-4 font-semibold text-xs md:text-sm text-center cursor-pointer select-none hover:bg-white/10 transition-all duration-200 border-r border-white/20"
                  aria-sort={
                    sort === "company"
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Société</span>
                    <SortCaret active={sort === "company"} dir={dir} />
                  </div>
                </th>

                {/* COLONNE STAND DESSERVI (triable) */}
                <th
                  onClick={() => toggleSort("stand")}
                  className="group px-2 md:px-6 py-3 md:py-4 font-semibold text-xs md:text-sm text-center cursor-pointer select-none hover:bg-white/10 transition-all duration-200 border-r border-white/20"
                  aria-sort={
                    sort === "stand"
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Stand desservi</span>
                    <SortCaret active={sort === "stand"} dir={dir} />
                  </div>
                </th>
                {/* COLONNE ÉVÉNEMENT (triable) */}
                <th
                  onClick={() => toggleSort("event")}
                  className="group px-2 md:px-6 py-3 md:py-4 font-semibold text-xs md:text-sm text-center cursor-pointer select-none hover:bg-white/10 transition-all duration-200 border-r border-white/20"
                  aria-sort={
                    sort === "event"
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Événement</span>
                    <SortCaret active={sort === "event"} dir={dir} />
                  </div>
                </th>

                {/* DATE (triable) */}
                <th
                  onClick={() => toggleSort("createdAt")}
                  className="group px-2 md:px-6 py-3 md:py-4 font-semibold text-xs md:text-sm text-center cursor-pointer select-none hover:bg-white/10 transition-all duration-200 border-r border-white/20"
                  aria-sort={
                    sort === "createdAt"
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Date</span>
                    <SortCaret active={sort === "createdAt"} dir={dir} />
                  </div>
                </th>

                {/* HEURE D'ENTRÉE (triable) */}
                <th
                  onClick={() => toggleSort("entryAt")}
                  className="group px-4 md:px-8 py-3 md:py-4 font-semibold text-xs md:text-sm text-center cursor-pointer select-none hover:bg-white/10 transition-all duration-200 border-r border-white/20 min-w-[200px]"
                  aria-sort={
                    sort === "entryAt"
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Heure d&apos;entrée</span>
                    <SortCaret active={sort === "entryAt"} dir={dir} />
                  </div>
                </th>

                <th
                  onClick={() => toggleSort("duration")}
                  className="group px-4 md:px-8 py-3 md:py-4 font-semibold text-xs md:text-sm text-center cursor-pointer select-none hover:bg-white/10 transition-all duration-200 border-r border-white/20 min-w-[200px]"
                  aria-sort={
                    sort === "duration"
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Heure sur site</span>
                    <SortCaret active={sort === "duration"} dir={dir} />
                  </div>
                </th>

                <th
                  onClick={() => toggleSort("exitAt")}
                  className="group px-4 md:px-8 py-3 md:py-4 font-semibold text-xs md:text-sm text-center cursor-pointer select-none hover:bg-white/10 transition-all duration-200 border-r border-white/20 min-w-[200px]"
                  aria-sort={
                    sort === "exitAt"
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Heure de sortie</span>
                    <SortCaret active={sort === "exitAt"} dir={dir} />
                  </div>
                </th>

                {/* ACTIONS */}
                <th className="px-6 py-3 md:py-4 text-center border-l border-white/20">
                  <span className="text-xs md:text-sm font-semibold">
                    Actions
                  </span>
                </th>
              </tr>
            </thead>

            <tbody className="bg-white">
              {pageData.map((acc, index) => (
                <tr
                  key={String(acc.id)}
                  className={`hover:bg-blue-50/50 transition-all duration-200 border-b border-gray-100 group ${
                    index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                  }`}
                >
                  <td className="py-3 md:py-4 px-2 md:px-6 text-center border-r border-gray-100">
                    <StatusPill status={acc.status as string} zone={acc.currentZone as Zone | undefined} />
                  </td>
                  <td className="px-2 md:px-4 py-3 md:py-4 text-center border-r border-gray-100">
                    {acc.currentZone ? (
                      <span 
                        className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium ${ZONE_COLORS[acc.currentZone as Zone]?.bg ?? "bg-gray-100"} ${ZONE_COLORS[acc.currentZone as Zone]?.text ?? "text-gray-800"}`}
                        title={getZoneLabel(acc.currentZone as Zone)}
                      >
                        {isFinalDestination(acc.currentZone as Zone) ? "✓ " : ""}
                        {truncateText(getZoneLabel(acc.currentZone as Zone), 12)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4 font-medium text-gray-800 text-center border-r border-gray-100">
                    {acc.company}
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-center border-r border-gray-100">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[#4F587E]/10 text-[#4F587E]">
                      {acc.stand || "-"}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-center border-r border-gray-100">
                    <span 
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800"
                      title={acc.event || undefined}
                    >
                      {truncateText(acc.event || "-", 15)}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4 whitespace-nowrap text-gray-600 text-center border-r border-gray-100">
                    {new Date(acc.createdAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 md:px-8 py-3 md:py-4 whitespace-nowrap text-gray-600 text-center border-r border-gray-100">
                    {acc.entryAt ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {new Date(acc.entryAt).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 md:px-8 py-3 md:py-4 whitespace-nowrap text-gray-600 text-center border-r border-gray-100">
                    {acc.entryAt && acc.exitAt ? (
                      (() => {
                        const ms =
                          +new Date(acc.exitAt) - +new Date(acc.entryAt);
                        if (ms <= 0)
                          return <span className="text-gray-400">-</span>;
                        const min = Math.floor(ms / 60000) % 60;
                        const h = Math.floor(ms / 3600000);
                        return (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {h}h {min}min
                          </span>
                        );
                      })()
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 md:px-8 py-3 md:py-4 whitespace-nowrap text-gray-600 text-center border-r border-gray-100">
                    {acc.exitAt ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        {new Date(acc.exitAt).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        href={buildLink(searchParams, currentPage, {
                          sel: String(acc.id),
                        })}
                        className="p-2 hover:bg-[#4F587E]/10 rounded-lg transition-all duration-200 text-[#4F587E] hover:text-[#3B4252]"
                        title="Éditer"
                      >
                        <Pencil size={16} />
                      </Link>
                      <button
                        onClick={() => handleDelete(acc.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-all duration-200 text-red-400 hover:text-red-600"
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination moderne */}
        <div className="px-8 py-5 bg-gradient-to-r from-gray-50 to-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-gray-700 flex-shrink-0 border-t border-gray-200 rounded-b-2xl shadow-inner">
          <span className="font-medium">
            {filteredCount === 0
              ? 0
              : Math.min((currentPage - 1) * perPage + 1, filteredCount)}
            –{Math.min(currentPage * perPage, filteredCount)} sur{" "}
            {filteredCount}
          </span>

          <Pagination>
            <PaginationContent>
              {/* bouton précédent */}
              <PaginationItem>
                {currentPage === 1 ? (
                  <PaginationPrevious href="#" disabled />
                ) : (
                  <PaginationPrevious
                    href={buildLink(searchParams, currentPage - 1)}
                  />
                )}
              </PaginationItem>

              {/* pages numérotées / ellipses */}
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

              {/* bouton suivant */}
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
