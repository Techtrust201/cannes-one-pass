/**
 * Phase 1B — Backfill idempotent du referentiel exposants :
 *  1. `Exhibitor.nameNormalized` (calcule depuis `Exhibitor.name`) ;
 *  2. `ExhibitorLocation` de type STAND (derivee depuis `Exhibitor.stand` legacy).
 *
 * La logique de planification (pure, testee) vit dans
 * `src/lib/imports/exhibitor-location-backfill.ts`. Ce script ne fait que
 * lire/ecrire Prisma par lots autour de cette logique.
 *
 * SECURITE :
 *  - dry-run PAR DEFAUT : sans `--apply`, aucune ecriture n'est effectuee ;
 *  - ecriture reelle uniquement si `ALLOW_EXHIBITOR_BACKFILL=YES` ET `--apply` ;
 *  - `--apply` sans `--org-id` ni `--event-id` est refuse (perimetre obligatoire) ;
 *  - ne supprime/desactive JAMAIS une ExhibitorLocation existante ;
 *  - ne modifie JAMAIS `Exhibitor.stand` ;
 *  - n'ecrase jamais `nameNormalized` ou une location deja presente
 *    (cle d'idempotence : exhibitorId + type STAND + codeNormalized).
 *
 * Usage :
 *   # Dry-run (par defaut, lecture seule) — perimetre optionnel
 *   npx tsx scripts/backfill-exhibitor-locations.ts
 *   npx tsx scripts/backfill-exhibitor-locations.ts --org-id=<uuid>
 *
 *   # Ecriture reelle (necessite le flag ET la variable d'environnement)
 *   ALLOW_EXHIBITOR_BACKFILL=YES npx tsx scripts/backfill-exhibitor-locations.ts \
 *     --apply --org-id=<uuid>
 */

import { PrismaClient, LocationType, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import {
  planExhibitorBackfillBatch,
  standLocationKey,
  emptyCounters,
  mergeCounters,
  type BackfillBatchCounters,
} from "../src/lib/imports/exhibitor-location-backfill";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const BATCH_SIZE = 200;

interface CliOptions {
  apply: boolean;
  orgId: string | null;
  eventId: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let orgId: string | null = null;
  let eventId: string | null = null;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg.startsWith("--org-id=")) orgId = arg.slice("--org-id=".length).trim() || null;
    else if (arg.startsWith("--event-id=")) eventId = arg.slice("--event-id=".length).trim() || null;
  }
  return { apply, orgId, eventId };
}

function printReport(counters: BackfillBatchCounters, apply: boolean): void {
  console.log("[backfill] --- rapport ---");
  console.log(`  exposants analyses             : ${counters.analyzed}`);
  console.log(`  nameNormalized a renseigner     : ${counters.nameNormalizedToSet}`);
  console.log(`  locations a creer               : ${counters.locationsToCreate}`);
  console.log(`  locations deja presentes        : ${counters.locationsAlreadyPresent}`);
  console.log(`  lignes ignorees (pas de stand)  : ${counters.skipped}`);
  console.log(`  secteur ambigu (info, non bloq) : ${counters.ambiguousSector}`);
  console.log(`  collisions codeNormalized       : ${counters.codeNormalizedCollisions}`);
  console.log(`  erreurs                         : ${counters.errors}`);
  if (!apply) {
    console.log(
      "[backfill] DRY-RUN : aucune ecriture effectuee. Relancer avec ALLOW_EXHIBITOR_BACKFILL=YES et --apply --org-id=<uuid> (ou --event-id=<uuid>) pour appliquer."
    );
  } else {
    console.log("[backfill] APPLICATION REELLE effectuee (transactions par lot).");
  }
}

async function main(): Promise<void> {
  const { apply, orgId, eventId } = parseArgs(process.argv.slice(2));

  if (apply) {
    if (process.env.ALLOW_EXHIBITOR_BACKFILL !== "YES") {
      throw new Error(
        "[backfill] Refuse : --apply necessite la variable d'environnement ALLOW_EXHIBITOR_BACKFILL=YES."
      );
    }
    if (!orgId && !eventId) {
      throw new Error(
        "[backfill] Refuse : --apply necessite un perimetre explicite (--org-id=<uuid> ou --event-id=<uuid>)."
      );
    }
  }

  console.log(
    `[backfill] mode : ${apply ? "APPLICATION REELLE (ecriture)" : "DRY-RUN (lecture seule, aucune ecriture)"}`
  );
  console.log(`[backfill] perimetre : org-id=${orgId ?? "(tous)"} event-id=${eventId ?? "(tous)"}`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const where: Prisma.ExhibitorWhereInput = {};
  if (orgId) where.organizationId = orgId;
  if (eventId) where.eventId = eventId;

  let total = emptyCounters();
  let cursorId: string | undefined;

  try {
    while (true) {
      const batch = await prisma.exhibitor.findMany({
        where,
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: { id: true, name: true, nameNormalized: true, stand: true, sector: true },
      });
      if (batch.length === 0) break;

      const existingLocations = await prisma.exhibitorLocation.findMany({
        where: {
          exhibitorId: { in: batch.map((e) => e.id) },
          type: LocationType.STAND,
        },
        select: { exhibitorId: true, codeNormalized: true },
      });
      const existingKeys = new Set(
        existingLocations.map((l) => standLocationKey(l.exhibitorId, l.codeNormalized))
      );

      const plan = planExhibitorBackfillBatch(batch, existingKeys);
      total = mergeCounters(total, plan.counters);

      if (apply && (plan.nameOps.length > 0 || plan.locationOps.length > 0)) {
        await prisma.$transaction([
          ...plan.nameOps.map((op) =>
            prisma.exhibitor.update({
              where: { id: op.exhibitorId },
              data: { nameNormalized: op.nameNormalized },
            })
          ),
          ...plan.locationOps.map((op) =>
            prisma.exhibitorLocation.create({
              data: {
                exhibitorId: op.exhibitorId,
                type: LocationType.STAND,
                code: op.code,
                codeNormalized: op.codeNormalized,
                sectorCode: op.sectorCode,
                portCode: op.portCode,
                logisticSpace: op.logisticSpace,
              },
            })
          ),
        ]);
      }

      if (batch.length < BATCH_SIZE) break;
      cursorId = batch[batch.length - 1].id;
    }
  } finally {
    await prisma.$disconnect();
  }

  printReport(total, apply);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
