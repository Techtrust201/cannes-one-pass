/**
 * Garde-fou serveur générique anti-surbooking pour les quotas de capacité.
 *
 * Généralise le blocage quota (RX uniquement à l'origine, voir
 * `POST /api/accreditations`) à toutes les organisations, et le rend
 * atomique via une transaction interactive Prisma + advisory lock
 * PostgreSQL : le recheck de disponibilité se fait DANS la même transaction
 * que le lock et la création, ce qui empêche deux soumissions concurrentes
 * de dépasser la capacité configurée.
 *
 * Ce module ne fait aucun accès DB direct sauf dans `enforceCapacityQuotas`
 * (lock + recheck via `getRxAvailability`). `buildCapacityQuotaCandidates`
 * est une fonction pure : les resolveurs zone/famille sont injectés par
 * l'appelant, qui reste seul responsable de la logique métier (RX ou
 * standard) — ce module ne connaît aucun hardcode RX.
 *
 * @see docs/rx/RX_CAPACITY_CONTRACT.md
 * @see src/lib/rx-capacity-service.ts
 */
import { prisma } from "@/lib/prisma";
import { getRxAvailability } from "@/lib/rx-capacity-service";
import type { RxCapacityKey } from "@/lib/rx-capacity";

/** Client Prisma utilisable en dehors ou dans une transaction interactive. */
type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ── Candidates ──────────────────────────────────────────────────────────────

export interface QuotaCandidate {
  key: RxCapacityKey;
  /** Nombre de véhicules de LA demande consommant ce même quota. */
  requestedCount: number;
}

/** Entrée véhicule minimale, façon payload `POST /api/accreditations`. */
export interface CandidateVehicleInput {
  vehicleType?: string | null;
  date?: string | null;
  /** Créneau de livraison, format attendu "HH:MM-HH:MM". */
  time?: string | null;
  /** Champs de reprise (démontage) — optionnels, RX ou autre organisation. */
  repVehicleType?: string | null;
  repDate?: string | null;
  /** Créneau de reprise, format attendu "HH:MM-HH:MM". */
  repTime?: string | null;
}

export interface BuildCandidatesParams {
  organizationId: string;
  eventId: string;
  vehicles: CandidateVehicleInput[];
  /**
   * Résout la zone effective pour un gabarit donné. Ne doit JAMAIS inventer
   * une zone : retourner `null` si elle n'est pas déterminable proprement
   * (aucune candidate n'est alors construite pour ce véhicule/phase).
   */
  resolveZone: (vehicleTypeCode: string) => string | null;
  /** Résout la famille (LIGHT/HEAVY) pour un gabarit donné. */
  resolveFamily: (vehicleTypeCode: string) => RxCapacityKey["vehicleFamily"];
}

function parseSlot(
  slot: string | null | undefined
): { start: string; end: string } | null {
  if (!slot || !slot.includes("-")) return null;
  const [start, end] = slot.split("-");
  if (!start || !end) return null;
  return { start, end };
}

/**
 * Champs identifiants une candidate de quota, dans un ordre stable. Source
 * UNIQUE de vérité pour toute dérivation de clé (regroupement en mémoire,
 * clé de verrou, agrégation de lot Phase 4B-2) : ne jamais dupliquer cette
 * liste de champs ailleurs.
 */
function candidateKeyParts(key: RxCapacityKey): string[] {
  return [
    key.organizationId,
    key.eventId,
    key.zone,
    key.date,
    key.startTime,
    key.endTime,
    key.vehicleFamily,
    key.phase,
  ];
}

/**
 * Clé logique PUBLIQUE et stable identifiant une candidate de quota (même
 * organisation/événement/zone/date/créneau/famille/phase → même clé).
 * Utilisée pour regrouper des candidates en mémoire (ex: agrégation d'un lot
 * d'import) — DIFFÉRENTE du format de `lockKeyForCandidate` (verrou DB), qui
 * reste inchangé pour ne pas modifier le comportement concurrentiel actuel.
 */
export function quotaCandidateKey(key: RxCapacityKey): string {
  return candidateKeyParts(key).join("::");
}

/**
 * Construit les quota candidates à partir des véhicules d'une demande.
 * Fonction pure (aucun accès DB) : les resolveurs zone/famille sont injectés.
 *
 * - MONTAGE (standard, toutes organisations) : nécessite `vehicleType` +
 *   `date` + `time` (plage `HH:MM-HH:MM`) + une zone résolvable.
 * - DEMONTAGE (optionnel) : nécessite en plus `repDate` + `repTime` (plage).
 *   `repVehicleType` peut être absent (reprise « même véhicule » → repli sur
 *   le gabarit de montage), mais sans `repDate`/`repTime` aucune candidate
 *   démontage n'est construite — comportement silencieux, jamais bloquant.
 *
 * Les candidates de clé logique identique sont regroupées : leur
 * `requestedCount` est sommé, pour qu'une même demande avec 2 véhicules sur
 * le même créneau compte pour 2 (et non 1) face à un `remaining` restant.
 */
export function buildCapacityQuotaCandidates(
  params: BuildCandidatesParams
): QuotaCandidate[] {
  const { organizationId, eventId, vehicles, resolveZone, resolveFamily } =
    params;
  const byKey = new Map<string, QuotaCandidate>();

  const addCandidate = (key: RxCapacityKey) => {
    const k = quotaCandidateKey(key);
    const existing = byKey.get(k);
    if (existing) {
      existing.requestedCount += 1;
    } else {
      byKey.set(k, { key, requestedCount: 1 });
    }
  };

  for (const v of vehicles) {
    // ── MONTAGE : standard, toutes organisations ────────────────────────
    const montageVt = (v.vehicleType ?? "").trim();
    const montageSlot = parseSlot(v.time);
    if (montageVt && v.date && montageSlot) {
      const zone = resolveZone(montageVt);
      if (zone) {
        addCandidate({
          organizationId,
          eventId,
          zone,
          date: v.date,
          startTime: montageSlot.start,
          endTime: montageSlot.end,
          vehicleFamily: resolveFamily(montageVt),
          phase: "MONTAGE",
        });
      }
    }

    // ── DEMONTAGE : optionnel, seulement si champs de reprise présents ──
    const repVt = ((v.repVehicleType ?? "").trim() || montageVt).trim();
    const repSlot = parseSlot(v.repTime);
    if (repVt && v.repDate && repSlot) {
      const zone = resolveZone(repVt);
      if (zone) {
        addCandidate({
          organizationId,
          eventId,
          zone,
          date: v.repDate,
          startTime: repSlot.start,
          endTime: repSlot.end,
          vehicleFamily: resolveFamily(repVt),
          phase: "DEMONTAGE",
        });
      }
    }
  }

  return Array.from(byKey.values());
}

// ── Lock key ──────────────────────────────────────────────────────────────

/**
 * Clé de lock stable et déterministe pour une candidate donnée. Dérivée des
 * MÊMES champs que `quotaCandidateKey` (`candidateKeyParts`), avec un
 * prefixe et un séparateur `:` distincts — format PRÉSERVÉ à l'identique de
 * l'implémentation historique pour ne jamais changer le comportement
 * concurrentiel actuel (advisory locks déjà en production).
 */
export function lockKeyForCandidate(key: RxCapacityKey): string {
  return `capacity-quota:${candidateKeyParts(key).join(":")}`;
}

// ── Erreur contrôlée ────────────────────────────────────────────────────────

export interface CapacityQuotaErrorDetails {
  phase: RxCapacityKey["phase"];
  zone: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: RxCapacityKey["vehicleFamily"];
  remaining: number;
  requestedCount: number;
}

/** Erreur contrôlée levée quand un quota configuré est insuffisant. */
export class CapacityQuotaError extends Error {
  readonly code = "CAPACITY_QUOTA_FULL" as const;
  readonly details: CapacityQuotaErrorDetails;

  constructor(details: CapacityQuotaErrorDetails) {
    super(
      `Créneau complet : ${details.zone} le ${details.date} de ${details.startTime} à ${details.endTime} (${details.vehicleFamily})`
    );
    this.name = "CapacityQuotaError";
    this.details = details;
  }
}

// ── Enforcement transactionnel ──────────────────────────────────────────────

/**
 * Verrouille (advisory lock PostgreSQL) puis recheck chaque quota candidate,
 * DANS la même transaction interactive `tx` que la création qui suivra.
 *
 * - Les lock keys sont triées avant prise de lock (ordre déterministe,
 *   anti-deadlock : deux requêtes concurrentes touchant les mêmes clés les
 *   prennent toujours dans le même ordre).
 * - Le hash utilisé est `hashtextextended(key, 0)` (64-bit) plutôt que
 *   `hashtext(key)::bigint` (32-bit, plus de collisions) — requête toujours
 *   paramétrée via `$executeRaw`, jamais de concaténation SQL.
 * - Le recheck (`getRxAvailability(key, tx)`) se fait après le lock, dans la
 *   transaction : une deuxième requête concurrente sur la même clé attend le
 *   lock puis reçoit une disponibilité déjà à jour.
 * - `hasQuota=false` (aucun quota configuré) n'est jamais bloquant.
 * - Condition de blocage : `remaining < requestedCount` (pas seulement
 *   `isFull`) — si 1 place reste et que la demande contient 2 véhicules sur
 *   ce créneau, elle doit être bloquée même sans concurrence externe.
 */
export async function enforceCapacityQuotas(
  tx: PrismaTx,
  candidates: QuotaCandidate[]
): Promise<void> {
  const sorted = [...candidates].sort((a, b) =>
    lockKeyForCandidate(a.key).localeCompare(lockKeyForCandidate(b.key))
  );

  for (const candidate of sorted) {
    const lockKey = lockKeyForCandidate(candidate.key);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const avail = await getRxAvailability(candidate.key, tx);
    if (avail.hasQuota && avail.remaining < candidate.requestedCount) {
      throw new CapacityQuotaError({
        phase: candidate.key.phase,
        zone: candidate.key.zone,
        date: candidate.key.date,
        startTime: candidate.key.startTime,
        endTime: candidate.key.endTime,
        vehicleFamily: candidate.key.vehicleFamily,
        remaining: avail.remaining,
        requestedCount: candidate.requestedCount,
      });
    }
  }
}
