import { NextRequest } from "next/server";
import prisma, { withRetry } from "@/lib/prisma";

/**
 * `GET /api/exhibitors?orgSlug=<slug>&eventSlug=<slug>` — Public.
 *
 * Renvoie la liste des exposants actifs pour une combinaison
 * organisation + event. Utilisé par la combobox du Step 1 RX.
 *
 * - Si l'organisation est inconnue/inactive ou l'event ne lui appartient
 *   pas, renvoie une liste vide (pas d'énumération discrète possible).
 */
export async function GET(req: NextRequest) {
  const orgSlug = req.nextUrl.searchParams.get("orgSlug")?.trim();
  const eventSlug = req.nextUrl.searchParams.get("eventSlug")?.trim();

  if (!orgSlug || !eventSlug) {
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

    const exhibitors = await withRetry(() =>
      prisma.exhibitor.findMany({
        where: { eventId: event.id, isActive: true },
        select: { id: true, name: true, stand: true, sector: true, zone: true },
        orderBy: { name: "asc" },
      })
    );
    return Response.json(exhibitors);
  } catch (err) {
    console.error("GET /api/exhibitors error:", err);
    return Response.json([], { status: 200 });
  }
}
