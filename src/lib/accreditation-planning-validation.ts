/**
 * Validation planning RX fondée sur `extension.categories[]` (Phase 6C-B-1).
 *
 * Service PARTAGÉ et STRICTEMENT READ-ONLY, destiné à être branché (sous-lots
 * suivants) dans `accreditation-service.ts`. Ce module ne branche encore
 * rien : il expose uniquement la fonction pure/testable.
 *
 * Garantie impérative (préservation Palais + comportement historique RX) :
 * ce service retourne immédiatement un succès SANS AUCUNE lecture planning
 * lorsque `organizationSlug !== "rx"` ou `logisticsPlanningMode ===
 * "DISABLED"` — voir `validateAccreditationPlanning`, premier bloc.
 *
 * Source de vérité EXCLUSIVE : `extension.categories[]` (categoryId,
 * livDate/livTime, repDate/repTime, vehicles[]). Les phases à valider sont
 * déterminées par `extension.skipMontage` / `extension.skipDemontage`.
 * Le `vehicles` racine (véhicules Prisma) n'est JAMAIS lu ici — sa
 * projection sera réalignée en 6C-B-2 à partir de la sortie canonique de ce
 * module (`phaseEntries`).
 *
 * Réutilise SANS DUPLICATION :
 *  - `resolveEffectiveRxSpace` / `resolveEffectiveRxSector` (config.ts) —
 *    même priorité référentiel > legacy que le formulaire client ;
 *  - `findCategory` / `genSlots` (config.ts) ;
 *  - `RX_CATEGORY_TO_DB_CODE` (planning-bridge.ts) ;
 *  - `resolvePlanning` / `buildScopeCandidates` (logistics-planning.ts) —
 *    priorité SPACE > SECTOR > PORT > EVENT, catégorie exacte > "ALL",
 *    garde plages disjointes (F7). Ce module ne recopie AUCUNE de ces
 *    règles, il fournit uniquement les lignes DB déjà scopées et le
 *    fallback legacy (`planning-data.ts` via `findCategory`).
 */

import {
  resolvePlanning,
  buildScopeCandidates,
  type PlanningPhase,
  type PlanningMode,
  type PlanningRuleRow,
  type PlanningLocationContext,
} from "./logistics-planning";
import { resolveEffectiveRxSpace, findCategory, genSlots } from "@/templates/accreditation/rx/config";
import { RX_CATEGORY_TO_DB_CODE } from "@/templates/accreditation/rx/planning-bridge";
import type { RxCategoryId, DateTimeSlots } from "@/templates/accreditation/rx/planning-data";

// ────────────────────────────────────────────────────────────────────────
// Delegate DB structurel injecté — lecture SEULE (aucune méthode
// d'écriture exposée). Satisfait par un vrai PrismaClient, une transaction,
// ou un mock de test (aucune DATABASE_URL requise pour les tests).
// ────────────────────────────────────────────────────────────────────────

export interface AccreditationPlanningDb {
  logisticsPlanning: {
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<PlanningRuleRow[]>;
  };
}

export interface PlanningValidationContext {
  organizationId: string;
  eventId: string;
  organizationSlug: string;
  logisticsPlanningMode: PlanningMode;
}

/** Emplacement réel déjà résolu par `resolveTrustedAccreditationReferential` (ou `null`). */
export interface PlanningValidationReferential {
  location: PlanningLocationContext | null;
}

export interface PlanningValidationVehicleInput {
  vehicleType?: string | null;
  plate?: string | null;
  /** Reprise « même véhicule » (défaut true, cf. contrat RX `RxCategorySelection`). */
  repSameAsDelivery?: boolean;
  repVehicleType?: string | null;
  repPlate?: string | null;
}

export interface PlanningValidationCategoryInput {
  categoryId: string;
  livDate?: string | null;
  livTime?: string | null;
  repDate?: string | null;
  repTime?: string | null;
  vehicles: PlanningValidationVehicleInput[];
}

export interface PlanningValidationCommand {
  /** Secteur legacy figé sur l'exposant (`extension.exhibitor.sector`) — repli hors STRICT uniquement. */
  exhibitorSector?: string | null;
  /** Choix manuel Intérieur/Extérieur Palais (`extension.space`) — pertinent seulement si legacy ambigu. */
  manualPalaisChoice?: string | null;
  categories: PlanningValidationCategoryInput[];
  skipMontage?: boolean;
  skipDemontage?: boolean;
}

export interface ValidateAccreditationPlanningInput {
  context: PlanningValidationContext;
  referential: PlanningValidationReferential;
  command: PlanningValidationCommand;
}

export type PlanningValidationErrorCode =
  | "PLANNING_DATE_INVALID"
  | "PLANNING_SLOT_INVALID"
  | "PLANNING_CATEGORY_INVALID"
  | "PLANNING_PHASE_INVALID"
  | "PLANNING_SKIP_INVALID"
  | "PLANNING_NOT_FOUND"
  | "PLANNING_DISJOINT_RANGES"
  | "PLANNING_VALIDATION_UNAVAILABLE";

export interface PlanningValidationErrorDetails {
  categoryId?: string;
  phase?: PlanningPhase;
  date?: string | null;
  time?: string | null;
}

export interface PlanningValidationFailure {
  ok: false;
  status: 400 | 409 | 503;
  code: PlanningValidationErrorCode;
  message: string;
  details?: PlanningValidationErrorDetails;
}

/** Projection canonique — source unique pour la future réalignement des quotas (6C-B-2). */
export interface PlanningPhaseEntry {
  categoryId: string;
  categoryCode: string;
  phase: PlanningPhase;
  date: string;
  time: string;
  vehicleIndex: number;
  vehicleType: string | null;
  sourceVehicle: PlanningValidationVehicleInput;
}

export interface PlanningValidationSuccess {
  ok: true;
  /** `true` = court-circuit impératif (non-RX ou DISABLED) : aucune lecture planning effectuée. */
  skipped: boolean;
  phaseEntries: PlanningPhaseEntry[];
}

export type PlanningValidationResult = PlanningValidationSuccess | PlanningValidationFailure;

function isKnownRxCategoryId(categoryId: string): categoryId is RxCategoryId {
  return categoryId in RX_CATEGORY_TO_DB_CODE;
}

/**
 * Construit les `phaseEntries` (projection canonique) depuis
 * `extension.categories[]`, en respectant la matrice montage/démontage
 * (section 9 du prompt) : aucune entrée MONTAGE si `skipMontage`, aucune
 * entrée DEMONTAGE si `skipDemontage`. Ne mute jamais `command`.
 */
function buildPhaseEntries(
  categories: PlanningValidationCategoryInput[],
  categoryCodeByCategoryId: Map<string, string>,
  skipMontage: boolean,
  skipDemontage: boolean
): PlanningPhaseEntry[] {
  const entries: PlanningPhaseEntry[] = [];
  for (const cat of categories) {
    const categoryCode = categoryCodeByCategoryId.get(cat.categoryId)!;
    cat.vehicles.forEach((vehicle, vehicleIndex) => {
      if (!skipMontage) {
        entries.push({
          categoryId: cat.categoryId,
          categoryCode,
          phase: "MONTAGE",
          date: cat.livDate ?? "",
          time: cat.livTime ?? "",
          vehicleIndex,
          vehicleType: vehicle.vehicleType ?? null,
          sourceVehicle: vehicle,
        });
      }
      if (!skipDemontage) {
        const repSame = vehicle.repSameAsDelivery !== false;
        entries.push({
          categoryId: cat.categoryId,
          categoryCode,
          phase: "DEMONTAGE",
          date: cat.repDate ?? "",
          time: cat.repTime ?? "",
          vehicleIndex,
          vehicleType: (repSame ? vehicle.vehicleType : vehicle.repVehicleType) ?? null,
          sourceVehicle: vehicle,
        });
      }
    });
  }
  return entries;
}

/**
 * Le formulaire RX transmet `livTime`/`repTime` comme la PLAGE COMPLÈTE
 * `"HH:MM-HH:MM"` choisie dans le menu (peuplé côté client par ce même
 * `genSlots`, cf. `StepDeliveryRx`/`StepPickupRx`) — jamais une simple heure
 * de départ. La validation doit donc comparer la valeur transmise à la
 * liste exacte des créneaux produits par `genSlots`, jamais une comparaison
 * `start <= time <= end` qui accepterait un créneau inventé dans un trou.
 */
function isValidSlot(range: string, time: string): boolean {
  return genSlots(range).includes(time);
}

/**
 * Valide la matrice montage/démontage et résout, pour chaque catégorie
 * demandée, le vrai `categoryCode` DB — en vérifiant que `categoryId`
 * existe bien dans l'espace RX EFFECTIF (référentiel réel résolu, jamais
 * `extension.space` déclaré par le client).
 */
function resolveCategoryCodes(
  categories: PlanningValidationCategoryInput[],
  effectiveSpace: string | null
): { ok: true; map: Map<string, string> } | PlanningValidationFailure {
  const map = new Map<string, string>();
  for (const cat of categories) {
    if (!isKnownRxCategoryId(cat.categoryId) || !findCategory(effectiveSpace ?? "", cat.categoryId)) {
      return {
        ok: false,
        status: 400,
        code: "PLANNING_CATEGORY_INVALID",
        message: `Catégorie "${cat.categoryId}" invalide pour l'espace logistique résolu.`,
        details: { categoryId: cat.categoryId },
      };
    }
    map.set(cat.categoryId, RX_CATEGORY_TO_DB_CODE[cat.categoryId]);
  }
  return { ok: true, map };
}

/**
 * Charge (une seule fois par phase, mise en cache) les lignes
 * `LogisticsPlanning` déjà scopées organisation + événement + phase +
 * actif + `scopeKey` candidat — même contrat que `GET /api/planning`.
 */
async function loadRowsForPhase(
  db: AccreditationPlanningDb,
  ctx: PlanningValidationContext,
  phase: PlanningPhase,
  location: PlanningLocationContext | null,
  cache: Map<PlanningPhase, PlanningRuleRow[]>
): Promise<PlanningRuleRow[]> {
  const cached = cache.get(phase);
  if (cached) return cached;

  const scopeKeys = buildScopeCandidates(location).map((c) => c.scopeKey);
  const rows = await db.logisticsPlanning.findMany({
    where: {
      organizationId: ctx.organizationId,
      eventId: ctx.eventId,
      phase,
      isActive: true,
      scopeKey: { in: scopeKeys },
    },
    select: {
      scope: true,
      scopeKey: true,
      categoryCode: true,
      phase: true,
      date: true,
      startTime: true,
      endTime: true,
    },
  });
  cache.set(phase, rows);
  return rows;
}

/**
 * Valide une combinaison (categoryId, phase) unique : résout la règle
 * (DB prioritaire, repli legacy `planning-data.ts` en TRANSITION,
 * obligatoire en STRICT — délégué intégralement à `resolvePlanning`), puis
 * vérifie que la date demandée existe et que le créneau transmis
 * (`"HH:MM-HH:MM"`) figure exactement dans la liste produite par `genSlots`
 * (jamais une simple comparaison `start <= time <= end`, qui accepterait un
 * créneau inventé dans un trou ou mal aligné sur la grille horaire).
 */
async function validateCategoryPhase(
  db: AccreditationPlanningDb,
  ctx: PlanningValidationContext,
  entry: PlanningPhaseEntry,
  effectiveSpace: string | null,
  location: PlanningLocationContext | null,
  rowsCache: Map<PlanningPhase, PlanningRuleRow[]>
): Promise<PlanningValidationFailure | null> {
  const legacyCategory = findCategory(effectiveSpace ?? "", entry.categoryId);
  const legacyRange: DateTimeSlots = legacyCategory
    ? entry.phase === "MONTAGE"
      ? legacyCategory.liv
      : legacyCategory.rep
    : {};

  const rows = await loadRowsForPhase(db, ctx, entry.phase, location, rowsCache);

  const resolution = resolvePlanning({
    mode: ctx.logisticsPlanningMode,
    phase: entry.phase,
    categoryCode: entry.categoryCode,
    location,
    rows,
    fallback: { source: "LEGACY", slots: legacyRange },
  });

  if (resolution.error) {
    if (resolution.error.code === "PLANNING_DISJOINT_RANGES") {
      return {
        ok: false,
        status: 409,
        code: "PLANNING_DISJOINT_RANGES",
        message: resolution.error.message,
        details: { categoryId: entry.categoryId, phase: entry.phase },
      };
    }
    return {
      ok: false,
      status: 409,
      code: "PLANNING_NOT_FOUND",
      message: resolution.error.message,
      details: { categoryId: entry.categoryId, phase: entry.phase },
    };
  }

  if (!entry.date) {
    return {
      ok: false,
      status: 400,
      code: "PLANNING_DATE_INVALID",
      message: `Date manquante pour la catégorie "${entry.categoryId}" / phase ${entry.phase}.`,
      details: { categoryId: entry.categoryId, phase: entry.phase },
    };
  }
  const range = resolution.slots[entry.date];
  if (!range) {
    return {
      ok: false,
      status: 400,
      code: "PLANNING_DATE_INVALID",
      message: `Date "${entry.date}" hors planning pour la catégorie "${entry.categoryId}" / phase ${entry.phase}.`,
      details: { categoryId: entry.categoryId, phase: entry.phase, date: entry.date },
    };
  }

  if (!entry.time || !isValidSlot(range, entry.time)) {
    return {
      ok: false,
      status: 400,
      code: "PLANNING_SLOT_INVALID",
      message: `Créneau "${entry.time || "(absent)"}" invalide pour la date "${entry.date}" (catégorie "${entry.categoryId}" / phase ${entry.phase}).`,
      details: { categoryId: entry.categoryId, phase: entry.phase, date: entry.date, time: entry.time },
    };
  }

  return null;
}

/**
 * Valide le planning RX d'une future accréditation à partir de
 * `extension.categories[]`. Lecture SEULE. Retourne la projection
 * canonique `phaseEntries`, réutilisable par le futur réalignement des
 * quotas (6C-B-2) sans jamais relire `vehicles` racine.
 */
export async function validateAccreditationPlanning(
  db: AccreditationPlanningDb,
  input: ValidateAccreditationPlanningInput
): Promise<PlanningValidationResult> {
  const { context, referential, command } = input;

  // Garantie impérative (section 7) : Palais et RX DISABLED ne lisent
  // JAMAIS le planning — comportement historique strictement préservé.
  if (context.organizationSlug !== "rx" || context.logisticsPlanningMode === "DISABLED") {
    return { ok: true, skipped: true, phaseEntries: [] };
  }

  const skipMontage = command.skipMontage === true;
  const skipDemontage = command.skipDemontage === true;
  if (skipMontage && skipDemontage) {
    return {
      ok: false,
      status: 400,
      code: "PLANNING_SKIP_INVALID",
      message: "Impossible de sauter simultanément le montage et le démontage.",
    };
  }

  try {
    const effectiveSpace = resolveEffectiveRxSpace({
      logisticSpace: referential.location?.logisticSpace ?? null,
      sectorCode: referential.location?.sectorCode ?? null,
      exhibitorSector: command.exhibitorSector ?? null,
      manualPalaisChoice: command.manualPalaisChoice ?? null,
      planningMode: context.logisticsPlanningMode,
    }).space;

    const categoryCodesResult = resolveCategoryCodes(command.categories, effectiveSpace);
    if (!categoryCodesResult.ok) return categoryCodesResult;

    const phaseEntries = buildPhaseEntries(
      command.categories,
      categoryCodesResult.map,
      skipMontage,
      skipDemontage
    );

    const rowsCache = new Map<PlanningPhase, PlanningRuleRow[]>();
    const validatedCombos = new Set<string>();
    for (const entry of phaseEntries) {
      const comboKey = `${entry.categoryId}::${entry.phase}`;
      if (validatedCombos.has(comboKey)) continue;
      validatedCombos.add(comboKey);

      const failure = await validateCategoryPhase(
        db,
        context,
        entry,
        effectiveSpace,
        referential.location,
        rowsCache
      );
      if (failure) return failure;
    }

    return { ok: true, skipped: false, phaseEntries };
  } catch {
    // Jamais de fuite d'objet Prisma / stack trace : message uniforme.
    return {
      ok: false,
      status: 503,
      code: "PLANNING_VALIDATION_UNAVAILABLE",
      message: "Service de validation du planning temporairement indisponible.",
    };
  }
}
