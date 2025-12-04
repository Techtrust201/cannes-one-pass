import { NextRequest } from "next/server";

// Coordonnées exactes du Palais des Festivals de Cannes
const PALAIS_COORDINATES = {
  lat: 43.5506,
  lng: 7.0175,
  address:
    "Palais des festivals et des congrès de Cannes, 1 Bd de la Croisette, 06400 Cannes",
};

// API Nominatim d'OpenStreetMap (gratuite et fiable)
const NOMINATIM_API_URL = "https://nominatim.openstreetmap.org/search";

// Fonction pour calculer la distance routière réelle (formule de Haversine + facteur routier adaptatif)
function calculateRoadDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Rayon de la Terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceAsTheCrowFlies = R * c;

  // Facteur de correction routière adaptatif selon la distance
  let routeFactor = 1.3; // Défaut
  if (distanceAsTheCrowFlies < 50)
    routeFactor = 1.5; // Très courte distance = beaucoup de détours urbains
  else if (distanceAsTheCrowFlies < 200)
    routeFactor = 1.4; // Courte distance = détours régionaux
  else if (distanceAsTheCrowFlies < 500)
    routeFactor = 1.3; // Distance moyenne = mix routes/autoroutes
  else if (distanceAsTheCrowFlies < 1000)
    routeFactor = 1.25; // Longue distance = principalement autoroutes
  else routeFactor = 1.2; // Très longue distance = autoroutes directes

  return Math.round(distanceAsTheCrowFlies * routeFactor);
}

// Cache pour éviter les appels répétés au géocodeur (avec expiration)
const geocodeCache = new Map<
  string,
  {
    lat: number;
    lng: number;
    country: string;
    fullName: string;
    distance: number;
    timestamp: number;
  }
>();

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures

// Fonction pour nettoyer et normaliser les noms de ville
function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[ç]/g, "c")
    .replace(/[ñ]/g, "n")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ");
}

// Fonction pour déduire le pays depuis le nom de ville
function deduceCountryFromCity(cityName: string): string {
  const city = normalizeCity(cityName);

  // Détection spéciale pour Cannes et région PACA
  if (
    city.includes("cannes") ||
    city.includes("nice") ||
    city.includes("antibes") ||
    city.includes("grasse") ||
    city.includes("monaco") ||
    city.includes("menton")
  ) {
    return "FRANCE";
  }

  // Villes françaises
  const frenchCities = [
    "paris",
    "lyon",
    "marseille",
    "toulouse",
    "nantes",
    "strasbourg",
    "montpellier",
    "bordeaux",
    "lille",
    "rennes",
    "reims",
    "le havre",
    "saint-etienne",
    "toulon",
    "grenoble",
    "dijon",
    "angers",
    "nimes",
    "villeurbanne",
    "clermont-ferrand",
    "aix-en-provence",
  ];

  // Villes espagnoles
  const spanishCities = [
    "madrid",
    "barcelona",
    "valencia",
    "sevilla",
    "zaragoza",
    "malaga",
    "murcia",
    "palma",
    "las palmas",
    "bilbao",
    "alicante",
    "cordoba",
    "valladolid",
    "vigo",
  ];

  // Villes italiennes
  const italianCities = [
    "rome",
    "milan",
    "naples",
    "turin",
    "palermo",
    "genoa",
    "bologna",
    "florence",
    "bari",
    "catania",
    "venice",
    "verona",
    "messina",
    "padua",
  ];

  // Villes allemandes
  const germanCities = [
    "berlin",
    "hamburg",
    "munich",
    "cologne",
    "frankfurt",
    "stuttgart",
    "dusseldorf",
    "dortmund",
    "essen",
    "leipzig",
    "bremen",
    "dresden",
    "hanover",
    "nuremberg",
  ];

  // Villes polonaises (ajout spécial pour vos données)
  const polishCities = [
    "warsaw",
    "varsovie",
    "krakow",
    "cracovie",
    "gdansk",
    "poznan",
    "wroclaw",
    "lodz",
    "katowice",
    "bialystok",
    "szczecin",
    "gdynia",
    "pienki",
    "barglów",
    "koscielny",
  ];

  if (frenchCities.some((c) => city.includes(c))) return "FRANCE";
  if (spanishCities.some((c) => city.includes(c))) return "ESPAGNE";
  if (italianCities.some((c) => city.includes(c))) return "ITALIE";
  if (germanCities.some((c) => city.includes(c))) return "ALLEMAGNE";
  if (polishCities.some((c) => city.includes(c))) return "POLOGNE";

  // Autres indices
  if (
    city.includes("brussels") ||
    city.includes("bruxelles") ||
    city.includes("antwerp")
  )
    return "BELGIQUE";
  if (
    city.includes("zurich") ||
    city.includes("geneva") ||
    city.includes("geneve") ||
    city.includes("bern")
  )
    return "SUISSE";
  if (
    city.includes("london") ||
    city.includes("londres") ||
    city.includes("manchester") ||
    city.includes("birmingham")
  )
    return "ROYAUME_UNI";
  if (
    city.includes("amsterdam") ||
    city.includes("rotterdam") ||
    city.includes("hague")
  )
    return "PAYS_BAS";
  if (
    city.includes("lisbon") ||
    city.includes("lisbonne") ||
    city.includes("porto") ||
    city.includes("braga")
  )
    return "PORTUGAL";

  return "AUTRE";
}

// Fonction pour géocoder une ville avec cache
async function geocodeCity(cityName: string): Promise<{
  lat: number;
  lng: number;
  country: string;
  fullName: string;
  distance: number;
} | null> {
  const normalizedCity = normalizeCity(cityName);
  const cacheKey = normalizedCity;

  // Vérifier le cache
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`🎯 Cache hit pour "${cityName}" → ${cached.distance}km`);
    return cached;
  }

  // CAS SPÉCIAL : Si c'est Cannes, retourner distance 0
  if (normalizedCity.includes("cannes")) {
    const result = {
      lat: PALAIS_COORDINATES.lat,
      lng: PALAIS_COORDINATES.lng,
      country: "FRANCE",
      fullName: "Cannes, France",
      distance: 0,
      timestamp: Date.now(),
    };
    geocodeCache.set(cacheKey, result);
    console.log(`🎯 Cannes détecté → 0km (logique!)`);
    return result;
  }

  try {
    console.log(`🔍 Géocodage de "${cityName}"...`);

    // Appel direct à l'API Nominatim d'OpenStreetMap
    const encodedCity = encodeURIComponent(cityName);
    const url = `${NOMINATIM_API_URL}?q=${encodedCity}&format=json&limit=1&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "PalaisDesFestivals/1.0", // Requis par Nominatim
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const results = await response.json();

    if (results && results.length > 0) {
      const location = results[0];
      const lat = parseFloat(location.lat);
      const lng = parseFloat(location.lon);

      if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        const distance = calculateRoadDistance(
          lat,
          lng,
          PALAIS_COORDINATES.lat,
          PALAIS_COORDINATES.lng
        );
        const country = deduceCountryFromCity(cityName);
        const fullName = location.display_name || cityName;

        const result = {
          lat,
          lng,
          country,
          fullName,
          distance,
          timestamp: Date.now(),
        };

        geocodeCache.set(cacheKey, result);
        console.log(
          `✅ Géocodé "${cityName}" → ${fullName} (${country}) → ${distance}km`
        );
        return result;
      }
    }

    console.log(`❌ Impossible de géocoder "${cityName}"`);
    return null;
  } catch (error) {
    console.error(`🚨 Erreur géocodage "${cityName}":`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");

    if (!city) {
      return Response.json(
        { error: "Paramètre 'city' manquant" },
        { status: 400 }
      );
    }

    console.log(`🚀 API Distance - Calcul pour: "${city}"`);

    const result = await geocodeCity(city);

    if (!result) {
      console.log(
        `⚠️ Ville "${city}" non trouvée, distance par défaut = 500km`
      );
      return Response.json({
        city,
        distance: 500, // Distance par défaut réaliste
        country: deduceCountryFromCity(city),
        fullName: city,
        coordinates: null,
        source: "fallback",
      });
    }

    return Response.json({
      city,
      distance: result.distance,
      country: result.country,
      fullName: result.fullName,
      coordinates: {
        lat: result.lat,
        lng: result.lng,
      },
      source: "geocoded",
    });
  } catch (error) {
    console.error("🚨 Erreur API Distance:", error);
    return Response.json(
      { error: "Erreur lors du calcul de distance" },
      { status: 500 }
    );
  }
}
