"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, X, CalendarClock } from "lucide-react";
import type { Accreditation } from "@/types";
import { PortalOverlay } from "@/components/ui/PortalOverlay";
import { formatDateFR, formatSlot } from "@/templates/accreditation/rx/config";
import AccreditationFormCard from "./AccreditationFormCard";
import StatusPill from "./StatusPill";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDateFR(iso);
  return iso;
}

export interface StandAccreditationRow {
  acc: Accreditation;
  gabarit: string;
}

interface Props {
  rows: StandAccreditationRow[];
  espace: string | null;
}

export default function StandAccreditationsList({ rows, espace }: Props) {
  const [openAcc, setOpenAcc] = useState<Accreditation | null>(null);

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        Aucune accréditation rattachée à ce stand.
      </div>
    );
  }

  const detailHref = (id: string) =>
    espace ? `/logisticien/${id}?espace=${encodeURIComponent(espace)}` : `/logisticien/${id}`;

  return (
    <>
      <div className="space-y-2">
        {rows.map(({ acc, gabarit }) => {
          const v = acc.vehicles?.[0];
          const phone = v ? `${v.phoneCode ?? ""} ${v.phoneNumber ?? ""}`.trim() : "";
          const ctx = (acc.extension ?? null) as {
            vehicleContext?: { livDate?: string | null; livTime?: string | null };
          } | null;
          const livDate = ctx?.vehicleContext?.livDate ?? v?.date ?? null;
          const livTime = ctx?.vehicleContext?.livTime ?? v?.time ?? null;
          const dateLabel = fmtDate(livDate);
          const slotLabel = livTime ? formatSlot(livTime) : "";
          return (
            <div
              key={acc.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {v?.plate ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-xs font-mono font-bold text-gray-700 tracking-wide">
                      {v.plate}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 italic">
                      Plaque non renseignée
                    </span>
                  )}
                  <StatusPill status={acc.status as string} compact />
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-600 flex-wrap">
                  {gabarit && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#4F587E]/10 text-[#4F587E] font-medium">
                      {gabarit}
                    </span>
                  )}
                  {phone && <span className="font-mono">{phone}</span>}
                  {acc.company && (
                    <span className="truncate text-gray-500">{acc.company}</span>
                  )}
                </div>
                {(dateLabel || slotLabel) && (
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-600">
                    <CalendarClock size={12} className="text-gray-400 shrink-0" />
                    <span>
                      {dateLabel}
                      {dateLabel && slotLabel ? " · " : ""}
                      {slotLabel}
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpenAcc(acc)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold shadow-sm hover:bg-red-700 active:bg-red-800 transition min-h-[40px]"
              >
                <ExternalLink size={14} />
                Ouvrir
              </button>
            </div>
          );
        })}
      </div>

      {openAcc && (
        <PortalOverlay>
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-start justify-center overflow-y-auto p-2 sm:p-6">
            <div className="relative w-full max-w-2xl my-4">
              <div className="sticky top-0 z-10 flex items-center justify-between bg-white rounded-t-2xl border border-gray-200 px-4 py-2.5 shadow-sm">
                <span className="font-semibold text-gray-800 text-sm">
                  Accréditation
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={detailHref(openAcc.id)}
                    className="hidden sm:inline-flex items-center gap-1 text-xs text-[#4F587E] hover:underline"
                  >
                    <ExternalLink size={13} /> Page complète
                  </Link>
                  <button
                    type="button"
                    onClick={() => setOpenAcc(null)}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                    aria-label="Fermer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 border-x border-b border-gray-200 rounded-b-2xl">
                <AccreditationFormCard acc={openAcc} />
              </div>
            </div>
          </div>
        </PortalOverlay>
      )}
    </>
  );
}
