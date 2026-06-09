export const dynamic = "force-dynamic";
export const maxDuration = 60;

import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, MapPin, Truck, ArrowRight } from "lucide-react";
import prisma, { withRetry } from "@/lib/prisma";
import { Accreditation } from "@/types";
import StatusPill from "@/components/logisticien/StatusPill";
import ActionButtons from "@/components/logisticien/ActionButtons";
import AccreditationQrBadge from "@/components/logisticien/AccreditationQrBadge";
import {
  mapDbVehicleType,
  mapDefaultVehicleTypes,
} from "@/lib/vehicle-type-server";
import { resolveVehicleTypeShortLabelFromList } from "@/lib/vehicle-type-resolve";

/**
 * Page de vérification "guérite" — cible du scan QR.
 *
 * Affiche les informations clés de l'accréditation en grand (mobile/terrain)
 * et les actions contextuelles selon le statut, en réutilisant le composant
 * `ActionButtons` (entrée/sortie/transfert/refus/retour) — aucune logique
 * dupliquée.
 */
export default async function VerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const acc = await withRetry(() =>
    prisma.accreditation.findUnique({
      where: { id },
      include: {
        vehicles: true,
        organization: { select: { id: true, slug: true } },
      },
    })
  );
  if (!acc) return notFound();

  const orgId = acc.organization?.id ?? null;
  const dbTypes = orgId
    ? await prisma.vehicleTypeConfig.findMany({
        where: { organizationId: orgId, isActive: true },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const vehicleTypes =
    dbTypes.length > 0
      ? dbTypes.map(mapDbVehicleType)
      : mapDefaultVehicleTypes(acc.organization?.slug);

  const safeAcc = {
    ...acc,
    vehicles: acc.vehicles.map((v) => ({
      ...v,
      unloading: Array.isArray(v.unloading)
        ? v.unloading
        : typeof v.unloading === "string" && v.unloading.startsWith("[")
          ? (() => {
              try {
                return JSON.parse(v.unloading as string);
              } catch {
                return [v.unloading];
              }
            })()
          : v.unloading
            ? [v.unloading]
            : [],
    })),
  } as unknown as Accreditation;

  const firstVehicle = safeAcc.vehicles[0];

  return (
    <div className="max-w-lg mx-auto p-3 sm:p-6 space-y-5">
      {/* En-tete verification */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-[#4F587E] text-white px-5 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-white/70">
              Vérification accréditation
            </p>
            <h1 className="text-lg font-bold truncate flex items-center gap-2">
              <Building2 size={18} className="shrink-0" />
              {safeAcc.company}
            </h1>
          </div>
          <StatusPill status={safeAcc.status} zone={safeAcc.currentZone} />
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Stand
              </p>
              <p className="font-medium text-gray-900">{safeAcc.stand || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Événement
              </p>
              <p className="font-medium text-gray-900 truncate">
                {safeAcc.event || "—"}
              </p>
            </div>
            <div className="flex items-start gap-1.5">
              <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Zone actuelle
                </p>
                <p className="font-medium text-gray-900">
                  {safeAcc.currentZone || "Hors zone"}
                </p>
              </div>
            </div>
          </div>

          {/* Vehicule(s) */}
          {safeAcc.vehicles.length > 0 && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-2">
              {safeAcc.vehicles.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 text-sm flex-wrap"
                >
                  <span className="font-mono font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200">
                    {v.plate || "Plaque à l'arrivée"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-[#4F587E] font-medium">
                    <Truck size={12} />
                    {resolveVehicleTypeShortLabelFromList(vehicleTypes, v.vehicleType, v.size)}
                  </span>
                  {v.trailerPlate && (
                    <span className="text-xs text-gray-500">
                      Rem. <span className="font-mono">{v.trailerPlate}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* QR + lien fiche complete */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <AccreditationQrBadge
              id={safeAcc.id}
              size={120}
              caption={firstVehicle?.plate ?? undefined}
            />
            <Link
              href={`/logisticien/${safeAcc.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4F587E] hover:underline"
            >
              Fiche complète
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>

      {/* Actions terrain contextuelles (reutilise ActionButtons) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-800 mb-3">Actions</h2>
        <ActionButtons acc={safeAcc} />
      </div>
    </div>
  );
}
