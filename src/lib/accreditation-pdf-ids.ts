import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import prisma from "@/lib/prisma";
import {
  mapDbVehicleType,
  mapDefaultVehicleTypes,
  resolveVehicleTypeLabelFromList,
} from "@/lib/vehicle-type-server";
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import { formatPhoneNumber } from "@/lib/contact-utils";
import {
  getPdfTranslations,
  type PdfT,
} from "@/lib/pdf-translations";
import { isValidLang, type LangCode } from "@/lib/translations";
import { formatSlot } from "@/templates/accreditation/rx/config";
import type { RxVehicleContext } from "@/lib/rx-vehicle-context";
import {
  OFFICIAL_STATUSES,
  resolvePdfMode,
  resolvePdfStatusLabel,
} from "@/lib/accreditation-pdf-modes";
import { trackingQrPayload, accessQrPayload } from "@/lib/qr-payloads";
import { getBaseUrl } from "@/lib/base-url";

// Ré-export pour compatibilité des imports existants (la logique pure vit
// désormais dans accreditation-pdf-modes, testable sans Prisma).
export { OFFICIAL_STATUSES, resolvePdfMode, resolvePdfStatusLabel };

interface RxExtension {
  exhibitor?: { name?: string; stand?: string };
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneCode?: string;
    phoneNumber?: string;
  };
  vehicleContext?: RxVehicleContext;
  manutentionProvider?: string;
}

function parseExtension(raw: unknown): RxExtension {
  if (!raw || typeof raw !== "object") return {};
  return raw as RxExtension;
}

function formatDateTime(iso: string | null | undefined, lang: LangCode): string {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const dt = new Date(`${iso}T12:00:00`);
    return new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(dt);
  }
  try {
    return new Date(iso).toLocaleString(lang);
  } catch {
    return iso;
  }
}

function formatTimeSlot(time: string | null | undefined): string {
  if (!time) return "—";
  return formatSlot(time);
}

async function loadVehicleTypes(
  orgId: string | null,
  orgSlug?: string | null
): Promise<VehicleTypeData[]> {
  if (orgId) {
    const types = await prisma.vehicleTypeConfig.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    if (types.length > 0) return types.map(mapDbVehicleType);
  }
  return mapDefaultVehicleTypes(orgSlug);
}

type DrawHelpers = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  font: any;
  width: number;
  height: number;
  MIN_Y: number;
  drawText: (
    page: unknown,
    text: string,
    x: number,
    y: number,
    size?: number,
    options?: { color?: [number, number, number] }
  ) => void;
  drawWrapped: (
    page: unknown,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size?: number,
    options?: { color?: [number, number, number] }
  ) => number;
};

async function renderAccreditationPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDoc: any,
  helpers: DrawHelpers,
  acc: {
    id: string;
    publicToken: string | null;
    company: string;
    stand: string;
    event: string;
    eventName: string;
    unloading: string;
    message: string | null;
    consent: boolean;
    status: string;
    entryAt: Date | null;
    exitAt: Date | null;
    extension: unknown;
    standId: string | null;
    zone: { label: string; address: string; latitude: number; longitude: number } | null;
    vehicles: Array<{
      plate: string | null;
      size: string;
      phoneCode: string;
      phoneNumber: string;
      date: string;
      time: string;
      city: string;
      vehicleType: string | null;
      trailerPlate: string | null;
    }>;
  },
  vehicleTypes: VehicleTypeData[],
  isRx: boolean,
  baseUrl: string,
  /** 'official' = accréditation d'accès (QR montage/démontage, validité 24h) ;
   *  'request' = demande non validée (QR de suivi, pas d'accès). */
  mode: "request" | "official",
  pdfT: PdfT,
  lang: LangCode
): Promise<void> {
  const page = pdfDoc.addPage();
  const { width, height, MIN_Y, drawText, drawWrapped, font } = helpers;
  let y = height - 50;

  // Dessin "brut" sans garde MIN_Y : réservé au pied de page (QR + notes
  // légales) qui se trouve volontairement sous la marge basse.
  const drawRaw = (
    text: string,
    x: number,
    yy: number,
    size = 9,
    color: [number, number, number] = [0.3, 0.3, 0.3]
  ) => {
    page.drawText(text, { x, y: yy, size, font, color: rgb(...color) });
  };

  const todayStr = new Intl.DateTimeFormat(lang, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const isRequest = mode === "request";
  drawText(
    page,
    isRequest ? pdfT.requestTitle : pdfT.officialTitle,
    50,
    height - 50,
    isRequest ? 18 : 22
  );
  drawText(
    page,
    isRx ? pdfT.rxSubtitle : pdfT.palaisSubtitle,
    50,
    height - 75,
    14
  );
  drawText(page, `${pdfT.issuedDate}: ${todayStr}`, 50, height - 95, 10);

  page.drawLine({
    start: { x: 50, y: height - 105 },
    end: { x: width - 50, y: height - 105 },
    thickness: 1,
    color: rgb(0.9, 0.9, 0.9),
    dashArray: [3, 3],
  });

  // Bandeau rouge très visible pour les demandes non validées : ce document
  // n'autorise PAS l'accès au site (sécurité opérationnelle).
  let bannerOffset = 0;
  if (isRequest) {
    page.drawRectangle({
      x: 50,
      y: height - 138,
      width: width - 100,
      height: 26,
      color: rgb(0.86, 0.15, 0.15),
    });
    drawText(
      page,
      pdfT.requestBanner,
      60,
      height - 131,
      12,
      { color: [1, 1, 1] }
    );
    bannerOffset = 36;
  }

  y = height - 130 - bannerOffset;
  const ext = parseExtension(acc.extension);
  const ctx = ext.vehicleContext ?? {};
  const v = acc.vehicles[0];

  const LABEL_X = 60;
  const LABEL_WIDTH = 150;
  const VALUE_X = LABEL_X + LABEL_WIDTH + 10;
  const VALUE_MAX_WIDTH = width - VALUE_X - 120;
  const LINE_HEIGHT = 16;

  const addLabelVal = (label: string, val: string) => {
    if (y < MIN_Y + LINE_HEIGHT * 2) return;
    drawText(page, `${label} :`, LABEL_X, y, 12, { color: [0.15, 0.15, 0.15] });
    y = drawWrapped(page, val, VALUE_X, y, VALUE_MAX_WIDTH, 12, { color: [0, 0, 0] });
  };

  drawText(page, pdfT.generalInfo, 50, y, 14);
  y -= 25;

  addLabelVal(pdfT.exhibitor, acc.company);
  addLabelVal(pdfT.stand, acc.stand);
  addLabelVal(pdfT.event, acc.eventName);
  if (isRequest && acc.publicToken) {
    addLabelVal(pdfT.reference, acc.publicToken);
  }
  if (acc.zone) {
    addLabelVal(pdfT.unloadingZone, acc.zone.label);
    if (acc.zone.address) addLabelVal(pdfT.address, acc.zone.address);
    addLabelVal(
      pdfT.gpsCoords,
      `${acc.zone.latitude.toFixed(5)}, ${acc.zone.longitude.toFixed(5)}`
    );
  }

  if (isRx && ext.contact) {
    const contactName = [ext.contact.firstName, ext.contact.lastName]
      .filter(Boolean)
      .join(" ");
    if (contactName) addLabelVal(pdfT.contact, contactName);
    if (ext.contact.email) addLabelVal(pdfT.email, ext.contact.email);
    if (ext.contact.phoneNumber) {
      addLabelVal(
        pdfT.phone,
        formatPhoneNumber(ext.contact.phoneCode ?? "", ext.contact.phoneNumber)
      );
    }
  }

  if (acc.unloading) {
    addLabelVal(pdfT.handling, acc.unloading);
  }

  // Sécurité : en mode "request" (demande non validée), on N'AFFICHE JAMAIS un
  // libellé de validation (« VALIDÉE »). Le statut affiché est découplé du
  // statut brut en base et reste cohérent avec le bandeau « non validée ».
  const statusColor: [number, number, number] = isRequest
    ? [0.7, 0.45, 0]
    : acc.status === "ENTREE"
      ? [0, 0.55, 0.2]
      : acc.status === "SORTIE"
        ? [0.7, 0, 0]
        : [0, 0, 0.6];
  const statusLabel = resolvePdfStatusLabel(pdfT, acc.status, mode);
  if (y >= MIN_Y) {
    drawText(page, `${pdfT.status} :`, LABEL_X, y, 12, { color: [0.15, 0.15, 0.15] });
    drawText(page, statusLabel, VALUE_X, y, 12, { color: statusColor });
    y -= LINE_HEIGHT;
  }

  if (v) {
    y -= 10;
    drawText(page, pdfT.deliveryVehicle, 50, y, 14);
    y -= 25;

    const gabarit = resolveVehicleTypeLabelFromList(
      vehicleTypes,
      v.vehicleType,
      v.size,
      lang
    );
    addLabelVal(pdfT.template, gabarit);
    addLabelVal(pdfT.plate, v.plate || pdfT.platePending);
    if (v.trailerPlate) addLabelVal(pdfT.trailerPlate, v.trailerPlate);
    addLabelVal(
      pdfT.driverPhone,
      formatPhoneNumber(v.phoneCode, v.phoneNumber)
    );
    const livDate = ctx.livDate ?? v.date;
    const livTime = ctx.livTime ?? v.time;
    addLabelVal(
      pdfT.deliverySlot,
      `${formatDateTime(livDate, lang)} — ${formatTimeSlot(livTime)}`
    );
    if (ctx.interveningCompany) {
      addLabelVal(pdfT.interveningCompanyDelivery, ctx.interveningCompany);
    }
    if (v.city) {
      addLabelVal(pdfT.departureCityDelivery, v.city);
    }

    y -= 10;
    drawText(page, pdfT.returnVehicle, 50, y, 14);
    y -= 25;

    const repDate = ctx.repDate;
    const repTime = ctx.repTime;
    if (repDate || repTime) {
      addLabelVal(
        pdfT.returnSlot,
        `${formatDateTime(repDate ?? undefined, lang)} — ${formatTimeSlot(repTime ?? undefined)}`
      );
    }

    const sameRep = ctx.repSameAsDelivery !== false;
    if (sameRep) {
      addLabelVal(pdfT.returnVehicle, pdfT.sameAsDelivery);
    } else {
      const repGabarit = resolveVehicleTypeLabelFromList(
        vehicleTypes,
        ctx.repVehicleType,
        null,
        lang
      );
      addLabelVal(pdfT.templateReturn, repGabarit);
      addLabelVal(pdfT.plateReturn, ctx.repPlate || "—");
      if (ctx.repInterveningCompany) {
        addLabelVal(pdfT.interveningCompanyReturn, ctx.repInterveningCompany);
      }
      if (ctx.repCity) {
        addLabelVal(pdfT.departureCityReturn, ctx.repCity);
      }
      if (ctx.repPhoneNumber) {
        addLabelVal(
          pdfT.phoneReturn,
          formatPhoneNumber(ctx.repPhoneCode ?? "", ctx.repPhoneNumber)
        );
      }
    }
  }

  if (acc.message) {
    y -= 10;
    addLabelVal(pdfT.message, acc.message);
  }

  y -= 10;
  const consentPrefix = acc.consent ? "[X]" : "[ ]";
  if (y >= MIN_Y) {
    drawText(
      page,
      `${consentPrefix} ${pdfT.consent}`,
      LABEL_X,
      y,
      11
    );
  }

  // Layout QR : zone bas de page réservée (cf. MIN_Y=200). QR remontés pour ne
  // pas chevaucher le consentement ni les notes légales.
  const QR_SIZE = 80;
  const QR_Y = 130;
  const FOOTER_TEXT_MAX_W = width - 240;

  const drawFooterWrapped = (lines: string[], startY: number) => {
    let noteY = startY;
    for (const raw of lines) {
      const words = raw.split(" ");
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, 9) > FOOTER_TEXT_MAX_W && line) {
          drawRaw(line, LABEL_X, noteY);
          noteY -= 12;
          line = w;
        } else {
          line = test;
        }
      }
      if (line) {
        drawRaw(line, LABEL_X, noteY);
        noteY -= 12;
      }
    }
  };
  const skipMontage = (ext as { skipMontage?: boolean }).skipMontage === true;
  const skipDemontage = (ext as { skipDemontage?: boolean }).skipDemontage === true;

  if (isRequest) {
    // Demande : un seul QR de SUIVI (page publique /suivi/{token}), jamais une
    // URL de contrôle d'accès. Ne permet pas l'entrée sur site.
    const suiviUrl = trackingQrPayload(baseUrl, acc.publicToken ?? "");
    const qrBuf = await QRCode.toBuffer(suiviUrl, { type: "png" });
    const qrImg = await pdfDoc.embedPng(qrBuf);
    const x = width - 50 - QR_SIZE;
    page.drawImage(qrImg, { x, y: QR_Y, width: QR_SIZE, height: QR_SIZE });
    drawRaw(pdfT.qrTracking, x - 18, QR_Y - 14);

    const noteLines = [pdfT.requestNote1, pdfT.requestNote2];
    drawFooterWrapped(noteLines, 52);
    return;
  }

  // Mode officiel : QR Montage / Démontage (URL de contrôle d'accès), libellés
  // explicites + créneau, conditionnés par les éventuels skip.
  const livLabel = ctx.livDate ? ` ${formatDateTime(ctx.livDate, lang)}` : "";
  const repLabel = ctx.repDate ? ` ${formatDateTime(ctx.repDate, lang)}` : "";
  const qrDefs: { label: string; url: string }[] = [];
  if (!skipMontage) {
    qrDefs.push({
      label: `${pdfT.qrSetup}${livLabel}`,
      url: accessQrPayload(baseUrl, acc.id, "livraison"),
    });
  }
  if (!skipDemontage) {
    qrDefs.push({
      label: `${pdfT.qrTeardown}${repLabel}`,
      url: accessQrPayload(baseUrl, acc.id, "reprise"),
    });
  }
  if (qrDefs.length === 0) {
    qrDefs.push({ label: pdfT.qrVehicle, url: accessQrPayload(baseUrl, acc.id) });
  }

  let qrX = width - 50 - QR_SIZE;
  for (const def of qrDefs) {
    const buf = await QRCode.toBuffer(def.url, { type: "png" });
    const img = await pdfDoc.embedPng(buf);
    page.drawImage(img, { x: qrX, y: QR_Y, width: QR_SIZE, height: QR_SIZE });
    drawRaw(def.label, qrX, QR_Y - 14, 8);
    qrX -= QR_SIZE + 24;
  }

  const noteLines = [pdfT.officialNote1, pdfT.officialNote2];
  drawFooterWrapped(noteLines, 52);
}

export async function generatePdfFromIds(
  ids: string[],
  baseUrl: string,
  opts: { mode?: "request" | "official"; lang?: LangCode } = {}
): Promise<Uint8Array> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("Aucun identifiant fourni");
  }

  const rows = await prisma.accreditation.findMany({
    where: { id: { in: uniqueIds } },
    include: {
      vehicles: true,
      organization: { select: { slug: true, id: true } },
      eventRef: { select: { name: true } },
    },
  });

  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = uniqueIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (ordered.length === 0) {
    throw new Error("Accréditations introuvables");
  }

  const orgId = ordered[0].organization?.id ?? null;
  const orgSlug = ordered[0].organization?.slug ?? null;
  const vehicleTypes = await loadVehicleTypes(orgId, orgSlug);

  // Zones de l'organisation (label + adresse + GPS) pour l'affichage PDF.
  const zoneRows = orgId
    ? await prisma.zoneConfig.findMany({
        where: { organizationId: orgId },
        select: { zone: true, label: true, address: true, latitude: true, longitude: true },
      })
    : [];
  const zoneByCode = new Map(zoneRows.map((z) => [z.zone, z]));

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const MIN_Y = 200; // FOOTER_RESERVE : zone QR + notes légales

  const drawText = (
    targetPage: unknown,
    text: string,
    x: number,
    yPos: number,
    size = 12,
    options: { color?: [number, number, number] } = {}
  ) => {
    if (yPos < MIN_Y) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (targetPage as any).drawText(text, {
      x,
      y: yPos,
      size,
      font,
      color: options.color ? rgb(...options.color) : rgb(0, 0, 0),
    });
  };

  const drawWrapped = (
    targetPage: unknown,
    text: string,
    x: number,
    yPos: number,
    maxWidth: number,
    size = 12,
    options: { color?: [number, number, number] } = {}
  ): number => {
    const words = text.split(" ");
    let line = "";
    const lineHeight = size + 4;
    let currentY = yPos;

    for (let i = 0; i < words.length; i += 1) {
      const w = words[i];
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth) {
        if (line) {
          drawText(targetPage, line, x, currentY, size, options);
          currentY -= lineHeight;
        }
        line = w;
      } else {
        line = test;
      }
    }
    if (line) {
      drawText(targetPage, line, x, currentY, size, options);
      currentY -= lineHeight;
    }
    return currentY;
  };

  const samplePage = pdfDoc.addPage();
  const { width, height } = samplePage.getSize();
  pdfDoc.removePage(pdfDoc.getPageCount() - 1);

  const helpers: DrawHelpers = {
    font,
    width,
    height,
    MIN_Y,
    drawText,
    drawWrapped,
  };

  for (const acc of ordered) {
    const isRx =
      acc.organization?.slug === "rx" ||
      Boolean(parseExtension(acc.extension).exhibitor);
    // Mode : explicite si fourni, sinon déduit du statut. Garde-fou §3.4b
    // appliqué dans resolvePdfMode (jamais 'official' pour un statut non
    // opérationnel, même si demandé explicitement).
    const mode = resolvePdfMode(acc.status, opts.mode);
    const zone = acc.currentZone ? zoneByCode.get(acc.currentZone) ?? null : null;
    const accForRender = {
      ...acc,
      eventName: acc.eventRef?.name ?? acc.event,
      zone,
    };
    const rawLang = acc.language ?? "fr";
    const accLang: LangCode = isValidLang(rawLang) ? rawLang : "fr";
    const pdfLang: LangCode =
      opts.lang && isValidLang(opts.lang) ? opts.lang : accLang;
    const pdfT = getPdfTranslations(pdfLang);

    await renderAccreditationPage(
      pdfDoc,
      helpers,
      accForRender,
      vehicleTypes,
      isRx,
      baseUrl,
      mode,
      pdfT,
      pdfLang
    );
  }

  return pdfDoc.save();
}

/**
 * SOURCE UNIQUE du PDF d'accréditation (cf. correctif QR/e-mail).
 *
 * Toutes les surfaces — téléchargement (route /api/accreditation/pdf),
 * e-mail de création, e-mail de validation, renvoi e-mail — DOIVENT passer par
 * cette fonction. Le `baseUrl` est résolu de façon déterministe via
 * `getBaseUrl()` (jamais le header `host`), garantissant que pour un même
 * `id` + `mode` + `lang`, le PDF téléchargé et le PDF joint à l'e-mail sont
 * BYTE-IDENTIQUES (même QR, même payload). Le QR émis est toujours reconnu par
 * le scanner agent (cf. tests round-trip `qr-payloads`).
 */
export async function generateAccreditationPdfBuffer(opts: {
  /** Identifiant(s) d'accréditation. Accepte un id unique ou une liste. */
  id?: string;
  ids?: string[];
  mode?: "request" | "official";
  lang?: LangCode;
  /** Surcharge optionnelle du baseUrl (défaut : getBaseUrl(), recommandé). */
  baseUrl?: string;
}): Promise<Buffer> {
  const ids = opts.ids ?? (opts.id ? [opts.id] : []);
  const bytes = await generatePdfFromIds(ids, opts.baseUrl ?? getBaseUrl(), {
    ...(opts.mode ? { mode: opts.mode } : {}),
    ...(opts.lang ? { lang: opts.lang } : {}),
  });
  return Buffer.from(bytes);
}
