/**
 * Validation de format de plaque (isomorphe). Sert à décider si une lecture OCR
 * est plausible, indépendamment du provider. Réutilise `normalizePlate` pour
 * rester cohérent avec le lookup et le backfill SQL.
 */
import { normalizePlate } from "@/lib/plate-utils";

// Format SIV (depuis 2009) : AA-123-AA → AA123AA.
const FR_SIV = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;
// Ancien format (FNI) : 1 à 4 chiffres + 2-3 lettres + 2 chiffres → 1234AB75.
const FR_OLD = /^[0-9]{1,4}[A-Z]{2,3}[0-9]{2}$/;

/** La plaque normalisée correspond-elle à un format d'immatriculation FR connu ? */
export function isPlausiblePlate(normalized: string | null): boolean {
  if (!normalized) return false;
  return FR_SIV.test(normalized) || FR_OLD.test(normalized);
}

/**
 * Transforme une lecture OCR brute en candidate plaque + indicateur de
 * plausibilité de format. Ne juge pas la confiance du moteur (gérée à part).
 */
export function scorePlateCandidate(raw: string): {
  normalized: string | null;
  plausible: boolean;
} {
  const normalized = normalizePlate(raw);
  return { normalized, plausible: isPlausiblePlate(normalized) };
}
