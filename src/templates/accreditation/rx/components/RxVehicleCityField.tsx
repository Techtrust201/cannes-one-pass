"use client";

import CityAutocomplete from "@/components/CityAutocomplete";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import type { CountryRegion } from "@/types";

const COUNTRY_NAME_TO_ENUM: Record<string, CountryRegion> = {
  France: "FRANCE",
  Espagne: "ESPAGNE",
  Italie: "ITALIE",
  Allemagne: "ALLEMAGNE",
  Belgique: "BELGIQUE",
  Suisse: "SUISSE",
  "Royaume-Uni": "ROYAUME_UNI",
  "Pays-Bas": "PAYS_BAS",
  Portugal: "PORTUGAL",
};

interface RxVehicleCityFieldProps {
  value: string;
  onChange: (city: string) => void;
  onSelect: (patch: {
    city: string;
    country?: CountryRegion;
    estimatedKms?: number;
  }) => void;
}

export function RxVehicleCityField({
  value,
  onChange,
  onSelect,
}: RxVehicleCityFieldProps) {
  const { t } = useTranslation();

  return (
    <div className="sm:col-span-3">
      <label className="text-xs text-gray-600 block mb-0.5">{t.departureCity}</label>
      <CityAutocomplete
        value={value}
        onChange={onChange}
        onCitySelect={(city) => {
          onSelect({
            city: city.name,
            country: COUNTRY_NAME_TO_ENUM[city.country] ?? "AUTRE",
            estimatedKms: city.distance > 0 ? city.distance : undefined,
          });
        }}
        className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm shadow-sm focus:ring-primary focus:border-primary"
      />
    </div>
  );
}
