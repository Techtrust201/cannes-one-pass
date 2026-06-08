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

/** Mapping d'une sélection CityAutocomplete → champs véhicule (ville, pays, km). */
export function mapCitySelectToVehicleFields(city: {
  name: string;
  country: string;
  distance: number;
}): { city: string; country: CountryRegion; estimatedKms?: number } {
  return {
    city: city.name,
    country: COUNTRY_NAME_TO_ENUM[city.country] ?? "AUTRE",
    estimatedKms: city.distance > 0 ? city.distance : undefined,
  };
}
