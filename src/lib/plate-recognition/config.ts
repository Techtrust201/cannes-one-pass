/**
 * Résolution de la configuration de reconnaissance de plaque depuis l'env.
 * Réservé au serveur (lit des variables potentiellement secrètes).
 */
import type { PlateProvider } from "./types";

const VALID_PROVIDERS: PlateProvider[] = [
  "tesseract",
  "codeproject_ai",
  "disabled",
];

export interface PlateServerConfig {
  provider: PlateProvider;
  /** Seuil de confiance 0..1 en deçà duquel la lecture est "incertaine". */
  minConfidence: number;
  /** URL du service self-hosted (CodeProject.AI), sans clé. */
  codeProjectUrl: string | null;
  /** Clé optionnelle, jamais exposée au frontend. */
  codeProjectApiKey: string | null;
}

function parseConfidence(raw: string | undefined): number {
  const v = Number.parseFloat(raw ?? "");
  if (Number.isFinite(v) && v >= 0 && v <= 1) return v;
  return 0.75; // défaut raisonnable
}

/**
 * Provider par défaut : `tesseract` (gratuit, navigateur) pour préserver le
 * comportement existant si rien n'est configuré. Une valeur inconnue retombe
 * aussi sur `tesseract`.
 */
export function getPlateServerConfig(): PlateServerConfig {
  const raw = (process.env.PLATE_RECOGNITION_PROVIDER ?? "tesseract")
    .trim()
    .toLowerCase();
  const provider = (
    VALID_PROVIDERS.includes(raw as PlateProvider) ? raw : "tesseract"
  ) as PlateProvider;

  return {
    provider,
    minConfidence: parseConfidence(process.env.PLATE_MIN_CONFIDENCE),
    codeProjectUrl: process.env.CODEPROJECT_AI_URL?.trim() || null,
    codeProjectApiKey: process.env.CODEPROJECT_AI_API_KEY?.trim() || null,
  };
}
