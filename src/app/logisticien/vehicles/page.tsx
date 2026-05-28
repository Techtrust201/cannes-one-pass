"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Truck } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import VehicleTypesSection from "@/components/logisticien/VehicleTypesSection";
import VehiclesTabs, {
  type VehiclesTab,
} from "@/components/logisticien/vehicles/VehiclesTabs";
import UnloadingProvidersSection from "@/components/logisticien/vehicles/UnloadingProvidersSection";
import PermanentsPlaceholder from "@/components/logisticien/vehicles/PermanentsPlaceholder";

const VALID_TABS = new Set<VehiclesTab>(["providers", "types", "permanents"]);

function FluxVehiculesPageContent() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const canWrite = hasPermission("FLUX_VEHICULES", "write");
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab") ?? "providers";
  const tab: VehiclesTab = VALID_TABS.has(tabParam as VehiclesTab)
    ? (tabParam as VehiclesTab)
    : "providers";

  if (permLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="animate-spin" size={24} />
          <span>Chargement…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#4F587E] rounded-xl text-white">
              <Truck size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Flux véhicules
              </h1>
              <p className="text-sm text-gray-500">
                Prestataires de déchargement, gabarits véhicules et
                accréditations permanentes.
              </p>
            </div>
          </div>
        </header>

        <VehiclesTabs active={tab} />

        {tab === "providers" && (
          <UnloadingProvidersSection canWrite={canWrite} />
        )}
        {tab === "types" && <VehicleTypesSection canWrite={canWrite} />}
        {tab === "permanents" && <PermanentsPlaceholder />}
      </div>
    </div>
  );
}

export default function FluxVehiculesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="animate-spin" size={24} />
            <span>Chargement…</span>
          </div>
        </div>
      }
    >
      <FluxVehiculesPageContent />
    </Suspense>
  );
}
