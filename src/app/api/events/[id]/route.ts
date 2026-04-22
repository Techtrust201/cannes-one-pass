import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { assertEventAccess } from "@/lib/rbac";

function handleAuthError(error: unknown) {
  if (error instanceof Response)
    return new Response(error.body, {
      status: error.status,
      statusText: error.statusText,
    });
  return new Response("Non autorisé", { status: 401 });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "GESTION_DATES", "read");
    currentUserId = session.user.id;
  } catch (error) {
    return handleAuthError(error);
  }

  const { id } = await ctx.params;

  try {
    await assertEventAccess(currentUserId!, id);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const event = await prisma.event.findUnique({ where: { id }, omit: { logoData: true } });
    if (!event)
      return Response.json({ error: "Événement introuvable" }, { status: 404 });
    return Response.json(event);
  } catch (error) {
    console.error("GET /api/events/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "GESTION_DATES", "write");
    currentUserId = session.user.id;
  } catch (error) {
    return handleAuthError(error);
  }

  const { id } = await ctx.params;

  try {
    await assertEventAccess(currentUserId!, id);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const body = await req.json();

    const dateFields = [
      "startDate",
      "endDate",
      "setupStartDate",
      "setupEndDate",
      "teardownStartDate",
      "teardownEndDate",
    ] as const;

    const data: Record<string, unknown> = {};
    const allowedScalar = [
      "name",
      "slug",
      "logo",
      "description",
      "location",
      "color",
      "accessStartTime",
      "accessEndTime",
      "notes",
      "activationDays",
      "isActive",
      "isArchived",
    ];

    for (const key of allowedScalar) {
      if (body[key] !== undefined) data[key] = body[key];
    }

    for (const key of dateFields) {
      if (body[key] !== undefined) {
        data[key] = body[key] ? new Date(body[key]) : null;
      }
    }

    if (data.slug) {
      data.slug = String(data.slug)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
    }

    const updated = await prisma.event.update({ where: { id }, data });

    if (data.isArchived === true) {
      await prisma.accreditation.updateMany({
        where: { eventId: id },
        data: { isArchived: true },
      });
    } else if (data.isArchived === false) {
      await prisma.accreditation.updateMany({
        where: { eventId: id },
        data: { isArchived: false },
      });
    }

    return Response.json(updated);
  } catch (error) {
    console.error("PATCH /api/events/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "GESTION_DATES", "write");
    currentUserId = session.user.id;
  } catch (error) {
    return handleAuthError(error);
  }

  const { id } = await ctx.params;

  try {
    await assertEventAccess(currentUserId!, id);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    await prisma.$transaction([
      prisma.event.update({
        where: { id },
        data: { isArchived: true },
      }),
      prisma.accreditation.updateMany({
        where: { eventId: id },
        data: { isArchived: true },
      }),
    ]);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/events/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
