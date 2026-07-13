/**
 * Cycle de vie d'un `ImportBatch` (Centre d'import generalise, Phase 3).
 *
 * Regle de tracabilite (cf. plan) :
 *  1. le dry-run n'ecrit RIEN (analyse en memoire) ;
 *  2. au commit, on cree l'`ImportBatch` en `PROCESSING` HORS de la transaction
 *     metier, afin qu'il SURVIVE a un rollback des donnees importees ;
 *  3. on execute la transaction des donnees ;
 *  4. succes -> `COMPLETED` avec compteurs ;
 *  5. echec -> `FAILED` avec resume d'erreur (les donnees ont ete rollbackees,
 *     mais la trace de l'echec reste).
 *
 * Ce module ne fait qu'orchestrer les ecritures `ImportBatch` ; il ne connait
 * pas le detail des profils. La `db` est typee structurellement pour rester
 * testable sans vraie connexion Prisma (aucune ecriture Neon en Phase 3).
 */

import { createHash } from "node:crypto";
import type { ImportProfile } from "@prisma/client";

export interface ImportBatchCounters {
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  errorCount: number;
}

export const EMPTY_COUNTERS: ImportBatchCounters = {
  created: 0,
  updated: 0,
  unchanged: 0,
  deactivated: 0,
  errorCount: 0,
};

/** Delegate `importBatch` minimal (satisfait par PrismaClient et les mocks). */
export interface ImportBatchDelegateLike {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  findFirst(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
    select?: Record<string, unknown>;
  }): Promise<{ id: string } | null>;
}

export interface ImportBatchDb {
  importBatch: ImportBatchDelegateLike;
}

export interface StartImportBatchParams {
  organizationId: string;
  eventId?: string | null;
  userId?: string | null;
  sourceProfile: ImportProfile;
  fileName: string;
  fileHashSha256: string;
}

/** Empreinte SHA-256 hex d'un contenu (identifie un reimport du meme fichier). */
export function computeFileHashSha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Cree l'`ImportBatch` en `PROCESSING` (hors transaction metier). */
export async function startImportBatch(
  db: ImportBatchDb,
  params: StartImportBatchParams
): Promise<{ id: string }> {
  return db.importBatch.create({
    data: {
      organizationId: params.organizationId,
      eventId: params.eventId ?? null,
      userId: params.userId ?? null,
      sourceProfile: params.sourceProfile,
      fileName: params.fileName,
      fileHashSha256: params.fileHashSha256,
      status: "PROCESSING",
    },
  });
}

/** Marque un lot `COMPLETED` avec compteurs + resume optionnel. */
export async function completeImportBatch(
  db: ImportBatchDb,
  id: string,
  counters: ImportBatchCounters,
  summary?: unknown
): Promise<void> {
  await db.importBatch.update({
    where: { id },
    data: {
      status: "COMPLETED",
      created: counters.created,
      updated: counters.updated,
      unchanged: counters.unchanged,
      deactivated: counters.deactivated,
      errorCount: counters.errorCount,
      summary: summary === undefined ? undefined : (summary as object),
      completedAt: new Date(),
    },
  });
}

/** Marque un lot `FAILED` avec resume d'erreur (trace conservee). */
export async function failImportBatch(
  db: ImportBatchDb,
  id: string,
  options: { errorCount?: number; summary?: unknown } = {}
): Promise<void> {
  await db.importBatch.update({
    where: { id },
    data: {
      status: "FAILED",
      errorCount: options.errorCount ?? 0,
      summary: options.summary === undefined ? undefined : (options.summary as object),
      completedAt: new Date(),
    },
  });
}

/**
 * Recherche le dernier lot `COMPLETED` pour la meme empreinte de fichier
 * (organisation + profil + hash) afin de signaler un reimport identique.
 * Purement informatif : ne bloque pas, ne modifie rien.
 */
export async function findLastCompletedBatchByHash(
  db: ImportBatchDb,
  params: { organizationId: string; sourceProfile: ImportProfile; fileHashSha256: string }
): Promise<{ id: string } | null> {
  return db.importBatch.findFirst({
    where: {
      organizationId: params.organizationId,
      sourceProfile: params.sourceProfile,
      fileHashSha256: params.fileHashSha256,
      status: "COMPLETED",
    },
    orderBy: { completedAt: "desc" },
    select: { id: true },
  });
}
