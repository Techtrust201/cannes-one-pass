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
 * PUT /api/admin/organizations/[id]/members
 * Body: { userIds: string[] }
 *
 * Remplace la liste complète des membres de l'Espace. Un super-admin reste
 * toujours membre virtuel (il a accès à tout via son rôle), mais on accepte
 * de gérer son rattachement comme tout autre user pour la cohérence d'UI.
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    await requireEspaceAdmin(req);
  } catch (err) {
    return handleAuthError(err);
  }

  const { id: organizationId } = await ctx.params;
  const body = await req.json();
  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds : [];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userOrganization.deleteMany({ where: { organizationId } });
      if (userIds.length > 0) {
        await tx.userOrganization.createMany({
          data: userIds.map((userId) => ({ userId, organizationId })),
          skipDuplicates: true,
        });
      }
    });

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          select: {
            user: {
              select: { id: true, name: true, email: true, role: true, isActive: true },
            },
            createdAt: true,
          },
        },
      },
    });
    return Response.json(org);
  } catch (error) {
    console.error("PUT /api/admin/organizations/[id]/members error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
