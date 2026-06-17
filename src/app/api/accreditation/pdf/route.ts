import { NextRequest } from "next/server";
import { generatePdfFromIds } from "@/lib/accreditation-pdf-ids";
import { isValidLang, type LangCode } from "@/lib/translations";

/**
 * Source UNIQUE de vérité PDF (cf. Lot 5).
 *
 * Cette route ne sait générer qu'à partir d'identifiants d'accréditation, via
 * `generatePdfFromIds`. L'ancien générateur « legacy » basé sur les données du
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

    const { getBaseUrl } = await import("@/lib/base-url");
    const host = req.headers.get("host") ?? "";
    const proto = host.includes("localhost")
      ? "http"
      : (req.headers.get("x-forwarded-proto") ?? "https");
    const baseUrl = host ? `${proto}://${host}` : getBaseUrl();

    const mode =
      body.mode === "official" || body.mode === "request"
        ? (body.mode as "official" | "request")
        : undefined;
    const lang =
      typeof body.lang === "string" && isValidLang(body.lang)
        ? (body.lang as LangCode)
        : undefined;

    const pdfBytes = await generatePdfFromIds(ids, baseUrl, {
      ...(mode ? { mode } : {}),
      ...(lang ? { lang } : {}),
    });

    const filename =
      mode === "official" ? "accreditation.pdf" : "demande-accreditation.pdf";
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${filename}`,
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Failed to generate PDF", { status: 500 });
  }
}
