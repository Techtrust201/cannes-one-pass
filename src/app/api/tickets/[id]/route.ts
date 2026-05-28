import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  requirePermission,
  getAccessibleOrganizationIds,
} from "@/lib/auth-helpers";

/**
 * `GET /api/tickets/[id]` — Détail + replies.
 * `PATCH /api/tickets/[id]` — Mise à jour du statut (et/ou message admin).
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    const session = await requirePermission(req, "TICKETS", "read");
    userId = session.user.id;
  } catch (err) {
    if (err instanceof Response) {
      return new Response(err.body, { status: err.status, statusText: err.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const params = await props.params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    include: {
      organization: { select: { id: true, slug: true, name: true, supportEmail: true } },
      eventRef: { select: { id: true, slug: true, name: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!ticket) return new Response("Not found", { status: 404 });

  const accessibleOrgs = await getAccessibleOrganizationIds(userId);
  if (accessibleOrgs !== "ALL" && !accessibleOrgs.includes(ticket.organizationId)) {
    return new Response("Accès refusé", { status: 403 });
  }

  return Response.json(ticket);
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    const session = await requirePermission(req, "TICKETS", "write");
    userId = session.user.id;
  } catch (err) {
    if (err instanceof Response) {
      return new Response(err.body, { status: err.status, statusText: err.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const params = await props.params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    select: { id: true, organizationId: true },
  });
  if (!ticket) return new Response("Not found", { status: 404 });

  const accessibleOrgs = await getAccessibleOrganizationIds(userId);
  if (accessibleOrgs !== "ALL" && !accessibleOrgs.includes(ticket.organizationId)) {
    return new Response("Accès refusé", { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const allowed = ["OPEN", "IN_PROGRESS", "ANSWERED", "CLOSED"];
  if (body.status && !allowed.includes(body.status)) {
    return Response.json({ error: "Statut invalide" }, { status: 400 });
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: body.status as never | undefined },
  });
  return Response.json(updated);
}
