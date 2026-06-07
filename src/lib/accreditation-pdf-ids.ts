import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import prisma from "@/lib/prisma";
import {
  mapDbVehicleType,
  mapDefaultVehicleTypes,
  resolveVehicleTypeLabelFromList,
} from "@/lib/vehicle-type-server";
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import { formatDateFR, formatSlot } from "@/templates/accreditation/rx/config";

interface VehicleContext {
  categoryId?: string | null;
  livDate?: string | null;
  livTime?: string | null;
  repDate?: string | null;
  repTime?: string | null;
  repSameAsDelivery?: boolean;
  repPlate?: string | null;
  repVehicleType?: string | null;
  repPhoneCode?: string | null;
  repPhoneNumber?: string | null;
}

interface RxExtension {
  exhibitor?: { name?: string; stand?: string };
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneCode?: string;
    phoneNumber?: string;
  };
  vehicleContext?: VehicleContext;
  manutentionProvider?: string;
}

function parseExtension(raw: unknown): RxExtension {
  if (!raw || typeof raw !== "object") return {};
  return raw as RxExtension;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDateFR(iso);
  try {
    return new Date(iso).toLocaleString("fr-FR");
  } catch {
    return iso;
  }
}

function formatTimeSlot(time: string | null | undefined): string {
  if (!time) return "—";
  return formatSlot(time);
}

async function loadVehicleTypes(orgId: string | null): Promise<VehicleTypeData[]> {
  if (orgId) {
    const types = await prisma.vehicleTypeConfig.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    if (types.length > 0) return types.map(mapDbVehicleType);
  }
  return mapDefaultVehicleTypes();
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
      vehicleType: string | null;
      trailerPlate: string | null;
    }>;
  },
  vehicleTypes: VehicleTypeData[],
  isRx: boolean,
  baseUrl: string,
  /** 'official' = accréditation d'accès (QR montage/démontage, validité 24h) ;
   *  'request' = demande non validée (QR de suivi, pas d'accès). */
  mode: "request" | "official"
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

  const todayStr = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const isRequest = mode === "request";
  drawText(
    page,
    isRequest ? "Demande d'accréditation Véhicule" : "Accréditation Véhicule",
    50,
    height - 50,
    isRequest ? 18 : 22
  );
  drawText(
    page,
    isRx
      ? "Cannes Yachting Festival — Logistique"
      : "Palais des Festivals et des Congrès de Cannes",
    50,
    height - 75,
    14
  );
  drawText(page, `Date d'émission: ${todayStr}`, 50, height - 95, 10);

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
      "DEMANDE NON VALIDEE — NE PERMET PAS L'ACCES AU SITE",
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

  drawText(page, "Informations Générales", 50, y, 14);
  y -= 25;

  addLabelVal("Exposant / Décorateur", acc.company);
  addLabelVal("Stand", acc.stand);
  addLabelVal("Événement", acc.eventName);
  if (isRequest && acc.publicToken) {
    addLabelVal("Référence de la demande", acc.publicToken);
  }
  if (acc.zone) {
    addLabelVal("Zone de déchargement", acc.zone.label);
    if (acc.zone.address) addLabelVal("Adresse", acc.zone.address);
    addLabelVal(
      "Coordonnées GPS",
      `${acc.zone.latitude.toFixed(5)}, ${acc.zone.longitude.toFixed(5)}`
    );
  }

  if (isRx && ext.contact) {
    const contactName = [ext.contact.firstName, ext.contact.lastName]
      .filter(Boolean)
      .join(" ");
    if (contactName) addLabelVal("Contact", contactName);
    if (ext.contact.email) addLabelVal("E-mail", ext.contact.email);
    if (ext.contact.phoneNumber) {
      addLabelVal(
        "Téléphone contact",
        `${ext.contact.phoneCode ?? ""} ${ext.contact.phoneNumber}`.trim()
      );
    }
  }

  if (acc.unloading) {
    addLabelVal("Manutention", acc.unloading);
  }

  const statusColor: [number, number, number] =
    acc.status === "ENTREE"
      ? [0, 0.55, 0.2]
      : acc.status === "SORTIE"
        ? [0.7, 0, 0]
        : [0, 0, 0.6];
  if (y >= MIN_Y) {
    drawText(page, "Statut :", LABEL_X, y, 12, { color: [0.15, 0.15, 0.15] });
    drawText(page, acc.status || "ATTENTE", VALUE_X, y, 12, { color: statusColor });
    y -= LINE_HEIGHT;
  }

  if (v) {
    y -= 10;
    drawText(page, "Véhicule de livraison", 50, y, 14);
    y -= 25;

    const gabarit = resolveVehicleTypeLabelFromList(
      vehicleTypes,
      v.vehicleType,
      v.size
    );
    addLabelVal("Gabarit", gabarit);
    addLabelVal("Plaque", v.plate || "— (à renseigner à l'arrivée)");
    if (v.trailerPlate) addLabelVal("Plaque remorque", v.trailerPlate);
    addLabelVal(
      "Téléphone conducteur",
      `${v.phoneCode} ${v.phoneNumber}`.trim()
    );
    const livDate = ctx.livDate ?? v.date;
    const livTime = ctx.livTime ?? v.time;
    addLabelVal(
      "Créneau livraison",
      `${formatDateTime(livDate)} — ${formatTimeSlot(livTime)}`
    );

    y -= 10;
    drawText(page, "Véhicule de reprise", 50, y, 14);
    y -= 25;

    const repDate = ctx.repDate;
    const repTime = ctx.repTime;
    if (repDate || repTime) {
      addLabelVal(
        "Créneau reprise",
        `${formatDateTime(repDate ?? undefined)} — ${formatTimeSlot(repTime ?? undefined)}`
      );
    }

    const sameRep = ctx.repSameAsDelivery !== false;
    if (sameRep) {
      addLabelVal("Véhicule de reprise", "Identique au véhicule de livraison");
    } else {
      const repGabarit = resolveVehicleTypeLabelFromList(
        vehicleTypes,
        ctx.repVehicleType,
        null
      );
      addLabelVal("Gabarit reprise", repGabarit);
      addLabelVal("Plaque reprise", ctx.repPlate || "—");
      if (ctx.repPhoneNumber) {
        addLabelVal(
          "Téléphone reprise",
          `${ctx.repPhoneCode ?? ""} ${ctx.repPhoneNumber}`.trim()
        );
      }
    }
  }

  if (acc.message) {
    y -= 10;
    addLabelVal("Message", acc.message);
  }

  y -= 10;
  const consentPrefix = acc.consent ? "[X]" : "[ ]";
  if (y >= MIN_Y) {
    drawText(
      page,
      `${consentPrefix} Je consens à la politique de confidentialité`,
      LABEL_X,
      y,
      11
    );
  }

  // Layout QR : on dispose les QR en bas à droite, AU-DESSUS du footer légal
  // (footer ancré à y≈40) pour éviter tout chevauchement texte/QR.
  const QR_SIZE = 80;
  const QR_Y = 60;
  const skipMontage = (ext as { skipMontage?: boolean }).skipMontage === true;
  const skipDemontage = (ext as { skipDemontage?: boolean }).skipDemontage === true;

  if (isRequest) {
    // Demande : un seul QR de SUIVI (page publique /suivi/{token}), jamais une
    // URL de contrôle d'accès. Ne permet pas l'entrée sur site.
    const suiviUrl = `${baseUrl}/suivi/${acc.publicToken ?? ""}`;
    const qrBuf = await QRCode.toBuffer(suiviUrl, { type: "png" });
    const qrImg = await pdfDoc.embedPng(qrBuf);
    const x = width - 50 - QR_SIZE;
    page.drawImage(qrImg, { x, y: QR_Y, width: QR_SIZE, height: QR_SIZE });
    drawRaw("QR de suivi de demande", x - 18, QR_Y - 12);

    const noteLines = [
      "Ce document peut être transmis au transporteur à titre informatif.",
      "Il ne constitue pas une accréditation d'accès au site.",
    ];
    let noteY = 44;
    for (const line of noteLines) {
      drawRaw(line, LABEL_X, noteY);
      noteY -= 12;
    }
    return;
  }

  // Mode officiel : QR Montage / Démontage (URL de contrôle d'accès), libellés
  // explicites + créneau, conditionnés par les éventuels skip.
  const livLabel = ctx.livDate ? ` ${formatDateTime(ctx.livDate)}` : "";
  const repLabel = ctx.repDate ? ` ${formatDateTime(ctx.repDate)}` : "";
  const qrDefs: { label: string; url: string }[] = [];
  if (!skipMontage) {
    qrDefs.push({
      label: `QR Montage${livLabel}`,
      url: `${baseUrl}/logisticien/${acc.id}?phase=livraison`,
    });
  }
  if (!skipDemontage) {
    qrDefs.push({
      label: `QR Démontage${repLabel}`,
      url: `${baseUrl}/logisticien/${acc.id}?phase=reprise`,
    });
  }
  if (qrDefs.length === 0) {
    qrDefs.push({ label: "QR Véhicule", url: `${baseUrl}/logisticien/${acc.id}` });
  }

  let qrX = width - 50 - QR_SIZE;
  for (const def of qrDefs) {
    const buf = await QRCode.toBuffer(def.url, { type: "png" });
    const img = await pdfDoc.embedPng(buf);
    page.drawImage(img, { x: qrX, y: QR_Y, width: QR_SIZE, height: QR_SIZE });
    drawRaw(def.label, qrX, QR_Y - 12, 8);
    qrX -= QR_SIZE + 24;
  }

  const noteLines = [
    "Cette accréditation est valable pour une durée de 24 heures à compter de l'heure d'entrée validée.",
    "Veuillez présenter ce document (QR code) à l'entrée du site.",
  ];
  let noteY = 44;
  for (const line of noteLines) {
    drawRaw(line, LABEL_X, noteY);
    noteY -= 12;
  }
}

/** Statuts opérationnels autorisant un PDF officiel (cf. plan §3.4b). */
const OFFICIAL_STATUSES = new Set(["ATTENTE", "ENTREE", "SORTIE"]);

export async function generatePdfFromIds(
  ids: string[],
  baseUrl: string,
  opts: { mode?: "request" | "official" } = {}
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
  const vehicleTypes = await loadVehicleTypes(orgId);

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
  const MIN_Y = 100;

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
    // Mode : explicite si fourni, sinon déduit du statut. Garde-fou §3.4b :
    // 'official' (QR d'accès) n'est produit QUE pour un statut opérationnel
    // (ATTENTE/ENTREE/SORTIE). Tout autre statut → 'request', même si
    // 'official' est demandé explicitement.
    const wantsOfficial =
      (opts.mode ?? (OFFICIAL_STATUSES.has(acc.status) ? "official" : "request")) ===
      "official";
    const mode: "request" | "official" =
      wantsOfficial && OFFICIAL_STATUSES.has(acc.status) ? "official" : "request";
    const zone = acc.currentZone ? zoneByCode.get(acc.currentZone) ?? null : null;
    const accForRender = {
      ...acc,
      eventName: acc.eventRef?.name ?? acc.event,
      zone,
    };
    await renderAccreditationPage(
      pdfDoc,
      helpers,
      accForRender,
      vehicleTypes,
      isRx,
      baseUrl,
      mode
    );
  }

  return pdfDoc.save();
}
