import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { sendAccreditationCreationEmail } from "@/lib/accreditation-creation-email";

/**
 * Renvoi de l'e-mail de création (récap + QR, Lot 2) pour une accréditation
 * existante. Utilisé par le bouton « Renvoyer l'accréditation » du flux
 * logisticien quand l'e-mail automatique n'est pas parti (ou pour le renvoyer).
 *
 * Réservé aux utilisateurs authentifiés ayant accès à l'accréditation (scoping
 * multi-tenant via `assertAccreditationAccess`). Non bloquant : l'issue d'envoi
 * est renvoyée telle quelle (jamais d'exception côté appelant).
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;

  // Authentification obligatoire (action back-office).
  let currentUserId: string | undefined;
  try {
    const session = await getSession(req);
    currentUserId = session?.user?.id;
  } catch {
    currentUserId = undefined;
  }
  if (!currentUserId) {
    return Response.json({ error: "Non autorisé." }, { status: 401 });
  }

  // Vérifie l'accès multi-tenant à cette accréditation.
  const { assertAccreditationAccess } = await import("@/lib/rbac");
  try {
    await assertAccreditationAccess(currentUserId, id);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const acc = await prisma.accreditation.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!acc) {
    return Response.json({ error: "Accréditation introuvable." }, { status: 404 });
  }
  if (!acc.email || !acc.email.trim()) {
    return Response.json(
      { error: "Aucun e-mail destinataire enregistré pour cette accréditation." },
      { status: 400 }
    );
  }

  const outcome = await sendAccreditationCreationEmail({
    accreditationId: acc.id,
    recipient: acc.email,
  });

  return Response.json({ outcome });
}
