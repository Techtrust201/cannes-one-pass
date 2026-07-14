/**
 * Résolution référentielle hybride et fiable (Phase 6C-B-1).
 *
 * Service PARTAGÉ et READ-ONLY, destiné à être branché (sous-lots suivants)
 * dans `accreditation-service.ts` pour les quatre canaux de création
 * (formulaire public, back-office, duplication, import CSV). Ce module ne
 * branche encore rien : il expose uniquement la fonction pure/testable.
 *
 * Principe de sécurité — aucun UUID client n'est jamais considéré comme
 * fiable :
 *  - `exhibitorId` / `exhibitorLocationId` transmis par l'appelant ne sont
 *    que des INDICATIONS : ils sont rechargés côté serveur et revérifiés
 *    (organisation, événement, activité, appartenance) avant d'être
 *    acceptés ;
 *  - en `TRANSITION`/`STRICT`, un UUID invalide/étranger/incohérent est une
 *    erreur contrôlée — jamais une résolution silencieuse sur un autre
 *    exposant/emplacement (pas de repli "naturel" masquant l'incohérence) ;
 *  - en `DISABLED`, un UUID invalide/étranger est simplement IGNORÉ : on
 *    retente une résolution naturelle best-effort, et à défaut on autorise
 *    un résultat référentiel nul (comportement legacy inchangé) ou un
 *    repli sur un éventuel snapshot historique fourni par l'appelant
 *    serveur (canal duplication).
 *
 * Résolution naturelle (UUID absent, ou ignoré en DISABLED) : même
 * sémantique que `src/lib/imports/accreditations-referential-resolver.ts`
 * (externalReference prioritaire, sinon nameNormalized, toujours scopé
 * organizationId + eventId + isActive) — on réutilise ses fonctions de
 * normalisation, jamais une seconde sémantique divergente. Toute ambiguïté
 * (`findMany` > 1 résultat) est explicite en TRANSITION/STRICT ; en
 * DISABLED elle est non bloquante (résultat nul, jamais de premier choix
 * arbitraire).
 *
 * Anti-IDOR : les messages d'erreur concernant une ressource étrangère,
 * inactive ou inexistante restent volontairement UNIFORMES (même texte
 * pour "introuvable" et "hors périmètre") — seul le `code` distingue les
 * cas pour l'observabilité serveur, jamais pour le client.
 */

import { normalizeExhibitorName, normalizeLocationCode } from "./imports/normalization";
import type { LocationTypeCode } from "./imports/referential";
import type { PlanningMode } from "./logistics-planning";

// ────────────────────────────────────────────────────────────────────────
// Delegates DB structurels injectés — satisfaits par un vrai PrismaClient,
// une transaction, ou un mock de test. Aucune dépendance directe au client
// Prisma réel : les tests n'ont besoin d'aucune DATABASE_URL. Lecture
// SEULE : aucune méthode d'écriture n'est exposée par cette interface.
// ────────────────────────────────────────────────────────────────────────

export interface TrustedExhibitorRow {
  id: string;
  name: string;
  nameNormalized: string | null;
  externalReference: string | null;
  organizationId: string;
  eventId: string;
  isActive: boolean;
}

export interface TrustedLocationRow {
  id: string;
  exhibitorId: string;
  type: LocationTypeCode;
  code: string;
  codeNormalized: string;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
  isActive: boolean;
}

export interface AccreditationReferentialDb {
  exhibitor: {
    findUnique(args: {
      where: { id: string };
      select?: Record<string, unknown>;
    }): Promise<TrustedExhibitorRow | null>;
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<TrustedExhibitorRow[]>;
  };
  exhibitorLocation: {
    findUnique(args: {
      where: { id: string };
      select?: Record<string, unknown>;
    }): Promise<TrustedLocationRow | null>;
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<TrustedLocationRow[]>;
  };
}

export interface TrustedReferentialContext {
  organizationId: string;
  eventId: string;
  logisticsPlanningMode: PlanningMode;
}

/**
 * Entrées du `command` client. Toutes non fiables (revérifiées ci-dessous),
 * sauf les 4 champs `legacy*` qui ne doivent être renseignés QUE par
 * l'appelant serveur (ex: accréditation source d'une duplication déjà
 * contrôlée en accès) — jamais désérialisés depuis un payload public.
 */
export interface TrustedReferentialInput {
  exhibitorId?: string | null;
  exhibitorLocationId?: string | null;
  exhibitorName?: string | null;
  exhibitorExternalReference?: string | null;
  locationCode?: string | null;
  locationType?: LocationTypeCode | null;
  /** Repli historique serveur (canal duplication, DISABLED uniquement). */
  legacyExhibitorId?: string | null;
  legacyExhibitorLocationId?: string | null;
  legacyLocationLabel?: string | null;
  legacyLocationSnapshot?: ResolvedReferentialSnapshot | null;
}

export interface ResolvedReferentialSnapshot {
  exhibitorName: string;
  locationType: LocationTypeCode | null;
  locationCode: string | null;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
}

export interface ResolvedReferential {
  exhibitorId: string | null;
  exhibitorLocationId: string | null;
  locationLabel: string | null;
  locationSnapshot: ResolvedReferentialSnapshot | null;
}

export interface ResolvedExhibitorInfo {
  id: string;
  name: string;
  organizationId: string;
  eventId: string;
}

export interface ResolvedLocationInfo {
  id: string;
  type: LocationTypeCode;
  code: string;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
}

export interface TrustedReferentialSuccess {
  ok: true;
  /**
   * `null` uniquement en `DISABLED` best-effort : aucun exposant n'a pu
   * être résolu (ni UUID valide, ni critère naturel, ni repli historique).
   * Comportement legacy inchangé — jamais bloquant.
   */
  referential: ResolvedReferential | null;
  exhibitor: ResolvedExhibitorInfo | null;
  location: ResolvedLocationInfo | null;
}

export type ReferentialErrorCode =
  | "EXHIBITOR_REQUIRED"
  | "LOCATION_REQUIRED"
  | "EXHIBITOR_NOT_FOUND"
  | "EXHIBITOR_AMBIGUOUS"
  | "EXHIBITOR_SCOPE_MISMATCH"
  | "LOCATION_NOT_FOUND"
  | "LOCATION_AMBIGUOUS"
  | "LOCATION_EXHIBITOR_MISMATCH"
  | "LOCATION_SCOPE_MISMATCH"
  | "REFERENTIAL_VALIDATION_UNAVAILABLE";

export interface TrustedReferentialFailure {
  ok: false;
  status: 400 | 409 | 503;
  code: ReferentialErrorCode;
  message: string;
  details?: unknown;
}

export type TrustedReferentialResult = TrustedReferentialSuccess | TrustedReferentialFailure;

const EXHIBITOR_SELECT = {
  id: true,
  name: true,
  nameNormalized: true,
  externalReference: true,
  organizationId: true,
  eventId: true,
  isActive: true,
} as const;

const LOCATION_SELECT = {
  id: true,
  exhibitorId: true,
  type: true,
  code: true,
  codeNormalized: true,
  portCode: true,
  sectorCode: true,
  logisticSpace: true,
  isActive: true,
} as const;

/** Message uniforme anti-IDOR : ne distingue jamais "inexistant" de "hors périmètre". */
const EXHIBITOR_UNIFORM_MESSAGE =
  "Exposant introuvable pour ce contexte organisation/événement.";
const LOCATION_UNIFORM_MESSAGE =
  "Emplacement introuvable pour cet exposant dans ce contexte.";

function toExhibitorInfo(row: TrustedExhibitorRow): ResolvedExhibitorInfo {
  return { id: row.id, name: row.name, organizationId: row.organizationId, eventId: row.eventId };
}

function toLocationInfo(row: TrustedLocationRow): ResolvedLocationInfo {
  return {
    id: row.id,
    type: row.type,
    code: row.code,
    portCode: row.portCode,
    sectorCode: row.sectorCode,
    logisticSpace: row.logisticSpace,
  };
}

type ExhibitorOutcome =
  | { ok: true; exhibitor: ResolvedExhibitorInfo | null }
  | TrustedReferentialFailure;

type LocationOutcome =
  | { ok: true; location: ResolvedLocationInfo | null }
  | TrustedReferentialFailure;

/**
 * Repli best-effort DISABLED : tente l'exposant historique (fourni par le
 * canal duplication) avant d'abandonner la résolution exposant. Un
 * `legacyExhibitorId` incohérent (inactif, étranger) est simplement ignoré
 * — jamais bloquant en DISABLED.
 */
async function resolveLegacyExhibitorFallback(
  db: AccreditationReferentialDb,
  ctx: TrustedReferentialContext,
  input: TrustedReferentialInput
): Promise<ExhibitorOutcome> {
  const legacyId = (input.legacyExhibitorId ?? "").trim();
  if (legacyId) {
    const row = await db.exhibitor.findUnique({ where: { id: legacyId }, select: EXHIBITOR_SELECT });
    if (row && row.isActive && row.organizationId === ctx.organizationId && row.eventId === ctx.eventId) {
      return { ok: true, exhibitor: toExhibitorInfo(row) };
    }
  }
  return { ok: true, exhibitor: null };
}

function exhibitorRefusal(row: TrustedExhibitorRow | null, ctx: TrustedReferentialContext): TrustedReferentialFailure {
  if (row && row.isActive && (row.organizationId !== ctx.organizationId || row.eventId !== ctx.eventId)) {
    return { ok: false, status: 409, code: "EXHIBITOR_SCOPE_MISMATCH", message: EXHIBITOR_UNIFORM_MESSAGE };
  }
  return { ok: false, status: 409, code: "EXHIBITOR_NOT_FOUND", message: EXHIBITOR_UNIFORM_MESSAGE };
}

/**
 * Résout l'exposant. `strict=true` (TRANSITION/STRICT) rend toute
 * incohérence bloquante ; `strict=false` (DISABLED) tente systématiquement
 * un repli best-effort avant d'abandonner (résultat `null`, jamais bloquant).
 */
async function resolveExhibitor(
  db: AccreditationReferentialDb,
  ctx: TrustedReferentialContext,
  input: TrustedReferentialInput,
  strict: boolean
): Promise<ExhibitorOutcome> {
  const exhibitorId = (input.exhibitorId ?? "").trim();

  if (exhibitorId) {
    const row = await db.exhibitor.findUnique({ where: { id: exhibitorId }, select: EXHIBITOR_SELECT });
    const valid =
      !!row && row.isActive && row.organizationId === ctx.organizationId && row.eventId === ctx.eventId;
    if (valid) return { ok: true, exhibitor: toExhibitorInfo(row!) };
    if (strict) return exhibitorRefusal(row, ctx);
    // DISABLED : UUID invalide/étranger/inactif ignoré, on retente une résolution naturelle ci-dessous.
  }

  const externalReference = (input.exhibitorExternalReference ?? "").trim();
  const nameNormalized = normalizeExhibitorName(input.exhibitorName ?? null);

  if (!externalReference && !nameNormalized) {
    if (strict) {
      return {
        ok: false,
        status: 400,
        code: "EXHIBITOR_REQUIRED",
        message:
          "Exposant requis : fournissez une référence externe ou un nom exposant (aucun identifiant interne accepté depuis le client).",
      };
    }
    return resolveLegacyExhibitorFallback(db, ctx, input);
  }

  const where: Record<string, unknown> = {
    organizationId: ctx.organizationId,
    eventId: ctx.eventId,
    isActive: true,
    ...(externalReference ? { externalReference } : { nameNormalized }),
  };
  const rows = await db.exhibitor.findMany({ where, select: EXHIBITOR_SELECT });

  if (rows.length === 0) {
    if (strict) {
      return { ok: false, status: 409, code: "EXHIBITOR_NOT_FOUND", message: EXHIBITOR_UNIFORM_MESSAGE };
    }
    return resolveLegacyExhibitorFallback(db, ctx, input);
  }
  if (rows.length > 1) {
    if (strict) {
      return {
        ok: false,
        status: 409,
        code: "EXHIBITOR_AMBIGUOUS",
        message: `Plusieurs exposants (${rows.length}) correspondent au critère fourni. Précisez une référence externe unique.`,
      };
    }
    // DISABLED : ambiguïté non bloquante — jamais de choix arbitraire.
    return { ok: true, exhibitor: null };
  }

  return { ok: true, exhibitor: toExhibitorInfo(rows[0]!) };
}

/** Symétrique de `resolveLegacyExhibitorFallback`, pour l'emplacement (DISABLED). */
async function resolveLegacyLocationFallback(
  db: AccreditationReferentialDb,
  exhibitor: ResolvedExhibitorInfo,
  input: TrustedReferentialInput
): Promise<LocationOutcome> {
  const legacyId = (input.legacyExhibitorLocationId ?? "").trim();
  if (legacyId) {
    const row = await db.exhibitorLocation.findUnique({ where: { id: legacyId }, select: LOCATION_SELECT });
    if (row && row.isActive && row.exhibitorId === exhibitor.id) {
      return { ok: true, location: toLocationInfo(row) };
    }
  }
  return { ok: true, location: null };
}

function locationRefusal(row: TrustedLocationRow | null, exhibitorId: string): TrustedReferentialFailure {
  if (row && row.isActive && row.exhibitorId !== exhibitorId) {
    return { ok: false, status: 409, code: "LOCATION_EXHIBITOR_MISMATCH", message: LOCATION_UNIFORM_MESSAGE };
  }
  return { ok: false, status: 409, code: "LOCATION_NOT_FOUND", message: LOCATION_UNIFORM_MESSAGE };
}

/**
 * Résout l'emplacement STRICTEMENT sous l'exposant déjà résolu (jamais un
 * emplacement d'un tiers). `strict=true` rend l'emplacement obligatoire et
 * toute incohérence bloquante ; `strict=false` (DISABLED) autorise un
 * résultat nul (repli best-effort).
 */
async function resolveLocation(
  db: AccreditationReferentialDb,
  exhibitor: ResolvedExhibitorInfo,
  input: TrustedReferentialInput,
  strict: boolean
): Promise<LocationOutcome> {
  const exhibitorLocationId = (input.exhibitorLocationId ?? "").trim();

  if (exhibitorLocationId) {
    const row = await db.exhibitorLocation.findUnique({
      where: { id: exhibitorLocationId },
      select: LOCATION_SELECT,
    });
    const valid = !!row && row.isActive && row.exhibitorId === exhibitor.id;
    if (valid) return { ok: true, location: toLocationInfo(row!) };
    if (strict) return locationRefusal(row, exhibitor.id);
    // DISABLED : identifiant invalide/étranger ignoré, on retente ci-dessous.
  }

  const locationCodeInput = (input.locationCode ?? "").trim();
  const normalized = locationCodeInput ? normalizeLocationCode(locationCodeInput) : null;

  if (!locationCodeInput || !normalized) {
    if (strict) {
      return {
        ok: false,
        status: 400,
        code: "LOCATION_REQUIRED",
        message: "Emplacement requis : fournissez un code d'emplacement valide.",
      };
    }
    return resolveLegacyLocationFallback(db, exhibitor, input);
  }

  const where: Record<string, unknown> = {
    exhibitorId: exhibitor.id,
    codeNormalized: normalized.codeNormalized,
    isActive: true,
    ...(input.locationType ? { type: input.locationType } : {}),
  };
  const rows = await db.exhibitorLocation.findMany({ where, select: LOCATION_SELECT });

  if (rows.length === 0) {
    if (strict) {
      return { ok: false, status: 409, code: "LOCATION_NOT_FOUND", message: LOCATION_UNIFORM_MESSAGE };
    }
    return resolveLegacyLocationFallback(db, exhibitor, input);
  }
  if (rows.length > 1) {
    if (strict) {
      return {
        ok: false,
        status: 409,
        code: "LOCATION_AMBIGUOUS",
        message: `Plusieurs emplacements (${rows.length}) correspondent au critère fourni. Précisez le type (TERRE / FLOT / STAND).`,
      };
    }
    return { ok: true, location: null };
  }

  const row = rows[0]!;
  // Garde défensive : le `where` ci-dessus scope déjà `exhibitorId`, mais on
  // ne fait jamais confiance implicitement à une seule condition Prisma.
  if (row.exhibitorId !== exhibitor.id) {
    if (strict) return locationRefusal(row, exhibitor.id);
    return { ok: true, location: null };
  }

  return { ok: true, location: toLocationInfo(row) };
}

function buildSnapshot(
  exhibitorName: string,
  location: ResolvedLocationInfo | null
): ResolvedReferentialSnapshot {
  return {
    exhibitorName,
    locationType: location?.type ?? null,
    locationCode: location?.code ?? null,
    portCode: location?.portCode ?? null,
    sectorCode: location?.sectorCode ?? null,
    logisticSpace: location?.logisticSpace ?? null,
  };
}

/**
 * Résout de façon fiable le référentiel exposant/emplacement d'une future
 * accréditation, pour les quatre canaux de création. Lecture SEULE.
 *
 * Politique par mode (voir en-tête du fichier) :
 *  - `DISABLED`  : best-effort, jamais bloquant, résultat `referential: null`
 *    possible (ou repli sur un snapshot historique serveur, FK nulles) ;
 *  - `TRANSITION`/`STRICT` : exposant ET emplacement obligatoires, toute
 *    incohérence (UUID étranger/inactif, ambiguïté, absence) est une erreur
 *    contrôlée 400/409 ; toute erreur DB devient un 503 uniforme, sans fuite
 *    d'objet Prisma ni de stack trace.
 */
export async function resolveTrustedAccreditationReferential(
  db: AccreditationReferentialDb,
  ctx: TrustedReferentialContext,
  input: TrustedReferentialInput
): Promise<TrustedReferentialResult> {
  try {
    const strict = ctx.logisticsPlanningMode !== "DISABLED";

    const exhibitorOutcome = await resolveExhibitor(db, ctx, input, strict);
    if (!exhibitorOutcome.ok) return exhibitorOutcome;

    const exhibitor = exhibitorOutcome.exhibitor;
    if (!exhibitor) {
      // DISABLED uniquement (strict=true aurait déjà retourné une erreur).
      if (input.legacyLocationSnapshot || input.legacyLocationLabel) {
        return {
          ok: true,
          referential: {
            exhibitorId: null,
            exhibitorLocationId: null,
            locationLabel: input.legacyLocationLabel ?? null,
            locationSnapshot: input.legacyLocationSnapshot ?? null,
          },
          exhibitor: null,
          location: null,
        };
      }
      return { ok: true, referential: null, exhibitor: null, location: null };
    }

    const locationOutcome = await resolveLocation(db, exhibitor, input, strict);
    if (!locationOutcome.ok) return locationOutcome;

    const location = locationOutcome.location;
    return {
      ok: true,
      referential: {
        exhibitorId: exhibitor.id,
        exhibitorLocationId: location?.id ?? null,
        locationLabel: location?.code ?? null,
        locationSnapshot: buildSnapshot(exhibitor.name, location),
      },
      exhibitor,
      location,
    };
  } catch {
    // Jamais de fuite d'objet Prisma / stack trace : message uniforme.
    return {
      ok: false,
      status: 503,
      code: "REFERENTIAL_VALIDATION_UNAVAILABLE",
      message: "Service de validation du référentiel temporairement indisponible.",
    };
  }
}
