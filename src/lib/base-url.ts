/**
 * Retourne l'URL de base de l'application.
 * En production (Vercel), utilise VERCEL_URL ou NEXT_PUBLIC_APP_URL.
 * En local, utilise localhost:3000.
 */
export function getBaseUrl(): string {
  // Variable d'environnement explicite (prioritaire)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Vercel fournit automatiquement VERCEL_URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Variable d'environnement custom
  if (process.env.INTERNAL_BASE_URL) {
    return process.env.INTERNAL_BASE_URL;
  }
  // Fallback local
  return "http://localhost:3000";
}
