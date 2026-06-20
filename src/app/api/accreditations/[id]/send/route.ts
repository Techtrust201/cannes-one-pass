import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import { createEmailSentEntry } from "@/lib/history";
import { writeHistoryDirect } from "@/lib/history-server";
import { getSession } from "@/lib/auth-helpers";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    // Récupérer l'utilisateur connecté (optionnel)
    let currentUserId: string | undefined;
    try {
      const session = await getSession(req);
      currentUserId = session?.user?.id;
    } catch {
      // Pas de session
    }

    // Si l'utilisateur est authentifié, vérifier qu'il a bien accès à
    // l'accréditation (scoping multi-tenant). Anonyme = on laisse passer
    // pour préserver le flow public d'envoi PDF côté Palais.
    if (currentUserId) {
      const { assertAccreditationAccess } = await import("@/lib/rbac");
      try {
        await assertAccreditationAccess(currentUserId, params.id);
      } catch (err) {
        if (err instanceof Response) return err;
        throw err;
      }
    }

    const { email } = (await req.json()) as { email?: string };

    const acc = await prisma.accreditation.findUnique({
      where: { id: params.id },
      include: { vehicles: true, organization: { select: { slug: true } } },
    });
    if (!acc) return new Response("Not found", { status: 404 });

    const targetEmail = email || (acc as { email?: string }).email;
    if (!targetEmail) return new Response("Email manquant", { status: 400 });

    // Met à jour le champ email si nouvel email
    if (!(acc as { email?: string }).email && email) {
      await prisma.accreditation.update({
        where: { id: acc.id },
        data: { email },
      });
    }

    // Source UNIQUE de vérité : MÊME fonction + MÊME baseUrl (getBaseUrl) que le
    // téléchargement et l'e-mail de création → PDF/QR byte-identiques. On
    // demande le mode « official » ; le garde-fou §3.4b retombe automatiquement
    // en « request » si l'accréditation n'est pas validée (statut non
    // opérationnel), ce qui garantit la cohérence bandeau/statut. La langue suit
    // l'accréditation.
    const { generateAccreditationPdfBuffer } = await import(
      "@/lib/accreditation-pdf-ids"
    );
    const { buildAccreditationPdfFilename } = await import(
      "@/lib/accreditation-pdf-filename"
    );
    const { isValidLang } = await import("@/lib/translations");
    const { getEmailTranslations } = await import("@/lib/email-translations");
    const accLang = (acc as { language?: string }).language;
    const pdfBuffer = await generateAccreditationPdfBuffer({
      id: acc.id,
      mode: "official",
      ...(accLang && isValidLang(accLang) ? { lang: accLang } : {}),
    });
    // Nom de fichier parlant (Lot 4). Le renvoi vise un document validé
    // (mode official) ; le garde-fou §3.4b peut le retomber en « request »,
    // mais le préfixe « Accreditation » reste cohérent avec l'intention d'envoi.
    const pdfFilename = buildAccreditationPdfFilename({
      stand: acc.stand,
      plate: acc.vehicles?.[0]?.plate,
      validated: acc.status !== "NOUVEAU",
    });

    // Lot 8 : sujet/corps multilingues (auparavant figés en FR + mention
    // « Palais des Festivals » erronée pour les autres organisations, ex. RX).
    const emailLang = accLang && isValidLang(accLang) ? accLang : "fr";
    const et = getEmailTranslations(emailLang);
    const resend = new Resend(process.env.RESEND_API_KEY!);
    await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: targetEmail,
      subject: et.titleValidated,
      html: `<p>${et.greeting}<br/>${et.introValidated}</p>`,
      // Buffer brut (jamais .toString("base64")) : le SDK Resend encode
      // lui-même → évite tout double-encodage qui abîmerait le QR.
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer,
        },
      ],
    });

    // Transaction : update DB + email history + historique
    await prisma.$transaction(async (tx) => {
      await tx.accreditation.update({
        where: { id: acc.id },
        data: { sentAt: new Date(), email: targetEmail },
      });

      await tx.accreditationEmailHistory.create({
        data: {
          accreditationId: acc.id,
          email: targetEmail,
        },
      });

      await writeHistoryDirect(
        createEmailSentEntry(acc.id, targetEmail, currentUserId),
        tx
      );
    });

    return new Response(null, { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("Erreur envoi", { status: 500 });
  }
}
