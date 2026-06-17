/**
 * Parser PUR des payloads de QR code du module de scan (testable sans Prisma).
 *
 * Le scanner agent doit reconnaître TOUS les QR émis par l'application, qu'il
 * s'agisse d'une demande publique non validée ou d'une accréditation officielle
 * validée. Le QR ne confère aucun droit d'accès en soi : il sert uniquement à
 * RETROUVER l'accréditation (par id ou par jeton public) pour ouvrir le
 * workflow agent.
 *
 * Formats reconnus :
 *  - JSON `{ "id": "..." }`               → e-mail de création / legacy ;
 *  - JSON `{ "token"|"publicToken"|"reference": "..." }` ;
 *  - URL/chemin `/logisticien/{id}`       → PDF officiel validé ;
 *  - URL/chemin `/suivi/{token}`          → PDF demande publique non validée ;
 *  - query `?id=` / `?token=` / `?ref=`   → URLs diverses ;
 *  - valeur brute : UUID → id ; sinon jeton court → token (référence).
 */

export interface QrLookupRef {
  /** Identifiant d'accréditation (résolution directe). */
  id?: string;
  /** Jeton public / référence de demande (résolution via publicToken). */
  token?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanSegment(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/**
 * Analyse le texte décodé d'un QR et renvoie une référence de lookup
 * (`{ id }` ou `{ token }`), ou `null` si rien d'exploitable.
 */
export function parseQrPayload(decoded: string | null | undefined): QrLookupRef | null {
  const text = (decoded ?? "").trim();
  if (!text) return null;

  // 1. Payload JSON ({ id } prioritaire, sinon token/publicToken/reference).
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object") {
      const id = (obj as Record<string, unknown>).id;
      if (typeof id === "string" && id.trim()) return { id: id.trim() };
      const tok =
        (obj as Record<string, unknown>).token ??
        (obj as Record<string, unknown>).publicToken ??
        (obj as Record<string, unknown>).reference;
      if (typeof tok === "string" && tok.trim()) return { token: tok.trim() };
    }
  } catch {
    /* pas du JSON : on continue */
  }

  // 2a. Chemin /suivi/{token} (QR demande publique non validée).
  const suivi = text.match(/\/suivi\/([^/?#]+)/);
  if (suivi?.[1]) return { token: cleanSegment(suivi[1]) };

  // 2b. Chemin /logisticien/{id} (QR officiel validé). Exclut /logisticien/scanner.
  const logi = text.match(/\/logisticien\/([^/?#]+)/);
  if (logi?.[1] && logi[1] !== "scanner") return { id: cleanSegment(logi[1]) };

  // 2c. Query string ?id= / ?token= / ?ref= / ?reference=.
  try {
    const u = new URL(text);
    const qid = u.searchParams.get("id");
    if (qid && qid.trim()) return { id: qid.trim() };
    const qtok =
      u.searchParams.get("token") ??
      u.searchParams.get("ref") ??
      u.searchParams.get("reference");
    if (qtok && qtok.trim()) return { token: qtok.trim() };
  } catch {
    /* pas une URL absolue : on continue */
  }

  // 3. Valeur brute : UUID -> id ; jeton court sans séparateur -> token.
  if (UUID_RE.test(text)) return { id: text };
  if (!/[\s/]/.test(text) && text.length <= 64) return { token: text };

  return null;
}
