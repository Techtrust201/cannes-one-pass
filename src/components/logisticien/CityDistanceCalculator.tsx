"use client";

import { useState, useEffect, useRef } from "react";
import { Calculator, MapPin, Loader2 } from "lucide-react";
import { findCity } from "@/lib/city-search";

interface CityDistanceCalculatorProps {
  city: string;
  onDistanceCalculated: (distance: number, country: string) => void;
  className?: string;
}

export default function CityDistanceCalculator({
  city,
  onDistanceCalculated,
  className = "",
}: CityDistanceCalculatorProps) {
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const lastCity = useRef("");

  useEffect(() => {
    if (!city.trim()) {
      setDistance(null);
      setError(null);
      return;
    }

    // Éviter les doublons
    if (city.trim() === lastCity.current) return;

    // 1. Essayer la base locale d'abord (instantané)
    const localMatch = findCity(city.trim());
    if (localMatch) {
      lastCity.current = city.trim();
      setDistance(localMatch.d);
      setSource("local");
      setError(null);
      setLoading(false);

      // Map country name to enum
      const MAP: Record<string, string> = {
        France: "FRANCE", Allemagne: "ALLEMAGNE", Italie: "ITALIE",
        Espagne: "ESPAGNE", "Royaume-Uni": "ROYAUME_UNI", Belgique: "BELGIQUE",
        Suisse: "SUISSE", "Pays-Bas": "PAYS_BAS", Portugal: "PORTUGAL",
        Pologne: "POLOGNE", Monaco: "FRANCE",
      };
      onDistanceCalculated(localMatch.d, MAP[localMatch.p] ?? "AUTRE");
      return;
    }

    // 2. Fallback API (debounce 1s)
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(
          `/api/distance?city=${encodeURIComponent(city.trim())}`
        );
        const data = await resp.json();
        lastCity.current = city.trim();

        if (data.distance != null) {
          setDistance(data.distance);
          setSource(data.source || "api");
          onDistanceCalculated(data.distance, data.country || "AUTRE");
          if (data.source === "fallback") {
            setError(`Ville "${city}" non trouvée, distance estimée`);
          } else {
            setError(null);
          }
        } else {
          setError(data.error || "Erreur lors du calcul");
          setDistance(null);
        }
      } catch (err) {
        console.error("Erreur calcul distance:", err);
        setError("Erreur de connexion");
        setDistance(null);
      } finally {
        setLoading(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  if (!city.trim()) return null;

  return (
    <div
      className={`bg-blue-50 border border-blue-200 rounded-lg p-3 ${className}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Calculator className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-blue-900">
          Calcul automatique de distance
        </span>
        {source === "local" && (
          <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
            instantané
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-blue-700">
          <Loader2 className="w-4 h-4 animate-spin" />
          Calcul en cours depuis {city}...
        </div>
      )}

      {error && (
        <div className="text-sm text-orange-700 bg-orange-50 p-2 rounded">
          ⚠️ {error}
        </div>
      )}

      {distance !== null && !loading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-green-600" />
            <span className="text-green-800">
              <strong>{city}</strong> → <strong>Cannes</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-white p-2 rounded border">
              <div className="text-gray-600">Distance</div>
              <div className="font-semibold text-blue-900">
                {distance.toLocaleString("fr-FR")} km
              </div>
            </div>

            <div className="bg-white p-2 rounded border">
              <div className="text-gray-600">Émissions estimées</div>
              <div className="font-semibold text-green-700">
                {Math.round(distance * 0.265).toLocaleString("fr-FR")} kg CO₂
              </div>
              <div className="text-xs text-gray-500">(véhicule moyen)</div>
            </div>
          </div>

          <div className="text-xs text-gray-600 bg-white p-2 rounded border">
            📍 <strong>Destination :</strong> Palais des festivals et des congrès
            de Cannes, 1 Bd de la Croisette, 06400 Cannes
          </div>
        </div>
      )}
    </div>
  );
}
