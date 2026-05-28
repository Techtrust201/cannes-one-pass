import { NextRequest } from "next/server";
import { Resend } from "resend";
import prisma from "@/lib/prisma";
import {
  requirePermission,
  getAccessibleOrganizationIds,
} from "@/lib/auth-helpers";

/**
 * `POST /api/tickets/[id]/reply` — Ajoute une réponse au ticket et tente
 * d'envoyer un email au demandeur via Resend.
 *
 * Le `from` est `Organization.supportEmail` si défini, sinon
 * `process.env.FROM_EMAIL` (le générique du Palais). En cas d'erreur
 * d'envoi, on conserve la réponse en DB avec `sentByEmail = false` afin
 * que l'agent voie le thread mais sache que le mail n'est pas parti.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  let userId: string;
  let userName: string;
  try {
    const session = await requirePermission(req, "TICKETS", "write");
    userId = session.user.id;
    userName = session.user.name ?? session.user.email ?? "Support";
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
      organization: { select: { id: true, name: true, supportEmail: true } },
    },
  });
  if (!ticket) return new Response("Not found", { status: 404 });

  const accessibleOrgs = await getAccessibleOrganizationIds(userId);
  if (accessibleOrgs !== "ALL" && !accessibleOrgs.includes(ticket.organizationId)) {
    return new Response("Accès refusé", { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const replyBody = (body.body ?? "").trim();
  if (replyBody.length < 1) {
    return Response.json({ error: "Réponse vide" }, { status: 400 });
  }

  // Tentative d'envoi email
  let sentByEmail = false;
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = ticket.organization.supportEmail || process.env.FROM_EMAIL;

  if (apiKey && fromEmail) {
    try {
      const resend = new Resend(apiKey);
      const subject = `[${ticket.organization.name}] Re: ticket #${ticket.id.slice(0, 8)}`;
      const safeBody = replyBody
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");
      const html = `<p>${safeBody}</p><hr/><p style="color:#888;font-size:12px">— ${userName}, ${ticket.organization.name}</p>`;
      await resend.emails.send({
        from: fromEmail,
        to: ticket.email,
        subject,
        html,
      });
      sentByEmail = true;
    } catch (err) {
      console.error("ticket reply email error:", err);
    }
  }

  const reply = await prisma.supportTicketReply.create({
    data: {
      ticketId: ticket.id,
      authorUserId: userId,
      body: replyBody,
      sentByEmail,
    },
  });

  // Si la réponse part bien et que le statut était OPEN, on bascule en ANSWERED.
  if (sentByEmail && ticket.status === "OPEN") {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "ANSWERED" },
    });
  } else {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status },
    });
  }

  return Response.json({ reply, sentByEmail }, { status: 201 });
}
