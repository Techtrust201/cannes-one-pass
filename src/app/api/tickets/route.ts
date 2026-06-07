import { NextRequest } from "next/server";
import { z } from "zod";
import prisma, { withRetry } from "@/lib/prisma";
import {
  requirePermission,
  getAccessibleOrganizationIds,
} from "@/lib/auth-helpers";

/**
 * Création publique d'un ticket de support — `POST /api/tickets`.
 *
 * Aucun authentification requise. Le `organizationSlug` du body identifie
 * l'organisation destinataire ; ses membres avec permission `TICKETS`
 * verront le ticket dans `/logisticien/tickets?espace=<slug>`.
 *
 * Anti-spam : rate-limit basique par email (max 5 tickets / heure).
 */
const createSchema = z.object({
  organizationSlug: z.string().min(1),
  eventSlug: z.string().optional(),
  // `stand` optionnel : le formulaire RX ne le demande pas (remplacé par
  // `identification`), mais le formulaire Palais l'envoie toujours.
  stand: z.string().max(120).optional(),
  email: z.email(),
  phone: z.string().max(40).optional(),
  message: z.string().min(5).max(5000),
  // Champs enrichis RX (optionnels au schéma ; requis côté UI RX).
  company: z.string().max(200).optional(),
  problemType: z.string().max(120).optional(),
  identification: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Champs invalides", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const {
    organizationSlug,
    eventSlug,
    stand,
    email,
    phone,
    message,
    company,
    problemType,
    identification,
  } = parsed.data;

  const org = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true, isActive: true },
  });
  if (!org || !org.isActive) {
    return Response.json({ error: "Organisation inconnue" }, { status: 404 });
  }

  // Rate-limit léger : interdit > 5 tickets / heure pour le même email
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.supportTicket.count({
    where: { email, createdAt: { gte: oneHourAgo } },
  });
  if (recent >= 5) {
    return Response.json(
      { error: "Trop de tickets envoyés. Réessayez plus tard." },
      { status: 429 }
    );
  }

  let eventId: string | null = null;
  if (eventSlug) {
    const ev = await prisma.event.findUnique({
      where: { slug: eventSlug },
      select: { id: true, organizationId: true },
    });
    if (ev && ev.organizationId === org.id) eventId = ev.id;
  }

  const created = await prisma.supportTicket.create({
    data: {
      organizationId: org.id,
      eventId,
      stand: stand ?? identification ?? "",
      email,
      phone: phone ?? null,
      message,
      company: company ?? null,
      problemType: problemType ?? null,
      identification: identification ?? null,
    },
  });

  return Response.json({ id: created.id, status: created.status }, { status: 201 });
}

/**
 * Liste paginée des tickets pour l'utilisateur connecté — `GET /api/tickets?espace=<slug>`.
 *
 * Filtre :
 *   - Si `?espace=<slug>` est présent, restreint à cette organisation (à
 *     condition que l'utilisateur en soit membre).
 *   - Sinon, retourne les tickets des organisations dont l'utilisateur
 *     est membre (ou tous pour SUPER_ADMIN).
 *   - Filtre optionnel `?status=OPEN|IN_PROGRESS|ANSWERED|CLOSED`.
 */
export async function GET(req: NextRequest) {
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

  const espace = req.nextUrl.searchParams.get("espace")?.trim() || null;
  const status = req.nextUrl.searchParams.get("status")?.trim() || null;

  const accessibleOrgs = await getAccessibleOrganizationIds(userId);
  let orgFilter: { in: string[] } | null = null;

  if (espace) {
    const org = await prisma.organization.findUnique({
      where: { slug: espace },
      select: { id: true },
    });
    if (!org) return Response.json([]);
    if (accessibleOrgs !== "ALL" && !accessibleOrgs.includes(org.id)) {
      return Response.json([]);
    }
    orgFilter = { in: [org.id] };
  } else if (accessibleOrgs !== "ALL") {
    orgFilter = { in: accessibleOrgs };
  }

  const tickets = await withRetry(() =>
    prisma.supportTicket.findMany({
      where: {
        ...(orgFilter ? { organizationId: orgFilter } : {}),
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        stand: true,
        email: true,
        phone: true,
        message: true,
        company: true,
        problemType: true,
        identification: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { id: true, slug: true, name: true } },
        eventRef: { select: { id: true, slug: true, name: true } },
        _count: { select: { replies: true } },
      },
    })
  );

  return Response.json(tickets);
}
