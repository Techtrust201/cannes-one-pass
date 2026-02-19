import Link from "next/link";
import { Pencil, Trash2, LogIn, LogOut, Clock, MapPin, Briefcase, ChevronLeft, ChevronRight } from "lucide-react";
import StatusPill from "./StatusPill";
import type { Accreditation } from "@/types";
import { getZoneLabel, getZoneColorClasses } from "@/lib/zone-utils";
import { buildLink } from "@/lib/url";

interface MobileAccreditationListProps {
  pageData: Accreditation[];
  onDelete: (id: string) => void;
  currentPage: number;
  totalPages: number;
  filteredCount: number;
  perPage: number;
  searchParams: Record<string, string>;
}

function fmtDuration(entryAt: Date | string | null | undefined, exitAt: Date | string | null | undefined) {
  if (!entryAt || !exitAt) return null;
  const ms = +new Date(exitAt) - +new Date(entryAt);
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const min = Math.floor(ms / 60000) % 60;
  if (h > 0) return `${h}h${min > 0 ? String(min).padStart(2, "0") : ""}`;
  return `${min}min`;
}

export default function MobileAccreditationList({
  pageData,
  onDelete,
  currentPage,
  totalPages,
  filteredCount,
  perPage,
  searchParams,
}: MobileAccreditationListProps) {
  return (
    <div className="block md:hidden w-full space-y-3 overflow-x-hidden">
      {/* Compteur de résultats */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-gray-500 font-medium">
          {filteredCount === 0
            ? "Aucun résultat"
            : `${Math.min((currentPage - 1) * perPage + 1, filteredCount)}–${Math.min(currentPage * perPage, filteredCount)} sur ${filteredCount}`}
        </p>
      </div>

      {pageData.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Aucune accréditation trouvée
        </div>
      )}

      {pageData.map((acc) => {
        const zone = acc.currentZone || undefined;
        // Afficher exclusivement le dernier step
        const displayEntry = acc.lastStepEntryAt || acc.entryAt;
        const displayExit = acc.lastStepExitAt || acc.exitAt;
        const displayZone = acc.lastStepZone || zone;
        const duration = fmtDuration(displayEntry, displayExit);
        const plate = acc.vehicles?.[0]?.plate;

        return (
          <div
            key={acc.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3 active:bg-gray-50 transition-colors"
          >
            {/* Row 1: Status + Zone + Date */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill status={acc.status as string} zone={zone} compact />

              {zone && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${getZoneColorClasses(zone)}`}
                >
                  <MapPin size={9} className="shrink-0" />
                  {getZoneLabel(zone)}
                </span>
              )}

              <span className="ml-auto text-[10px] text-gray-400 whitespace-nowrap">
                {acc.vehicles?.[0]?.date ?? ""}
              </span>
            </div>

            {/* Row 2: Company + plate */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate leading-tight">
                  {acc.company || "Sans nom"}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {plate && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono font-bold text-gray-700 tracking-wide">
                      {plate}
                    </span>
                  )}
                  {acc.event && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                      <Briefcase size={9} className="shrink-0" />
                      {acc.event}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3: Horaires — dernier step uniquement */}
            {(displayEntry || displayExit) && (
              <div className="flex items-center gap-3 text-[11px] flex-wrap">
                {displayEntry && (
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <LogIn size={10} className="shrink-0" />
                    {new Date(displayEntry).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {displayExit ? (
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <LogOut size={10} className="shrink-0" />
                    {new Date(displayExit).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : displayEntry ? (
                  <span className="inline-flex items-center gap-1 text-blue-500">
                    <Clock size={10} className="shrink-0 animate-pulse" />
                    en cours
                  </span>
                ) : null}
                {duration && (
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <Clock size={10} className="shrink-0" />
                    {duration}
                  </span>
                )}
                {displayZone && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] text-[#4F587E] font-medium">
                    <MapPin size={8} className="shrink-0" />
                    {getZoneLabel(displayZone)}
                  </span>
                )}
              </div>
            )}

            {/* Row 4: Actions */}
            <div className="flex gap-2 pt-1 border-t border-gray-100">
              <Link
                href={`/logisticien/${acc.id}`}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#4F587E] text-white font-semibold text-xs shadow-sm hover:bg-[#3B4252] active:bg-[#2d3347] transition min-h-[44px]"
              >
                <Pencil size={13} />
                Éditer
              </Link>
              <button
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-red-50 text-red-600 font-semibold text-xs border border-red-200 hover:bg-red-100 active:bg-red-200 transition min-h-[44px] min-w-[44px]"
                onClick={() => onDelete(acc.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Pagination mobile */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 pb-2">
          {currentPage > 1 ? (
            <Link
              href={buildLink(searchParams, currentPage - 1)}
              className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 active:bg-gray-100 transition min-h-[44px] shadow-sm"
            >
              <ChevronLeft size={16} />
              Préc.
            </Link>
          ) : (
            <div />
          )}

          <span className="text-xs text-gray-500 font-medium">
            Page {currentPage}/{totalPages}
          </span>

          {currentPage < totalPages ? (
            <Link
              href={buildLink(searchParams, currentPage + 1)}
              className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 active:bg-gray-100 transition min-h-[44px] shadow-sm"
            >
              Suiv.
              <ChevronRight size={16} />
            </Link>
          ) : (
            <div />
          )}
        </div>
      )}
    </div>
  );
}
