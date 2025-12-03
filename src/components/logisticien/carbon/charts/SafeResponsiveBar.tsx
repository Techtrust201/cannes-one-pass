"use client";

import { useState, useEffect } from "react";

interface SafeResponsiveBarProps {
  data: any[];
  keys: string[];
  indexBy: string;
  margin?: any;
  padding?: number;
  valueScale?: any;
  indexScale?: any;
  colors?: any;
  borderColor?: any;
  axisTop?: any;
  axisRight?: any;
  axisBottom?: any;
  axisLeft?: any;
  labelSkipWidth?: number;
  labelSkipHeight?: number;
  labelTextColor?: any;
  legends?: any[];
  tooltip?: (data: any) => React.ReactNode;
  animate?: boolean;
  motionConfig?: string;
}

export default function SafeResponsiveBar(props: SafeResponsiveBarProps) {
  const [ResponsiveBar, setResponsiveBar] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadChart = async () => {
      try {
        const nivoModule = await import("@nivo/bar");
        setResponsiveBar(() => nivoModule.ResponsiveBar);
        setError(null);
      } catch (err) {
        console.error("Erreur chargement ResponsiveBar:", err);
        setError("Impossible de charger le graphique");
      } finally {
        setLoading(false);
      }
    };

    loadChart();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !ResponsiveBar) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        {error || "Graphique non disponible"}
      </div>
    );
  }

  return <ResponsiveBar {...props} />;
}


