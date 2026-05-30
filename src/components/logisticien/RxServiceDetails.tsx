"use client";

import { CalendarClock, Truck, Wrench, Building2 } from "lucide-react";
import { findCategory, formatDateFR, formatSlot } from "@/templates/accreditation/rx/config";

interface VehicleContext {
  categoryId?: string | null;
  livDate?: string | null;
  livTime?: string | null;
  repDate?: string | null;
  repTime?: string | null;
  repSameAsDelivery?: boolean;
  repPlate?: string | null;
  repVehicleType?: string | null;
  repPhoneCode?: string | null;
  repPhoneNumber?: string | null;
  interveningCompany?: string | null;
}

interface RxExtensionShape {
  space?: string;
  manutentionProvider?: string;
  scalesAssigned?: boolean;
  vehicleContext?: VehicleContext;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDateFR(iso);
  return iso;
}

function fmtSlot(time: string | null | undefined): string {
  if (!time) return "—";
  return formatSlot(time);
}

export default function RxServiceDetails({
  extension,
}: {
  extension?: Record<string, unknown> | null;
}) {
  if (!extension || typeof extension !== "object") return null;
  const ext = extension as RxExtensionShape;
  const ctx = ext.vehicleContext;

  // N'affiche rien pour les accréditations non-RX (pas de contexte de service).
  if (!ctx && !ext.manutentionProvider) return null;

  const categoryDef =
    ctx?.categoryId && ext.space ? findCategory(ext.space, ctx.categoryId) : null;
  const sameRep = ctx?.repSameAsDelivery !== false;

  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 className="font-semibold text-base text-gray-800 flex items-center gap-2 mb-3">
        <div className="w-3 h-3 bg-[#3DAAA4] rounded-full" />
        Détail des services
      </h3>

      <div className="space-y-3 text-sm">
        {categoryDef && (
          <div className="flex items-center gap-2 text-gray-800 font-medium">
            <span>{categoryDef.icon}</span>
            <span>{categoryDef.name}</span>
          </div>
        )}

        {ctx?.interveningCompany && (
          <div className="flex items-start gap-2">
            <Building2 size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-gray-500">Société intervenante : </span>
              <span className="text-gray-800 font-medium">
                {ctx.interveningCompany}
              </span>
            </div>
          </div>
        )}

        {ctx && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1">
                <CalendarClock size={13} /> Livraison (montage)
              </div>
              <div className="text-gray-800">{fmtDate(ctx.livDate)}</div>
              <div className="text-gray-500 text-xs">{fmtSlot(ctx.livTime)}</div>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1">
                <CalendarClock size={13} /> Reprise (démontage)
              </div>
              <div className="text-gray-800">{fmtDate(ctx.repDate)}</div>
              <div className="text-gray-500 text-xs">{fmtSlot(ctx.repTime)}</div>
            </div>
          </div>
        )}

        {ctx && (
          <div className="flex items-start gap-2">
            <Truck size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-gray-500">Véhicule de reprise : </span>
              {sameRep ? (
                <span className="text-gray-800">
                  identique au véhicule de livraison
                </span>
              ) : (
                <span className="text-gray-800">
                  {ctx.repPlate || "plaque non renseignée"}
                  {ctx.repPhoneNumber
                    ? ` · ${ctx.repPhoneCode ?? ""} ${ctx.repPhoneNumber}`.trim()
                    : ""}
                </span>
              )}
            </div>
          </div>
        )}

        {(ext.manutentionProvider || ext.scalesAssigned) && (
          <div className="flex items-start gap-2">
            <Wrench size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-gray-500">Manutention : </span>
              <span className="text-gray-800">
                {ext.manutentionProvider || "—"}
                {ext.scalesAssigned ? " · Scales assigné" : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
