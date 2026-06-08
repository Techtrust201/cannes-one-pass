import { findCity } from "@/lib/city-search";
import { parseRxVehicleContext } from "@/lib/rx-vehicle-context";

// ── Mapping pays : nom brut ou code → pays en français ──────────────
export const COUNTRY_NAME_MAP: Record<string, string> = {
  FRANCE: "France", ESPAGNE: "Espagne", ITALIE: "Italie",
  ALLEMAGNE: "Allemagne", BELGIQUE: "Belgique", SUISSE: "Suisse",
  ROYAUME_UNI: "Royaume-Uni", PAYS_BAS: "Pays-Bas", PORTUGAL: "Portugal",
  AUTRE: "Autre",
};

const COUNTRY_KEYWORD_MAP: Record<string, string> = {
  france: "France", pologne: "Pologne", italie: "Italie",
  espagne: "Espagne", allemagne: "Allemagne", belgique: "Belgique",
  suisse: "Suisse", portugal: "Portugal", turquie: "Turquie",
  lituanie: "Lituanie", lettonie: "Lettonie", hongrie: "Hongrie",
  bulgarie: "Bulgarie", roumanie: "Roumanie", danemark: "Danemark",
  autriche: "Autriche", irlande: "Irlande", russie: "Russie",
  ukraine: "Ukraine",
  "royaume-uni": "Royaume-Uni", "royaume-unis": "Royaume-Uni",
  "pays-bas": "Pays-Bas",
  "république tchèque": "République tchèque", "république tchéque": "République tchèque",
  uk: "Royaume-Uni", poland: "Pologne", polska: "Pologne",
  italy: "Italie", spain: "Espagne", germany: "Allemagne",
  belgium: "Belgique", "united kingdom": "Royaume-Uni",
  turkey: "Turquie", turquir: "Turquie",
};

/**
 * Normalise un champ city brut en : { cityName, countryName, distance }
 * Gère les formats : "Nice, France" | "POLOGNE" | "lo,don" | "78 GUYANCOURT" | etc.
 */
export interface ResolvedCity {
  cityName: string;
  countryName: string;
  distance: number;
}

export function resolveCity(rawCity: string): ResolvedCity {
  const trimmed = (rawCity || "").trim();
  if (!trimmed) return { cityName: "", countryName: "Origine non renseignée", distance: 0 };

  const MANUAL_FIX: Record<string, string> = {
    "lo,don": "London", "kawe,": "Cannes", "Gones": "Gonesse",
    "Brignet": "Brignoles", "wiszkow": "Wyszków", "wisekow": "Wyszków",
    "wischkow  pologne": "Wyszków", "PERPIGNANT": "Perpignan",
    "TURQUIR": "Turquie", "Caros, Pérou": "Carros",
    "CELOREO PORTUGAL": "Porto", "mtx": "Cannes", "Po": "Pologne",
    "En Provence, États-Unis d'Amérique": "Aix-en-Provence",
    "Cannes la Bocca": "Cannes", "Cannes-la-Bocca, France": "Cannes",
    "Frejus, France": "Fréjus", "Prade, France": "Prades",
    "Greater London, United Kingdom": "London",
    "Lithuanian National Drama Theatre, Lituanie": "Vilnius",
    "Belgium, Belgium": "Belgique",
    "Czech, Pologne": "Częstochowa",
    "78 GUYANCOURT": "Versailles", "78 GUYANTCOURT": "Versailles",
    "Guyancourt": "Versailles",
    "Pegomas": "Pégomas", "PUGET": "Puget-sur-Argens",
    "CARROS": "Carros", "carros": "Carros",
    "Cannes": "Cannes", "Brignais": "Brignais",
    "BFAOUBCLIN": "Dublin",
    "Varsovie": "Varsovie", "Pologne": "Pologne",
    "République Tchéque": "République tchèque",
    "Royaume-Unis": "Royaume-Uni",
    "london": "London",
  };

  const input = MANUAL_FIX[trimmed] || trimmed;

  // Format "Ville, Pays" → extraire la partie ville
  let cityPart = input;
  let countryPart = "";
  const commaIdx = input.indexOf(", ");
  if (commaIdx > 0) {
    cityPart = input.substring(0, commaIdx).trim();
    countryPart = input.substring(commaIdx + 2).trim();
  }

  // Si c'est un code postal / département seul (91, 54, 69530, etc.)
  if (/^\d{2,5}$/.test(cityPart.replace(/\s/g, ""))) {
    return { cityName: cityPart, countryName: "France", distance: 863 };
  }
  // "78 GUYANCOURT" → "Guyancourt"
  if (/^\d{2}\s+\w/.test(cityPart)) {
    cityPart = cityPart.replace(/^\d{2,5}\s+/, "");
  }

  // Vérifier si c'est un nom de pays seul (pas une ville)
  const lowerFull = input.toLowerCase().replace(/,\s*/g, "").trim();
  const lowerCity = cityPart.toLowerCase().trim();
  const countryFromKeyword = COUNTRY_KEYWORD_MAP[lowerFull] || COUNTRY_KEYWORD_MAP[lowerCity];
  if (countryFromKeyword) {
    // "Pologne, Pologne" ou "POLOGNE" ou "POLSKA" → pays connu, distance = capitale
    const capitalDistances: Record<string, number> = {
      "Pologne": 1700, "Italie": 629, "Espagne": 1189, "Portugal": 1743,
      "Turquie": 2188, "Lituanie": 2168, "Lettonie": 2294, "Hongrie": 1239,
      "Bulgarie": 1589, "Roumanie": 1832, "Danemark": 1686, "Autriche": 1112,
      "Irlande": 1752, "Russie": 3067, "Ukraine": 2316,
      "Royaume-Uni": 1240, "Pays-Bas": 1241, "Belgique": 1045,
      "Allemagne": 1324, "France": 863, "Suisse": 574,
      "République tchèque": 1148,
    };
    return {
      cityName: countryFromKeyword,
      countryName: countryFromKeyword,
      distance: capitalDistances[countryFromKeyword] ?? 1500,
    };
  }

  // Essayer findCity sur la partie ville
  const match = findCity(cityPart);
  if (match) {
    return { cityName: match.n, countryName: match.p, distance: match.d };
  }

  // findCity sur l'input complet (au cas où)
  const matchFull = findCity(input);
  if (matchFull) {
    return { cityName: matchFull.n, countryName: matchFull.p, distance: matchFull.d };
  }

  // Villes/communes non présentes dans european-cities.json (distances pré-calculées vers Cannes)
  // Distances routières pré-calculées vers Cannes (Palais des Festivals)
  const EXTRA_CITIES: Record<string, { country: string; distance: number }> = {
    // France — proches Cannes
    "cannes": { country: "France", distance: 0 },
    "cannes la bocca": { country: "France", distance: 4 },
    "carros": { country: "France", distance: 30 },
    "pégomas": { country: "France", distance: 15 },
    "pegomas": { country: "France", distance: 15 },
    "roquebrune": { country: "France", distance: 20 },
    "la roquette": { country: "France", distance: 18 },
    "la roquette-sur-siagne": { country: "France", distance: 18 },
    "saint-laurent-du-var": { country: "France", distance: 22 },
    "montauroux": { country: "France", distance: 34 },
    "puget-sur-argens": { country: "France", distance: 52 },
    "puget": { country: "France", distance: 52 },
    // France — Var / PACA
    "flassans-sur-issole": { country: "France", distance: 88 },
    "brignoles": { country: "France", distance: 98 },
    "la farlède": { country: "France", distance: 140 },
    "prades": { country: "France", distance: 480 },
    // France — Rhône-Alpes
    "brignais": { country: "France", distance: 465 },
    "cornier": { country: "France", distance: 360 },
    // France — Île-de-France / nord
    "gonesse": { country: "France", distance: 879 },
    "dugny": { country: "France", distance: 875 },
    "versailles": { country: "France", distance: 870 },
    "guyancourt": { country: "France", distance: 875 },
    "montlhéry": { country: "France", distance: 845 },
    "savigny": { country: "France", distance: 863 },
    // France — départements / régions
    "essonne": { country: "France", distance: 863 },
    "seine-saint-denis": { country: "France", distance: 875 },
    "yvelines": { country: "France", distance: 880 },
    "meurthe-et-moselle": { country: "France", distance: 719 },
    // France — nord / divers
    "wimille": { country: "France", distance: 1120 },
    "pérenchies": { country: "France", distance: 1060 },
    "flers": { country: "France", distance: 1050 },
    // Belgique
    "turnhout": { country: "Belgique", distance: 1090 },
    "genappe": { country: "Belgique", distance: 1010 },
    // Allemagne
    "langenlonsheim": { country: "Allemagne", distance: 920 },
    // Italie
    "pianoro": { country: "Italie", distance: 480 },
    "casalfiumanese": { country: "Italie", distance: 490 },
    // Lituanie
    "klaipeda": { country: "Lituanie", distance: 2500 },
    // Ukraine
    "dnipro": { country: "Ukraine", distance: 2700 },
    // Espagne
    "ajalvir": { country: "Espagne", distance: 1215 },
    // Portugal
    "guarda": { country: "Portugal", distance: 1525 },
    // Pays-Bas
    "meppel": { country: "Pays-Bas", distance: 1280 },
    "boxtel": { country: "Pays-Bas", distance: 1150 },
    // France — divers
    "poissy": { country: "France", distance: 880 },
    // Belgique — divers
    "andenne": { country: "Belgique", distance: 980 },
    // Roumanie
    "rovinari": { country: "Roumanie", distance: 1850 },
    // Pologne
    "wyszków": { country: "Pologne", distance: 1755 },
    "wyszkow": { country: "Pologne", distance: 1755 },
  };

  const lookupKey = cityPart.toLowerCase().trim();
  const extra = EXTRA_CITIES[lookupKey];
  if (extra) {
    return { cityName: cityPart, countryName: extra.country, distance: extra.distance };
  }

  // Déduire le pays depuis la partie countryPart
  const countryFromPart = COUNTRY_KEYWORD_MAP[countryPart.toLowerCase()];
  const fallbackCountry = countryFromPart || countryPart || "Origine non renseignée";

  // Dernière chance : si on a un pays, estimer la distance depuis la capitale
  const capitalDistanceFallback: Record<string, number> = {
    "France": 863, "Pologne": 1700, "Italie": 629, "Espagne": 1189,
    "Allemagne": 1324, "Belgique": 1045, "Royaume-Uni": 1240,
    "Portugal": 1743, "Pays-Bas": 1241, "Suisse": 574,
    "Lituanie": 2168, "Turquie": 2188, "République tchèque": 1148,
    "Roumanie": 1832, "Bulgarie": 1589, "Hongrie": 1239,
    "Lettonie": 2294, "Danemark": 1686, "Autriche": 1112,
    "Irlande": 1752, "Ukraine": 2316, "Russie": 3067,
  };

  return {
    cityName: cityPart,
    countryName: fallbackCountry,
    distance: capitalDistanceFallback[fallbackCountry] ?? 0,
  };
}

/** Cache de résolution ville pour éviter de recalculer */
export function buildCityResolveCache(
  accreditations: Array<{ vehicles: Array<{ city: string }>; extension?: unknown }>
): Map<string, ResolvedCity> {
  const cache = new Map<string, ResolvedCity>();
  const add = (raw: string) => {
    const t = raw.trim();
    if (t && !cache.has(t)) cache.set(t, resolveCity(t));
  };
  for (const acc of accreditations) {
    for (const v of acc.vehicles) {
      add(v.city || "");
    }
    const ctx = parseRxVehicleContext(acc.extension);
    if (ctx?.repCity) add(ctx.repCity);
  }
  return cache;
}

