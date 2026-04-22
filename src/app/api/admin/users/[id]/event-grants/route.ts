import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

function handleAuthError(error: unknown) {
  if (error instanceof Response)
    return new Response(error.body, {
      status: error.status,
      statusText: error.statusText,
    });
  return new Response("Non autorisé", { status: 401 });
}

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET : events extra auxquels l'utilisateur a accès hors de ses Espaces.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireRole(req, "SUPER_ADMIN");
  } catch (err) {
    return handleAuthError(err);
  }

  const { id: userId } = await ctx.params;
  const grants = await prisma.userEvent.findMany({
    where: { userId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
          startDate: true,
          endDate: true,
          organization: { select: { id: true, name: true } },
        },
      },
    },
  });
  return Response.json(grants.map((g) => g.event));
}

/**
 * PUT : remplacer la liste des grants d'events extra.
 * Body: { eventIds: string[] }
 *
 * Réservé aux SUPER_ADMIN car permet de cross-assigner à travers les Espaces.
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    await requireRole(req, "SUPER_ADMIN");
  } catch (err) {
    return handleAuthError(err);
  }

  const { id: userId } = await ctx.params;
  const body = await req.json();
  const eventIds: string[] = Array.isArray(body.eventIds) ? body.eventIds : [];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userEvent.deleteMany({ where: { userId } });
      if (eventIds.length > 0) {
        await tx.userEvent.createMany({
          data: eventIds.map((eventId) => ({ userId, eventId })),
          skipDuplicates: true,
        });
      }
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("PUT /api/admin/users/[id]/event-grants error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
