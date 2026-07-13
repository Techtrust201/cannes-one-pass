/**
 * Moteur unique de création d'accréditation — partagé par le formulaire
 * public, le back-office, la duplication et (Phase 4) l'import CSV.
 *
 * Extrait du POST historique de `src/app/api/accreditations/route.ts` sans
 * changement de comportement fonctionnel, à l'exception d'un renforcement :
 * la résolution du Stand et l'écriture d'historique de création rejoignent
 * désormais la même transaction que la création Accreditation/Vehicle
 * (auparavant des écritures Prisma séparées, non atomiques entre elles).
 *
 * Séparation stricte :
 *  - `previewAccreditation` : validations + résolutions en lecture (Zod,
 *    organisation/événement, catégorie, zone/famille véhicule, quota
 *    candidates). Aucune écriture DB.
 *  - `createAccreditationInTransaction` : écritures DANS une transaction
 *    (Stand, verrouillage quota, Accreditation, Vehicle, historique).
 *  - `createAccreditation` : ouvre sa propre transaction, l'exécute, puis
 *    déclenche les effets APRÈS commit (e-mails). Aucun e-mail dans la
 *    transaction.
 */
import { randomBytes } from "crypto";
import type { ActorSource, EmplacementCategory } from "@prisma/client";
import prisma from "@/lib/prisma";
import { writeHistoryDirect } from "@/lib/history-server";
import { createCreatedEntry, createDuplicatedEntry, type HistoryEntryData } from "@/lib/history";
import { getTemplate } from "@/templates/accreditation/registry";
import { suggestZone, buildRxZoneRouting, type RxZoneRouting } from "@/lib/rx-zone-rules";
import {
  resolveVehicleFamilyFromConfig,
  resolveVehicleFamilyFromText,
  type VehicleFamily,
} from "@/lib/vehicle-family";
import type { RxCapacityDb } from "@/lib/rx-capacity-service";
import {
  buildCapacityQuotaCandidates,
  enforceCapacityQuotas,
  CapacityQuotaError,
  type QuotaCandidate,
  type CandidateVehicleInput,
} from "@/lib/capacity-quota-guard";
import { normalizePlate } from "@/lib/plate-utils";
import { isValidEmail } from "@/lib/email-sender";
import { deriveCategory, CSV_TO_ENUM } from "@/lib/category-rules";
import { inferActorSource } from "@/lib/accreditation-audit";
import {
  sendAccreditationCreationEmail,
  type CreationEmailOutcome,
} from "@/lib/accreditation-creation-email";

export { CapacityQuotaError };

/** Client Prisma utilisable en dehors ou dans une transaction interactive. */
export type AccreditationDb = RxCapacityDb;

interface AccreditationServiceContextBase {
  currentUserId?: string;
  currentUserRole?: "SUPER_ADMIN" | "ADMIN" | "USER";
  /**
   * Phase 4A : id de l'accréditation source quand la création provient d'une
   * duplication. Renseigné UNIQUEMENT par l'appelant serveur (jamais depuis
   * le payload client) — trace la provenance dans l'historique de création
   * sans créer de nouvelle table (réutilise `changeReason`/`diff`).
   */
  duplicateSourceAccreditationId?: string;
  /**
   * Phase 4A : références référentiel à figer sur la nouvelle accréditation.
   * Renseigné UNIQUEMENT par l'appelant serveur à partir d'une source déjà
   * contrôlée en accès (ex: accréditation parente d'une duplication, ou
   * résolution référentiel d'un import) — jamais lu depuis le payload client
   * `command`, pour éviter qu'un client injecte un
   * `exhibitorId`/`exhibitorLocationId` arbitraire.
   */
  referential?: {
    exhibitorId?: string | null;
    exhibitorLocationId?: string | null;
    locationLabel?: string | null;
    locationSnapshot?: unknown;
  };
}

/** Contexte standard (formulaire public, back-office, duplication) — comportement inchangé. */
interface AccreditationServiceContextStandard extends AccreditationServiceContextBase {
  channel?: undefined;
  importMode?: undefined;
}

/**
 * Phase 4B-2 : contexte d'import CSV/XLSX. `channel` + `importMode` pilotent
 * EXCLUSIVEMENT la politique de création (statut + `actorSource`) — jamais
 * de champ générique `statusOverride`/`actorSourceOverride` qui laisserait
 * un appelant imposer une valeur arbitraire. La politique reste déduite par
 * le moteur lui-même (voir `resolveCreationPolicy`) :
 *  - `importMode: "PENDING"`   → status NOUVEAU   + actorSource CSV_IMPORT ;
 *  - `importMode: "VALIDATED"` → status ATTENTE   + actorSource CSV_IMPORT.
 */
interface AccreditationServiceContextCsvImport extends AccreditationServiceContextBase {
  channel: "CSV_IMPORT";
  importMode: "PENDING" | "VALIDATED";
}

/**
 * Union discriminée sûre : un appelant ne peut PAS fournir `importMode` sans
 * `channel: "CSV_IMPORT"` (et inversement) au niveau du typage. Une
 * validation défensive au runtime (`validateCreationContext`) couvre en plus
 * les appelants non typés (JSON désérialisé, etc.) — voir `INVALID_CREATION_CONTEXT`.
 */
export type AccreditationServiceContext =
  | AccreditationServiceContextStandard
  | AccreditationServiceContextCsvImport;

/** Payload brut — mêmes champs que le body historique de POST /api/accreditations. */
export type AccreditationCommand = Record<string, unknown>;

type CategorySource =
  | "PUBLIC_FORM"
  | "LOGISTICIEN"
  | "SUPER_ADMIN"
  | "AUTO_DEDUCTION"
  | "CSV_IMPORT";

export interface AccreditationServiceError {
  ok: false;
  status: 400 | 409;
  error: string;
  code?: string;
  details?: unknown;
}

export interface AccreditationServiceSuccess {
  ok: true;
  status: 201;
  body: Record<string, unknown>;
}

export type AccreditationServiceResult =
  | AccreditationServiceError
  | AccreditationServiceSuccess;

/** Résultat de `previewAccreditation` : plan prêt pour l'écriture, ou erreur de validation. */
type PreviewSuccess = {
  ok: true;
  organizationId: string | null;
  eventId: string | null;
  event: string;
  company: string;
  stand: string;
  unloading: string;
  message: string | undefined;
  consent: boolean | undefined;
  language: string | undefined;
  recipientEmail: string;
  extensionPayload: Record<string, unknown> | null;
  category: EmplacementCategory | null;
  categorySource: CategorySource | null;
  currentZone: string | null;
  status: "NOUVEAU" | "ATTENTE";
  actorSource: ActorSource;
  vehiclesArr: Array<Record<string, unknown>>;
  splitPerVehicle: boolean;
  quotaCandidates: QuotaCandidate[];
  standSectorHint: string | null;
  resolveVehicleZone: (v: Record<string, unknown>) => string | null;
  // Phase 4A : figés depuis `context` (jamais depuis le payload client).
  exhibitorId: string | null;
  exhibitorLocationId: string | null;
  locationLabel: string | null;
  locationSnapshot: unknown;
  duplicateSourceAccreditationId: string | undefined;
};

type PreviewFailure = AccreditationServiceError & { ok: false };

export type PreviewAccreditationResult = PreviewSuccess | PreviewFailure;

function buildVehicleCreate(v: Record<string, unknown>) {
  return {
    // `plate` est nullable côté DB (workflow RX : plaque saisie au scan).
    plate: (v.plate as string | null | undefined) ?? null,
    size: (v.size as string) ?? "",
    phoneCode: v.phoneCode as string,
    phoneNumber: v.phoneNumber as string,
    date: v.date as string,
    time: (v.time as string) ?? "",
    city: (v.city as string) ?? "",
    unloading: JSON.stringify(v.unloading),
    kms: (v.kms as string) ?? "",
    vehicleType: (v.vehicleType as string) ?? null,
    country:
      (v.country as
        | "FRANCE"
        | "ESPAGNE"
        | "ITALIE"
        | "ALLEMAGNE"
        | "BELGIQUE"
        | "SUISSE"
        | "ROYAUME_UNI"
        | "PAYS_BAS"
        | "PORTUGAL"
        | "AUTRE") ?? null,
    estimatedKms: v.estimatedKms != null ? Number(v.estimatedKms) : 0,
    trailerPlate: (v.trailerPlate as string) ?? null,
    plateNormalized: normalizePlate(v.plate as string | null | undefined),
    trailerPlateNormalized: normalizePlate(v.trailerPlate as string | null | undefined),
    emptyWeight: v.emptyWeight != null ? Number(v.emptyWeight) : null,
    maxWeight: v.maxWeight != null ? Number(v.maxWeight) : null,
    currentWeight: v.currentWeight != null ? Number(v.currentWeight) : null,
  };
}

function genPublicToken(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Entrée d'historique de création : trace explicitement la provenance d'une
 * duplication (id source, `changeReason`, `diff.channel`) plutôt qu'une
 * simple "Accréditation créée" générique. Réutilise l'action `CREATED`
 * existante et les colonnes `changeReason`/`diff` déjà présentes sur
 * `AccreditationHistory` — aucune nouvelle table, aucune migration.
 */
function buildCreatedHistoryEntry(
  accreditationId: string,
  actorSource: ActorSource,
  currentUserId: string | undefined,
  duplicateSourceAccreditationId: string | undefined
): HistoryEntryData {
  if (duplicateSourceAccreditationId) {
    return createDuplicatedEntry(accreditationId, duplicateSourceAccreditationId, currentUserId, actorSource);
  }
  return createCreatedEntry(accreditationId, currentUserId, actorSource);
}

/**
 * Validation défensive du contexte de création, AU RUNTIME — en complément
 * du typage (utile pour tout appelant non strictement typé, ex: valeurs
 * désérialisées). Un contexte incohérent est une erreur contrôlée
 * `INVALID_CREATION_CONTEXT`, jamais une résolution silencieuse par défaut.
 */
function validateCreationContext(
  context: AccreditationServiceContext
): AccreditationServiceError | null {
  const channel = (context as { channel?: unknown }).channel;
  const importMode = (context as { importMode?: unknown }).importMode;

  // Contexte standard : ni channel ni importMode.
  if (channel === undefined && importMode === undefined) return null;

  if (channel !== "CSV_IMPORT") {
    return {
      ok: false,
      status: 400,
      error: `Contexte de création invalide : channel "${String(channel)}" non reconnu (attendu "CSV_IMPORT" ou absent).`,
      code: "INVALID_CREATION_CONTEXT",
    };
  }
  if (importMode !== "PENDING" && importMode !== "VALIDATED") {
    return {
      ok: false,
      status: 400,
      error: `Contexte de création invalide : importMode manquant ou non reconnu pour channel "CSV_IMPORT" (attendu "PENDING" ou "VALIDATED").`,
      code: "INVALID_CREATION_CONTEXT",
    };
  }
  return null;
}

/**
 * Déduit la politique de création (statut + actorSource) EXCLUSIVEMENT
 * depuis le contexte serveur — jamais depuis le payload client `command`.
 *  - Contexte CSV_IMPORT : actorSource = CSV_IMPORT, statut selon importMode.
 *  - Contexte standard (inchangé) : actorSource déduit de l'utilisateur
 *    connecté, statut ATTENTE pour une création interne, NOUVEAU sinon.
 */
function resolveCreationPolicy(
  context: AccreditationServiceContext
): { status: "NOUVEAU" | "ATTENTE"; actorSource: ActorSource } {
  if (context.channel === "CSV_IMPORT") {
    return {
      status: context.importMode === "VALIDATED" ? "ATTENTE" : "NOUVEAU",
      actorSource: "CSV_IMPORT",
    };
  }
  const actorSource = inferActorSource(context.currentUserId, context.currentUserRole);
  const isInternalCreation = actorSource === "LOGISTICIEN" || actorSource === "SUPER_ADMIN";
  return { status: isInternalCreation ? "ATTENTE" : "NOUVEAU", actorSource };
}

/**
 * Validations + résolutions en lecture, sans écriture DB : template/Zod,
 * organisation/événement, catégorie, zone/famille véhicule, quota candidates.
 */
export async function previewAccreditation(
  command: AccreditationCommand,
  context: AccreditationServiceContext
): Promise<PreviewAccreditationResult> {
  const contextError = validateCreationContext(context);
  if (contextError) return contextError;

  const { referential, duplicateSourceAccreditationId } = context;
  const raw = command;
  const { company, stand, unloading, event, message, consent, vehicles, language } = raw;

  // Détermination du template via `organizationSlug` (optionnel pour les
  // anciens payloads Palais sans slug → fallback "palais").
  const organizationSlug = (raw.organizationSlug as string | undefined)?.toLowerCase() ?? "palais";
  const template = getTemplate(organizationSlug);

  // Validation Zod différenciée par template (plaque obligatoire pour
  // Palais, optionnelle pour RX, etc.). Fallback legacy réservé au Palais.
  const zodResult = template.schema.safeParse({ ...raw, organizationSlug });
  if (!zodResult.success) {
    const legacyPalaisOk =
      organizationSlug === "palais" &&
      company &&
      stand &&
      unloading &&
      event &&
      Array.isArray(vehicles) &&
      vehicles.length > 0 &&
      !vehicles.some(
        (v) =>
          !v.plate || !v.size || !v.phoneCode || !v.phoneNumber || !v.date || !v.city || !v.unloading
      );

    if (!legacyPalaisOk) {
      return {
        ok: false,
        status: 400,
        error: zodResult.error.issues[0]?.message ?? "Payload invalide",
        details: zodResult.error.issues,
      };
    }
  }
  const currentZone = (raw.currentZone as string | null | undefined) ?? null;

  // Résolution de l'organisation cible (voir historique route.ts pour le
  // détail de l'ordre de résolution : slug exact → formTemplate → event).
  let organizationId: string | null = null;
  let orgRecord = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true, isActive: true },
  });
  if (!orgRecord || !orgRecord.isActive) {
    orgRecord = await prisma.organization.findFirst({
      where: { formTemplate: organizationSlug, isActive: true },
      select: { id: true, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  }
  if (orgRecord && orgRecord.isActive) {
    organizationId = orgRecord.id;
  }

  const eventRecord = await prisma.event.findUnique({ where: { slug: event as string } });
  if (eventRecord && organizationId) {
    const { assertEventBelongsToOrg } = await import("@/lib/auth-helpers");
    // Parité HTTP stricte avec le comportement historique : `assertEventBelongsToOrg`
    // lève une `Response` texte 400 ("Event inconnu" ou "L'event ne correspond pas
    // à l'organisation cible"). On la laisse remonter telle quelle (statut,
    // content-type et body préservés) ; l'adaptateur route la retourne sans la
    // transformer. Ne PAS fusionner les deux cas ni les convertir en JSON générique.
    await assertEventBelongsToOrg(eventRecord.id, organizationId);
  }
  if (!organizationId && eventRecord?.organizationId) {
    organizationId = eventRecord.organizationId;
  }

  // Politique de création (statut + actorSource) déduite EXCLUSIVEMENT du
  // contexte serveur — jamais depuis `raw.status`/`raw.actorSource`, même si
  // ces propriétés sont présentes dans le payload brut du client (ignorées).
  const { status, actorSource } = resolveCreationPolicy(context);

  // Catégorie : fournie explicitement (override manuel) ou déduite
  // automatiquement depuis stand + zone. `categorySource` reflète la même
  // origine que `actorSource` (CSV_IMPORT inclus) — jamais forcé à
  // LOGISTICIEN pour un import CSV.
  let category: EmplacementCategory | null = null;
  let categorySource: CategorySource | null = null;
  const rawCategory = (raw.category as string | undefined)?.trim().toLowerCase();
  if (rawCategory && CSV_TO_ENUM[rawCategory]) {
    category = CSV_TO_ENUM[rawCategory];
    categorySource =
      actorSource === "CSV_IMPORT" ||
      actorSource === "PUBLIC_FORM" ||
      actorSource === "LOGISTICIEN" ||
      actorSource === "SUPER_ADMIN"
        ? actorSource
        : "LOGISTICIEN";
  } else {
    const derived = deriveCategory({ stand: stand as string | null, zone: currentZone });
    if (derived) {
      category = derived;
      categorySource = "AUTO_DEDUCTION";
    }
  }

  const extensionPayload =
    raw.extension && typeof raw.extension === "object"
      ? (raw.extension as Record<string, unknown>)
      : null;

  // Destinataire de l'e-mail de création : e-mail racine (Palais) ou contact
  // RX (extension.contact.email). Null si absent → validation ci-dessous.
  const contactObj =
    extensionPayload && typeof extensionPayload.contact === "object"
      ? (extensionPayload.contact as Record<string, unknown>)
      : null;
  const recipientEmailCandidate: string | null =
    typeof raw.email === "string" && raw.email.trim()
      ? raw.email.trim()
      : contactObj && typeof contactObj.email === "string" && (contactObj.email as string).trim()
        ? (contactObj.email as string).trim()
        : null;

  // Garde-fou : l'e-mail destinataire est OBLIGATOIRE avant création — il
  // conditionne l'envoi automatique (récap + QR). On bloque *avant* toute
  // création pour ne jamais produire une accréditation non « envoyable ».
  if (!isValidEmail(recipientEmailCandidate)) {
    return {
      ok: false,
      status: 400,
      error:
        "E-mail du destinataire requis et valide pour créer l'accréditation (envoi du récapitulatif et du QR code).",
    };
  }
  const recipientEmail = recipientEmailCandidate as string;

  const vehiclesArr = vehicles as Array<Record<string, unknown>>;
  const splitPerVehicle = raw.splitPerVehicle === true && vehiclesArr.length > 0;

  // ── Résolution générique zone / famille véhicule (toutes organisations) ─
  const exhibitorSector =
    extensionPayload && typeof extensionPayload.exhibitor === "object"
      ? String((extensionPayload.exhibitor as Record<string, unknown>).sector ?? "")
      : "";
  let rxPalmBeachCodes: Set<string> = new Set();
  let rxZoneRouting: Map<string, RxZoneRouting> | undefined;
  let vtFamilyMap: Map<string, VehicleFamily> = new Map();
  let hasRxZoneConfig = false;
  if (organizationId && vehiclesArr.length > 0) {
    const vtConfigs = await prisma.vehicleTypeConfig.findMany({
      where: { organizationId, isActive: true },
      select: {
        code: true,
        pdfCode: true,
        vehicleFamily: true,
        rxPalmBeachAtCanto: true,
        rxZoneCanto: true,
        rxZoneVieuxPort: true,
      },
    });
    hasRxZoneConfig = vtConfigs.some(
      (c) => c.rxPalmBeachAtCanto || c.rxZoneCanto || c.rxZoneVieuxPort
    );
    rxPalmBeachCodes = new Set(
      vtConfigs.filter((c) => c.rxPalmBeachAtCanto).map((c) => c.code.toUpperCase())
    );
    rxZoneRouting = buildRxZoneRouting(vtConfigs);
    vtFamilyMap = new Map(
      vtConfigs.map((c) => [
        c.code.toUpperCase(),
        resolveVehicleFamilyFromConfig({
          pdfCode: c.pdfCode as "A" | "B" | "C" | "D",
          vehicleFamily: c.vehicleFamily ?? null,
        }) ?? resolveVehicleFamilyFromText(c.code),
      ])
    );
  }
  const resolveZoneForType = (vehicleTypeCode: string): string | null => {
    if (hasRxZoneConfig && exhibitorSector) {
      return suggestZone(vehicleTypeCode ?? "", exhibitorSector, rxPalmBeachCodes, rxZoneRouting);
    }
    return (
      currentZone ?? (extensionPayload?.suggestedZone as string | undefined) ?? null
    );
  };
  const resolveVehicleZone = (v: Record<string, unknown>): string | null =>
    resolveZoneForType((v.vehicleType as string) ?? "");
  const resolveVehicleFamily = (vehicleTypeCode: string): VehicleFamily => {
    const key = (vehicleTypeCode ?? "").trim().toUpperCase();
    return vtFamilyMap.get(key) ?? resolveVehicleFamilyFromText(vehicleTypeCode);
  };

  // ── Quotas de capacité : construction des candidates (toutes orgs) ─────
  const quotaCandidates: QuotaCandidate[] =
    organizationId && eventRecord?.id
      ? buildCapacityQuotaCandidates({
          organizationId,
          eventId: eventRecord.id,
          vehicles: vehiclesArr as CandidateVehicleInput[],
          resolveZone: resolveZoneForType,
          resolveFamily: resolveVehicleFamily,
        })
      : [];

  const standSectorHint =
    extensionPayload && typeof extensionPayload.exhibitor === "object"
      ? ((extensionPayload.exhibitor as Record<string, unknown>).sector as string | undefined) ??
        null
      : null;

  return {
    ok: true,
    organizationId,
    eventId: eventRecord?.id ?? null,
    event: event as string,
    company: company as string,
    stand: stand as string,
    unloading: unloading as string,
    message: message as string | undefined,
    consent: consent as boolean | undefined,
    language: language as string | undefined,
    recipientEmail,
    extensionPayload,
    category,
    categorySource,
    currentZone,
    status,
    actorSource,
    vehiclesArr,
    splitPerVehicle,
    quotaCandidates,
    standSectorHint,
    resolveVehicleZone,
    exhibitorId: referential?.exhibitorId ?? null,
    exhibitorLocationId: referential?.exhibitorLocationId ?? null,
    locationLabel: referential?.locationLabel ?? null,
    locationSnapshot: referential?.locationSnapshot ?? null,
    duplicateSourceAccreditationId,
  };
}

export interface CreateAccreditationSplitResult {
  kind: "split";
  created: { id: string }[];
}
export interface CreateAccreditationSingleResult {
  kind: "single";
  accreditation: Record<string, unknown> & { id: string; vehicles: Record<string, unknown>[] };
}
export type CreateAccreditationResult =
  | CreateAccreditationSplitResult
  | CreateAccreditationSingleResult;

/**
 * Écritures DANS la transaction fournie : résolution Stand, verrouillage +
 * recheck quota, création Accreditation/Vehicle, historique de création.
 * Aucun e-mail ici.
 *
 * Amélioration volontaire d'atomicité vs l'ancien code : la résolution du Stand
 * n'est PLUS best-effort. Une erreur Prisma sur le Stand se propage et fait
 * rollbacker toute la transaction (aucune Accreditation/Vehicle/History
 * partielle, aucun e-mail post-commit). Auparavant, le Stand était résolu hors
 * transaction avec un try/catch qui absorbait l'erreur et pouvait laisser un
 * stand orphelin.
 */
export async function createAccreditationInTransaction(
  tx: AccreditationDb,
  plan: PreviewSuccess,
  context: AccreditationServiceContext
): Promise<CreateAccreditationResult> {
  const { currentUserId } = context;
  const {
    organizationId,
    eventId,
    event,
    company,
    stand,
    unloading,
    message,
    consent,
    language,
    recipientEmail,
    extensionPayload,
    category,
    categorySource,
    currentZone,
    status,
    actorSource,
    vehiclesArr,
    splitPerVehicle,
    quotaCandidates,
    standSectorHint,
    resolveVehicleZone,
    exhibitorId,
    exhibitorLocationId,
    locationLabel,
    locationSnapshot,
    duplicateSourceAccreditationId,
  } = plan;

  // Résolution du Stand : upsert par (organizationId, eventId, number=stand),
  // DANS la transaction. Toute erreur se propage et rollbacke l'ensemble
  // (atomicité stricte : pas de stand orphelin, pas d'accréditation partielle).
  let standId: string | null = null;
  if (organizationId && stand && String(stand).trim() !== "") {
    const existing = await tx.stand.findFirst({
      where: { organizationId, eventId, number: stand as string },
      select: { id: true },
    });
    if (existing) {
      standId = existing.id;
      if (standSectorHint) {
        await tx.stand.update({ where: { id: existing.id }, data: { sector: standSectorHint } });
      }
    } else {
      const created = await tx.stand.create({
        data: { organizationId, eventId, number: stand as string, sector: standSectorHint },
        select: { id: true },
      });
      standId = created.id;
    }
  }

  if (quotaCandidates.length > 0) {
    await enforceCapacityQuotas(tx, quotaCandidates);
  }

  const zoneMovementCreate = currentZone
    ? { zoneMovements: { create: { toZone: currentZone, action: "ENTRY" as const } } }
    : {};

  if (splitPerVehicle) {
    const createdList: { id: string }[] = [];
    for (const v of vehiclesArr) {
      const c = await tx.accreditation.create({
        data: {
          company,
          stand,
          unloading,
          event,
          publicToken: genPublicToken(),
          eventId,
          organizationId,
          standId,
          extension: {
            ...(extensionPayload ?? {}),
            suggestedZone: resolveVehicleZone(v),
            vehicleContext: {
              categoryId: (v.categoryId as string) ?? null,
              livDate: (v.date as string) ?? null,
              livTime: (v.time as string) ?? null,
              repDate: (v.repDate as string) ?? null,
              repTime: (v.repTime as string) ?? null,
              repSameAsDelivery: v.repSameAsDelivery !== false,
              repPlate: (v.repPlate as string | null | undefined) ?? null,
              repVehicleType: (v.repVehicleType as string) ?? null,
              repPhoneCode: (v.repPhoneCode as string) ?? null,
              repPhoneNumber: (v.repPhoneNumber as string) ?? null,
              interveningCompany: (v.interveningCompany as string) ?? null,
              repInterveningCompany: (v.repInterveningCompany as string) ?? null,
              repCity: (v.repCity as string) ?? null,
              repCountry: (v.repCountry as string) ?? null,
              repEstimatedKms: v.repEstimatedKms != null ? Number(v.repEstimatedKms) : null,
            },
          },
          message: message ?? "",
          consent: consent ?? true,
          language: language ?? "fr",
          email: recipientEmail,
          status,
          currentZone,
          category,
          categorySource,
          exhibitorId,
          exhibitorLocationId,
          locationLabel,
          locationSnapshot: locationSnapshot === null ? undefined : (locationSnapshot as object),
          vehicles: { create: [buildVehicleCreate(v)] },
          ...zoneMovementCreate,
        },
        select: { id: true },
      });
      createdList.push(c);
      await writeHistoryDirect(
        buildCreatedHistoryEntry(c.id, actorSource, currentUserId, duplicateSourceAccreditationId),
        tx
      );
    }
    return { kind: "split", created: createdList };
  }

  const created = await tx.accreditation.create({
    data: {
      company,
      stand,
      unloading,
      event,
      publicToken: genPublicToken(),
      eventId,
      organizationId,
      standId,
      extension: extensionPayload === null ? undefined : (extensionPayload as object),
      message: message ?? "",
      consent: consent ?? true,
      language: language ?? "fr",
      email: recipientEmail,
      status,
      currentZone,
      category,
      categorySource,
      exhibitorId,
      exhibitorLocationId,
      locationLabel,
      locationSnapshot: locationSnapshot === null ? undefined : (locationSnapshot as object),
      vehicles: { create: vehiclesArr.map(buildVehicleCreate) },
      ...zoneMovementCreate,
    },
    include: { vehicles: true },
  });
  await writeHistoryDirect(
    buildCreatedHistoryEntry(created.id, actorSource, currentUserId, duplicateSourceAccreditationId),
    tx
  );

  return {
    kind: "single",
    accreditation: created as unknown as CreateAccreditationSingleResult["accreditation"],
  };
}

function deserializeVehicleUnloading(v: Record<string, unknown>) {
  const { unloading, ...rest } = v;
  return {
    ...rest,
    unloading: Array.isArray(unloading)
      ? unloading
      : typeof unloading === "string" && unloading.startsWith("[")
        ? (() => {
            try {
              return JSON.parse(unloading);
            } catch {
              return [unloading];
            }
          })()
        : unloading
          ? [unloading]
          : [],
  };
}

/**
 * Agrège plusieurs issues e-mail (contrat existant `CreationEmailOutcome` de
 * `sendAccreditationCreationEmail` — INCHANGÉ, jamais de valeur générique
 * "skipped") de façon déterministe, indépendante de l'ordre :
 *  1. "failed" si au moins un échec ;
 *  2. sinon "sent" si au moins un envoi réussi ;
 *  3. sinon "skipped_no_recipient" si TOUS les résultats sont
 *     "skipped_no_recipient" ;
 *  4. sinon "skipped_disabled" (mélange de skipped, ou tous
 *     "skipped_disabled").
 */
function aggregateEmailOutcomes(
  outcomes: CreationEmailOutcome[]
): CreationEmailOutcome {
  if (outcomes.some((o) => o === "failed")) return "failed";
  if (outcomes.some((o) => o === "sent")) return "sent";
  if (outcomes.every((o) => o === "skipped_no_recipient")) return "skipped_no_recipient";
  return "skipped_disabled";
}

/**
 * Point d'entrée unique : preview (validations + lectures), transaction
 * d'écriture, puis effets APRÈS commit (e-mails). Utilisé par le formulaire
 * public, le back-office et — Phase 4 — l'import CSV d'accréditations.
 */
export async function createAccreditation(
  command: AccreditationCommand,
  context: AccreditationServiceContext
): Promise<AccreditationServiceResult> {
  const preview = await previewAccreditation(command, context);
  if (!preview.ok) {
    return { ok: false, status: preview.status, error: preview.error, details: preview.details };
  }

  let result: CreateAccreditationResult;
  try {
    result = await prisma.$transaction((tx) => createAccreditationInTransaction(tx, preview, context));
  } catch (err) {
    if (err instanceof CapacityQuotaError) {
      return { ok: false, status: 409, error: err.message, code: err.code, details: err.details };
    }
    throw err;
  }

  if (result.kind === "split") {
    // Tous les envois sont tentés (un échec n'interrompt pas les suivants) ;
    // la transaction déjà committée n'est jamais remise en cause → 201.
    const outcomes: CreationEmailOutcome[] = [];
    for (const c of result.created) {
      try {
        outcomes.push(
          await sendAccreditationCreationEmail({
            accreditationId: c.id,
            recipient: preview.recipientEmail,
          })
        );
      } catch (e) {
        console.error("Creation email (split) failed:", e);
        outcomes.push("failed");
      }
    }
    return {
      ok: true,
      status: 201,
      body: {
        count: result.created.length,
        ids: result.created.map((c) => c.id),
        emailOutcome: aggregateEmailOutcomes(outcomes),
      },
    };
  }

  // Création simple : retourne EXACTEMENT le résultat de
  // sendAccreditationCreationEmail (contrat existant, 4 valeurs), "failed"
  // seulement si la fonction lève une exception. Aucun échec d'e-mail ne
  // modifie le résultat métier de l'accréditation (déjà committée → 201).
  let emailOutcome: CreationEmailOutcome;
  try {
    emailOutcome = await sendAccreditationCreationEmail({
      accreditationId: result.accreditation.id,
      recipient: preview.recipientEmail,
    });
  } catch (e) {
    console.error("Creation email failed:", e);
    emailOutcome = "failed";
  }

  const acc = result.accreditation;
  const vehicles = (acc.vehicles as Array<Record<string, unknown>>).map(deserializeVehicleUnloading);

  return {
    ok: true,
    status: 201,
    body: { ...acc, emailOutcome, vehicles },
  };
}
