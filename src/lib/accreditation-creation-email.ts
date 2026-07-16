/**
 * Lot 2 — E-mail automatique à la création d'une accréditation.
 *
 * Envoie un récapitulatif + QR code + infos chauffeur. Le message s'adapte au
 * statut : « pas encore valide » pour une demande publique (NOUVEAU), « validée »
 * pour une accréditation créée par un agent (espace logisticien). Conçu pour être
 * **non bloquant** : cette fonction ne lève jamais d'exception et n'altère jamais
 * le statut de l'accréditation. Le résultat est tracé dans l'historique
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
import { generateAccreditationPdfBuffer } from "@/lib/accreditation-pdf-ids";
import { buildAccreditationPdfFilename } from "@/lib/accreditation-pdf-filename";
import { getEmailTranslations } from "@/lib/email-translations";
import { getPdfTranslations } from "@/lib/pdf-translations";
import { idQrPayload } from "@/lib/qr-payloads";
import { isValidLang, type LangCode } from "@/lib/translations";
import {
  mapDbVehicleType,
  mapDefaultVehicleTypes,
  resolveVehicleTypeLabelFromList,
} from "@/lib/vehicle-type-server";
import { getOrgFieldLabel } from "@/lib/org-form-config";

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
  id?: number;
  plate: string | null;
  trailerPlate: string | null;
  vehicleType: string | null;
  size: string;
  phoneCode: string;
  phoneNumber: string;
  date: string;
  time: string;
  city: string;
  logisticsRole?: "MONTAGE" | "DEMONTAGE" | "BOTH" | null;
}

function buildHtml(
  acc: { company: string; stand: string; event: string },
  vehicle: MinimalVehicle | undefined,
  vehicleIdentity: string,
  gabarit: string,
  /**
   * `true` = accréditation déjà validée administrativement (créée depuis
   * l'espace logisticien) -> message « validée ». `false` = demande publique
   * encore à valider par un agent (statut NOUVEAU).
   */
  validated: boolean,
  /**
   * Slug d'organisation : scope les libellés (Palais → « Société » /
   * « Stand | Client »). Les autres organisations conservent les libellés
   * historiques de l'e-mail (« Société » / « Stand »).
   */
  orgSlug: string | null,
  /** Langue du corps de l'e-mail (Lot 8) : suit la langue de l'accréditation. */
  lang: LangCode
): string {
  // Lot 8 : corps d'e-mail multilingue (auparavant figé en FR).
  const et = getEmailTranslations(lang);
  const pdfT = getPdfTranslations(lang);
  // Libellés société/stand : Palais → libellé dédié dans la langue ; autres
  // organisations (RX inclus) → fallback PDF traduit.
  const companyLabel = getOrgFieldLabel(orgSlug, "decoratorName", lang, pdfT.exhibitor);
  const standLabel = getOrgFieldLabel(orgSlug, "standServed", lang, pdfT.stand);
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

  const banner = validated
    ? `
    <div style="background:#DCFCE7;border-left:4px solid #16A34A;padding:12px 16px;border-radius:8px;margin-bottom:20px;">
      <strong style="color:#166534;">${escapeHtml(et.bannerValidatedTitle)}</strong>
      <div style="font-size:13px;color:#166534;margin-top:4px;">
        ${escapeHtml(et.bannerValidatedText)}
      </div>
    </div>`
    : `
    <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:8px;margin-bottom:20px;">
      <strong style="color:#92400E;">${escapeHtml(et.bannerRequestTitle)}</strong>
      <div style="font-size:13px;color:#92400E;margin-top:4px;">
        ${escapeHtml(et.bannerRequestText)}
      </div>
    </div>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827;">
    <h2 style="color:#4F587E;margin:0 0 4px;">${escapeHtml(
      validated ? et.titleValidated : et.titleRequest
    )}</h2>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">
      ${escapeHtml(et.greeting)}<br/>${escapeHtml(
        validated ? et.introValidated : et.introRequest
      )}
    </p>

    ${banner}

    <table style="width:100%;border-collapse:collapse;background:#F9FAFB;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      ${row(companyLabel, acc.company)}
      ${row(standLabel, acc.stand)}
      ${row(et.event, acc.event)}
      ${row(et.vehicle, vehicleIdentity)}
      ${gabarit ? row(et.vehicleTemplate, gabarit) : ""}
      ${vehicle?.trailerPlate ? row(et.trailer, vehicle.trailerPlate) : ""}
      ${vehicle?.date ? row(et.plannedDate, `${vehicle.date}${vehicle.time ? " " + vehicle.time : ""}`) : ""}
      ${vehicle?.city ? row(et.departureCity, vehicle.city) : ""}
      ${phone ? row(et.driverPhone, phone) : ""}
    </table>

    <div style="text-align:center;margin-bottom:8px;">
      <img src="cid:qraccreditation" alt="${escapeHtml(et.qrAlt)}" width="220" height="220" style="border:1px solid #E5E7EB;border-radius:12px;background:#fff;" />
      <div style="font-size:12px;color:#6b7280;margin-top:6px;">${escapeHtml(et.qrCaption)}</div>
    </div>

    <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:12px 16px;margin-top:20px;">
      <div style="font-size:13px;color:#1E3A8A;font-weight:600;">
        ${escapeHtml(et.spamTitle)}
      </div>
      <div style="font-size:13px;color:#1E40AF;margin-top:4px;">
        ${escapeHtml(et.spamText)}
      </div>
    </div>

    <p style="font-size:12px;color:#9ca3af;margin-top:24px;">
      ${escapeHtml(et.footerAuto)}
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
            slug: true,
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

    const vehicles = (acc.vehicles ?? []) as MinimalVehicle[];
    const vehicle = vehicles[0];
    const lang: LangCode = isValidLang(acc.language ?? "")
      ? (acc.language as LangCode)
      : "fr";

    let vehicleTypes = mapDefaultVehicleTypes(null);
    if (acc.organizationId) {
      const types = await prisma.vehicleTypeConfig.findMany({
        where: { organizationId: acc.organizationId, isActive: true },
        orderBy: { sortOrder: "asc" },
      });
      if (types.length > 0) {
        vehicleTypes = types.map(mapDbVehicleType);
      }
    }

    const gabarit = vehicle
      ? resolveVehicleTypeLabelFromList(
          vehicleTypes,
          vehicle.vehicleType,
          vehicle.size,
          lang
        )
      : "";

    // Identité véhicule pour le sujet (évite la confusion si plusieurs e-mails).
    const vehicleIdentity =
      vehicles.length > 1
        ? `${vehicles.length} véhicules`
        : vehicle?.plate?.trim() ||
          vehicle?.vehicleType?.trim() ||
          vehicle?.size?.trim() ||
          "Véhicule";

    // QR principal : premier véhicule (compatibilité scanner) + vehicleId si dispo.
    const qrPng = await QRCode.toBuffer(
      idQrPayload(acc.id, {
        vehicleId: vehicle?.id ?? null,
        phase:
          vehicle?.logisticsRole === "DEMONTAGE"
            ? "DEMONTAGE"
            : vehicle?.logisticsRole === "MONTAGE"
              ? "MONTAGE"
              : undefined,
      }),
      {
        errorCorrectionLevel: "M",
        width: 320,
        margin: 2,
        type: "png",
      }
    );

    // « validée » = accréditation créée par un agent habilité (espace
    // logisticien) -> tout statut autre que NOUVEAU. NOUVEAU = demande publique
    // encore à valider à l'arrivée. Dérivé du statut réel : fonctionne aussi
    // pour le renvoi d'e-mail (resend-creation-email).
    const validated = acc.status !== "NOUVEAU";
    const et = getEmailTranslations(lang);
    const subject = validated
      ? `${et.subjectValidated} — ${vehicleIdentity} (${acc.company})`
      : `${et.subjectRequest} — ${vehicleIdentity} (${acc.company})`;
    const html = buildHtml(
      acc,
      vehicle,
      vehicleIdentity,
      gabarit,
      validated,
      acc.organization?.slug ?? null,
      lang
    );

    // Source unique de vérité du document : on attache à l'e-mail le MÊME PDF
    // propre que celui téléchargé depuis l'interface (générateur structuré
    // multilingue), au lieu d'un simple rendu HTML. Non bloquant : si la
    // génération échoue, l'e-mail part quand même (avec le QR inline).
    let pdfAttachment: { filename: string; content: Buffer } | null = null;
    try {
      const pdfBuffer = await generateAccreditationPdfBuffer({
        id: acc.id,
        mode: validated ? "official" : "request",
        lang,
      });
      pdfAttachment = {
        filename: buildAccreditationPdfFilename({
          stand: acc.stand,
          plate: vehicle?.plate,
          validated,
        }),
        content: pdfBuffer,
      };
    } catch (e) {
      console.error("Creation email PDF attachment failed:", e);
      await traceInfo(
        accreditationId,
        "PDF non joint à l'e-mail (génération échouée) ; e-mail envoyé avec le QR seul."
      );
    }

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
        ...(pdfAttachment
          ? [{ filename: pdfAttachment.filename, content: pdfAttachment.content }]
          : []),
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
