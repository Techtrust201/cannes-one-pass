/**
 * Moteur de lecture du planning logistique (Phase 6).
 *
 * Module PUR (aucun accès Prisma) : reçoit des lignes `LogisticsPlanning`
 * déjà chargées et scopées (organizationId + eventId + phase + isActive)
 * par l'appelant, et résout la règle applicable pour un contexte donné
 * (emplacement résolu + catégorie + phase), selon la priorité :
 *
 *   1. LOCATION (le plus spécifique — emplacement précis)
 *   2. SPACE
 *   3. SECTOR
 *   4. PORT
 *   5. EVENT  (le plus générique — typique Palais : règle globale)
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
export type PlanningScope = "EVENT" | "PORT" | "SECTOR" | "SPACE" | "LOCATION";

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
  zoneCode?: string | null;
  /** JSON Prisma ou tableau déjà normalisé selon l'appelant. */
  allowedVehicleTypeCodes?: unknown;
  comment?: string | null;
  exhibitorLocationId?: string | null;
}

/** Emplacement résolu (ExhibitorLocation) utilisé pour construire la portée candidate. */
export interface PlanningLocationContext {
  /** Id validé côté serveur (jamais un UUID client non contrôlé). */
  exhibitorLocationId?: string | null;
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
  zoneCode?: string | null;
  allowedVehicleTypeCodes?: unknown;
  comment?: string | null;
}

/** Une plage `"HH:MM-HH:MM"` en conflit, pour un jour donné (F7). */
export interface PlanningDisjointRangeConflict {
  date: string;
  ranges: string[];
}

export interface PlanningResolutionError {
  code: "PLANNING_NOT_FOUND" | "PLANNING_DISJOINT_RANGES";
  message: string;
  /** Détail structuré des plages en conflit — uniquement pour `PLANNING_DISJOINT_RANGES`. */
  conflicts?: PlanningDisjointRangeConflict[];
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
 * LOCATION > SPACE > SECTOR > PORT > EVENT, à partir d'un emplacement
 * résolu (ou `null` pour une règle purement événementielle, typique Palais).
 * Exportée pour permettre à l'appelant (route API) de restreindre sa
 * requête Prisma aux `scopeKey` réellement pertinents.
 */
export function buildScopeCandidates(
  location: PlanningLocationContext | null
): ScopeCandidate[] {
  const candidates: ScopeCandidate[] = [];
  if (location?.exhibitorLocationId) {
    candidates.push({
      scope: "LOCATION",
      scopeKey: `LOCATION:${location.exhibitorLocationId}`,
    });
  }
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

/** Clé canonique LOCATION:<exhibitorLocationId> (id déjà validé serveur). */
export function locationPlanningScopeKey(exhibitorLocationId: string): string {
  return `LOCATION:${exhibitorLocationId}`;
}

export type DailyRangeMergeResult =
  | { ok: true; start: string; end: string }
  | { ok: false; conflicts: string[] };

/**
 * Fusionne les plages `"HH:MM"`/`"HH:MM"` d'un même jour (F7).
 *
 * Seules les plages qui se chevauchent ou se touchent (`start <= end` de la
 * plage précédemment fusionnée) sont fusionnées. Si, après fusion, au moins
 * deux groupes disjoints subsistent, on ne choisit JAMAIS un
 * `min(start)-max(end)` arbitraire qui inventerait un créneau dans le trou :
 * on retourne les plages en conflit (`"HH:MM-HH:MM"`) pour que l'appelant
 * produise une erreur structurée (`PLANNING_DISJOINT_RANGES`).
 *
 * Fonction pure, partagée entre le moteur runtime (ce module) et le preview
 * d'import (`src/lib/imports/planning.ts`), pour garantir un comportement
 * identique aux deux endroits.
 */
export function mergeDailyRanges(
  ranges: Array<{ start: string; end: string }>
): DailyRangeMergeResult {
  const sorted = [...ranges].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const merged: Array<{ start: string; end: string }> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }
  if (merged.length > 1) {
    return { ok: false, conflicts: merged.map((m) => `${m.start}-${m.end}`) };
  }
  return { ok: true, start: merged[0]!.start, end: merged[0]!.end };
}

type SlotsMapResult =
  | { ok: true; slots: Record<string, string> }
  | { ok: false; conflicts: PlanningDisjointRangeConflict[] };

/** Agrège des lignes quotidiennes en une map `date -> "HH:MM-HH:MM"` (F7), via `mergeDailyRanges`. */
function toSlotsMap(rows: PlanningRuleRow[]): SlotsMapResult {
  const byDate = new Map<string, Array<{ start: string; end: string }>>();
  for (const row of rows) {
    const list = byDate.get(row.date);
    if (list) list.push({ start: row.startTime, end: row.endTime });
    else byDate.set(row.date, [{ start: row.startTime, end: row.endTime }]);
  }

  const slots: Record<string, string> = {};
  const conflicts: PlanningDisjointRangeConflict[] = [];

  for (const [date, ranges] of byDate) {
    const result = mergeDailyRanges(ranges);
    if (!result.ok) {
      conflicts.push({ date, ranges: result.conflicts });
      continue;
    }
    slots[date] = `${result.start}-${result.end}`;
  }

  if (conflicts.length > 0) return { ok: false, conflicts };
  return { ok: true, slots };
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

function disjointRangesError(
  phase: PlanningPhase,
  categoryCode: string,
  conflicts: PlanningDisjointRangeConflict[]
): PlanningResolutionError {
  return {
    code: "PLANNING_DISJOINT_RANGES",
    message: `Plages horaires disjointes en base pour la phase ${phase} / catégorie ${categoryCode} : impossible de les fusionner sans créer un créneau artificiel.`,
    conflicts,
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

    // Plages disjointes détectées pour ce scope+catégorie : erreur terminale
    // et mode-indépendante (même en TRANSITION). Il s'agit d'un problème de
    // qualité de donnée (règle corrompue), pas d'une règle absente : le
    // fallback legacy — prévu pour couvrir une ABSENCE de règle — ne doit
    // jamais masquer silencieusement ce cas (cf. D1). On ne cascade pas non
    // plus vers un scope moins prioritaire, ce qui risquerait de choisir une
    // règle moins spécifique sans que personne ne corrige la donnée source.
    const mapResult = toSlotsMap(chosen);
    if (!mapResult.ok) {
      return emptyResolution(
        mode,
        phase,
        resolvedCategoryCode,
        "NONE",
        {},
        disjointRangesError(phase, resolvedCategoryCode, mapResult.conflicts)
      );
    }

    return {
      source: "DB",
      mode,
      phase,
      categoryCode: resolvedCategoryCode,
      scope: candidate.scope,
      scopeKey: candidate.scopeKey,
      slots: mapResult.slots,
      rule: {
        scope: candidate.scope,
        scopeKey: candidate.scopeKey,
        categoryCode: resolvedCategoryCode,
        dates,
        zoneCode: chosen[0]!.zoneCode ?? null,
        allowedVehicleTypeCodes: chosen[0]!.allowedVehicleTypeCodes ?? null,
        comment: chosen[0]!.comment ?? null,
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
