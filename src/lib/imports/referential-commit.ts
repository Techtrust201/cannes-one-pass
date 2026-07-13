/**
 * Application transactionnelle (commit) du profil Referentiel — strategie
 * FUSION (Phase 3).
 *
 * FUSION :
 *  - creer les exposants/emplacements absents ;
 *  - mettre a jour ceux presents (geographie, reference externe, nom) ;
 *  - laisser INTACTS les absents (aucune desactivation silencieuse) ;
 *  - idempotent au reimport (cles naturelles : exposant = (eventId,
 *    nameNormalized) ; emplacement = (exhibitorId, type, codeNormalized)).
 *
 * MIROIR LEGACY TEMPORAIRE : creer un `Exhibitor` exige encore le champ legacy
 * `stand` (obligatoire jusqu'en Phase 1C). On le derive du 1er emplacement REEL
 * selon la priorite deterministe STAND > TERRE > FLOT. JAMAIS le nom de la
 * societe (ce serait une fausse donnee). Le parseur garantit qu'au moins un
 * emplacement existe ; ce champ est deprecie et la source de verite reste
 * `ExhibitorLocation` (tous les emplacements TERRE/FLOT sont conserves).
 *
 * Ce module recoit une transaction (`tx`) typee structurellement : il est donc
 * testable sans connexion Neon. Aucune ecriture Neon n'est realisee en Phase 3.
 */

import type { ParsedExhibitor, ParsedLocation, LocationTypeCode } from "./referential";
import { EMPTY_COUNTERS, type ImportBatchCounters } from "./import-batch";

interface ExistingExhibitor {
  id: string;
  name: string;
  nameNormalized: string | null;
  externalReference: string | null;
  stand: string;
}

interface ExistingLocation {
  id: string;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
  isActive: boolean;
}

/** Delegates Prisma minimaux (satisfaits par une transaction reelle ou un mock). */
export interface ReferentialCommitTx {
  exhibitor: {
    findFirst(args: {
      where: { organizationId: string; eventId: string; nameNormalized: string };
      select?: Record<string, unknown>;
    }): Promise<ExistingExhibitor | null>;
    create(args: { data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<{
      id: string;
    }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  exhibitorLocation: {
    findFirst(args: {
      where: { exhibitorId: string; type: LocationTypeCode; codeNormalized: string };
      select?: Record<string, unknown>;
    }): Promise<ExistingLocation | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface ReferentialCommitContext {
  organizationId: string;
  eventId: string;
}

export interface ReferentialCommitResult {
  counters: ImportBatchCounters;
  exhibitorsCreated: number;
  exhibitorsUpdated: number;
  exhibitorsUnchanged: number;
  locationsCreated: number;
  locationsUpdated: number;
  locationsUnchanged: number;
}

const LOCATION_PRIORITY: LocationTypeCode[] = ["STAND", "TERRE", "FLOT"];

/**
 * Derive le miroir legacy `Exhibitor.stand` depuis le 1er emplacement REEL
 * (priorite deterministe STAND > TERRE > FLOT). JAMAIS le nom de la societe.
 * Leve si l'exposant n'a aucun emplacement (le parseur l'empeche en amont).
 */
export function deriveLegacyStand(exhibitor: ParsedExhibitor): string {
  for (const type of LOCATION_PRIORITY) {
    const loc = exhibitor.locations.find((l) => l.type === type);
    if (loc) return loc.code;
  }
  throw new Error(
    `Exposant "${exhibitor.name}" sans emplacement : impossible de deriver le champ legacy 'stand'.`
  );
}

function locationGeographyDiffers(existing: ExistingLocation, parsed: ParsedLocation): boolean {
  return (
    existing.portCode !== parsed.portCode ||
    existing.sectorCode !== parsed.sectorCode ||
    existing.logisticSpace !== parsed.logisticSpace ||
    existing.isActive !== true
  );
}

/**
 * Applique le plan Referentiel (deja parse/valide) dans la transaction fournie.
 * L'appelant garantit que le parsing n'a produit aucune erreur bloquante et
 * que l'ImportBatch a ete cree hors transaction.
 */
export async function applyReferentialCommit(
  tx: ReferentialCommitTx,
  exhibitors: ParsedExhibitor[],
  ctx: ReferentialCommitContext
): Promise<ReferentialCommitResult> {
  const result: ReferentialCommitResult = {
    counters: { ...EMPTY_COUNTERS },
    exhibitorsCreated: 0,
    exhibitorsUpdated: 0,
    exhibitorsUnchanged: 0,
    locationsCreated: 0,
    locationsUpdated: 0,
    locationsUnchanged: 0,
  };

  for (const exhibitor of exhibitors) {
    const existing = await tx.exhibitor.findFirst({
      // Fusion scopee explicitement org + event + nameNormalized : deux
      // exposants homonymes dans deux events/organisations distincts ne sont
      // JAMAIS fusionnes (eventId appartient deja a une seule organisation).
      where: {
        organizationId: ctx.organizationId,
        eventId: ctx.eventId,
        nameNormalized: exhibitor.nameNormalized,
      },
      select: {
        id: true,
        name: true,
        nameNormalized: true,
        externalReference: true,
        stand: true,
      },
    });

    let exhibitorId: string;
    if (!existing) {
      const created = await tx.exhibitor.create({
        data: {
          organizationId: ctx.organizationId,
          eventId: ctx.eventId,
          name: exhibitor.name,
          nameNormalized: exhibitor.nameNormalized,
          externalReference: exhibitor.externalReference,
          stand: deriveLegacyStand(exhibitor),
          isActive: true,
        },
        select: { id: true },
      });
      exhibitorId = created.id;
      result.exhibitorsCreated += 1;
    } else {
      exhibitorId = existing.id;
      const patch: Record<string, unknown> = {};
      if (existing.name !== exhibitor.name) patch.name = exhibitor.name;
      if (existing.nameNormalized !== exhibitor.nameNormalized) {
        patch.nameNormalized = exhibitor.nameNormalized;
      }
      if (exhibitor.externalReference && existing.externalReference !== exhibitor.externalReference) {
        patch.externalReference = exhibitor.externalReference;
      }
      if (Object.keys(patch).length > 0) {
        await tx.exhibitor.update({ where: { id: existing.id }, data: patch });
        result.exhibitorsUpdated += 1;
      } else {
        result.exhibitorsUnchanged += 1;
      }
    }

    for (const loc of exhibitor.locations) {
      const existingLoc = await tx.exhibitorLocation.findFirst({
        where: { exhibitorId, type: loc.type, codeNormalized: loc.codeNormalized },
        select: {
          id: true,
          portCode: true,
          sectorCode: true,
          logisticSpace: true,
          isActive: true,
        },
      });

      if (!existingLoc) {
        await tx.exhibitorLocation.create({
          data: {
            exhibitorId,
            type: loc.type,
            code: loc.code,
            codeNormalized: loc.codeNormalized,
            portCode: loc.portCode,
            sectorCode: loc.sectorCode,
            logisticSpace: loc.logisticSpace,
            isActive: true,
          },
        });
        result.locationsCreated += 1;
      } else if (locationGeographyDiffers(existingLoc, loc)) {
        await tx.exhibitorLocation.update({
          where: { id: existingLoc.id },
          data: {
            code: loc.code,
            portCode: loc.portCode,
            sectorCode: loc.sectorCode,
            logisticSpace: loc.logisticSpace,
            isActive: true,
          },
        });
        result.locationsUpdated += 1;
      } else {
        result.locationsUnchanged += 1;
      }
    }
  }

  result.counters = {
    created: result.exhibitorsCreated + result.locationsCreated,
    updated: result.exhibitorsUpdated + result.locationsUpdated,
    unchanged: result.exhibitorsUnchanged + result.locationsUnchanged,
    deactivated: 0,
    errorCount: 0,
  };

  return result;
}
