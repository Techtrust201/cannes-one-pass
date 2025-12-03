"use client";

import { useState } from "react";
import CarbonHeader from "@/components/logisticien/carbon/CarbonHeader";
import CarbonTabs from "@/components/logisticien/carbon/CarbonTabs";
import CarbonStats from "@/components/logisticien/carbon/CarbonStats";
import TableauTab from "@/components/logisticien/carbon/TableauTab";
import CamembertTab from "@/components/logisticien/carbon/CamembertTab";
import BatonsTab from "@/components/logisticien/carbon/BatonsTab";
import ListeTab from "@/components/logisticien/carbon/ListeTab";
import { useCarbonData } from "@/hooks/useCarbonData";

export type DateRange = {
  start: string;
  end: string;
};

export type CarbonTab = "Tableau" | "Camembert" | "Bâtons" | "Liste";

export default function CarbonPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({
    start: "01/01/2024",
    end: "31/12/2024",
  });
  const [activeTab, setActiveTab] = useState<CarbonTab>("Tableau");

  // Récupération des données réelles
  const { data, loading, error, isSearching, refetch } = useCarbonData(
    dateRange,
    searchQuery
  );

  const handleExport = async () => {
    try {
      const { exportToPDF } = await import("@/lib/carbonExport");
      await exportToPDF(activeTab);
    } catch (error) {
      console.error("Erreur lors de l'export:", error);
      alert("Erreur lors de l'export. Veuillez réessayer.");
    }
  };

  const renderActiveTab = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Chargement des données...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="text-red-600 font-medium">Erreur</div>
          </div>
          <p className="text-red-700 mt-2">{error}</p>
          <button
            onClick={refetch}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Réessayer
          </button>
        </div>
      );
    }

    if (!data || data.total === 0) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <p className="text-blue-800">
            Aucune donnée disponible pour la période sélectionnée.
          </p>
        </div>
      );
    }

    const commonProps = { data, dateRange, searchQuery };

    switch (activeTab) {
      case "Tableau":
        return <TableauTab {...commonProps} />;
      case "Camembert":
        return <CamembertTab {...commonProps} />;
      case "Bâtons":
        return <BatonsTab {...commonProps} />;
      case "Liste":
        return <ListeTab {...commonProps} />;
      default:
        return <TableauTab {...commonProps} />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <CarbonHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onExport={handleExport}
        loading={loading}
        isSearching={isSearching}
        onRefresh={refetch}
      />
      <CarbonStats data={data} loading={loading} />
      <CarbonTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6" data-export-content>
          {renderActiveTab()}
        </div>
      </div>
    </div>
  );
}
