import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { generateAccreditationPdfBuffer } from "@/lib/accreditation-pdf-ids";
import { buildAccreditationPdfFilename } from "@/lib/accreditation-pdf-filename";
import { isValidLang, type LangCode } from "@/lib/translations";

/**
 * Source UNIQUE de vérité PDF (cf. Lot 5).
 *
 * Cette route ne sait générer qu'à partir d'identifiants d'accréditation, via
 * la source unique `generateAccreditationPdfBuffer`. L'ancien générateur
 * « legacy » basé sur les données du
 * formulaire (company/vehicles inline) a été supprimé : il produisait une
 * structure divergente de celle jointe à l'e-mail. Tous les boutons visibles
 * (espace public, logisticien, fiche, renvoi e-mail) créent l'accréditation
 * AVANT le téléchargement et disposent donc toujours d'un `id`.
 *
 * Le mode (`request` | `official`) est validé côté générateur (garde-fou
 * §3.4b) : `official` n'est produit que pour un statut opérationnel, sinon le
 * document retombe automatiquement en `request`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.filter((v: unknown): v is string => typeof v === "string")
      : typeof body.id === "string"
        ? [body.id]
        : [];

    if (ids.length === 0) {
      return new Response(
        "Identifiant d'accréditation manquant : le PDF ne peut être généré que pour une accréditation enregistrée.",
        { status: 400 }
      );
    }

    const mode =
      body.mode === "official" || body.mode === "request"
        ? (body.mode as "official" | "request")
        : undefined;
    const lang =
      typeof body.lang === "string" && isValidLang(body.lang)
        ? (body.lang as LangCode)
        : undefined;

    // Source unique : baseUrl déterministe (getBaseUrl) côté générateur, afin
    // que le PDF téléchargé soit BYTE-IDENTIQUE au PDF joint à l'e-mail (même
    // QR/payload) pour un même id + mode + lang. On n'utilise plus le header
    // `host`, qui faisait diverger l'hôte encodé dans le QR.
    const pdfBytes = await generateAccreditationPdfBuffer({
      ids,
      ...(mode ? { mode } : {}),
      ...(lang ? { lang } : {}),
    });

    // Nom de fichier parlant : Accreditation_<Stand>_<Plaque>.pdf (Lot 4).
    // Stand depuis la 1re accréditation ; plaque uniquement pour un PDF
    // individuel (un seul id). Le mode « official » force « validé » (préfixe
    // Accreditation) ; sinon « Demande_Accreditation ».
    const meta = await prisma.accreditation.findFirst({
      where: { id: ids[0] },
      select: {
        stand: true,
        status: true,
        vehicles: { select: { plate: true }, take: 1 },
      },
    });
    const validated =
      mode === "official" ||
      (mode !== "request" && (meta?.status ?? "NOUVEAU") !== "NOUVEAU");
    const filename = buildAccreditationPdfFilename({
      stand: meta?.stand,
      plate: ids.length === 1 ? meta?.vehicles?.[0]?.plate : null,
      validated,
    });
    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Failed to generate PDF", { status: 500 });
  }
}
