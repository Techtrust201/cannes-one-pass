"use client";

import { useState, useEffect } from "react";

interface SafeResponsivePieProps {
  data: any[];
  margin?: any;
  innerRadius?: number;
  padAngle?: number;
  cornerRadius?: number;
  activeOuterRadiusOffset?: number;
  colors?: (d: any) => string;
  borderWidth?: number;
  borderColor?: any;
  enableArcLinkLabels?: boolean;
  enableArcLabels?: boolean;
  tooltip?: (datum: any) => React.ReactNode;
  animate?: boolean;
  motionConfig?: string;
}

export default function SafeResponsivePie(props: SafeResponsivePieProps) {
  const [ResponsivePie, setResponsivePie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadChart = async () => {
      try {
        const nivoModule = await import("@nivo/pie");
        setResponsivePie(() => nivoModule.ResponsivePie);
        setError(null);
      } catch (err) {
        console.error("Erreur chargement ResponsivePie:", err);
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

  if (error || !ResponsivePie) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        {error || "Graphique non disponible"}
      </div>
    );
  }

  return <ResponsivePie {...props} />;
}


