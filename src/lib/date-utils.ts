/**
 * Parse une date véhicule stockée en base (deux formats possibles) en objet Date.
 * - "YYYY-MM-DD" (HTML date input, nouvelles accréditations)
 * - "DD/MM/YYYY" (ancien format, saisie manuelle)
 */
export function parseVehicleDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  if (dateStr.includes("-")) {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day);
  }
  const [day, month, year] = dateStr.split("/").map(Number);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day);
}

/**
 * Formate une date véhicule (string brute) en "DD/MM/YY" pour l'affichage.
 */
export function formatVehicleDate(dateStr?: string): string {
  const d = parseVehicleDate(dateStr);
  if (!d) return "-";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
