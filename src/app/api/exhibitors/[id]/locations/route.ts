import { NextRequest } from "next/server";
import prisma, { withRetry } from "@/lib/prisma";

/**
 * `GET /api/exhibitors/:id/locations?orgSlug=<slug>&eventSlug=<slug>` — Public.
 *
 * Renvoie les `ExhibitorLocation` actives de l'exposant `:id`, utilisées par
 * le Step "Exposant" RX pour proposer un choix d'emplacement (auto-sélection
 * si une seule, choix obligatoire si plusieurs). Cette route reste
 * volontairement permissive (liste vide possible) : c'est le FORMULAIRE
 * (`StepExhibitorRx.tsx`, Phase 6C-A) qui décide, selon
 * `Event.logisticsPlanningMode`, si une liste vide est bloquante
 * (`TRANSITION`/`STRICT`, message traduit) ou seulement informative
 * (`DISABLED`, comportement historique — jamais d'erreur ici).
 *
 * Sécurité : l'exposant doit appartenir à l'organisation ET à l'événement
 * fournis (anti-IDOR) ; sinon liste vide (pas d'énumération discrète).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: exhibitorId } = await params;
  const orgSlug = req.nextUrl.searchParams.get("orgSlug")?.trim();
  const eventSlug = req.nextUrl.searchParams.get("eventSlug")?.trim();

  if (!exhibitorId || !orgSlug || !eventSlug) {
    return Response.json([]);
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true, isActive: true },
    });
    if (!org || !org.isActive) return Response.json([]);

    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      select: { id: true, organizationId: true },
    });
    if (!event || event.organizationId !== org.id) return Response.json([]);

    const exhibitor = await prisma.exhibitor.findUnique({
      where: { id: exhibitorId },
      select: { id: true, organizationId: true, eventId: true },
    });
    if (!exhibitor || exhibitor.organizationId !== org.id || exhibitor.eventId !== event.id) {
      return Response.json([]);
    }

    const locations = await withRetry(() =>
      prisma.exhibitorLocation.findMany({
        where: { exhibitorId: exhibitor.id, isActive: true },
        select: {
          id: true,
          type: true,
          code: true,
          portCode: true,
          sectorCode: true,
          logisticSpace: true,
        },
        orderBy: { code: "asc" },
      })
    );
    return Response.json(locations);
  } catch (err) {
    console.error("GET /api/exhibitors/[id]/locations error:", err);
    return Response.json([], { status: 200 });
  }
}
