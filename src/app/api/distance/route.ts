import { NextRequest } from "next/server";
import { findCity } from "@/lib/city-search";

// Coordonnées exactes du Palais des Festivals de Cannes
const PALAIS_COORDINATES = {
  lat: 43.5506,
  lng: 7.0175,
};

// ── Haversine amélioré avec facteur routier adaptatif ─────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateRoadDistance(lat: number, lng: number): number {
  const d = haversine(lat, lng, PALAIS_COORDINATES.lat, PALAIS_COORDINATES.lng);

  // Facteur de correction routière adaptatif
  let factor: number;
  if (d < 50) factor = 1.5;         // Détours urbains
  else if (d < 200) factor = 1.4;   // Routes régionales
  else if (d < 500) factor = 1.3;   // Mix routes/autoroutes
  else if (d < 1000) factor = 1.25; // Principalement autoroutes
  else factor = 1.2;                // Autoroutes directes

  return Math.round(d * factor);
}

// ── Normalisation du nom de ville ─────────────────────────────────────
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

// ── Déduction du pays ─────────────────────────────────────────────────
function deduceCountry(cityName: string): string {
  const city = normalizeCity(cityName);
  const match = findCity(cityName);
  if (match) {
    // Map country name to enum
    const MAP: Record<string, string> = {
      France: "FRANCE", Allemagne: "ALLEMAGNE", Italie: "ITALIE",
      Espagne: "ESPAGNE", "Royaume-Uni": "ROYAUME_UNI", Belgique: "BELGIQUE",
      Suisse: "SUISSE", "Pays-Bas": "PAYS_BAS", Portugal: "PORTUGAL",
      Pologne: "POLOGNE", Autriche: "AUTRICHE", "République tchèque": "REP_TCHEQUE",
      Hongrie: "HONGRIE", Roumanie: "ROUMANIE", Croatie: "CROATIE",
      Monaco: "FRANCE",
    };
    return MAP[match.p] ?? "AUTRE";
  }

  // Fallback heuristics
  if (city.includes("cannes") || city.includes("nice") || city.includes("paris") ||
      city.includes("lyon") || city.includes("marseille")) return "FRANCE";
  if (city.includes("london") || city.includes("londres")) return "ROYAUME_UNI";
  if (city.includes("berlin") || city.includes("munich")) return "ALLEMAGNE";
  if (city.includes("rome") || city.includes("milan")) return "ITALIE";
  if (city.includes("madrid") || city.includes("barcelona")) return "ESPAGNE";
  if (city.includes("bruxelles") || city.includes("brussels")) return "BELGIQUE";
  if (city.includes("zurich") || city.includes("geneve")) return "SUISSE";
  if (city.includes("amsterdam") || city.includes("rotterdam")) return "PAYS_BAS";
  if (city.includes("lisbonne") || city.includes("porto")) return "PORTUGAL";
  if (city.includes("varsovie") || city.includes("cracovie")) return "POLOGNE";

  return "AUTRE";
}

// ── Cache mémoire pour Nominatim (villes rares) ──────────────────────
const nominatimCache = new Map<string, {
  lat: number; lng: number; country: string; fullName: string;
  distance: number; timestamp: number;
}>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// ── Fallback Nominatim (gratuit, < 5% des requêtes) ──────────────────
async function geocodeViaNominatim(cityName: string): Promise<{
  lat: number; lng: number; fullName: string; distance: number;
} | null> {
  const key = normalizeCity(cityName);
  const cached = nominatimCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1&addressdetails=1`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "PalaisDesFestivals/1.0" },
    });
    if (!resp.ok) return null;

    const results = await resp.json();
    if (!results?.length) return null;

    const loc = results[0];
    const lat = parseFloat(loc.lat);
    const lng = parseFloat(loc.lon);
    if (isNaN(lat) || isNaN(lng)) return null;

    const distance = calculateRoadDistance(lat, lng);
    const result = {
      lat, lng,
      country: deduceCountry(cityName),
      fullName: loc.display_name || cityName,
      distance,
      timestamp: Date.now(),
    };
    nominatimCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

// ── Endpoint GET /api/distance?city=xxx ──────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");

    if (!city) {
      return Response.json({ error: "Paramètre 'city' manquant" }, { status: 400 });
    }

    // Cas spécial : Cannes → 0 km
    if (normalizeCity(city).includes("cannes")) {
      return Response.json({
        city,
        distance: 0,
        country: "FRANCE",
        fullName: "Cannes, France",
        coordinates: { lat: PALAIS_COORDINATES.lat, lng: PALAIS_COORDINATES.lng },
        source: "local",
      });
    }

    // 1. Chercher dans la base locale (< 1ms)
    const localMatch = findCity(city);
    if (localMatch) {
      return Response.json({
        city,
        distance: localMatch.d,
        country: deduceCountry(city),
        fullName: `${localMatch.n}, ${localMatch.p}`,
        coordinates: { lat: localMatch.lat, lng: localMatch.lng },
        source: "local",
      });
    }

    // 2. Fallback Nominatim (rare, < 5%)
    const nominatimResult = await geocodeViaNominatim(city);
    if (nominatimResult) {
      return Response.json({
        city,
        distance: nominatimResult.distance,
        country: deduceCountry(city),
        fullName: nominatimResult.fullName,
        coordinates: { lat: nominatimResult.lat, lng: nominatimResult.lng },
        source: "nominatim",
      });
    }

    // 3. Fallback final : distance par défaut
    return Response.json({
      city,
      distance: 500,
      country: deduceCountry(city),
      fullName: city,
      coordinates: null,
      source: "fallback",
    });
  } catch (error) {
    console.error("Erreur API Distance:", error);
    return Response.json(
      { error: "Erreur lors du calcul de distance" },
      { status: 500 }
    );
  }
}
