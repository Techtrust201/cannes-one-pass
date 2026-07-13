/**
 * Helper de lecture transitoire (Phase 1B) : expose une vue unifiee des
 * emplacements d'un exposant, en repli sur `Exhibitor.stand` legacy quand
 * aucune `ExhibitorLocation` n'existe encore.
 *
 * IMPORTANT : ce helper prepare uniquement la transition. Il n'est branche
 * sur aucune page/route en Phase 1B — le formulaire public sera adapte en
 * Phase 6. Fonction pure : ne fait aucun appel Prisma, prend en entree les
 * donnees deja chargees par l'appelant.
 */

import { parseLegacySector } from "@/lib/imports/legacy-sector";
import { normalizeLocationCode } from "@/lib/imports/normalization";

export interface ExhibitorLocationLike {
  id: string;
  exhibitorId: string;
  type: "TERRE" | "FLOT" | "STAND";
  code: string;
  codeNormalized: string;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
  isActive: boolean;
}

export interface ExhibitorLikeForFallback {
  id: string;
  stand: string | null;
  sector?: string | null;
}

export interface VirtualLegacyLocation extends ExhibitorLocationLike {
  /** Marque explicitement qu'il ne s'agit pas d'une ligne ExhibitorLocation reelle. */
  isLegacyFallback: true;
}

export type ExhibitorLocationOrLegacy = ExhibitorLocationLike | VirtualLegacyLocation;

/**
 * Retourne les emplacements exploitables d'un exposant :
 *  1. si des `ExhibitorLocation` actives existent -> on les retourne telles quelles ;
 *  2. sinon, si `Exhibitor.stand` est renseigne -> on retourne une location
 *     legacy virtuelle de type STAND (jamais persistee) ;
 *  3. sinon -> liste vide.
 *
 * Les locations reelles sont toujours prioritaires sur le repli legacy.
 */
export function getExhibitorLocationsWithLegacyFallback(
  exhibitor: ExhibitorLikeForFallback,
  locations: readonly ExhibitorLocationLike[]
): ExhibitorLocationOrLegacy[] {
  const activeLocations = locations.filter((location) => location.isActive);
  if (activeLocations.length > 0) return activeLocations;

  const normalized = normalizeLocationCode(exhibitor.stand);
  if (!normalized) return [];

  const parsed = parseLegacySector(exhibitor.sector ?? null);

  const legacy: VirtualLegacyLocation = {
    id: `legacy:${exhibitor.id}`,
    exhibitorId: exhibitor.id,
    type: "STAND",
    code: normalized.code,
    codeNormalized: normalized.codeNormalized,
    portCode: parsed.portCode,
    sectorCode: parsed.sectorCode,
    logisticSpace: parsed.logisticSpace,
    isActive: true,
    isLegacyFallback: true,
  };
  return [legacy];
}
