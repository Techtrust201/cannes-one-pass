/**
 * Resolution referentiel exposant / emplacement pour l'import d'accreditations
 * (Phase 4B-1). Service de LECTURE SEULE : aucune ecriture, aucune resolution
 * d'UUID fournie par le fichier.
 *
 * Principe de securite : le fichier ne transmet JAMAIS d'`exhibitorId` /
 * `exhibitorLocationId`. On resout cote serveur, dans le contexte
 * organisation + evenement deja valide, a partir de criteres naturels :
 *  - exposant : `externalReference` (prioritaire) sinon `nameNormalized` ;
 *  - emplacement : `codeNormalized` (+ `type` optionnel) DANS les locations de
 *    l'exposant resolu uniquement.
 *
 * Toute ambiguite est une erreur explicite : on ne choisit JAMAIS le premier
 * resultat arbitrairement. Le resultat fournit `exhibitorId`,
 * `exhibitorLocationId`, `locationLabel` et un `locationSnapshot` coherent,
 * injectes ensuite dans le moteur via `context.referential` (Phase 4A).
 */

import { normalizeExhibitorName, normalizeLocationCode } from "./normalization";
import type { LocationTypeCode } from "./referential";

export type ReferentialResolutionErrorCode =
  | "EXHIBITOR_NOT_FOUND"
  | "EXHIBITOR_AMBIGUOUS"
  | "LOCATION_NOT_FOUND"
  | "LOCATION_AMBIGUOUS"
  | "LOCATION_EXHIBITOR_MISMATCH";

export interface ResolverExhibitorRow {
  id: string;
  name: string;
  nameNormalized: string | null;
  externalReference: string | null;
  organizationId: string;
  eventId: string;
}

export interface ResolverLocationRow {
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

/**
 * Delegates Prisma minimaux (satisfaits par un vrai `PrismaClient`, une
 * transaction, ou un mock de test). On utilise `findMany` pour DETECTER
 * l'ambiguite (>1 resultat) plutot que de masquer un doublon avec `findFirst`.
 */
export interface ReferentialResolverDb {
  exhibitor: {
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<ResolverExhibitorRow[]>;
  };
  exhibitorLocation: {
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<ResolverLocationRow[]>;
  };
}

export interface ReferentialResolverContext {
  organizationId: string;
  eventId: string;
}

export interface ReferentialResolverInput {
  externalReference?: string | null;
  name?: string | null;
  locationCode?: string | null;
  locationType?: LocationTypeCode | null;
}

export interface LocationSnapshot {
  exhibitorName: string;
  locationType: LocationTypeCode | null;
  locationCode: string | null;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
}

export interface ReferentialResolutionSuccess {
  ok: true;
  exhibitorId: string;
  exhibitorLocationId: string | null;
  locationLabel: string | null;
  locationSnapshot: LocationSnapshot;
}

export interface ReferentialResolutionFailure {
  ok: false;
  code: ReferentialResolutionErrorCode;
  message: string;
}

export type ReferentialResolution =
  | ReferentialResolutionSuccess
  | ReferentialResolutionFailure;

const EXHIBITOR_SELECT = {
  id: true,
  name: true,
  nameNormalized: true,
  externalReference: true,
  organizationId: true,
  eventId: true,
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

/**
 * Resout exposant + emplacement dans le contexte org/event. Lecture seule.
 * Ne lit AUCUN identifiant depuis l'appelant : uniquement des criteres
 * naturels (reference externe, nom, code d'emplacement, type).
 */
export async function resolveReferential(
  db: ReferentialResolverDb,
  ctx: ReferentialResolverContext,
  input: ReferentialResolverInput
): Promise<ReferentialResolution> {
  const externalReference = (input.externalReference ?? "").trim();
  const nameNormalized = normalizeExhibitorName(input.name ?? null);

  if (!externalReference && !nameNormalized) {
    return {
      ok: false,
      code: "EXHIBITOR_NOT_FOUND",
      message:
        "Aucun critere exposant : renseignez une reference externe ou un nom exposant (aucun identifiant interne accepte depuis le fichier).",
    };
  }

  // Scoping systematique : organisation + evenement + actif. Deux exposants
  // homonymes dans deux org/events distincts ne peuvent jamais etre confondus.
  const exhibitorWhere: Record<string, unknown> = {
    organizationId: ctx.organizationId,
    eventId: ctx.eventId,
    isActive: true,
  };
  if (externalReference) {
    exhibitorWhere.externalReference = externalReference;
  } else {
    exhibitorWhere.nameNormalized = nameNormalized;
  }

  const exhibitors = await db.exhibitor.findMany({
    where: exhibitorWhere,
    select: EXHIBITOR_SELECT,
  });

  if (exhibitors.length === 0) {
    return {
      ok: false,
      code: "EXHIBITOR_NOT_FOUND",
      message: externalReference
        ? `Exposant introuvable pour la reference externe "${externalReference}" dans ce contexte organisation/evenement.`
        : `Exposant introuvable pour le nom "${input.name}" dans ce contexte organisation/evenement.`,
    };
  }
  if (exhibitors.length > 1) {
    return {
      ok: false,
      code: "EXHIBITOR_AMBIGUOUS",
      message: `Plusieurs exposants (${exhibitors.length}) correspondent au critere fourni. Precisez une reference externe unique.`,
    };
  }

  const exhibitor = exhibitors[0]!;
  const snapshot: LocationSnapshot = {
    exhibitorName: exhibitor.name,
    locationType: null,
    locationCode: null,
    portCode: null,
    sectorCode: null,
    logisticSpace: null,
  };

  const locationCodeInput = (input.locationCode ?? "").trim();
  if (!locationCodeInput) {
    // Pas d'emplacement demande (autorise pour Palais) : exposant seul.
    return {
      ok: true,
      exhibitorId: exhibitor.id,
      exhibitorLocationId: null,
      locationLabel: null,
      locationSnapshot: snapshot,
    };
  }

  const normalizedCode = normalizeLocationCode(locationCodeInput);
  if (!normalizedCode) {
    return {
      ok: false,
      code: "LOCATION_NOT_FOUND",
      message: `Code d'emplacement invalide ("${locationCodeInput}").`,
    };
  }

  const locationWhere: Record<string, unknown> = {
    exhibitorId: exhibitor.id,
    codeNormalized: normalizedCode.codeNormalized,
    isActive: true,
  };
  if (input.locationType) {
    locationWhere.type = input.locationType;
  }

  const locations = await db.exhibitorLocation.findMany({
    where: locationWhere,
    select: LOCATION_SELECT,
  });

  if (locations.length === 0) {
    return {
      ok: false,
      code: "LOCATION_NOT_FOUND",
      message: `Emplacement "${locationCodeInput}" introuvable parmi les emplacements de l'exposant "${exhibitor.name}".`,
    };
  }
  if (locations.length > 1) {
    return {
      ok: false,
      code: "LOCATION_AMBIGUOUS",
      message: `Plusieurs emplacements (${locations.length}) correspondent a "${locationCodeInput}" pour cet exposant. Precisez le type (TERRE / FLOT / STAND).`,
    };
  }

  const location = locations[0]!;
  // Garde defensive : l'emplacement doit appartenir EXACTEMENT a l'exposant
  // resolu (jamais rattacher l'accreditation a la location d'un tiers).
  if (location.exhibitorId !== exhibitor.id) {
    return {
      ok: false,
      code: "LOCATION_EXHIBITOR_MISMATCH",
      message: `L'emplacement "${locationCodeInput}" n'appartient pas a l'exposant resolu.`,
    };
  }

  return {
    ok: true,
    exhibitorId: exhibitor.id,
    exhibitorLocationId: location.id,
    locationLabel: location.code,
    locationSnapshot: {
      exhibitorName: exhibitor.name,
      locationType: location.type,
      locationCode: location.code,
      portCode: location.portCode,
      sectorCode: location.sectorCode,
      logisticSpace: location.logisticSpace,
    },
  };
}
