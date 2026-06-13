/**
 * Validation d'URL pour les liens fournis par l'utilisateur (ex: lecteur de
 * plaque par zone, Lot 3). N'autorise que http/https afin de bloquer les
 * protocoles dangereux (`javascript:`, `data:`, `file:`, etc.).
 *
 * À utiliser côté serveur (validation avant persistance) ET côté client
 * (avant de rendre un lien cliquable).
 */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}
