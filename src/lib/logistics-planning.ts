/**
 * Moteur de lecture du planning logistique (Phase 6).
 *
 * Module PUR (aucun accès Prisma) : reçoit des lignes `LogisticsPlanning`
 * déjà chargées et scopées (organizationId + eventId + phase + isActive)
 * par l'appelant, et résout la règle applicable pour un contexte donné
 * (emplacement résolu + catégorie + phase), selon la priorité :
 *
 *   1. SPACE  (le plus spécifique)
 *   2. SECTOR
 *   3. PORT
 *   4. EVENT  (le plus générique — typique Palais : règle globale)
 *
 * À niveau de portée égal, une règle avec `categoryCode` exact est
 * toujours préférée à une règle générique (`categoryCode = "ALL"`).
 * Si un niveau contient des lignes mais aucune ne correspond à la
 * catégorie demandée (ni exacte, ni "ALL"), on NE les utilise PAS : on
 * cascade vers le niveau suivant plutôt que de choisir un premier
 * résultat arbitraire.
 *
 * Modes (`Event.logisticsPlanningMode`) :
 *   - DISABLED   : ne consulte jamais les lignes DB ; renvoie uniquement
 *                  le fallback fourni (ou NONE, jamais d'erreur).
 *   - TRANSITION : DB prioritaire ; fallback uniquement si la combinaison
 *                  demandée est absente en base.
 *   - STRICT     : DB obligatoire ; absence de règle => erreur structurée
 *                  `PLANNING_NOT_FOUND` (jamais de fallback).
 *
 * Le fallback lui-même (planning-data.ts pour RX, dates Event pour le
 * Palais) est calculé par l'appelant : ce module ne connaît aucune
 * logique spécifique à une organisation.
 */

export type PlanningPhase = "MONTAGE" | "DEMONTAGE";
export type PlanningMode = "DISABLED" | "TRANSITION" | "STRICT";
export type PlanningScope = "EVENT" | "PORT" | "SECTOR" | "SPACE";

export const DEFAULT_PLANNING_CATEGORY_CODE = "ALL";

/** Ligne `LogisticsPlanning` minimale requise par le moteur (lecture seule). */
export interface PlanningRuleRow {
  scope: PlanningScope;
  scopeKey: string;
  categoryCode: string;
  phase: PlanningPhase;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

/** Emplacement résolu (ExhibitorLocation) utilisé pour construire la portée candidate. */
export interface PlanningLocationContext {
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
}

export interface PlanningFallback {
  source: "LEGACY" | "EVENT_FALLBACK";
  /** Map date (YYYY-MM-DD) -> plage "HH:MM-HH:MM", au format historique. */
  slots: Record<string, string>;
}

export interface ResolvePlanningParams {
  mode: PlanningMode;
  phase: PlanningPhase;
  /** Catégorie demandée. Défaut `"ALL"` si omise. */
  categoryCode?: string;
  /** `null` = pas d'emplacement résolu (seule la portée EVENT est candidate). */
  location: PlanningLocationContext | null;
  /** Lignes déjà scopées organizationId + eventId + phase + isActive=true. */
  rows: PlanningRuleRow[];
  /** Fallback pré-calculé par l'appelant (ignoré si `mode === "STRICT"`). */
  fallback?: PlanningFallback | null;
}

export interface PlanningResolutionRule {
  scope: PlanningScope;
  scopeKey: string;
  categoryCode: string;
  dates: string[];
}

export interface PlanningResolutionError {
  code: "PLANNING_NOT_FOUND";
  message: string;
}

export type PlanningResolutionSource = "DB" | "LEGACY" | "EVENT_FALLBACK" | "NONE";

export interface PlanningResolution {
  source: PlanningResolutionSource;
  mode: PlanningMode;
  phase: PlanningPhase;
  categoryCode: string;
  scope: PlanningScope | null;
  scopeKey: string | null;
  /** Map date (YYYY-MM-DD) -> plage "HH:MM-HH:MM" (format historique DateTimeSlots). */
  slots: Record<string, string>;
  rule: PlanningResolutionRule | null;
  error: PlanningResolutionError | null;
}

interface ScopeCandidate {
  scope: PlanningScope;
  scopeKey: string;
}

/**
 * Construit les clés de portée candidates, dans l'ordre de priorité
 * SPACE > SECTOR > PORT > EVENT, à partir d'un emplacement résolu (ou
 * `null` pour une règle purement événementielle, typique Palais).
 * Exportée pour permettre à l'appelant (route API) de restreindre sa
 * requête Prisma aux `scopeKey` réellement pertinents.
 */
export function buildScopeCandidates(
  location: PlanningLocationContext | null
): ScopeCandidate[] {
  const candidates: ScopeCandidate[] = [];
  if (location?.logisticSpace) {
    candidates.push({ scope: "SPACE", scopeKey: `SPACE:${location.logisticSpace}` });
  }
  if (location?.portCode && location?.sectorCode) {
    candidates.push({
      scope: "SECTOR",
      scopeKey: `SECTOR:${location.portCode}:${location.sectorCode}`,
    });
  }
  if (location?.portCode) {
    candidates.push({ scope: "PORT", scopeKey: `PORT:${location.portCode}` });
  }
  candidates.push({ scope: "EVENT", scopeKey: "EVENT" });
  return candidates;
}

/** Agrège des lignes quotidiennes en une map `date -> "HH:MM-HH:MM"` (union la plus large par jour). */
function toSlotsMap(rows: PlanningRuleRow[]): Record<string, string> {
  const byDate = new Map<string, { start: string; end: string }>();
  for (const row of rows) {
    const current = byDate.get(row.date);
    if (!current) {
      byDate.set(row.date, { start: row.startTime, end: row.endTime });
    } else {
      byDate.set(row.date, {
        start: row.startTime < current.start ? row.startTime : current.start,
        end: row.endTime > current.end ? row.endTime : current.end,
      });
    }
  }
  const out: Record<string, string> = {};
  for (const [date, { start, end }] of byDate) {
    out[date] = `${start}-${end}`;
  }
  return out;
}

function emptyResolution(
  mode: PlanningMode,
  phase: PlanningPhase,
  categoryCode: string,
  source: PlanningResolutionSource,
  slots: Record<string, string>,
  error: PlanningResolutionError | null
): PlanningResolution {
  return { source, mode, phase, categoryCode, scope: null, scopeKey: null, slots, rule: null, error };
}

function notFoundError(phase: PlanningPhase, categoryCode: string): PlanningResolutionError {
  return {
    code: "PLANNING_NOT_FOUND",
    message: `Aucune règle de planning trouvée pour la phase ${phase} / catégorie ${categoryCode}.`,
  };
}

/**
 * Résout la règle de planning applicable pour un contexte donné.
 * Fonction pure, sans accès I/O : toutes les lignes candidates doivent
 * déjà être chargées et passées via `params.rows`.
 */
export function resolvePlanning(params: ResolvePlanningParams): PlanningResolution {
  const { mode, phase, location, rows, fallback = null } = params;
  const categoryCode = params.categoryCode?.trim() || DEFAULT_PLANNING_CATEGORY_CODE;

  // DISABLED : comportement historique inchangé. On ne consulte jamais la
  // base ; on renvoie tel quel le fallback fourni par l'appelant (ou NONE,
  // jamais d'erreur — DISABLED ne doit jamais bloquer le formulaire public).
  if (mode === "DISABLED") {
    if (fallback) {
      return {
        source: fallback.source,
        mode,
        phase,
        categoryCode,
        scope: null,
        scopeKey: null,
        slots: fallback.slots,
        rule: null,
        error: null,
      };
    }
    return emptyResolution(mode, phase, categoryCode, "NONE", {}, null);
  }

  const candidates = buildScopeCandidates(location);
  const rowsForPhase = rows.filter((r) => r.phase === phase);

  for (const candidate of candidates) {
    const atLevel = rowsForPhase.filter((r) => r.scopeKey === candidate.scopeKey);
    if (atLevel.length === 0) continue;

    const exact = atLevel.filter((r) => r.categoryCode === categoryCode);
    const generic =
      categoryCode === DEFAULT_PLANNING_CATEGORY_CODE
        ? []
        : atLevel.filter((r) => r.categoryCode === DEFAULT_PLANNING_CATEGORY_CODE);
    const chosen = exact.length > 0 ? exact : generic;

    // Des lignes existent à ce niveau de portée mais aucune ne correspond à
    // la catégorie demandée (ni exacte, ni "ALL") : on NE les utilise pas
    // arbitrairement, on cascade vers le niveau de portée suivant.
    if (chosen.length === 0) continue;

    const resolvedCategoryCode = chosen[0]!.categoryCode;
    const dates = Array.from(new Set(chosen.map((r) => r.date))).sort();
    return {
      source: "DB",
      mode,
      phase,
      categoryCode: resolvedCategoryCode,
      scope: candidate.scope,
      scopeKey: candidate.scopeKey,
      slots: toSlotsMap(chosen),
      rule: {
        scope: candidate.scope,
        scopeKey: candidate.scopeKey,
        categoryCode: resolvedCategoryCode,
        dates,
      },
      error: null,
    };
  }

  // Aucune règle DB ne couvre cette combinaison.
  if (mode === "STRICT") {
    return emptyResolution(mode, phase, categoryCode, "NONE", {}, notFoundError(phase, categoryCode));
  }

  // TRANSITION : fallback règle par règle. La présence partielle de
  // planning DB pour d'autres combinaisons ne change rien ici : cette
  // combinaison précise est absente, on retombe sur le fallback fourni.
  if (fallback) {
    return {
      source: fallback.source,
      mode,
      phase,
      categoryCode,
      scope: null,
      scopeKey: null,
      slots: fallback.slots,
      rule: null,
      error: null,
    };
  }

  return emptyResolution(mode, phase, categoryCode, "NONE", {}, notFoundError(phase, categoryCode));
}
