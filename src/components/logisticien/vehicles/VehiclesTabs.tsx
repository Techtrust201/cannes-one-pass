"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Truck, Box, ShieldCheck } from "lucide-react";

export type VehiclesTab = "providers" | "types" | "permanents";

interface VehiclesTabsProps {
  active: VehiclesTab;
}

interface TabDef {
  id: VehiclesTab;
  label: string;
  icon: typeof Truck;
  badge?: string;
}

const TABS: TabDef[] = [
  { id: "providers", label: "Prestataires", icon: Truck },
  { id: "types", label: "Types de véhicule", icon: Box },
  { id: "permanents", label: "Accès permanents", icon: ShieldCheck, badge: "Bientôt" },
];

export default function VehiclesTabs({ active }: VehiclesTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function switchTab(tab: VehiclesTab) {
    const qs = new URLSearchParams(searchParams?.toString() ?? "");
    qs.set("tab", tab);
    router.replace(`${pathname || "/logisticien/vehicles"}?${qs.toString()}`, {
      scroll: false,
    });
  }

  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex overflow-x-auto">
        {TABS.map((t) => {
          const isActive = active === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition min-w-[140px] whitespace-nowrap ${
                isActive
                  ? "border-[#4F587E] text-[#4F587E] bg-[#4F587E]/5"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={16} />
              <span>{t.label}</span>
              {t.badge && (
                <span className="ml-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
