/**
 * Application transactionnelle (commit) du profil Planning — strategie FUSION
 * COMPLETE (Phase 3, corrigee).
 *
 * FUSION = { creation, mise a jour, inchange, conservation des absents }.
 * En particulier une CORRECTION D'HORAIRE doit METTRE A JOUR la regle
 * existante (jamais creer un doublon en laissant l'ancienne plage active).
 *
 * Identite logique d'une regle (rapprochement explicite) :
 *   jour-combinaison = (scopeKey, categoryCode, phase, date).
 * Par jour-combinaison, on rapproche les creneaux entrants et existants :
 *   - meme (startTime,endTime) exact                 -> INCHANGE (aucune ecriture) ;
 *   - exactement 1 entrant + 1 existant non apparies -> MISE A JOUR de l'horaire ;
 *   - sinon (plusieurs creneaux le meme jour)         -> CREATION des entrants,
 *     conservation des existants (jamais de desactivation), signalement si
 *     ambigu (plusieurs restes des deux cotes).
 *
 * `tx` est typee structurellement : testable sans connexion Neon. Aucune
 * ecriture Neon en Phase 3.
 */

import type { PlanningRow } from "./planning";
import { EMPTY_COUNTERS, type ImportBatchCounters } from "./import-batch";
import type { ImportRowIssue } from "./csv";

interface ExistingPlanningRow {
  id: string;
  startTime: string;
  endTime: string;
}

export interface PlanningCommitTx {
  logisticsPlanning: {
    findMany(args: {
      where: {
        organizationId: string;
        eventId: string;
        scopeKey: string;
        categoryCode: string;
        phase: string;
        date: string;
        isActive: boolean;
      };
      select?: Record<string, unknown>;
    }): Promise<ExistingPlanningRow[]>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface PlanningCommitContext {
  organizationId: string;
  eventId: string;
  importBatchId?: string | null;
  source?: string;
}

export interface PlanningCommitResult {
  counters: ImportBatchCounters;
  created: number;
  updated: number;
  unchanged: number;
  warnings: ImportRowIssue[];
}

function dayKeyOf(row: PlanningRow): string {
  return [row.scopeKey, row.categoryCode, row.phase, row.date].join("|");
}

function slotKey(startTime: string, endTime: string): string {
  return `${startTime}-${endTime}`;
}

/**
 * Applique le plan Planning (deja parse/valide) dans la transaction fournie,
 * en FUSION complete. L'appelant garantit l'absence d'erreur bloquante et la
 * creation prealable de l'ImportBatch hors transaction.
 */
export async function applyPlanningCommit(
  tx: PlanningCommitTx,
  rows: PlanningRow[],
  ctx: PlanningCommitContext
): Promise<PlanningCommitResult> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const warnings: ImportRowIssue[] = [];

  // Regroupement des creneaux entrants par jour-combinaison.
  const groups = new Map<string, PlanningRow[]>();
  for (const row of rows) {
    const key = dayKeyOf(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    const ref = group[0]!;
    const existing = await tx.logisticsPlanning.findMany({
      where: {
        organizationId: ctx.organizationId,
        eventId: ctx.eventId,
        scopeKey: ref.scopeKey,
        categoryCode: ref.categoryCode,
        phase: ref.phase,
        date: ref.date,
        isActive: true,
      },
      select: { id: true, startTime: true, endTime: true },
    });

    const existingByTime = new Map<string, ExistingPlanningRow>();
    for (const e of existing) existingByTime.set(slotKey(e.startTime, e.endTime), e);

    const incomingLeftover: PlanningRow[] = [];
    for (const inc of group) {
      const key = slotKey(inc.startTime, inc.endTime);
      const match = existingByTime.get(key);
      if (match) {
        // Creneau identique : inchange, aucune ecriture.
        existingByTime.delete(key);
        unchanged += 1;
      } else {
        incomingLeftover.push(inc);
      }
    }
    const existingLeftover = [...existingByTime.values()];

    if (incomingLeftover.length === 1 && existingLeftover.length === 1) {
      // Correction d'horaire : mise a jour de la regle existante (pas de doublon).
      const inc = incomingLeftover[0]!;
      await tx.logisticsPlanning.update({
        where: { id: existingLeftover[0]!.id },
        data: {
          startTime: inc.startTime,
          endTime: inc.endTime,
          isActive: true,
          source: ctx.source ?? "import",
          importBatchId: ctx.importBatchId ?? null,
        },
      });
      updated += 1;
    } else {
      for (const inc of incomingLeftover) {
        await tx.logisticsPlanning.create({ data: buildCreateData(inc, ctx) });
        created += 1;
      }
      if (incomingLeftover.length > 0 && existingLeftover.length > 0) {
        warnings.push({
          line: ref.sourceLine,
          column: "_row",
          value: dayKeyOf(ref),
          reason:
            "Plusieurs creneaux le meme jour : creation des nouveaux, conservation des existants (rapprochement ambigu, revue manuelle recommandee).",
        });
      }
    }
  }

  const counters: ImportBatchCounters = {
    ...EMPTY_COUNTERS,
    created,
    updated,
    unchanged,
  };

  return { counters, created, updated, unchanged, warnings };
}

function buildCreateData(row: PlanningRow, ctx: PlanningCommitContext): Record<string, unknown> {
  return {
    organizationId: ctx.organizationId,
    eventId: ctx.eventId,
    scope: row.scope,
    scopeKey: row.scopeKey,
    portCode: row.portCode,
    sectorCode: row.sectorCode,
    spaceCode: row.spaceCode,
    categoryCode: row.categoryCode,
    phase: row.phase,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    isActive: true,
    source: ctx.source ?? "import",
    importBatchId: ctx.importBatchId ?? null,
  };
}
