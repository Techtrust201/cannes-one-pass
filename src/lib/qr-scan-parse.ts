/**
 * Parser PUR des payloads de QR code du module de scan (testable sans Prisma).
 *
 * Formats reconnus (ordre de résolution) :
 *  1. JSON `{ id, vehicleId?, phase? }` — nouveau format véhicule physique ;
 *  2. JSON `{ id }` / `{ token }` — legacy ;
 *  3. URL `/logisticien/{id}?phase=&vehicleId=` ;
 *  4. URL `/suivi/{token}` ;
 *  5. UUID brut / jeton court.
 */

export interface QrLookupRef {
  /** Identifiant d'accréditation (résolution directe). */
  id?: string;
  /** Jeton public / référence de demande (résolution via publicToken). */
  token?: string;
  /** Véhicule physique ciblé (optionnel, validé côté serveur). */
  vehicleId?: number;
  /** Phase logistique (livraison = montage, reprise = démontage). */
  phase?: "livraison" | "reprise";
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

function parsePhase(raw: unknown): "livraison" | "reprise" | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "livraison" || v === "montage") return "livraison";
  if (v === "reprise" || v === "demontage" || v === "démontage") return "reprise";
  return undefined;
}

function parseVehicleId(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (Number.isInteger(n) && n > 0) return n;
  }
  return undefined;
}

/**
 * Analyse le texte décodé d'un QR et renvoie une référence de lookup,
 * ou `null` si rien d'exploitable.
 */
export function parseQrPayload(decoded: string | null | undefined): QrLookupRef | null {
  const text = (decoded ?? "").trim();
  if (!text) return null;

  // 1. Payload JSON
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object") {
      const record = obj as Record<string, unknown>;
      const id = record.id;
      const vehicleId = parseVehicleId(record.vehicleId);
      const phase = parsePhase(record.phase);
      if (typeof id === "string" && id.trim()) {
        return {
          id: id.trim(),
          ...(vehicleId != null ? { vehicleId } : {}),
          ...(phase ? { phase } : {}),
        };
      }
      const tok = record.token ?? record.publicToken ?? record.reference;
      if (typeof tok === "string" && tok.trim()) return { token: tok.trim() };
    }
  } catch {
    /* pas du JSON */
  }

  // 2a. /suivi/{token}
  const suivi = text.match(/\/suivi\/([^/?#]+)/);
  if (suivi?.[1]) return { token: cleanSegment(suivi[1]) };

  // 2b. /logisticien/{id}?phase=&vehicleId=
  const logi = text.match(/\/logisticien\/([^/?#]+)/);
  if (logi?.[1] && logi[1] !== "scanner") {
    const ref: QrLookupRef = { id: cleanSegment(logi[1]) };
    try {
      const u = text.includes("://")
        ? new URL(text)
        : new URL(text, "https://local.invalid");
      const phase = parsePhase(u.searchParams.get("phase"));
      const vehicleId = parseVehicleId(u.searchParams.get("vehicleId"));
      if (phase) ref.phase = phase;
      if (vehicleId != null) ref.vehicleId = vehicleId;
    } catch {
      /* ignore */
    }
    return ref;
  }

  // 2c. Query string
  try {
    const u = new URL(text);
    const qid = u.searchParams.get("id");
    if (qid && qid.trim()) {
      const ref: QrLookupRef = { id: qid.trim() };
      const phase = parsePhase(u.searchParams.get("phase"));
      const vehicleId = parseVehicleId(u.searchParams.get("vehicleId"));
      if (phase) ref.phase = phase;
      if (vehicleId != null) ref.vehicleId = vehicleId;
      return ref;
    }
    const qtok =
      u.searchParams.get("token") ??
      u.searchParams.get("ref") ??
      u.searchParams.get("reference");
    if (qtok && qtok.trim()) return { token: qtok.trim() };
  } catch {
    /* continue */
  }

  if (UUID_RE.test(text)) return { id: text };
  if (!/[\s/]/.test(text) && text.length <= 64) return { token: text };

  return null;
}
