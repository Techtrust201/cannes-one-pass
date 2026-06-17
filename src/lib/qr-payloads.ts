/**
 * Construction PURE des payloads de QR code (testable sans Prisma).
 *
 * UN SEUL endroit définit le contenu encodé dans les QR codes de l'application,
 * partagé par le générateur PDF et l'e-mail. Couplé au parser `parseQrPayload`,
 * cela garantit (via test round-trip) que TOUT QR émis est reconnu par le
 * scanner agent — qu'il provienne d'un téléchargement ou d'un e-mail.
 *
 * Aucun QR ne confère de droit d'accès : il sert uniquement à retrouver
 * l'accréditation (par id ou jeton public) pour ouvrir le workflow agent.
 */

function stripTrailingSlash(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** QR de suivi d'une DEMANDE publique non validée → URL /suivi/{token}. */
export function trackingQrPayload(baseUrl: string, token: string): string {
  return `${stripTrailingSlash(baseUrl)}/suivi/${token}`;
}

/** QR d'une accréditation officielle → URL /logisticien/{id}[?phase=...]. */
export function accessQrPayload(
  baseUrl: string,
  id: string,
  phase?: "livraison" | "reprise"
): string {
  const base = `${stripTrailingSlash(baseUrl)}/logisticien/${id}`;
  return phase ? `${base}?phase=${phase}` : base;
}

/** QR « identifiant » compact (JSON {id}) — utilisé pour le QR inline e-mail. */
export function idQrPayload(id: string): string {
  return JSON.stringify({ id });
}
