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
 * GET : liste des Espaces dont l'utilisateur est membre.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireEspaceAdmin(req);
  } catch (err) {
    return handleAuthError(err);
  }

  const { id: userId } = await ctx.params;
  const links = await prisma.userOrganization.findMany({
    where: { userId },
    include: {
      organization: {
        select: { id: true, name: true, slug: true, color: true, logo: true, isActive: true },
      },
    },
  });
  return Response.json(links.map((l) => l.organization));
}

/**
 * PUT : remplacer la liste des Espaces dont l'utilisateur est membre.
 * Body: { organizationIds: string[] }
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    await requireEspaceAdmin(req);
  } catch (err) {
    return handleAuthError(err);
  }

  const { id: userId } = await ctx.params;
  const body = await req.json();
  const organizationIds: string[] = Array.isArray(body.organizationIds)
    ? body.organizationIds
    : [];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userOrganization.deleteMany({ where: { userId } });
      if (organizationIds.length > 0) {
        await tx.userOrganization.createMany({
          data: organizationIds.map((organizationId) => ({ userId, organizationId })),
          skipDuplicates: true,
        });
      }
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("PUT /api/admin/users/[id]/organizations error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
