/**
 * Abstraction de reconnaissance de plaque (OCR / ALPR).
 *
 * Objectif : ne pas dépendre d'un seul moteur. Aujourd'hui Tesseract.js (gratuit,
 * navigateur) ; demain un provider self-hosted gratuit (CodeProject.AI ALPR ou
 * équivalent) sans refondre l'interface. Aucun provider payant pour l'instant.
 *
 * Types isomorphes (utilisables côté client et serveur).
 */

/** Providers supportés. `disabled` = saisie manuelle uniquement. */
export type PlateProvider = "tesseract" | "codeproject_ai" | "disabled";

/** Résultat normalisé d'une tentative de reconnaissance. */
export interface PlateRecognitionResult {
  /** true seulement si une plaque exploitable a été reconnue avec assez de confiance. */
  success: boolean;
  /** Plaque brute proposée (peut être affichée pour correction). */
  plate: string | null;
  /** Plaque normalisée (alphanumérique majuscule) prête pour le lookup. */
  normalizedPlate: string | null;
  /** Confiance 0..1, ou null si non fournie par le provider. */
  confidence: number | null;
  /** Provider effectivement utilisé. */
  provider: PlateProvider;
  /** Message éventuel (lecture incertaine, indisponible, désactivé…). */
  message?: string;
}

/** Config publique (non secrète) exposée au frontend pour router l'appel. */
export interface PlateRecognitionPublicConfig {
  provider: PlateProvider;
  minConfidence: number;
}
