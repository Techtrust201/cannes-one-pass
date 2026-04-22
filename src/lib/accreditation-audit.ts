/**
 * Wrapper centralisé pour auditer les écritures sur Accreditation/Vehicle.
 *
 * L'objectif est de garantir que toute modification est tracée dans
 * AccreditationHistory avec sa source, son auteur, et un diff exploitable.
 * Les routes d'écriture devraient idéalement toutes passer par ces helpers.
 */
import type { ActorSource, HistoryAction, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { writeHistoryDirect } from "@/lib/history-server";

// Réexport des fonctions pures (pour éviter de devoir importer Prisma côté tests)
export { computeDiff, inferActorSource } from "./accreditation-audit-pure";

type PrismaLike = PrismaClient;

interface AuditContext {
  /** Source de l'écriture (obligatoire) */
  source: ActorSource;
  /** User connecté (null pour PUBLIC_FORM) */
  userId?: string | null;
  /** Raison libre : "Import CSV Yachting 2026", "Correction manuelle", etc. */
  reason?: string;
  /** User-Agent du client (tracé pour debug) */
  userAgent?: string;
}

/**
 * Écrit une entrée d'audit complète. À appeler systématiquement dans les
 * transactions d'écriture pour garantir la traçabilité.
 */
export async function writeAudit(params: {
  accreditationId: string;
  action: HistoryAction;
  field?: string;
  oldValue?: string;
  newValue?: string;
  description: string;
  context: AuditContext;
  diff?: { before?: unknown; after?: unknown };
  tx?: PrismaLike;
}) {
  return writeHistoryDirect(
    {
      accreditationId: params.accreditationId,
      action: params.action,
      field: params.field,
      oldValue: params.oldValue,
      newValue: params.newValue,
      description: params.description,
      userId: params.context.userId ?? undefined,
      userAgent: params.context.userAgent,
      actorSource: params.context.source,
      changeReason: params.context.reason,
      diff: params.diff,
    },
    params.tx ?? prisma
  );
}

/**
 * Helper : crée le contexte d'audit à partir d'une requête HTTP + source.
 * Extrait le User-Agent automatiquement.
 */
export function makeAuditContext(
  request: Request,
  source: ActorSource,
  userId?: string | null,
  reason?: string
): AuditContext {
  return {
    source,
    userId: userId ?? null,
    reason,
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}

