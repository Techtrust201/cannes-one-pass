/**
 * Helper métier serveur — calcul de capacité RX par créneau.
 *
 * Ce module est pur (pas de dépendance Prisma) : le caller est responsable
 * de récupérer `RxCapacity.capacity` et les statuts des accréditations
 * correspondant au créneau, puis appelle `computeCapacityStats`.
 *
 * @see docs/rx/RX_CAPACITY_CONTRACT.md
 */
import type { VehicleFamily } from "@/lib/vehicle-family";

// ── Clé logique du créneau ────────────────────────────────────────────────────

export type RxPhase = "MONTAGE" | "DEMONTAGE";

/**
 * Clé métier identifiant un créneau de capacité de manière unique.
 * Correspond à la contrainte @@unique du modèle `RxCapacity`.
 */
export interface RxCapacityKey {
  organizationId: string;
  eventId: string;
  /**
   * Scope canonique (ZONE:…, LOCATION:…, SECTOR:…, etc.).
   * Aligné sur `RxCapacity.scopeKey` / LogisticsPlanning.
   */
  scopeKey: string;
  /** Code ZoneConfig (ex : "LA_BOCCA", "PALM_BEACH") — contexte logistique. */
  zone: string;
  /** Format YYYY-MM-DD — cohérent avec Vehicle.date. */
  date: string;
  /** Format HH:MM — cohérent avec Vehicle.time (heure début). */
  startTime: string;
  /** Format HH:MM. */
  endTime: string;
  vehicleFamily: VehicleFamily;
  phase: RxPhase;
}

// ── Statuts ───────────────────────────────────────────────────────────────────

/**
 * Statuts qui consomment une place de capacité.
 * NOUVEAU = pré-réservation provisoire.
 * ATTENTE = réservation confirmée.
 * ENTREE  = occupation réelle de la zone.
 */
export const RX_CONSUMER_STATUSES = ["NOUVEAU", "ATTENTE", "ENTREE"] as const;
export type RxConsumerStatus = (typeof RX_CONSUMER_STATUSES)[number];

/**
 * Statuts qui libèrent une place de capacité.
 * SORTIE = départ de zone.
 * REFUS  = place rendue immédiatement.
 * ABSENT = non présenté.
 */
export const RX_LIBERATOR_STATUSES = ["SORTIE", "REFUS", "ABSENT"] as const;
export type RxLiberatorStatus = (typeof RX_LIBERATOR_STATUSES)[number];

export function isConsumerStatus(status: string): status is RxConsumerStatus {
  return (RX_CONSUMER_STATUSES as readonly string[]).includes(status);
}

export function isLiberatorStatus(status: string): status is RxLiberatorStatus {
  return (RX_LIBERATOR_STATUSES as readonly string[]).includes(status);
}

// ── Résultat du calcul ────────────────────────────────────────────────────────

export interface RxCapacityStats {
  /** Places totales autorisées sur ce créneau (valeur RxCapacity.capacity). */
  capacity: number;
  /** Accréditations en statut NOUVEAU (pré-réservations provisoires). */
  provisionalUsed: number;
  /** Accréditations en statut ATTENTE (réservations confirmées). */
  confirmedUsed: number;
  /** Accréditations en statut ENTREE (véhicules présents en zone). */
  inZoneUsed: number;
  /** NOUVEAU + ATTENTE + ENTREE. */
  totalUsed: number;
  /** capacity - totalUsed (peut être négatif en cas de sur-réservation). */
  remaining: number;
  /** true si remaining <= 0. */
  isFull: boolean;
}

// ── Calcul ────────────────────────────────────────────────────────────────────

/**
 * Calcule les statistiques de capacité à partir des statuts des accréditations
 * déjà filtrées pour ce créneau (même org, event, zone, date, plage horaire,
 * famille véhicule, phase).
 *
 * Les statuts SORTIE, REFUS et ABSENT ne sont pas comptabilisés : ils libèrent
 * la place conformément au contrat métier.
 *
 * @param capacity  Nombre de places autorisées (RxCapacity.capacity).
 * @param statuses  Statuts des accréditations correspondant au créneau.
 */
export function computeCapacityStats(
  capacity: number,
  statuses: string[]
): RxCapacityStats {
  let provisionalUsed = 0;
  let confirmedUsed = 0;
  let inZoneUsed = 0;

  for (const status of statuses) {
    if (status === "NOUVEAU") provisionalUsed++;
    else if (status === "ATTENTE") confirmedUsed++;
    else if (status === "ENTREE") inZoneUsed++;
    // SORTIE / REFUS / ABSENT → libèrent, ne comptent pas.
  }

  const totalUsed = provisionalUsed + confirmedUsed + inZoneUsed;
  const remaining = capacity - totalUsed;

  return {
    capacity,
    provisionalUsed,
    confirmedUsed,
    inZoneUsed,
    totalUsed,
    remaining,
    isFull: remaining <= 0,
  };
}
