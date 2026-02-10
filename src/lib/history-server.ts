/**
 * Fonctions d'historique côté serveur uniquement.
 * Importe Prisma directement — NE PAS importer dans les composants client.
 */
import type { PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { HistoryEntryData } from "@/lib/history";

// Type compatible avec PrismaClient ou transaction client
type PrismaLike = Pick<PrismaClient, "accreditationHistory">;

/**
 * Écrit une entrée d'historique directement en DB.
 * Accepte un client Prisma ou un transaction client (tx).
 * Si aucun client n'est fourni, utilise le client global.
 */
export async function writeHistoryDirect(
  data: HistoryEntryData,
  tx?: PrismaLike
) {
  const client = tx ?? prisma;
  return client.accreditationHistory.create({
    data: {
      accreditationId: data.accreditationId,
      action: data.action,
      field: data.field ?? null,
      oldValue: data.oldValue ?? null,
      newValue: data.newValue ?? null,
      description: data.description,
      userId: data.userId ?? null,
      userAgent: data.userAgent ?? null,
    },
  });
}

/**
 * Écrit plusieurs entrées d'historique dans une transaction.
 */
export async function writeHistoryBatch(
  entries: HistoryEntryData[],
  tx?: PrismaLike
) {
  return Promise.all(entries.map((entry) => writeHistoryDirect(entry, tx)));
}
