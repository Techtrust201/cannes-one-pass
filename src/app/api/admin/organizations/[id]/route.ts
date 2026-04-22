import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, hasPermission } from "@/lib/auth-helpers";

async function requireEspaceAdmin(
  request: NextRequest,
  mode: "read" | "write"
) {
  const { session, role } = await requireRole(request, "USER");
  if (role === "SUPER_ADMIN") return session;
  const allowed = await hasPermission(session.user.id, "GESTION_ESPACES", mode);
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

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireEspaceAdmin(req, "read");
  } catch (err) {
    return handleAuthError(err);
  }

  const { id } = await ctx.params;
  try {
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        events: {
          select: { id: true, name: true, slug: true, startDate: true, endDate: true, isArchived: true },
          orderBy: { startDate: "desc" },
        },
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
    if (!org) {
      return Response.json({ error: "Espace introuvable" }, { status: 404 });
    }
    return Response.json(org);
  } catch (error) {
    console.error("GET /api/admin/organizations/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireEspaceAdmin(req, "write");
  } catch (err) {
    return handleAuthError(err);
  }

  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.logo !== undefined) data.logo = body.logo ?? null;
    if (body.color !== undefined) data.color = body.color ?? "#4F587E";
    if (body.description !== undefined) data.description = body.description ?? null;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    if (body.slug !== undefined) {
      const normalized = normalizeSlug(String(body.slug));
      if (!normalized) {
        return Response.json({ error: "Slug invalide" }, { status: 400 });
      }
      const conflict = await prisma.organization.findFirst({
        where: { slug: normalized, NOT: { id } },
      });
      if (conflict) {
        return Response.json(
          { error: "Un autre Espace utilise déjà ce slug" },
          { status: 409 }
        );
      }
      data.slug = normalized;
    }

    const updated = await prisma.organization.update({
      where: { id },
      data,
    });
    return Response.json(updated);
  } catch (error) {
    console.error("PATCH /api/admin/organizations/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireEspaceAdmin(req, "write");
  } catch (err) {
    return handleAuthError(err);
  }

  const { id } = await ctx.params;
  try {
    // Bloquer la suppression si l'Espace contient des events
    const count = await prisma.event.count({ where: { organizationId: id } });
    if (count > 0) {
      return Response.json(
        {
          error:
            "Impossible de supprimer cet Espace : il contient encore " +
            count +
            " event(s). Détachez-les d'abord.",
        },
        { status: 409 }
      );
    }

    await prisma.organization.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/admin/organizations/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
