import type { PdfT } from "@/lib/pdf-translations";

/**
 * Logique PURE de mode/statut PDF (sans dépendance Prisma) — testable isolément.
 *
 * Deux modes métier clairs :
 *  - `request`  = demande publique NON validée (bandeau « non validée », QR de
 *                 suivi, jamais le libellé « VALIDÉE ») ;
 *  - `official` = accréditation validée (pas de bandeau, statut « VALIDÉE »,
 *                 QR de contrôle d'accès).
 */

/** Statuts opérationnels autorisant un PDF officiel (cf. plan §3.4b). */
export const OFFICIAL_STATUSES = new Set(["ATTENTE", "ENTREE", "SORTIE"]);

/**
 * Résout le mode PDF effectif. Garde-fou §3.4b : un PDF « official » (QR
 * d'accès, mention validée) n'est JAMAIS produit pour un statut non
 * opérationnel, même si « official » est demandé explicitement. Inversement,
 * un statut opérationnel sans mode demandé donne « official ».
 */
export function resolvePdfMode(
  status: string,
  requested?: "request" | "official"
): "request" | "official" {
  const wantsOfficial =
    (requested ?? (OFFICIAL_STATUSES.has(status) ? "official" : "request")) ===
    "official";
  return wantsOfficial && OFFICIAL_STATUSES.has(status) ? "official" : "request";
}

/**
 * Libellé de statut affiché dans le PDF. INVARIANT de sécurité : en mode
 * « request » (demande non validée), on renvoie toujours le libellé « à
 * valider » et JAMAIS un libellé de validation — interdit la contradiction
 * « DEMANDE NON VALIDÉE » + « Statut : VALIDÉE ».
 */
export function resolvePdfStatusLabel(
  pdfT: PdfT,
  status: string,
  mode: "request" | "official"
): string {
  return mode === "request"
    ? pdfT.requestStatusLabel
    : pdfT.statusLabels[status] ?? (status || "ATTENTE");
}
