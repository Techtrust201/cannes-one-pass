import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, hasPermission } from "@/lib/auth-helpers";

async function requireEspaceAdmin(request: NextRequest) {
  const { session, role } = await requireRole(request, "USER");
  if (role === "SUPER_ADMIN") return session;
  const allowed = await hasPermission(session.user.id, "GESTION_ESPACES", "write");
  if (!allowed) throw new Response("Accès refusé", { status: 403 });
  return session;
}

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
 * PUT /api/admin/organizations/[id]/events
 * Body: { eventIds: string[] }
 *
 * Remplace la liste complète des events rattachés à l'Espace. Les events qui
 * ne sont plus dans la liste se retrouvent sans organisation (organizationId = NULL)
 * → ils n'apparaîtront plus pour les utilisateurs scoped sur cet Espace jusqu'à
 * ce qu'un super-admin les rattache ailleurs.
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    await requireEspaceAdmin(req);
  } catch (err) {
    return handleAuthError(err);
  }

  const { id: organizationId } = await ctx.params;
  const body = await req.json();
  const eventIds: string[] = Array.isArray(body.eventIds) ? body.eventIds : [];

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Détacher les events qui étaient rattachés mais ne sont plus dans la liste
      await tx.event.updateMany({
        where: {
          organizationId,
          NOT: { id: { in: eventIds.length > 0 ? eventIds : ["__none__"] } },
        },
        data: { organizationId: null },
      });
      // 2. Rattacher les events sélectionnés à cet Espace (en déplaçant ceux
      //    qui viennent d'un autre Espace)
      if (eventIds.length > 0) {
        await tx.event.updateMany({
          where: { id: { in: eventIds } },
          data: { organizationId },
        });
      }
    });

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        events: {
          select: { id: true, name: true, slug: true, startDate: true, endDate: true, isArchived: true },
          orderBy: { startDate: "desc" },
        },
      },
    });
    return Response.json(org);
  } catch (error) {
    console.error("PUT /api/admin/organizations/[id]/events error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
