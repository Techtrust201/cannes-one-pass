export const dynamic = "force-dynamic";

/**
 * GET /api/rx/availability/public
 *
 * Variante PUBLIQUE de la disponibilité RX, destinée au formulaire exposant
 * (aucune session requise). Contrairement à la route admin
 * `/api/rx/availability` (protégée par `FLUX_VEHICULES`), celle-ci :
 *   - identifie org + event par leur SLUG (jamais d'id interne côté client),
 *   - valide strictement tous les paramètres,
 *   - ne retourne QUE des statistiques agrégées non sensibles
 *     ({ hasQuota, capacity, remaining, isFull }) — aucune donnée personnelle,
 *     aucune liste d'accréditations.
 *
 * Paramètres requis (query string) :
 *   - orgSlug       : string (Organization.slug)
 *   - eventSlug     : string (Event.slug)
 *   - zone          : string (code ZoneConfig)
 *   - date          : string (YYYY-MM-DD)
 *   - startTime     : string (HH:MM)
 *   - endTime       : string (HH:MM)
 *   - vehicleFamily : "LIGHT" | "HEAVY"
 *   - phase         : "MONTAGE" | "DEMONTAGE"
 *
 * En cas d'org/event inconnu ou non appariés, renvoie un résultat neutre
 * (hasQuota=false) en 200 pour éviter toute énumération, à l'image de
 * `/api/exhibitors`.
 *
 * @see src/app/api/rx/availability/route.ts (variante admin)
 * @see src/lib/rx-capacity-service.ts
 */
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getRxAvailability } from "@/lib/rx-capacity-service";
import type { RxCapacityKey, RxPhase } from "@/lib/rx-capacity";
import type { VehicleFamily } from "@/lib/vehicle-family";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const NEUTRAL = { hasQuota: false, capacity: 0, remaining: 0, isFull: false };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const orgSlug = searchParams.get("orgSlug")?.trim() ?? "";
  const eventSlug = searchParams.get("eventSlug")?.trim() ?? "";
  const zone = searchParams.get("zone")?.trim() ?? "";
  const date = searchParams.get("date")?.trim() ?? "";
  const startTime = searchParams.get("startTime")?.trim() ?? "";
  const endTime = searchParams.get("endTime")?.trim() ?? "";
  const vehicleFamilyRaw = searchParams.get("vehicleFamily")?.trim() ?? "";
  const phaseRaw = searchParams.get("phase")?.trim() ?? "";

  const missingParams = [
    !orgSlug && "orgSlug",
    !eventSlug && "eventSlug",
    !zone && "zone",
    !date && "date",
    !startTime && "startTime",
    !endTime && "endTime",
    !vehicleFamilyRaw && "vehicleFamily",
    !phaseRaw && "phase",
  ].filter(Boolean);

  if (missingParams.length > 0) {
    return Response.json(
      { error: `Paramètres manquants : ${missingParams.join(", ")}` },
      { status: 400 }
    );
  }

  if (!DATE_RE.test(date)) {
    return Response.json({ error: "date invalide (attendu YYYY-MM-DD)" }, { status: 400 });
  }
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return Response.json({ error: "startTime/endTime invalides (attendu HH:MM)" }, { status: 400 });
  }
  if (vehicleFamilyRaw !== "LIGHT" && vehicleFamilyRaw !== "HEAVY") {
    return Response.json({ error: 'vehicleFamily doit être "LIGHT" ou "HEAVY"' }, { status: 400 });
  }
  if (phaseRaw !== "MONTAGE" && phaseRaw !== "DEMONTAGE") {
    return Response.json({ error: 'phase doit être "MONTAGE" ou "DEMONTAGE"' }, { status: 400 });
  }

  // Résolution org + event par slug (aucun id interne exposé côté client).
  // Org inconnue/inactive ou event non rattaché → résultat neutre (anti-énumération).
  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, isActive: true },
  });
  if (!org || !org.isActive) return Response.json(NEUTRAL);

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    select: { id: true, organizationId: true },
  });
  if (!event || event.organizationId !== org.id) return Response.json(NEUTRAL);

  const key: RxCapacityKey = {
    organizationId: org.id,
    eventId: event.id,
    zone,
    date,
    startTime,
    endTime,
    vehicleFamily: vehicleFamilyRaw as VehicleFamily,
    phase: phaseRaw as RxPhase,
  };

  const result = await getRxAvailability(key);

  // Projection minimale : uniquement l'agrégat nécessaire à l'affichage.
  return Response.json({
    hasQuota: result.hasQuota,
    capacity: result.capacity,
    remaining: result.remaining,
    isFull: result.isFull,
  });
}
