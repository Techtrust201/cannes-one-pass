/**
 * Commit transactionnel d'un lot d'accreditations (Phase 4B-3).
 *
 * Reutilise EXACTEMENT le moteur unique (`createAccreditationInTransaction`)
 * deja partage par le formulaire public, le back-office et la duplication —
 * AUCUNE creation Prisma ad-hoc ici. Ce module ne fait jamais confiance a un
 * preview renvoye par le client : il recoit uniquement des `InternalAccreditationLinePlan`
 * recalcules cote serveur par `previewAccreditationsBatch` (meme requete).
 *
 * Architecture (cf. plan) :
 *  1. `startImportBatch` en PROCESSING, HORS transaction (survit a un rollback) ;
 *  2. UNE seule `db.$transaction` : boucle sur toutes les lignes, une creation
 *     par ligne via `createAccreditationInTransaction` (memes quotas, meme
 *     historique, memes tokens, memes snapshots que toute autre creation) ;
 *  3. une seule ligne en echec -> rollback complet (aucune accreditation
 *     partielle) -> `failImportBatch` ;
 *  4. succes DB -> e-mails envoyes APRES commit, HORS transaction, tous
 *     tentes (un echec d'e-mail ne remet jamais en cause la creation DB deja
 *     committee, jamais de faux 500) -> `completeImportBatch`.
 *
 * Les quotas ne sont PAS reverifies ici explicitement : `createAccreditationInTransaction`
 * appelle deja `enforceCapacityQuotas` (advisory lock + recheck REEL dans la
 * transaction) pour chaque ligne qui porte des `quotaCandidates` — le preview
 * est purement informatif, cette transaction fait foi. Si la disponibilite a
 * change depuis le preview, `CapacityQuotaError` remonte et fait rollbacker
 * tout le lot (aucune creation partielle, aucun e-mail).
 */

import type { CreationEmailOutcome } from "@/lib/accreditation-creation-email";
import { sendAccreditationCreationEmail } from "@/lib/accreditation-creation-email";
import {
  createAccreditationInTransaction,
  CapacityQuotaError,
  RxServerValidationError,
  type AccreditationDb,
} from "@/lib/accreditation-service";
import {
  EMPTY_COUNTERS,
  startImportBatch,
  completeImportBatch,
  failImportBatch,
  type ImportBatchCounters,
  type ImportBatchDb,
} from "./import-batch";
import type { InternalAccreditationLinePlan } from "./accreditations-preview";

export interface AccreditationsCommitLineResult {
  line: number;
  accreditationId: string;
}

export interface AccreditationsCommitEmailResult {
  line: number;
  accreditationId: string;
  recipient: string;
  outcome: CreationEmailOutcome;
}

/** Client structurel : delegate `importBatch` + `$transaction` typee sur `AccreditationDb`. */
export interface AccreditationsCommitDb extends ImportBatchDb {
  $transaction<T>(fn: (tx: AccreditationDb) => Promise<T>): Promise<T>;
}

export interface AccreditationsCommitContext {
  organizationId: string;
  eventId: string;
  userId: string;
  fileName: string;
  fileHashSha256: string;
  importMode: "PENDING" | "VALIDATED";
}

export interface AccreditationsCommitSuccess {
  ok: true;
  batchId: string;
  created: AccreditationsCommitLineResult[];
  counters: ImportBatchCounters;
  emailResults: AccreditationsCommitEmailResult[];
}

export interface AccreditationsCommitFailure {
  ok: false;
  batchId: string;
  status: 400 | 409 | 503 | 500;
  code?: string;
  error: string;
  details?: unknown;
}

export type AccreditationsCommitOutcome =
  | AccreditationsCommitSuccess
  | AccreditationsCommitFailure;

/**
 * Ecritures DANS la transaction fournie : une creation par ligne valide, via
 * le moteur unique. Aucune transaction imbriquee, aucun `createAccreditation`
 * (qui ouvrirait sa PROPRE transaction et enverrait un e-mail par ligne).
 * Toute exception se propage et fait rollbacker l'integralite du lot.
 */
export async function applyAccreditationsCommitInTransaction(
  tx: AccreditationDb,
  linePlans: InternalAccreditationLinePlan[]
): Promise<{ created: AccreditationsCommitLineResult[]; counters: ImportBatchCounters }> {
  const created: AccreditationsCommitLineResult[] = [];
  for (const plan of linePlans) {
    if (!plan.preview.ok) {
      // Garde defensive : le caller (route) ne doit transmettre QUE des plans
      // valides (deja filtres par `previewAccreditationsBatch.public.ok`).
      throw new Error(
        `Ligne ${plan.line} invalide transmise au commit (incoherence interne, aucune donnee ecrite pour cette ligne).`
      );
    }
    const result = await createAccreditationInTransaction(tx, plan.preview, plan.context);
    if (result.kind === "split") {
      for (const c of result.created) created.push({ line: plan.line, accreditationId: c.id });
    } else {
      created.push({ line: plan.line, accreditationId: result.accreditation.id });
    }
  }
  return { created, counters: { ...EMPTY_COUNTERS, created: created.length } };
}

/**
 * Orchestration complete d'un commit de lot : ImportBatch (PROCESSING hors
 * tx) -> transaction unique -> COMPLETED/FAILED -> e-mails post-commit.
 *
 * `linePlans` DOIT deja avoir ete filtre par l'appelant pour ne contenir QUE
 * des lignes dont `preview.ok === true` (cf. `previewAccreditationsBatch`) ;
 * une garde defensive refuse tout plan invalide sans creer d'ImportBatch
 * COMPLETED partiel.
 */
export async function commitAccreditationsBatch(
  db: AccreditationsCommitDb,
  linePlans: InternalAccreditationLinePlan[],
  ctx: AccreditationsCommitContext
): Promise<AccreditationsCommitOutcome> {
  const batch = await startImportBatch(db, {
    organizationId: ctx.organizationId,
    eventId: ctx.eventId,
    userId: ctx.userId,
    sourceProfile: "ACCREDITATIONS",
    fileName: ctx.fileName,
    fileHashSha256: ctx.fileHashSha256,
  });

  const invalidLine = linePlans.find((p) => !p.preview.ok);
  if (invalidLine) {
    await failImportBatch(db, batch.id, {
      errorCount: 1,
      summary: { reason: `Ligne ${invalidLine.line} invalide transmise au commit (incoherence interne).` },
    });
    return {
      ok: false,
      batchId: batch.id,
      status: 500,
      error: "Plan de ligne invalide transmis au commit (incoherence interne, aucune donnee ecrite).",
    };
  }

  let txResult: { created: AccreditationsCommitLineResult[]; counters: ImportBatchCounters };
  try {
    txResult = await db.$transaction((tx) => applyAccreditationsCommitInTransaction(tx, linePlans));
  } catch (err) {
    if (err instanceof CapacityQuotaError) {
      await failImportBatch(db, batch.id, {
        errorCount: linePlans.length,
        summary: { code: err.code, reason: err.message, details: err.details },
      });
      return {
        ok: false,
        batchId: batch.id,
        status: 409,
        code: err.code,
        error: err.message,
        details: err.details,
      };
    }
    // Phase 6C-B-4 — revalidation référentiel/planning RX échouée AU COMMIT
    // (drift depuis le preview : ex. emplacement désactivé, planning modifié
    // entre-temps). Rollback complet déjà garanti (exception propagée hors de
    // `$transaction`) ; code/statut structuré préservé (jamais un 500 générique
    // pour une incohérence métier connue).
    if (err instanceof RxServerValidationError) {
      await failImportBatch(db, batch.id, {
        errorCount: linePlans.length,
        summary: { code: err.code, reason: err.message, details: err.details },
      });
      return {
        ok: false,
        batchId: batch.id,
        status: err.status,
        code: err.code,
        error: err.message,
        details: err.details,
      };
    }
    console.error("Import accreditations — transaction en echec:", err);
    await failImportBatch(db, batch.id, {
      errorCount: linePlans.length,
      summary: { reason: err instanceof Error ? err.message : "erreur inconnue" },
    });
    return {
      ok: false,
      batchId: batch.id,
      status: 500,
      error: "Echec de la transaction d'import (aucune donnee ecrite : transaction annulee).",
      details: err instanceof Error ? err.message : "erreur inconnue",
    };
  }

  // E-mails APRES commit uniquement, HORS transaction : la DB est deja
  // committee a ce stade, un echec d'envoi ne doit JAMAIS produire un faux
  // 500 ni annuler quoi que ce soit (comportement identique a `createAccreditation`).
  const recipientByLine = new Map(
    linePlans.map((p) => [p.line, p.preview.ok ? p.preview.recipientEmail : null])
  );
  const emailResults: AccreditationsCommitEmailResult[] = [];
  for (const c of txResult.created) {
    const recipient = recipientByLine.get(c.line);
    if (!recipient) continue;
    let outcome: CreationEmailOutcome;
    try {
      outcome = await sendAccreditationCreationEmail({
        accreditationId: c.accreditationId,
        recipient,
      });
    } catch (e) {
      console.error("Import accreditations — e-mail post-commit en echec:", e);
      outcome = "failed";
    }
    emailResults.push({ line: c.line, accreditationId: c.accreditationId, recipient, outcome });
  }

  await completeImportBatch(db, batch.id, txResult.counters, {
    importMode: ctx.importMode,
    accreditationIds: txResult.created.map((c) => c.accreditationId),
    emailResults,
  });

  return {
    ok: true,
    batchId: batch.id,
    created: txResult.created,
    counters: txResult.counters,
    emailResults,
  };
}
