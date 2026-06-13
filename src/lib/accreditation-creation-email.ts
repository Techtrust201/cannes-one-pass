/**
 * Lot 2 — E-mail automatique à la création d'une accréditation.
 *
 * Envoie un récapitulatif + QR code + infos chauffeur, avec une mention claire
 * que l'accréditation n'est PAS encore valide. Conçu pour être **non bloquant** :
 * cette fonction ne lève jamais d'exception et n'altère jamais le statut de
 * l'accréditation (elle reste NOUVEAU). Le résultat est tracé dans l'historique
 * en distinguant 3 cas : envoyé / ignoré (pas de destinataire) / échec (config
 * Resend manquante ou erreur d'envoi).
 *
 * Réservé au serveur (importe Prisma + Resend).
 */
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import QRCode from "qrcode";
import { writeHistoryDirect } from "@/lib/history-server";
import { createEmailSentEntry } from "@/lib/history";
import { resolveAccreditationSender } from "@/lib/email-sender";

export type CreationEmailOutcome =
  | "sent"
  | "skipped_no_recipient"
  | "skipped_disabled"
  | "failed";

/** Échappe le HTML pour éviter toute injection depuis les champs utilisateur. */
function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Trace informative SANS marquer l'e-mail comme envoyé (cas ignoré/échec). */
async function traceInfo(accreditationId: string, description: string): Promise<void> {
  try {
    await writeHistoryDirect({
      accreditationId,
      action: "INFO_UPDATED",
      field: "email",
      description,
      actorSource: "SYSTEM",
    });
  } catch (e) {
    console.error("traceInfo (creation email) failed:", e);
  }
}

interface MinimalVehicle {
  plate: string | null;
  trailerPlate: string | null;
  vehicleType: string | null;
  size: string;
  phoneCode: string;
  phoneNumber: string;
  date: string;
  time: string;
  city: string;
}

function buildHtml(
  acc: { company: string; stand: string; event: string },
  vehicle: MinimalVehicle | undefined,
  vehicleIdentity: string
): string {
  const phone = vehicle
    ? `${vehicle.phoneCode ?? ""} ${vehicle.phoneNumber ?? ""}`.trim()
    : "";
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">${escapeHtml(
          label
        )}</td><td style="padding:6px 12px;color:#111827;font-size:13px;font-weight:600;">${escapeHtml(
          value
        )}</td></tr>`
      : "";

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827;">
    <h2 style="color:#4F587E;margin:0 0 4px;">Demande d'accréditation reçue</h2>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">
      Bonjour,<br/>Votre demande d'accréditation véhicule a bien été enregistrée.
      Voici votre récapitulatif et votre QR code.
    </p>

    <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:8px;margin-bottom:20px;">
      <strong style="color:#92400E;">Accréditation pas encore valide.</strong>
      <div style="font-size:13px;color:#92400E;margin-top:4px;">
        Elle devra être validée par un agent à votre arrivée sur site. Présentez ce QR code à l'agent.
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#F9FAFB;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      ${row("Société", acc.company)}
      ${row("Stand", acc.stand)}
      ${row("Événement", acc.event)}
      ${row("Véhicule", vehicleIdentity)}
      ${vehicle?.trailerPlate ? row("Remorque", vehicle.trailerPlate) : ""}
      ${vehicle?.date ? row("Date prévue", `${vehicle.date}${vehicle.time ? " " + vehicle.time : ""}`) : ""}
      ${vehicle?.city ? row("Ville de départ", vehicle.city) : ""}
      ${phone ? row("Téléphone chauffeur", phone) : ""}
    </table>

    <div style="text-align:center;margin-bottom:8px;">
      <img src="cid:qraccreditation" alt="QR code de l'accréditation" width="220" height="220" style="border:1px solid #E5E7EB;border-radius:12px;background:#fff;" />
      <div style="font-size:12px;color:#6b7280;margin-top:6px;">QR de l'accréditation — à présenter à l'agent</div>
    </div>

    <p style="font-size:12px;color:#9ca3af;margin-top:24px;">
      Cet e-mail est envoyé automatiquement, merci de ne pas y répondre.
    </p>
  </div>`;
}

/**
 * Envoie l'e-mail de création. Ne lève jamais : renvoie l'issue pour le log.
 */
export async function sendAccreditationCreationEmail(params: {
  accreditationId: string;
  recipient: string | null | undefined;
}): Promise<CreationEmailOutcome> {
  const { accreditationId } = params;
  const recipient = params.recipient?.trim() || "";

  // 1) Aucun destinataire → ignoré (tracé, jamais marqué "envoyé").
  if (!recipient) {
    await traceInfo(
      accreditationId,
      "E-mail de création ignoré : aucun destinataire renseigné."
    );
    return "skipped_no_recipient";
  }

  // 2) Clé Resend manquante → échec tracé, sans exception ni blocage.
  if (!process.env.RESEND_API_KEY) {
    await traceInfo(
      accreditationId,
      "E-mail de création non envoyé : configuration e-mail (Resend) manquante."
    );
    return "failed";
  }

  try {
    const acc = await prisma.accreditation.findUnique({
      where: { id: accreditationId },
      include: {
        vehicles: true,
        organization: {
          select: {
            name: true,
            emailFromName: true,
            emailFromAddress: true,
            replyToEmail: true,
            emailSendingEnabled: true,
          },
        },
      },
    });
    if (!acc) {
      await traceInfo(
        accreditationId,
        "E-mail de création non envoyé : accréditation introuvable."
      );
      return "failed";
    }

    // Résolution de l'expéditeur : config org si valide, sinon FROM_EMAIL global.
    const sender = resolveAccreditationSender(acc.organization);

    if (sender.disabled) {
      await traceInfo(
        accreditationId,
        "E-mail de création non envoyé : envoi automatique désactivé pour l'organisation."
      );
      return "skipped_disabled";
    }

    if (!sender.from) {
      await traceInfo(
        accreditationId,
        "E-mail de création non envoyé : aucun expéditeur configuré (FROM_EMAIL global manquant)."
      );
      return "failed";
    }

    const vehicle = acc.vehicles[0] as MinimalVehicle | undefined;
    // Identité véhicule pour le sujet (évite la confusion si plusieurs e-mails).
    const vehicleIdentity =
      vehicle?.plate?.trim() ||
      vehicle?.vehicleType?.trim() ||
      vehicle?.size?.trim() ||
      "Véhicule";

    // QR strictement compatible avec le scanner Lot 1 (resolveAccreditationId
    // lit JSON.parse(text).id) et avec les QR PDF existants.
    const qrPng = await QRCode.toBuffer(JSON.stringify({ id: acc.id }), {
      errorCorrectionLevel: "M",
      width: 320,
      margin: 2,
      type: "png",
    });

    const subject = `Demande d'accréditation reçue — ${vehicleIdentity} (${acc.company})`;
    const html = buildHtml(acc, vehicle, vehicleIdentity);

    // Trace le fallback forcé (config org refusée) sans bloquer l'envoi.
    if (sender.usedFallback && sender.note) {
      await traceInfo(accreditationId, sender.note);
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: sender.from,
      to: recipient,
      ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
      subject,
      html,
      attachments: [
        {
          filename: "qr-accreditation.png",
          content: qrPng,
          inlineContentId: "qraccreditation",
        },
      ],
    });

    if (error) {
      await traceInfo(
        accreditationId,
        `Échec de l'envoi de l'e-mail de création : ${error.message ?? "erreur Resend"}.`
      );
      return "failed";
    }

    // Succès : on marque l'e-mail comme réellement envoyé.
    await prisma.accreditationEmailHistory.create({
      data: { accreditationId, email: recipient },
    });
    await writeHistoryDirect(createEmailSentEntry(accreditationId, recipient));
    return "sent";
  } catch (e) {
    console.error("sendAccreditationCreationEmail failed:", e);
    await traceInfo(
      accreditationId,
      `Échec de l'envoi de l'e-mail de création : ${
        e instanceof Error ? e.message : "erreur inconnue"
      }.`
    );
    return "failed";
  }
}
