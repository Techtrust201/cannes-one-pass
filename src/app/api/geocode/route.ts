import { NextRequest } from "next/server";

/**
 * API de géocodage – proxy vers OpenStreetMap Nominatim
 * 
 * GET /api/geocode?address=... → Forward geocoding (adresse → lat/lng)
 * GET /api/geocode?lat=...&lng=... → Reverse geocoding (lat/lng → adresse)
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "PalaisDesFestivals/1.0";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");

  try {
    if (address) {
      // Forward geocoding : adresse → coordonnées
      const url = `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`;
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      const data = await response.json();
      if (data.length > 0) {
        return Response.json({
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
          displayName: data[0].display_name,
        });
      }
      return Response.json({ error: "Adresse non trouvée" }, { status: 404 });
    }

    if (lat && lng) {
      // Reverse geocoding : coordonnées → adresse
      const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      const data = await response.json();
      if (data && data.display_name) {
        return Response.json({
          address: data.display_name,
          latitude: parseFloat(data.lat),
          longitude: parseFloat(data.lon),
        });
      }
      return Response.json({ error: "Coordonnées non trouvées" }, { status: 404 });
    }

    return Response.json({ error: "Paramètre 'address' ou 'lat'+'lng' requis" }, { status: 400 });
  } catch (error) {
    console.error("Geocoding error:", error);
    return Response.json({ error: "Erreur de géocodage" }, { status: 500 });
  }
}
