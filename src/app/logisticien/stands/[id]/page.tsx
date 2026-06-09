export const dynamic = "force-dynamic";
export const maxDuration = 60;

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Store } from "lucide-react";
import prisma, { withRetry } from "@/lib/prisma";
import type { Accreditation } from "@/types";
import {
  mapDbVehicleType,
  mapDefaultVehicleTypes,
  resolveVehicleTypeShortLabelFromList,
} from "@/lib/vehicle-type-server";
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import { withEspaceQuery } from "@/lib/url";
import StandAccreditationsList, {
  type StandAccreditationRow,
} from "@/components/logisticien/StandAccreditationsList";
import QrCodeBlock from "@/components/logisticien/QrCodeBlock";

async function loadVehicleTypesForOrg(
  orgId: string | null,
  orgSlug?: string | null
): Promise<VehicleTypeData[]> {
  if (orgId) {
    const types = await prisma.vehicleTypeConfig.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    if (types.length > 0) return types.map(mapDbVehicleType);
  }
  return mapDefaultVehicleTypes(orgSlug);
}

export default async function StandDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await props.params;
  const paramsObj = await props.searchParams;
  const espace = paramsObj.espace?.trim() || null;

  const stand = await withRetry(() =>
    prisma.stand.findUnique({
      where: { id },
      include: {
        accreditations: {
          where: { isArchived: false },
          include: { vehicles: true },
          orderBy: { createdAt: "desc" },
        },
      },
    })
  );
  if (!stand) return notFound();

  const vehicleTypes = await loadVehicleTypesForOrg(stand.organizationId, espace);

  const rows: StandAccreditationRow[] = stand.accreditations.map((a) => {
    const safeAcc = {
      ...a,
      vehicles: a.vehicles.map((v) => ({
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
    };
    const v0 = a.vehicles[0];
    const gabarit = v0
      ? resolveVehicleTypeShortLabelFromList(vehicleTypes, v0.vehicleType, v0.size)
      : "";
    return { acc: safeAcc as unknown as Accreditation, gabarit };
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 p-3 sm:p-6 max-w-3xl mx-auto w-full">
      <Link
        href={withEspaceQuery("/logisticien/stands", espace)}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"
      >
        <ChevronLeft size={16} /> Tous les stands
      </Link>

      <div className="mb-4">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
          <Store size={20} className="text-[#4F587E]" />
          Stand {stand.number}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {rows.length > 1
            ? `${rows.length} accréditations rattachées`
            : `${rows.length} accréditation rattachée`}
          {stand.sector ? ` · ${stand.sector}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
        <div className="min-w-0">
          <StandAccreditationsList rows={rows} espace={espace} />
        </div>
        <div className="lg:w-64">
          <QrCodeBlock
            path={`/logisticien/stands/${stand.id}`}
            label="QR Stand"
            caption="Accès à toutes les accréditations de ce stand."
            fileName={`qr-stand-${stand.number}`}
          />
        </div>
      </div>
    </div>
  );
}
