/**
 * Détection partagée de l'erreur 409 CAPACITY_QUOTA_FULL renvoyée par
 * `POST /api/accreditations`, pour affichage d'un message utilisateur propre
 * et cohérent partout où une accréditation est créée (public RX, public
 * Palais/standard, back-office logisticien).
 *
 * Ne remplace pas la gestion des autres erreurs (chaque appelant conserve
 * sa logique existante) : ce module ne fait que détecter et formater le cas
 * quota complet, sans jamais exposer zone/vehicleFamily/phase/remaining/
 * requestedCount ni le message serveur brut.
 *
 * @see src/lib/capacity-quota-guard.ts (CapacityQuotaError, code source)
 * @see src/app/api/accreditations/route.ts (réponse 409)
 */
import { formatVehicleDate } from "@/lib/date-utils";
import type { T } from "@/lib/translations";

export interface CapacityQuotaFullMessages {
  generic: string;
  withSlot: (date: string, startTime: string, endTime: string) => string;
}

/** Repli français, utilisé quand aucune traduction n'est disponible (ex. back-office sans i18n). */
const DEFAULT_MESSAGES: CapacityQuotaFullMessages = {
  generic: "Ce créneau est complet. Merci de sélectionner un autre créneau.",
  withSlot: (date, startTime, endTime) =>
    `Le créneau du ${date} de ${startTime} à ${endTime} est complet. Merci de sélectionner un autre créneau.`,
};

/**
 * Résout les messages "créneau complet" depuis les traductions courantes
 * (`t.capacityQuotaFull` / `t.capacityQuotaFullWithSlot`), avec repli
 * français si la langue courante n'a pas (encore) ces clés.
 */
export function getCapacityQuotaFullMessages(
  t?: Pick<T, "capacityQuotaFull" | "capacityQuotaFullWithSlot">
): CapacityQuotaFullMessages {
  return {
    generic: t?.capacityQuotaFull ?? DEFAULT_MESSAGES.generic,
    withSlot: (date, startTime, endTime) => {
      const template = t?.capacityQuotaFullWithSlot;
      if (!template) return DEFAULT_MESSAGES.withSlot(date, startTime, endTime);
      return template
        .replace("{date}", date)
        .replace("{startTime}", startTime)
        .replace("{endTime}", endTime);
    },
  };
}

interface CapacityQuotaErrorBody {
  code?: unknown;
  details?: {
    date?: unknown;
    startTime?: unknown;
    endTime?: unknown;
  };
}

/**
 * Détecte une erreur 409 CAPACITY_QUOTA_FULL dans un body JSON déjà parsé et
 * retourne un message utilisateur propre. Retourne `null` si le body ne
 * correspond pas à ce code (l'appelant garde alors sa gestion d'erreur
 * habituelle, inchangée).
 */
export function extractCapacityQuotaFullMessage(
  body: unknown,
  messages: CapacityQuotaFullMessages = DEFAULT_MESSAGES
): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as CapacityQuotaErrorBody;
  if (b.code !== "CAPACITY_QUOTA_FULL") return null;

  const d = b.details;
  if (
    d &&
    typeof d.date === "string" && d.date &&
    typeof d.startTime === "string" && d.startTime &&
    typeof d.endTime === "string" && d.endTime
  ) {
    return messages.withSlot(formatVehicleDate(d.date), d.startTime, d.endTime);
  }
  return messages.generic;
}

/**
 * Variante pratique quand seule la `Response` (non encore parsée) est
 * disponible : clone la réponse (ne consomme pas le body pour l'appelant),
 * parse le JSON et délègue à `extractCapacityQuotaFullMessage`.
 */
export async function extractCapacityQuotaFullMessageFromResponse(
  res: Response,
  messages: CapacityQuotaFullMessages = DEFAULT_MESSAGES
): Promise<string | null> {
  try {
    const body = await res.clone().json();
    return extractCapacityQuotaFullMessage(body, messages);
  } catch {
    return null;
  }
}
