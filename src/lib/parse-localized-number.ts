/**
 * Parse une valeur numérique en acceptant les décimales françaises (virgule)
 * comme anglaises (point), ainsi que les espaces (séparateurs de milliers ou
 * saisie mobile). Retourne `null` si la valeur n'est pas un nombre fini valide.
 *
 * Exemples acceptés : "1,3", "1.3", "0,22", "0.22", " 20 ", 12, "-3,5".
 * Rejetés : "", "abc", "1,2,3", "1.2.3", NaN, Infinity.
 */
export function parseLocalizedNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  // Normalise : retire tous les espaces, virgule décimale → point.
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".");
  if (normalized === "") return null;

  // N'accepte qu'un nombre décimal simple (un seul point au plus).
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
