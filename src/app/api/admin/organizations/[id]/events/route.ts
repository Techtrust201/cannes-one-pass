import { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireEspaceManagement,
  requireOrganizationMembership,
} from "@/lib/auth-helpers";

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
  let sessionUserId: string;
  let role: UserRole;
  try {
    const authCtx = await requireEspaceManagement(req, "write");
    sessionUserId = authCtx.session.user.id;
    role = authCtx.role;
  } catch (err) {
    return handleAuthError(err);
  }

  const { id: organizationId } = await ctx.params;
  try {
    await requireOrganizationMembership(sessionUserId, role, organizationId);
  } catch (err) {
    return handleAuthError(err);
  }

  const body = await req.json();
  const eventIds: string[] = Array.isArray(body.eventIds) ? body.eventIds : [];

  try {
    if (role !== "SUPER_ADMIN" && eventIds.length > 0) {
      const events = await prisma.event.findMany({
        where: { id: { in: eventIds } },
        select: { id: true, organizationId: true },
      });
      if (events.length !== eventIds.length) {
        return Response.json({ error: "Un ou plusieurs événements sont introuvables." }, { status: 400 });
      }
      const steals = events.filter(
        (e) => e.organizationId != null && e.organizationId !== organizationId
      );
      if (steals.length > 0) {
        return Response.json(
          {
            error:
              "Seul un Super Admin peut rattacher des événements déjà affectés à un autre Espace.",
          },
          { status: 403 }
        );
      }
    }

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
