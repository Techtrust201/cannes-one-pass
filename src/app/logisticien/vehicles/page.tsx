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
import CountingSection from "@/components/logisticien/vehicles/CountingSection";
import RxCapacitiesSection from "@/components/logisticien/vehicles/RxCapacitiesSection";
import PageHelp from "@/components/logisticien/help/PageHelp";
import Glossary from "@/components/logisticien/help/Glossary";

const VALID_TABS = new Set<VehiclesTab>([
  "providers",
  "types",
  "stats",
  "permanents",
  "capacities",
]);

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
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-8">
      <div
        className={`mx-auto ${
          tab === "capacities" ? "max-w-7xl" : "max-w-4xl"
        }`}
      >
        <header className="mb-4 sm:mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-[#4F587E] rounded-xl text-white shrink-0">
              <Truck size={24} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                Flux véhicules
              </h1>
              <p className="text-sm text-gray-500">
                Prestataires, types de véhicule, comptages et quotas.
              </p>
            </div>
          </div>
        </header>

        <PageHelp storageKey="logisticien-vehicles" glossaryHref="#lexique-vehicles">
          <p>
            Paramétrez les <strong>types de véhicules</strong>, les prestataires de déchargement
            et consultez les comptages.
          </p>
          <p>
            Pour RX, les quotas détaillés se gèrent aussi dans{" "}
            <strong>Planning &amp; quotas</strong> (Paramétrage RX) — l’onglet Capacités ici reste
            disponible en complément.
          </p>
        </PageHelp>
        <Glossary
          id="lexique-vehicles"
          title="Lexique — Flux véhicules"
          terms={[
            { term: "Type de véhicule", definition: "Gabarit / famille utilisé dans le formulaire (léger, lourd, etc.)." },
            { term: "Prestataire", definition: "Société de déchargement proposée lors de la création." },
            { term: "Capacités", definition: "Plafonds de véhicules par créneau (quotas)." },
          ]}
        />

        <VehiclesTabs active={tab} />

        {tab === "providers" && (
          <UnloadingProvidersSection canWrite={canWrite} />
        )}
        {tab === "types" && <VehicleTypesSection canWrite={canWrite} />}
        {tab === "stats" && <CountingSection />}
        {tab === "permanents" && <PermanentsPlaceholder />}
        {tab === "capacities" && <RxCapacitiesSection canWrite={canWrite} />}
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
