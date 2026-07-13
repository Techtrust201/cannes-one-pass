/**
 * Cœur PUR (aucun accès I/O, aucun `console`, aucun `process`) de l'outil de
 * purge d'une organisation (Phase 7).
 *
 * Toute la logique de garde et de calcul est ici, testable sans base de
 * données réelle (délégué `PurgeDb` injecté). Le script exécutable
 * `scripts/purge-organization.ts` ne fait que : parser `process.argv`,
 * charger l'environnement, instancier Prisma, appeler ce module, et
 * afficher le résultat. Il ne contient AUCUNE logique de garde dupliquée.
 *
 * Protections absolues (toutes obligatoires pour `--execute`) :
 *   --org-id=<UUID exact>
 *   --org-slug=rx
 *   --confirm-slug=rx   (doit être IDENTIQUE à --org-slug)
 *   --execute
 *   --backup-confirmed
 *   ALLOW_ORGANIZATION_PURGE=YES (variable d'environnement)
 *
 * Le slug résolu en base doit être EXACTEMENT "rx" (jamais "palais", jamais
 * un autre slug) et doit correspondre à l'UUID fourni. Sans la conjonction
 * EXACTE de toutes ces protections : aucune transaction, aucune suppression,
 * sortie en erreur (si `--execute` est demandé) ou dry-run (par défaut).
 *
 * Périmètre supprimé (uniquement l'organisation ciblée) :
 *   accréditations (+ véhicules/historique/e-mails/mouvements/créneaux/chat
 *   en cascade), historique archivé, tickets de support (+ réponses), stands,
 *   exposants + emplacements, capacités RX, planning logistique, lots d'import.
 *
 * Conservé impérativement : Organization, Event, User, permissions, liens
 * utilisateurs/organisation, ZoneConfig, VehicleTypeConfig, UnloadingProvider.
 */

export interface PurgeCliArgs {
  orgId: string | null;
  orgSlug: string | null;
  confirmSlug: string | null;
  execute: boolean;
  backupConfirmed: boolean;
}

/** Parse pur de `process.argv.slice(2)` — aucun accès I/O. */
export function parseArgs(argv: string[]): PurgeCliArgs {
  const args: PurgeCliArgs = {
    orgId: null,
    orgSlug: null,
    confirmSlug: null,
    execute: false,
    backupConfirmed: false,
  };
  for (const raw of argv) {
    if (raw === "--execute") {
      args.execute = true;
    } else if (raw === "--backup-confirmed") {
      args.backupConfirmed = true;
    } else if (raw.startsWith("--org-id=")) {
      args.orgId = raw.slice("--org-id=".length).trim() || null;
    } else if (raw.startsWith("--org-slug=")) {
      args.orgSlug = raw.slice("--org-slug=".length).trim() || null;
    } else if (raw.startsWith("--confirm-slug=")) {
      args.confirmSlug = raw.slice("--confirm-slug=".length).trim() || null;
    }
  }
  return args;
}

export type PurgeGuardFailureCode =
  | "MISSING_ARGS"
  | "FORBIDDEN_SLUG_PALAIS"
  | "SLUG_NOT_RX"
  | "CONFIRM_SLUG_MISMATCH"
  | "ENV_VAR_MISSING"
  | "BACKUP_NOT_CONFIRMED"
  | "ORG_NOT_FOUND"
  | "UUID_SLUG_MISMATCH";

export type PurgeGuardResult =
  | { ok: true }
  | { ok: false; code: PurgeGuardFailureCode; reason: string };

export interface PurgeGuardContext {
  args: PurgeCliArgs;
  /** `process.env.ALLOW_ORGANIZATION_PURGE === "YES"`, calculé par l'appelant. */
  envAllowed: boolean;
  /** Organisation résolue par `orgId` (ou `null` si introuvable). Jamais fourni par le fichier/l'utilisateur. */
  organization: { id: string; slug: string } | null;
}

const RX_SLUG = "rx";
const PALAIS_SLUG = "palais";

/**
 * Valide la conjonction EXACTE de toutes les protections requises pour
 * exécuter une purge réelle. Fonction pure : ne lit ni n'écrit rien.
 * Retourne le premier motif de refus rencontré (jamais un choix arbitraire).
 */
export function validatePurgeGuards(ctx: PurgeGuardContext): PurgeGuardResult {
  const { args } = ctx;

  if (!args.orgId || !args.orgSlug || !args.confirmSlug) {
    return {
      ok: false,
      code: "MISSING_ARGS",
      reason: "--org-id, --org-slug et --confirm-slug sont tous obligatoires.",
    };
  }

  const orgSlugLower = args.orgSlug.toLowerCase();
  if (orgSlugLower === PALAIS_SLUG) {
    return {
      ok: false,
      code: "FORBIDDEN_SLUG_PALAIS",
      reason: "Refus absolu : le slug cible ne peut jamais être \"palais\".",
    };
  }
  if (orgSlugLower !== RX_SLUG) {
    return {
      ok: false,
      code: "SLUG_NOT_RX",
      reason: `Refus absolu : seul le slug "${RX_SLUG}" est autorisé pour cet outil (reçu "${args.orgSlug}").`,
    };
  }

  if (args.confirmSlug !== args.orgSlug) {
    return {
      ok: false,
      code: "CONFIRM_SLUG_MISMATCH",
      reason: "--confirm-slug doit être strictement identique à --org-slug.",
    };
  }

  if (!ctx.envAllowed) {
    return {
      ok: false,
      code: "ENV_VAR_MISSING",
      reason: "La variable d'environnement ALLOW_ORGANIZATION_PURGE=YES est absente.",
    };
  }

  if (!args.backupConfirmed) {
    return {
      ok: false,
      code: "BACKUP_NOT_CONFIRMED",
      reason: "--backup-confirmed est obligatoire (confirmation explicite qu'une sauvegarde existe).",
    };
  }

  if (!ctx.organization) {
    return {
      ok: false,
      code: "ORG_NOT_FOUND",
      reason: `Organisation introuvable pour l'UUID "${args.orgId}".`,
    };
  }

  if (ctx.organization.slug !== args.orgSlug) {
    return {
      ok: false,
      code: "UUID_SLUG_MISMATCH",
      reason: `L'UUID fourni correspond au slug "${ctx.organization.slug}", pas à "${args.orgSlug}" fourni.`,
    };
  }

  if (ctx.organization.slug.toLowerCase() !== RX_SLUG) {
    return {
      ok: false,
      code: "SLUG_NOT_RX",
      reason: `Refus absolu : l'organisation résolue a le slug "${ctx.organization.slug}", pas "${RX_SLUG}".`,
    };
  }

  return { ok: true };
}

/** Compteurs read-only, utilisés à la fois pour le dry-run et le rapport post-purge. */
export interface PurgeCounts {
  accreditations: number;
  accreditationHistoryArchive: number;
  supportTickets: number;
  exhibitorLocations: number;
  exhibitors: number;
  stands: number;
  rxCapacities: number;
  logisticsPlanningRows: number;
  importBatches: number;
}

/** Délégué Prisma minimal (satisfait par un vrai `PrismaClient`, une transaction, ou un mock de test). */
export interface PurgeDb {
  accreditation: {
    findMany(args: { where: Record<string, unknown>; select?: Record<string, unknown> }): Promise<
      { id: string }[]
    >;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  accreditationHistoryArchive: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  supportTicket: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  exhibitorLocation: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  exhibitor: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  stand: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  rxCapacity: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  logisticsPlanning: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  importBatch: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

/**
 * Compte, en lecture seule, tout ce qui serait supprimé pour cette
 * organisation. Utilisé pour le dry-run (toujours) et pour le rapport
 * post-purge (doit alors renvoyer des zéros partout).
 */
export async function computePurgeCounts(db: PurgeDb, organizationId: string): Promise<PurgeCounts> {
  const accreditationIds = await db.accreditation.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const ids = accreditationIds.map((a) => a.id);

  const [
    accreditations,
    accreditationHistoryArchive,
    supportTickets,
    exhibitorLocations,
    exhibitors,
    stands,
    rxCapacities,
    logisticsPlanningRows,
    importBatches,
  ] = await Promise.all([
    db.accreditation.count({ where: { organizationId } }),
    ids.length > 0
      ? db.accreditationHistoryArchive.count({ where: { accreditationId: { in: ids } } })
      : Promise.resolve(0),
    db.supportTicket.count({ where: { organizationId } }),
    db.exhibitorLocation.count({ where: { exhibitor: { organizationId } } }),
    db.exhibitor.count({ where: { organizationId } }),
    db.stand.count({ where: { organizationId } }),
    db.rxCapacity.count({ where: { organizationId } }),
    db.logisticsPlanning.count({ where: { organizationId } }),
    db.importBatch.count({ where: { organizationId } }),
  ]);

  return {
    accreditations,
    accreditationHistoryArchive,
    supportTickets,
    exhibitorLocations,
    exhibitors,
    stands,
    rxCapacities,
    logisticsPlanningRows,
    importBatches,
  };
}

/**
 * Exécute la suppression réelle, dans UNE SEULE transaction (le `db` fourni
 * doit être le délégué de transaction `tx`, jamais le client racine).
 *
 * Ordre : `AccreditationHistoryArchive` d'abord (aucune cascade FK, doit être
 * supprimé explicitement par `accreditationId`), puis les tables scopées
 * `organizationId` (les tables enfants de `Accreditation` — véhicules,
 * historique, e-mails, mouvements, créneaux, chat — sont supprimées
 * automatiquement par cascade Prisma/Postgres à la suppression de la ligne
 * `Accreditation`).
 *
 * Ne touche JAMAIS à `Organization`, `Event`, `User`, aux permissions, aux
 * liens utilisateur/organisation, ni à `ZoneConfig`/`VehicleTypeConfig`/
 * `UnloadingProvider`.
 */
export async function executeOrganizationPurge(
  tx: PurgeDb,
  organizationId: string
): Promise<PurgeCounts> {
  const accreditationRows = await tx.accreditation.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const accreditationIds = accreditationRows.map((a) => a.id);

  const archiveResult =
    accreditationIds.length > 0
      ? await tx.accreditationHistoryArchive.deleteMany({
          where: { accreditationId: { in: accreditationIds } },
        })
      : { count: 0 };

  const supportTicketsResult = await tx.supportTicket.deleteMany({ where: { organizationId } });

  // Cascade Prisma/Postgres : Vehicle, AccreditationHistory,
  // AccreditationEmailHistory, ZoneMovement, VehicleTimeSlot, ChatMessage.
  const accreditationsResult = await tx.accreditation.deleteMany({ where: { organizationId } });

  // Cascade Prisma/Postgres : ExhibitorLocation (FK onDelete: Cascade côté
  // exhibitorId). Suppression explicite néanmoins pour rester déterministe
  // même si l'ordre de la transaction change un jour.
  const exhibitorLocationsResult = await tx.exhibitorLocation.deleteMany({
    where: { exhibitor: { organizationId } },
  });
  const exhibitorsResult = await tx.exhibitor.deleteMany({ where: { organizationId } });

  const standsResult = await tx.stand.deleteMany({ where: { organizationId } });
  const rxCapacitiesResult = await tx.rxCapacity.deleteMany({ where: { organizationId } });
  const logisticsPlanningResult = await tx.logisticsPlanning.deleteMany({ where: { organizationId } });
  const importBatchesResult = await tx.importBatch.deleteMany({ where: { organizationId } });

  return {
    accreditations: accreditationsResult.count,
    accreditationHistoryArchive: archiveResult.count,
    supportTickets: supportTicketsResult.count,
    exhibitorLocations: exhibitorLocationsResult.count,
    exhibitors: exhibitorsResult.count,
    stands: standsResult.count,
    rxCapacities: rxCapacitiesResult.count,
    logisticsPlanningRows: logisticsPlanningResult.count,
    importBatches: importBatchesResult.count,
  };
}

/** Libellés stables utilisés par le rapport CLI (jamais de secret, uniquement des compteurs). */
export function formatPurgeCountsReport(counts: PurgeCounts): string[] {
  return [
    `Accréditations : ${counts.accreditations}`,
    `Historique archivé : ${counts.accreditationHistoryArchive}`,
    `Tickets de support : ${counts.supportTickets}`,
    `Emplacements exposant : ${counts.exhibitorLocations}`,
    `Exposants : ${counts.exhibitors}`,
    `Stands : ${counts.stands}`,
    `Capacités RX : ${counts.rxCapacities}`,
    `Lignes de planning logistique : ${counts.logisticsPlanningRows}`,
    `Lots d'import : ${counts.importBatches}`,
  ];
}
