import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireEspaceManagement,
  requireOrganizationMembership,
} from "@/lib/auth-helpers";
import {
  isValidEmail,
  isAllowedSenderAddress,
  getAllowedSenderDomains,
} from "@/lib/email-sender";

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
  let sessionUserId: string;
  let role: import("@prisma/client").UserRole;
  try {
    const authCtx = await requireEspaceManagement(req, "read");
    sessionUserId = authCtx.session.user.id;
    role = authCtx.role;
  } catch (err) {
    return handleAuthError(err);
  }

  const { id } = await ctx.params;
  try {
    await requireOrganizationMembership(sessionUserId, role, id);
  } catch (err) {
    return handleAuthError(err);
  }

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
    return Response.json({ ...org, allowedEmailDomains: getAllowedSenderDomains() });
  } catch (error) {
    console.error("GET /api/admin/organizations/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  let sessionUserId: string;
  let role: import("@prisma/client").UserRole;
  try {
    const authCtx = await requireEspaceManagement(req, "write");
    sessionUserId = authCtx.session.user.id;
    role = authCtx.role;
  } catch (err) {
    return handleAuthError(err);
  }

  const { id } = await ctx.params;
  try {
    await requireOrganizationMembership(sessionUserId, role, id);
  } catch (err) {
    return handleAuthError(err);
  }

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

    // --- Configuration expéditeur e-mail automatique ---
    if (body.emailFromName !== undefined) {
      const v = body.emailFromName ? String(body.emailFromName).trim() : "";
      data.emailFromName = v || null;
    }

    if (body.emailSendingEnabled !== undefined) {
      data.emailSendingEnabled = Boolean(body.emailSendingEnabled);
    }

    if (body.emailFromAddress !== undefined) {
      const raw = body.emailFromAddress ? String(body.emailFromAddress).trim() : "";
      if (!raw) {
        data.emailFromAddress = null;
      } else if (!isValidEmail(raw)) {
        return Response.json(
          { error: "Adresse d'expédition invalide." },
          { status: 400 }
        );
      } else if (!isAllowedSenderAddress(raw)) {
        return Response.json(
          {
            error:
              "Domaine d'expédition non autorisé. Domaines autorisés : " +
              getAllowedSenderDomains().join(", ") +
              ".",
          },
          { status: 400 }
        );
      } else {
        // Empêche une organisation d'usurper l'adresse d'une autre.
        const conflict = await prisma.organization.findFirst({
          where: {
            emailFromAddress: { equals: raw, mode: "insensitive" },
            NOT: { id },
          },
          select: { id: true },
        });
        if (conflict) {
          return Response.json(
            { error: "Cette adresse d'expédition est déjà utilisée par un autre Espace." },
            { status: 409 }
          );
        }
        data.emailFromAddress = raw;
      }
    }

    if (body.replyToEmail !== undefined) {
      const raw = body.replyToEmail ? String(body.replyToEmail).trim() : "";
      if (!raw) {
        data.replyToEmail = null;
      } else if (!isValidEmail(raw)) {
        return Response.json(
          { error: "Adresse de réponse invalide." },
          { status: 400 }
        );
      } else {
        data.replyToEmail = raw;
      }
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
  let role: import("@prisma/client").UserRole;
  try {
    const authCtx = await requireEspaceManagement(req, "write");
    role = authCtx.role;
  } catch (err) {
    return handleAuthError(err);
  }

  if (role !== "SUPER_ADMIN") {
    return Response.json(
      { error: "Seuls les Super Admins peuvent supprimer un Espace." },
      { status: 403 }
    );
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
