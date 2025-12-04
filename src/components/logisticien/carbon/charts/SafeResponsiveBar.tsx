"use client";

import { useState, useEffect } from "react";

interface BarDataPoint {
  [key: string]: string | number;
}

interface SafeResponsiveBarProps {
  data: BarDataPoint[];
  keys: string[];
  indexBy: string;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  padding?: number;
  valueScale?: Record<string, unknown>;
  indexScale?: Record<string, unknown>;
  colors?: string[] | ((datum: BarDataPoint) => string) | Record<string, unknown>;
  borderColor?: string | ((datum: BarDataPoint) => string) | Record<string, unknown>;
  axisTop?: Record<string, unknown> | null;
  axisRight?: Record<string, unknown> | null;
  axisBottom?: Record<string, unknown> | null;
  axisLeft?: Record<string, unknown> | null;
  labelSkipWidth?: number;
  labelSkipHeight?: number;
  labelTextColor?: string | ((datum: BarDataPoint) => string) | Record<string, unknown>;
  legends?: Array<Record<string, unknown>>;
  tooltip?: (data: BarDataPoint) => React.ReactNode;
  animate?: boolean;
  motionConfig?: string;
  [key: string]: unknown; // Permettre toutes les autres props de Nivo
}

export default function SafeResponsiveBar(props: SafeResponsiveBarProps) {
  const [ResponsiveBar, setResponsiveBar] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadChart = async () => {
      try {
        const nivoModule = await import("@nivo/bar");
        setResponsiveBar(() => nivoModule.ResponsiveBar as React.ComponentType<Record<string, unknown>>);
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

  return <ResponsiveBar {...(props as unknown as Record<string, unknown>)} />;
}


