/**
 * Logique pure de mapping événement API → `EventOption`, extraite de
 * `EventCarouselSelector.tsx` (Phase 6C-A / F8) pour être testable en
 * isolation : ce fichier ne contient aucun JSX, il peut donc être importé
 * par un test `.test.ts` classique (le pipeline Vitest de ce projet, avec
 * `tsconfig.json` en `jsx: "preserve"`, ne sait pas transformer un import de
 * `.tsx` dans un test).
 */

export interface EventOption {
  key: string;
  label: string;
  logo: string;
  id: string;
  /**
   * Mode de lecture du planning logistique en base
   * (`Event.logisticsPlanningMode`). `GET /api/events` renvoie déjà ce champ
   * (objet Event complet) : on le conserve ici au lieu de le supprimer, pour
   * que les templates (RX) puissent piloter le caractère obligatoire de
   * l'emplacement référentiel et le comportement du planning DB sans créer
   * de route dédiée. Défaut "DISABLED" si absent (comportement historique).
   */
  logisticsPlanningMode: "DISABLED" | "TRANSITION" | "STRICT";
}

export interface RawApiEvent {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  logisticsPlanningMode?: string | null;
}

/**
 * Traduit un événement brut de `GET /api/events` en `EventOption`.
 * `logisticsPlanningMode` doit être conservé (et non plus supprimé) pour
 * piloter le caractère obligatoire de l'emplacement référentiel et le
 * comportement du planning DB côté RX ; toute valeur inconnue ou absente
 * retombe explicitement sur `"DISABLED"` (comportement historique).
 */
export function mapEventOptionFromApi(e: RawApiEvent): EventOption {
  return {
    id: e.id,
    key: e.slug,
    label: e.name,
    logo: e.logo || `/api/events/${e.id}/logo`,
    logisticsPlanningMode:
      e.logisticsPlanningMode === "TRANSITION" || e.logisticsPlanningMode === "STRICT"
        ? e.logisticsPlanningMode
        : "DISABLED",
  };
}
