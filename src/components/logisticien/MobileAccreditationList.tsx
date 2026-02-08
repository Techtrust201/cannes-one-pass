import Link from "next/link";
import { Pencil, Trash2, LogIn, LogOut, Clock, MapPin, Briefcase } from "lucide-react";
import StatusPill from "./StatusPill";
import type { Accreditation, Zone } from "@/types";
import { getZoneLabel, ZONE_COLORS } from "@/lib/zone-utils";

interface MobileAccreditationListProps {
  pageData: Accreditation[];
  onDelete: (id: string) => void;
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
}: MobileAccreditationListProps) {
  return (
    <div className="block sm:hidden w-full space-y-3 overflow-x-hidden pb-20">
      {pageData.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Aucune accréditation trouvée
        </div>
      )}

      {pageData.map((acc) => {
        const zone = acc.currentZone as Zone | undefined;
        const duration = fmtDuration(acc.entryAt, acc.exitAt);
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
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${ZONE_COLORS[zone]?.bg ?? "bg-gray-100"} ${ZONE_COLORS[zone]?.text ?? "text-gray-700"}`}
                >
                  <MapPin size={9} className="shrink-0" />
                  {getZoneLabel(zone)}
                </span>
              )}

              <span className="ml-auto text-[10px] text-gray-400 whitespace-nowrap">
                {acc.createdAt
                  ? new Date(acc.createdAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })
                  : ""}
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

            {/* Row 3: Horaires compact */}
            {(acc.entryAt || acc.exitAt) && (
              <div className="flex items-center gap-3 text-[11px]">
                {acc.entryAt && (
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <LogIn size={10} className="shrink-0" />
                    {new Date(acc.entryAt).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {acc.exitAt && (
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <LogOut size={10} className="shrink-0" />
                    {new Date(acc.exitAt).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {duration && (
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <Clock size={10} className="shrink-0" />
                    {duration}
                  </span>
                )}
                {acc.entryAt && !acc.exitAt && !duration && (
                  <span className="inline-flex items-center gap-1 text-blue-500">
                    <Clock size={10} className="shrink-0 animate-pulse" />
                    en cours
                  </span>
                )}
              </div>
            )}

            {/* Row 4: Actions */}
            <div className="flex gap-2 pt-1 border-t border-gray-100">
              <Link
                href={`/logisticien/${acc.id}`}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#4F587E] text-white font-semibold text-xs shadow-sm hover:bg-[#3B4252] transition"
              >
                <Pencil size={13} />
                Éditer
              </Link>
              <button
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 font-semibold text-xs border border-red-200 hover:bg-red-100 transition"
                onClick={() => onDelete(acc.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
