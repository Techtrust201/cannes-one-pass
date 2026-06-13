import type { AccreditationStatus } from "@/types";

/** Action déclenchée par l'agent depuis la popup de scan. */
export type ScanAction = "VALIDATE_ENTRY" | "REFUSE" | "ENTRY" | "EXIT";

/** Type de scan à l'origine de l'action (contexte de traçabilité). */
export type ScanType = "qr" | "plate";

/** Véhicule tel qu'affiché dans la popup de résumé du scan. */
export interface ScanVehicle {
  id: number;
  plate: string | null;
  trailerPlate: string | null;
  /** Gabarit résolu (libellé court) côté serveur. */
  vehicleLabel: string;
  /** Téléphone affichable (indicatif + numéro). */
  phone: string | null;
}

/**
 * Résumé d'accréditation renvoyé par `/api/accreditations/lookup` et consommé
 * par la popup de scan. Volontairement allégé : ne nécessite pas la permission
 * `LISTE` (les agents terrain n'y ont pas forcément accès).
 */
export interface AccreditationScanSummary {
  id: string;
  company: string;
  stand: string;
  status: AccreditationStatus;
  currentZone: string | null;
  version: number;
  isArchived: boolean;
  entryAt: string | null;
  exitAt: string | null;
  vehicles: ScanVehicle[];
}
