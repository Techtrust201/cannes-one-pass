"use client";

import { useState, useEffect } from "react";
import { Calculator, MapPin, Loader2 } from "lucide-react";

interface CityDistanceCalculatorProps {
  city: string;
  onDistanceCalculated: (distance: number, country: string) => void;
  className?: string;
}

export default function CityDistanceCalculator({
  city,
  onDistanceCalculated,
  className = ""
}: CityDistanceCalculatorProps) {
  const [distance, setDistance] = useState<number | null>(null);
  const [country, setCountry] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateDistance = async () => {
    if (!city.trim()) {
      setDistance(null);
      setCountry("");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/distance?city=${encodeURIComponent(city.trim())}`);
      const data = await response.json();

      if (data.success) {
        setDistance(data.data.distance);
        setCountry(data.data.country);
        onDistanceCalculated(data.data.distance, data.data.country);
        
        if (!data.data.found) {
          setError(`Ville "${city}" non trouvée, distance estimée utilisée`);
        }
      } else {
        setError(data.error || "Erreur lors du calcul");
        setDistance(null);
        setCountry("");
      }
    } catch (err) {
      console.error("Erreur calcul distance:", err);
      setError("Erreur de connexion");
      setDistance(null);
      setCountry("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      calculateDistance();
    }, 1000); // Attendre 1s après la dernière saisie

    return () => clearTimeout(debounceTimer);
  }, [city]);

  if (!city.trim()) return null;

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <Calculator className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-blue-900">
          Calcul automatique de distance
        </span>
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
                {distance.toLocaleString('fr-FR')} km
              </div>
            </div>
            
            <div className="bg-white p-2 rounded border">
              <div className="text-gray-600">Émissions estimées</div>
              <div className="font-semibold text-green-700">
                {Math.round(distance * 0.25).toLocaleString('fr-FR')} kg CO₂
              </div>
              <div className="text-xs text-gray-500">
                (véhicule moyen)
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-600 bg-white p-2 rounded border">
            📍 <strong>Destination :</strong> Palais des festivals et des congrès de Cannes, 
            1 Bd de la Croisette, 06400 Cannes
          </div>
        </div>
      )}
    </div>
  );
}


