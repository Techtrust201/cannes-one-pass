"use client";

import type { CarbonTab } from "@/app/logisticien/carbon/page";

interface CarbonTabsProps {
  activeTab: CarbonTab;
  onTabChange: (tab: CarbonTab) => void;
}

const tabs: CarbonTab[] = ["Tableau", "Camembert", "Bâtons", "Liste"];

export default function CarbonTabs({
  activeTab,
  onTabChange,
}: CarbonTabsProps) {
  return (
    <div className="bg-[#3F4660] border-b border-gray-300">
      <div className="px-6">
        <div className="flex space-x-0">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`px-6 py-3 text-sm font-medium border-r border-gray-400 last:border-r-0 transition-colors ${
                activeTab === tab
                  ? "bg-white text-gray-900"
                  : "text-white hover:bg-white/10"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
