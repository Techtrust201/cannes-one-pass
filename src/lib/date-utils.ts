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

/**
 * Parse une chaîne de recherche pouvant être une date (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD).
 * Retourne la Date à minuit ou null si invalide.
 */
export function parseSearchDate(query: string): Date | null {
  const s = query.trim().replace(/\s+/g, " ");
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const date = new Date(y, m - 1, d);
      if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) return date;
    }
  }
  // DD/MM/YYYY ou DD-MM-YYYY
  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const [, d, m, yStr] = match;
    const day = Number(d);
    const month = Number(m);
    let year = Number(yStr);
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
    }
  }
  return null;
}

/**
 * Formate une Date en chaîne heure pour la recherche (HH:mm).
 */
export function formatTimeForSearch(d: Date | string | null | undefined): string[] {
  if (!d) return [];
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return [];
  const h = date.getHours();
  const m = date.getMinutes();
  const hm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const hmAlt = `${h}:${String(m).padStart(2, "0")}`;
  const result = [hm];
  if (hm !== hmAlt) result.push(hmAlt);
  result.push(`${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`);
  return result;
}
