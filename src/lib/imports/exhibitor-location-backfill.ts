/**
 * Planification pure du backfill legacy `Exhibitor` -> `ExhibitorLocation`
 * (Phase 1B). Ce module ne touche jamais Prisma/la base : il calcule
 * uniquement les operations a effectuer a partir de donnees deja chargees
 * par l'appelant (script `scripts/backfill-exhibitor-locations.ts`).
 *
 * Objectif generique : le mapping fonctionne pour toute organisation
 * (Palais, RX, autres). Le parsing `Exhibitor.sector` via `parseLegacySector`
 * est un enrichissement applique lorsque le format legacy est reconnu ; en cas
 * de doute, les champs incertains restent `null` (compteur `ambiguousSector`).
 */

import { parseLegacySector } from "@/lib/imports/legacy-sector";
import {
  normalizeExhibitorName,
  normalizeLocationCode,
} from "@/lib/imports/normalization";

export interface BackfillExhibitorRow {
  id: string;
  name: string;
  nameNormalized: string | null;
  stand: string | null;
  sector: string | null;
}

export interface StandLocationCandidate {
  code: string;
  codeNormalized: string;
  sectorCode: string | null;
  portCode: string | null;
  logisticSpace: string | null;
  /** true si le secteur legacy est present mais ambigu ou non decoupable. */
  ambiguousSector: boolean;
  /** Motif de diagnostic (ex. PORT_SECTOR_CONFLICT). */
  warningReason?: string | null;
}

/**
 * Decide si `Exhibitor.nameNormalized` doit etre renseigne.
 * N'ecrase jamais une valeur deja presente (presumee correcte), meme si
 * elle differe de la valeur recalculee.
 */
export function planNameNormalization(exhibitor: BackfillExhibitorRow): string | null {
  if (exhibitor.nameNormalized && exhibitor.nameNormalized.trim()) return null;
  return normalizeExhibitorName(exhibitor.name);
}

/**
 * Construit le candidat ExhibitorLocation (type STAND) depuis les champs
 * legacy d'un Exhibitor. Retourne `null` si `stand` n'est pas exploitable.
 * `sectorCode`/`portCode`/`logisticSpace` proviennent de `parseLegacySector`
 * : on ne copie jamais la chaine combinee legacy dans `sectorCode`.
 */
export function planStandLocation(exhibitor: BackfillExhibitorRow): StandLocationCandidate | null {
  const normalized = normalizeLocationCode(exhibitor.stand);
  if (!normalized) return null;

  const parsed = parseLegacySector(exhibitor.sector);

  return {
    code: normalized.code,
    codeNormalized: normalized.codeNormalized,
    sectorCode: parsed.sectorCode,
    portCode: parsed.portCode,
    logisticSpace: parsed.logisticSpace,
    ambiguousSector: parsed.ambiguous,
    warningReason: parsed.warningReason ?? null,
  };
}

export interface NameNormalizationOp {
  exhibitorId: string;
  nameNormalized: string;
}

export interface LocationCreationOp {
  exhibitorId: string;
  code: string;
  codeNormalized: string;
  sectorCode: string | null;
  portCode: string | null;
  logisticSpace: string | null;
}

export interface BackfillBatchCounters {
  analyzed: number;
  nameNormalizedToSet: number;
  locationsToCreate: number;
  locationsAlreadyPresent: number;
  skipped: number;
  errors: number;
  ambiguousSector: number;
  /** Deux libelles `code` distincts normalisent vers la meme cle (meme exposant). */
  codeNormalizedCollisions: number;
}

export interface BackfillBatchPlan {
  nameOps: NameNormalizationOp[];
  locationOps: LocationCreationOp[];
  counters: BackfillBatchCounters;
}

export function emptyCounters(): BackfillBatchCounters {
  return {
    analyzed: 0,
    nameNormalizedToSet: 0,
    locationsToCreate: 0,
    locationsAlreadyPresent: 0,
    skipped: 0,
    errors: 0,
    ambiguousSector: 0,
    codeNormalizedCollisions: 0,
  };
}

export function mergeCounters(
  a: BackfillBatchCounters,
  b: BackfillBatchCounters
): BackfillBatchCounters {
  return {
    analyzed: a.analyzed + b.analyzed,
    nameNormalizedToSet: a.nameNormalizedToSet + b.nameNormalizedToSet,
    locationsToCreate: a.locationsToCreate + b.locationsToCreate,
    locationsAlreadyPresent: a.locationsAlreadyPresent + b.locationsAlreadyPresent,
    skipped: a.skipped + b.skipped,
    errors: a.errors + b.errors,
    ambiguousSector: a.ambiguousSector + b.ambiguousSector,
    codeNormalizedCollisions: a.codeNormalizedCollisions + b.codeNormalizedCollisions,
  };
}

/**
 * Cle d'idempotence d'une ExhibitorLocation STAND : `exhibitorId` + type
 * `STAND` + `codeNormalized`. Doit correspondre exactement a la contrainte
 * unique Prisma `@@unique([exhibitorId, type, codeNormalized])`.
 */
export function standLocationKey(exhibitorId: string, codeNormalized: string): string {
  return `${exhibitorId}::STAND::${codeNormalized}`;
}

/**
 * Planifie le backfill d'un lot d'exposants (pure, sans acces DB).
 * `existingStandKeys` doit contenir les cles `standLocationKey(...)` des
 * ExhibitorLocation de type STAND deja presentes en base pour ce lot
 * (calculees par l'appelant via une requete groupee) — elles ne sont
 * jamais recreees ni ecrasees.
 */
export function planExhibitorBackfillBatch(
  exhibitors: readonly BackfillExhibitorRow[],
  existingStandKeys: ReadonlySet<string>
): BackfillBatchPlan {
  const counters = emptyCounters();
  const nameOps: NameNormalizationOp[] = [];
  const locationOps: LocationCreationOp[] = [];
  /** Cle standLocationKey -> libelle `code` deja planifie dans ce lot. */
  const plannedCodesByKey = new Map<string, string>();

  for (const exhibitor of exhibitors) {
    counters.analyzed++;
    try {
      const nameToSet = planNameNormalization(exhibitor);
      if (nameToSet) {
        nameOps.push({ exhibitorId: exhibitor.id, nameNormalized: nameToSet });
        counters.nameNormalizedToSet++;
      }

      if (!exhibitor.stand || !exhibitor.stand.trim()) {
        counters.skipped++;
        continue;
      }

      const candidate = planStandLocation(exhibitor);
      if (!candidate) {
        counters.skipped++;
        continue;
      }
      if (candidate.ambiguousSector) counters.ambiguousSector++;

      const key = standLocationKey(exhibitor.id, candidate.codeNormalized);
      if (existingStandKeys.has(key)) {
        counters.locationsAlreadyPresent++;
        continue;
      }

      const previousCode = plannedCodesByKey.get(key);
      if (previousCode !== undefined && previousCode !== candidate.code) {
        counters.codeNormalizedCollisions++;
        counters.skipped++;
        continue;
      }

      if (previousCode === undefined) {
        plannedCodesByKey.set(key, candidate.code);
        locationOps.push({
          exhibitorId: exhibitor.id,
          code: candidate.code,
          codeNormalized: candidate.codeNormalized,
          sectorCode: candidate.sectorCode,
          portCode: candidate.portCode,
          logisticSpace: candidate.logisticSpace,
        });
        counters.locationsToCreate++;
      }
    } catch {
      counters.errors++;
    }
  }

  return { nameOps, locationOps, counters };
}
