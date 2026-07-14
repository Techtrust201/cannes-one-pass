/**
 * Preview d'un LOT d'accréditations à importer (Phase 4B-2) : orchestre la
 * résolution référentiel, la construction de la commande moteur, l'appel à
 * `previewAccreditation` ligne par ligne, et l'agrégation des quotas.
 *
 * AUCUNE écriture DB : ni `prisma.accreditation.create`, ni `$transaction`,
 * ni `ImportBatch`, ni e-mail. Le résultat est strictement informatif — le
 * futur commit (Phase 4B-3) NE FAIT JAMAIS confiance à ce preview : il
 * reparsera le fichier et recalculera entièrement son propre plan.
 *
 * Séparation stricte du résultat :
 *  - `public` : structure sérialisable (JSON.stringify-safe), sûre à
 *    renvoyer au client (route 4B-3) ;
 *  - `internalLinePlans` : plan riche non sérialisable (contient les
 *    `PreviewAccreditationResult` complets, avec fonctions), réservé au
 *    futur commit transactionnel — ne JAMAIS l'exposer via HTTP.
 */

import type { ActorSource } from "@prisma/client";
import {
  previewAccreditation,
  type AccreditationCommand,
  type AccreditationServiceContext,
  type PreviewAccreditationResult,
} from "@/lib/accreditation-service";
import { quotaCandidateKey, type QuotaCandidate } from "@/lib/capacity-quota-guard";
import type { RxCapacityKey } from "@/lib/rx-capacity";
import type { RxAvailabilityResult } from "@/lib/rx-capacity-service";
import type { ImportRowIssue } from "./csv";
import type {
  AccreditationParseResult,
  AccreditationTemplate,
  ParsedAccreditationRow,
} from "./accreditations";
import {
  resolveReferential,
  type ReferentialResolverDb,
  type ReferentialResolutionSuccess,
} from "./accreditations-referential-resolver";

// ── Contexte serveur de confiance ────────────────────────────────────────

export interface AccreditationsPreviewContext {
  organizationId: string;
  organizationSlug: string;
  eventId: string;
  eventSlug: string;
  template: AccreditationTemplate;
  /** Jamais déduit du fichier : présent explicitement, propagé au moteur. */
  importMode: "PENDING" | "VALIDATED";
  currentUserId?: string;
  currentUserRole?: "SUPER_ADMIN" | "ADMIN" | "USER";
}

/**
 * Lecture de disponibilité injectée (testable sans DB). En production, sera
 * branchée sur `getRxAvailability` (Phase 4B-3 / route). Aucun verrou ici :
 * le preview reste informatif, jamais un advisory lock DB.
 */
export type AvailabilityReader = (key: RxCapacityKey) => Promise<RxAvailabilityResult>;

// ── Résultat public (sérialisable) ───────────────────────────────────────

export interface AccreditationPreviewVehicleSummary {
  plate: string | null;
  vehicleType: string | null;
  date: string | null;
  time: string | null;
}

export interface AccreditationPreviewReferentialSummary {
  exhibitorId: string | null;
  exhibitorLocationId: string | null;
  locationLabel: string | null;
}

export interface AccreditationPreviewLineResult {
  line: number;
  valid: boolean;
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
  /** Statut prévu si le commit avait lieu maintenant (null si ligne invalide). */
  status: "NOUVEAU" | "ATTENTE" | null;
  actorSource: ActorSource | null;
  company: string | null;
  stand: string | null;
  locationLabel: string | null;
  vehicle: AccreditationPreviewVehicleSummary;
  category: string | null;
  quotaCandidates: { key: RxCapacityKey; requestedCount: number }[];
  referential: AccreditationPreviewReferentialSummary | null;
}

export interface BatchQuotaGroupPublic {
  key: RxCapacityKey;
  /** Somme des `requestedCount` de toutes les lignes valides du lot pour cette clé. */
  requestedCount: number;
  /** Numéros de ligne (1-indexés) contribuant à ce groupe. */
  lines: number[];
  hasQuota: boolean;
  capacity: number;
  used: number;
  remaining: number;
  /** > 0 si le lot dépasse la disponibilité actuelle pour cette clé. */
  exceededBy: number;
}

export interface BatchCapacityExceededError {
  code: "BATCH_CAPACITY_EXCEEDED";
  zone: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleFamily: RxCapacityKey["vehicleFamily"];
  phase: RxCapacityKey["phase"];
  remaining: number;
  requestedCount: number;
  exceededBy: number;
  lines: number[];
}

export interface AccreditationsPreviewPublicResult {
  ok: boolean;
  template: AccreditationTemplate;
  /** Rappel explicite : PENDING → futur statut NOUVEAU ; VALIDATED → futur statut ATTENTE. */
  importMode: "PENDING" | "VALIDATED";
  totalRows: number;
  /** Erreurs de portée fichier (ex: FORBIDDEN_COLUMN), non rattachées à une ligne. Bloquantes. */
  fileErrors: ImportRowIssue[];
  lines: AccreditationPreviewLineResult[];
  quotaGroups: BatchQuotaGroupPublic[];
  batchCapacityErrors: BatchCapacityExceededError[];
}

/**
 * Plan interne (non sérialisable) d'une ligne : commande + contexte moteur
 * effectivement utilisés + résultat complet de `previewAccreditation`.
 * Réservé au futur commit (Phase 4B-3) — jamais exposé via HTTP.
 */
export interface InternalAccreditationLinePlan {
  line: number;
  command: AccreditationCommand;
  context: AccreditationServiceContext;
  preview: PreviewAccreditationResult;
}

export interface AccreditationsPreviewResult {
  public: AccreditationsPreviewPublicResult;
  internalLinePlans: InternalAccreditationLinePlan[];
}

// ── Helpers de mapping ───────────────────────────────────────────────────

function unloadingToString(tokens: string[]): string {
  return tokens.length > 0 ? tokens.join("+") : "";
}

function summarizeVehicle(row: ParsedAccreditationRow): AccreditationPreviewVehicleSummary {
  return {
    plate: row.vehicle.plate,
    vehicleType: row.vehicle.vehicleType,
    date: row.vehicle.date,
    time: row.vehicle.time,
  };
}

function hasReferentialCriteria(row: ParsedAccreditationRow): boolean {
  return Boolean(
    row.referential.exhibitorExternalReference ||
      row.referential.exhibitorName ||
      row.referential.locationCode
  );
}

/**
 * Construit le véhicule "racine" (`command.vehicles[0]`), format attendu par
 * `previewAccreditation`/`buildCapacityQuotaCandidates` — identique pour les
 * deux templates. Les champs de reprise (démontage) proviennent du
 * brouillon RX quand il existe (une ligne RX porte montage ET démontage).
 */
function buildRootVehiclePayload(row: ParsedAccreditationRow): Record<string, unknown> {
  const rep = row.rx?.rep;
  const cat = row.rx?.category;
  return {
    plate: row.vehicle.plate,
    size: row.vehicle.size ?? "",
    phoneCode: row.vehicle.phoneCode,
    phoneNumber: row.vehicle.phoneNumber,
    date: row.vehicle.date ?? cat?.livDate ?? undefined,
    time: row.vehicle.time ?? cat?.livTime ?? undefined,
    city: row.vehicle.city ?? "",
    unloading: row.vehicle.unloading,
    kms: row.vehicle.kms ?? undefined,
    vehicleType: row.vehicle.vehicleType ?? undefined,
    country: row.vehicle.country ?? undefined,
    estimatedKms: row.vehicle.estimatedKms ?? undefined,
    trailerPlate: row.vehicle.trailerPlate ?? undefined,
    emptyWeight: row.vehicle.emptyWeight ?? undefined,
    maxWeight: row.vehicle.maxWeight ?? undefined,
    currentWeight: row.vehicle.currentWeight ?? undefined,
    categoryId: cat?.categoryId ?? undefined,
    repDate: cat?.repDate ?? undefined,
    repTime: cat?.repTime ?? undefined,
    repSameAsDelivery: rep?.repSameAsDelivery ?? undefined,
    repVehicleType: rep?.repVehicleType ?? undefined,
    repPlate: rep?.repPlate ?? undefined,
    repPhoneCode: rep?.repPhoneCode ?? undefined,
    repPhoneNumber: rep?.repPhoneNumber ?? undefined,
    interveningCompany: row.rx?.interveningCompany ?? undefined,
    repInterveningCompany: rep?.repInterveningCompany ?? undefined,
    repCity: rep?.repCity ?? undefined,
    repCountry: rep?.repCountry ?? undefined,
    repEstimatedKms: rep?.repEstimatedKms ?? undefined,
  };
}

/**
 * Véhicule imbriqué dans `extension.categories[0].vehicles[0]` — allow-list
 * STRICTE conforme au sous-ensemble accepté par `rxExtensionSchema`. Jamais
 * de JSON brut recopié depuis le fichier.
 */
function buildRxExtensionVehiclePayload(row: ParsedAccreditationRow): Record<string, unknown> {
  const rep = row.rx?.rep;
  return {
    vehicleType: row.vehicle.vehicleType ?? undefined,
    plate: row.vehicle.plate,
    trailerPlate: row.vehicle.trailerPlate ?? undefined,
    interveningCompany: row.rx?.interveningCompany ?? undefined,
    phoneCode: row.vehicle.phoneCode ?? undefined,
    phoneNumber: row.vehicle.phoneNumber ?? undefined,
    city: row.vehicle.city ?? undefined,
    country: row.vehicle.country ?? undefined,
    estimatedKms: row.vehicle.estimatedKms ?? undefined,
    repSameAsDelivery: rep?.repSameAsDelivery ?? undefined,
    repVehicleType: rep?.repVehicleType ?? undefined,
    repPlate: rep?.repPlate ?? undefined,
    repPhoneCode: rep?.repPhoneCode ?? undefined,
    repPhoneNumber: rep?.repPhoneNumber ?? undefined,
    repInterveningCompany: rep?.repInterveningCompany ?? undefined,
    repCity: rep?.repCity ?? undefined,
    repCountry: rep?.repCountry ?? undefined,
    repEstimatedKms: rep?.repEstimatedKms ?? undefined,
  };
}

/**
 * Reconstruit `extension` RX par allow-list stricte, JAMAIS de JSON brut du
 * fichier. `exhibitor.{id,name,sector}` et `stand` proviennent EXCLUSIVEMENT
 * de la résolution référentiel serveur ; `contact` provient des 5 colonnes
 * du fichier (le référentiel `Exhibitor` ne stocke aucune coordonnée de
 * contact — prénom/nom/e-mail/téléphone n'y existent pas).
 */
function buildRxExtension(
  row: ParsedAccreditationRow,
  resolution: ReferentialResolutionSuccess
): Record<string, unknown> {
  const rx = row.rx!;
  const snapshot = resolution.locationSnapshot;
  return {
    exhibitor: {
      id: resolution.exhibitorId,
      name: snapshot.exhibitorName,
      stand: resolution.locationLabel ?? snapshot.locationCode ?? snapshot.exhibitorName,
      sector: snapshot.sectorCode ?? "",
    },
    contact: {
      firstName: rx.contact.firstName ?? undefined,
      lastName: rx.contact.lastName ?? undefined,
      email: rx.contact.email ?? undefined,
      phoneCode: rx.contact.phoneCode ?? undefined,
      phoneNumber: rx.contact.phoneNumber ?? undefined,
    },
    space: rx.space ?? snapshot.logisticSpace ?? snapshot.sectorCode ?? "",
    categories: [
      {
        categoryId: rx.category.categoryId ?? "",
        livDate: rx.category.livDate ?? "",
        livTime: rx.category.livTime ?? "",
        repDate: rx.category.repDate ?? "",
        repTime: rx.category.repTime ?? "",
        vehicles: [buildRxExtensionVehiclePayload(row)],
      },
    ],
    scalesAssigned: rx.scalesAssigned ?? false,
    manutentionProvider: rx.manutentionProvider ?? "",
    manutentionProviderOther: rx.manutentionProviderOther ?? undefined,
    skipMontage: rx.skipMontage ?? undefined,
    skipDemontage: rx.skipDemontage ?? undefined,
  };
}

/**
 * Décision explicite et testée (Phase 4B-2) : aucun consentement RGPD valide
 * n'existe dans le fichier importé ni dans la politique actuelle. On
 * n'invente JAMAIS `consent = true` — `false` est appliqué et signalé par un
 * warning de ligne, plutôt que de présumer un consentement juridique.
 */
const CONSENT_NOT_COLLECTED_WARNING =
  "CONSENT_NOT_COLLECTED: aucun consentement RGPD valide n'est présent dans le fichier importé ; consent=false appliqué par défaut.";

function buildPalaisCommand(
  row: ParsedAccreditationRow,
  ctx: AccreditationsPreviewContext,
  resolution: ReferentialResolutionSuccess | null
): AccreditationCommand {
  const stand = row.accreditation.stand ?? resolution?.locationLabel ?? "";
  return {
    organizationSlug: ctx.organizationSlug,
    company: row.accreditation.company ?? resolution?.locationSnapshot.exhibitorName ?? "",
    stand,
    unloading: unloadingToString(row.vehicle.unloading),
    event: ctx.eventSlug,
    vehicles: [buildRootVehiclePayload(row)],
    message: row.accreditation.message ?? undefined,
    consent: false,
    email: row.accreditation.email ?? undefined,
    language: row.accreditation.language ?? undefined,
    category: row.accreditation.category ?? undefined,
  };
}

/**
 * `splitPerVehicle: true` réutilise le chemin d'enrichissement du moteur
 * (recalcul `suggestedZone`/`vehicleContext`, cf. Phase 4A duplication) pour
 * l'unique véhicule de la ligne — même s'il n'y a qu'un seul véhicule, cette
 * ligne RX bénéficie ainsi de la même suggestion de zone qu'une création
 * back-office.
 */
function buildRxCommand(
  row: ParsedAccreditationRow,
  ctx: AccreditationsPreviewContext,
  resolution: ReferentialResolutionSuccess
): AccreditationCommand {
  const stand = resolution.locationLabel ?? row.accreditation.stand ?? "";
  return {
    organizationSlug: ctx.organizationSlug,
    company: row.accreditation.company ?? resolution.locationSnapshot.exhibitorName,
    stand,
    unloading: unloadingToString(row.vehicle.unloading),
    event: ctx.eventSlug,
    vehicles: [buildRootVehiclePayload(row)],
    message: row.accreditation.message ?? undefined,
    consent: false,
    language: row.accreditation.language ?? undefined,
    category: row.accreditation.category ?? undefined,
    splitPerVehicle: true,
    extension: buildRxExtension(row, resolution),
  };
}

// ── Résolution référentiel par ligne ─────────────────────────────────────

type RowReferentialOutcome =
  | { ok: true; resolution: ReferentialResolutionSuccess | null }
  | { ok: false; issue: ImportRowIssue };

/**
 * RX : exposant ET emplacement obligatoires — toute erreur de résolution
 * bloque la ligne. Palais : résolution facultative ; si aucun critère n'est
 * fourni on continue sans rattachement, mais un critère fourni et invalide
 * (ou ambigu) reste une erreur explicite — jamais ignoré silencieusement.
 */
async function resolveRowReferential(
  db: ReferentialResolverDb,
  ctx: AccreditationsPreviewContext,
  row: ParsedAccreditationRow
): Promise<RowReferentialOutcome> {
  const criteria = {
    externalReference: row.referential.exhibitorExternalReference,
    name: row.referential.exhibitorName,
    locationCode: row.referential.locationCode,
    locationType: row.referential.locationType,
  };

  if (ctx.template === "rx") {
    const resolution = await resolveReferential(db, ctx, criteria);
    if (!resolution.ok) {
      return {
        ok: false,
        issue: { line: row.line, column: "_row", reason: `${resolution.code}: ${resolution.message}` },
      };
    }
    if (!resolution.exhibitorLocationId) {
      return {
        ok: false,
        issue: {
          line: row.line,
          column: "_row",
          reason:
            "LOCATION_NOT_FOUND: emplacement obligatoire pour RX (aucun code d'emplacement fourni ou résolu).",
        },
      };
    }
    return { ok: true, resolution };
  }

  // Palais : facultatif.
  if (!hasReferentialCriteria(row)) {
    return { ok: true, resolution: null };
  }
  const resolution = await resolveReferential(db, ctx, criteria);
  if (!resolution.ok) {
    return {
      ok: false,
      issue: { line: row.line, column: "_row", reason: `${resolution.code}: ${resolution.message}` },
    };
  }
  return { ok: true, resolution };
}

// ── Orchestration principale ─────────────────────────────────────────────

/**
 * Preview complet d'un lot déjà parsé (`parseAccreditationsTable`). AUCUNE
 * écriture DB. `db` est un service de LECTURE (résolution référentiel) ;
 * `getAvailability` est injecté pour rendre le service testable sans DB
 * réelle (en production : `getRxAvailability`).
 */
export async function previewAccreditationsBatch(
  db: ReferentialResolverDb,
  parseResult: AccreditationParseResult,
  ctx: AccreditationsPreviewContext,
  getAvailability: AvailabilityReader
): Promise<AccreditationsPreviewResult> {
  const fileErrors = parseResult.errors.filter((e) => e.line === 1);

  const lines: AccreditationPreviewLineResult[] = [];
  const internalLinePlans: InternalAccreditationLinePlan[] = [];
  const quotaContributions: { candidate: QuotaCandidate; line: number }[] = [];

  for (const row of parseResult.rows) {
    const rowParseErrors = parseResult.errors.filter((e) => e.line === row.line);
    const rowParseWarnings = parseResult.warnings.filter((e) => e.line === row.line);
    const vehicle = summarizeVehicle(row);

    if (rowParseErrors.length > 0) {
      lines.push({
        line: row.line,
        valid: false,
        errors: rowParseErrors,
        warnings: rowParseWarnings,
        status: null,
        actorSource: null,
        company: row.accreditation.company,
        stand: row.accreditation.stand,
        locationLabel: null,
        vehicle,
        category: row.accreditation.category,
        quotaCandidates: [],
        referential: null,
      });
      continue;
    }

    const refOutcome = await resolveRowReferential(db, ctx, row);
    if (!refOutcome.ok) {
      lines.push({
        line: row.line,
        valid: false,
        errors: [refOutcome.issue],
        warnings: rowParseWarnings,
        status: null,
        actorSource: null,
        company: row.accreditation.company,
        stand: row.accreditation.stand,
        locationLabel: null,
        vehicle,
        category: row.accreditation.category,
        quotaCandidates: [],
        referential: null,
      });
      continue;
    }

    const resolution = refOutcome.resolution;
    const command =
      ctx.template === "rx"
        ? buildRxCommand(row, ctx, resolution as ReferentialResolutionSuccess)
        : buildPalaisCommand(row, ctx, resolution);

    // Phase 6C-B-4 — `referentialInput` (RX uniquement) : l'exposant/emplacement
    // DÉJÀ résolu ci-dessus par `resolveRowReferential` (critères naturels du
    // fichier — externalReference/nom/code, jamais un UUID désérialisé) est
    // transmis comme INDICATION au moteur unique, qui le REVÉRIFIE intégralement
    // (`resolveTrustedAccreditationReferential` : actif, même organisation/
    // événement) — À LA FOIS ici (preview, `prisma`) ET À NOUVEAU au commit
    // (transaction, `tx`, cf. `createAccreditationInTransaction`). Protège
    // contre un exposant/emplacement désactivé entre le preview et le commit
    // d'un gros lot (TOCTOU) sans dupliquer la résolution naturelle déjà
    // effectuée par `resolveRowReferential` (spécifique aux fichiers d'import,
    // qui ne transmettent jamais d'UUID — la mandat-obligation RX/Palais reste
    // gérée exclusivement par `resolveRowReferential` ci-dessus, inchangée).
    const context: AccreditationServiceContext = {
      channel: "CSV_IMPORT",
      importMode: ctx.importMode,
      currentUserId: ctx.currentUserId,
      currentUserRole: ctx.currentUserRole,
      referential: resolution
        ? {
            exhibitorId: resolution.exhibitorId,
            exhibitorLocationId: resolution.exhibitorLocationId,
            locationLabel: resolution.locationLabel,
            locationSnapshot: resolution.locationSnapshot,
          }
        : undefined,
      referentialInput:
        ctx.template === "rx" && resolution
          ? {
              exhibitorId: resolution.exhibitorId,
              exhibitorLocationId: resolution.exhibitorLocationId,
            }
          : undefined,
    };

    const preview = await previewAccreditation(command, context);
    internalLinePlans.push({ line: row.line, command, context, preview });

    const engineIssues: ImportRowIssue[] = [];
    if (!preview.ok) {
      engineIssues.push({
        line: row.line,
        column: "_row",
        reason: `${preview.code ?? "ENGINE_VALIDATION_ERROR"}: ${preview.error}`,
      });
    }

    const candidatesForLine = preview.ok ? preview.quotaCandidates : [];
    for (const candidate of candidatesForLine) {
      quotaContributions.push({ candidate, line: row.line });
    }

    const consentWarning: ImportRowIssue = {
      line: row.line,
      column: "_row",
      reason: CONSENT_NOT_COLLECTED_WARNING,
    };

    lines.push({
      line: row.line,
      valid: preview.ok,
      errors: engineIssues,
      warnings: [...rowParseWarnings, consentWarning],
      status: preview.ok ? preview.status : null,
      actorSource: preview.ok ? preview.actorSource : null,
      company: preview.ok ? preview.company : row.accreditation.company,
      stand: preview.ok ? preview.stand : row.accreditation.stand,
      locationLabel: resolution?.locationLabel ?? null,
      vehicle,
      category: preview.ok ? preview.category : row.accreditation.category,
      quotaCandidates: candidatesForLine.map((c) => ({ key: c.key, requestedCount: c.requestedCount })),
      referential: resolution
        ? {
            exhibitorId: resolution.exhibitorId,
            exhibitorLocationId: resolution.exhibitorLocationId,
            locationLabel: resolution.locationLabel,
          }
        : null,
    });
  }

  // ── Agrégation des quotas du lot (clé publique unique, cf. capacity-quota-guard) ──
  interface GroupAccumulator {
    key: RxCapacityKey;
    requestedCount: number;
    lines: number[];
  }
  const groups = new Map<string, GroupAccumulator>();
  for (const { candidate, line } of quotaContributions) {
    const k = quotaCandidateKey(candidate.key);
    const existing = groups.get(k);
    if (existing) {
      existing.requestedCount += candidate.requestedCount;
      existing.lines.push(line);
    } else {
      groups.set(k, { key: candidate.key, requestedCount: candidate.requestedCount, lines: [line] });
    }
  }

  const quotaGroups: BatchQuotaGroupPublic[] = [];
  const batchCapacityErrors: BatchCapacityExceededError[] = [];

  // Tous les groupes sont évalués, même si le premier dépasse déjà.
  for (const group of groups.values()) {
    const availability = await getAvailability(group.key);
    const exceededBy = availability.hasQuota
      ? Math.max(0, group.requestedCount - availability.remaining)
      : 0;

    quotaGroups.push({
      key: group.key,
      requestedCount: group.requestedCount,
      lines: [...group.lines],
      hasQuota: availability.hasQuota,
      capacity: availability.capacity,
      used: availability.totalUsed,
      remaining: availability.remaining,
      exceededBy,
    });

    if (availability.hasQuota && exceededBy > 0) {
      batchCapacityErrors.push({
        code: "BATCH_CAPACITY_EXCEEDED",
        zone: group.key.zone,
        date: group.key.date,
        startTime: group.key.startTime,
        endTime: group.key.endTime,
        vehicleFamily: group.key.vehicleFamily,
        phase: group.key.phase,
        remaining: availability.remaining,
        requestedCount: group.requestedCount,
        exceededBy,
        lines: [...group.lines],
      });
    }
  }

  const ok =
    fileErrors.length === 0 &&
    lines.every((l) => l.valid) &&
    batchCapacityErrors.length === 0;

  return {
    public: {
      ok,
      template: ctx.template,
      importMode: ctx.importMode,
      totalRows: parseResult.totalRows,
      fileErrors,
      lines,
      quotaGroups,
      batchCapacityErrors,
    },
    internalLinePlans,
  };
}
