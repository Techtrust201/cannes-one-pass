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
import { logisticsRoleLabel } from "@/lib/scan-vehicle-target";
import {
  getRxVehicleProcessInstructions,
  type RxVehicleProcessInstructions,
} from "@/lib/rx-vehicle-process";
import type { VehicleFamily } from "@prisma/client";

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

export interface MinimalVehicle {
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
  interveningCompany?: string | null;
}

export type EmailVehicleBlock = {
  vehicle: MinimalVehicle;
  gabarit: string;
  process: RxVehicleProcessInstructions | null;
  /** cid de l'image QR inline (null = pas de QR pour ce bloc, ex. demande NOUVEAU). */
  qrCid: string | null;
  qrCaption: string;
};

/**
 * Corps HTML de l'e-mail de création — exporté pour tests (multi-véhicules).
 */
export function buildCreationEmailHtml(opts: {
  acc: { company: string; stand: string; event: string };
  vehicles: EmailVehicleBlock[];
  vehicleIdentity: string;
  validated: boolean;
  orgSlug: string | null;
  lang: LangCode;
  /** QR unique de suivi (demande NOUVEAU) — cid fixe `qraccreditation`. */
  trackingQr?: boolean;
}): string {
  const { acc, vehicles, vehicleIdentity, validated, orgSlug, lang } = opts;
  const et = getEmailTranslations(lang);
  const pdfT = getPdfTranslations(lang);
  const companyLabel = getOrgFieldLabel(orgSlug, "decoratorName", lang, pdfT.exhibitor);
  const standLabel = getOrgFieldLabel(orgSlug, "standServed", lang, pdfT.stand);
  const isRx = (orgSlug ?? "").toLowerCase() === "rx";

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

  const vehicleBlocksHtml = vehicles
    .map((block) => {
      const v = block.vehicle;
      const phone = `${v.phoneCode ?? ""} ${v.phoneNumber ?? ""}`.trim();
      const role = logisticsRoleLabel(v.logisticsRole);
      const processHtml =
        isRx && block.process
          ? `<div style="margin-top:8px;padding:8px 10px;background:#EFF6FF;border-radius:6px;font-size:12px;color:#1E3A8A;">
              <strong>${escapeHtml(block.process.title)}</strong>
              <div style="margin-top:4px;">Zone : ${escapeHtml(block.process.zoneLabel)}${
                block.process.maxParkingMinutes != null
                  ? ` · max ${block.process.maxParkingMinutes} min`
                  : ""
              }</div>
              <ul style="margin:6px 0 0 16px;padding:0;">
                ${block.process.instructions
                  .map((i) => `<li>${escapeHtml(i)}</li>`)
                  .join("")}
              </ul>
            </div>`
          : "";
      const qrHtml = block.qrCid
        ? `<div style="text-align:center;margin-top:10px;">
            <img src="cid:${escapeHtml(block.qrCid)}" alt="${escapeHtml(et.qrAlt)}" width="180" height="180" style="border:1px solid #E5E7EB;border-radius:12px;background:#fff;" />
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(block.qrCaption)}</div>
          </div>`
        : "";
      return `
      <div style="border:1px solid #E5E7EB;border-radius:8px;padding:12px;margin-bottom:12px;background:#fff;">
        <div style="font-size:13px;font-weight:700;color:#4F587E;margin-bottom:6px;">${escapeHtml(role)}</div>
        <table style="width:100%;border-collapse:collapse;">
          ${v.plate ? row(et.vehicle, v.plate) : row(et.vehicle, "Plaque à l'arrivée")}
          ${block.gabarit ? row(et.vehicleTemplate, block.gabarit) : ""}
          ${v.trailerPlate ? row(et.trailer, v.trailerPlate) : ""}
          ${v.date ? row(et.plannedDate, `${v.date}${v.time ? " " + v.time : ""}`) : ""}
          ${v.city ? row(et.departureCity, v.city) : ""}
          ${phone ? row(et.driverPhone, phone) : ""}
          ${v.interveningCompany ? row("Société intervenante", v.interveningCompany) : ""}
        </table>
        ${processHtml}
        ${qrHtml}
      </div>`;
    })
    .join("");

  const trackingQrHtml = opts.trackingQr
    ? `<div style="text-align:center;margin-bottom:8px;">
        <img src="cid:qraccreditation" alt="${escapeHtml(et.qrAlt)}" width="220" height="220" style="border:1px solid #E5E7EB;border-radius:12px;background:#fff;" />
        <div style="font-size:12px;color:#6b7280;margin-top:6px;">${escapeHtml(et.qrCaption)}</div>
      </div>`
    : "";

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

    <table style="width:100%;border-collapse:collapse;background:#F9FAFB;border-radius:8px;overflow:hidden;margin-bottom:16px;">
      ${row(companyLabel, acc.company)}
      ${row(standLabel, acc.stand)}
      ${row(et.event, acc.event)}
      ${row(et.vehicle, vehicleIdentity)}
    </table>

    ${vehicleBlocksHtml}
    ${trackingQrHtml}

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
    const lang: LangCode = isValidLang(acc.language ?? "")
      ? (acc.language as LangCode)
      : "fr";
    const orgSlug = acc.organization?.slug ?? null;
    const isRx = (orgSlug ?? "").toLowerCase() === "rx";

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

    const processConfigs = isRx && acc.organizationId
      ? await prisma.rxVehicleProcessConfig.findMany({
          where: { organizationId: acc.organizationId, isActive: true },
        })
      : [];
    const processByFamily = new Map(
      processConfigs.map((c) => [c.vehicleFamily as VehicleFamily, c])
    );

    const resolveProcess = (
      vehicleType: string | null,
      size: string
    ): RxVehicleProcessInstructions | null => {
      if (!isRx) return null;
      const code = (vehicleType || size || "").trim().toUpperCase();
      const vt = vehicleTypes.find(
        (t) => t.code.toUpperCase() === code || t.label.toUpperCase() === code
      );
      const family = (vt?.vehicleFamily as VehicleFamily | null | undefined) ?? null;
      if (!family) return null;
      return getRxVehicleProcessInstructions(
        family,
        processByFamily.get(family) ?? null
      );
    };

    // Identité véhicule pour le sujet (évite la confusion si plusieurs e-mails).
    const vehicleIdentity =
      vehicles.length > 1
        ? `${vehicles.length} véhicules`
        : vehicles[0]?.plate?.trim() ||
          vehicles[0]?.vehicleType?.trim() ||
          vehicles[0]?.size?.trim() ||
          "Véhicule";

    // « validée » = accréditation créée par un agent habilité (espace
    // logisticien) -> tout statut autre que NOUVEAU. NOUVEAU = demande publique
    // encore à valider à l'arrivée. Dérivé du statut réel : fonctionne aussi
    // pour le renvoi d'e-mail (resend-creation-email).
    const validated = acc.status !== "NOUVEAU";
    const et = getEmailTranslations(lang);

    type QrAttachment = {
      filename: string;
      content: Buffer;
      inlineContentId: string;
    };
    const qrAttachments: QrAttachment[] = [];

    const vehicleBlocks: EmailVehicleBlock[] = [];
    for (let i = 0; i < vehicles.length; i += 1) {
      const vehicle = vehicles[i];
      const gabarit = resolveVehicleTypeLabelFromList(
        vehicleTypes,
        vehicle.vehicleType,
        vehicle.size,
        lang
      );
      const process = resolveProcess(vehicle.vehicleType, vehicle.size);
      let qrCid: string | null = null;
      let qrCaption = et.qrCaption;
      if (validated) {
        qrCid = `qrvehicle${vehicle.id ?? i}`;
        const phase =
          vehicle.logisticsRole === "DEMONTAGE"
            ? ("DEMONTAGE" as const)
            : vehicle.logisticsRole === "MONTAGE"
              ? ("MONTAGE" as const)
              : undefined;
        const png = await QRCode.toBuffer(
          idQrPayload(acc.id, {
            vehicleId: vehicle.id ?? null,
            phase,
          }),
          {
            errorCorrectionLevel: "M",
            width: 280,
            margin: 2,
            type: "png",
          }
        );
        qrAttachments.push({
          filename: `qr-vehicle-${vehicle.id ?? i}.png`,
          content: png,
          inlineContentId: qrCid,
        });
        qrCaption = logisticsRoleLabel(vehicle.logisticsRole);
      }
      vehicleBlocks.push({
        vehicle,
        gabarit,
        process,
        qrCid,
        qrCaption,
      });
    }

    // Demande NOUVEAU : un seul QR de suivi (sécurité) + récap de tous les véhicules.
    if (!validated) {
      const trackingPng = await QRCode.toBuffer(
        idQrPayload(acc.id, {
          vehicleId: vehicles[0]?.id ?? null,
        }),
        {
          errorCorrectionLevel: "M",
          width: 320,
          margin: 2,
          type: "png",
        }
      );
      qrAttachments.push({
        filename: "qr-accreditation.png",
        content: trackingPng,
        inlineContentId: "qraccreditation",
      });
    }

    const subject = validated
      ? `${et.subjectValidated} — ${vehicleIdentity} (${acc.company})`
      : `${et.subjectRequest} — ${vehicleIdentity} (${acc.company})`;
    const html = buildCreationEmailHtml({
      acc,
      vehicles: vehicleBlocks,
      vehicleIdentity,
      validated,
      orgSlug,
      lang,
      trackingQr: !validated,
    });

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
          plate: vehicles[0]?.plate,
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
        ...qrAttachments.map((q) => ({
          filename: q.filename,
          content: q.content,
          inlineContentId: q.inlineContentId,
        })),
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
