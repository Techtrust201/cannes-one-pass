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

/** QR d'une accréditation officielle → URL /logisticien/{id}[?phase=&vehicleId=]. */
export function accessQrPayload(
  baseUrl: string,
  id: string,
  phase?: "livraison" | "reprise",
  vehicleId?: number | null
): string {
  const base = `${stripTrailingSlash(baseUrl)}/logisticien/${id}`;
  const params = new URLSearchParams();
  if (phase) params.set("phase", phase);
  if (vehicleId != null && Number.isFinite(vehicleId)) {
    params.set("vehicleId", String(vehicleId));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** QR « identifiant » compact (JSON) — e-mail / scanner. */
export function idQrPayload(
  id: string,
  opts?: { vehicleId?: number | null; phase?: "livraison" | "reprise" | "MONTAGE" | "DEMONTAGE" }
): string {
  const payload: Record<string, string | number> = { id };
  if (opts?.vehicleId != null && Number.isFinite(opts.vehicleId)) {
    payload.vehicleId = opts.vehicleId;
  }
  if (opts?.phase) {
    const p = opts.phase;
    payload.phase =
      p === "MONTAGE" || p === "livraison"
        ? "livraison"
        : p === "DEMONTAGE" || p === "reprise"
          ? "reprise"
          : p;
  }
  return JSON.stringify(payload);
}
