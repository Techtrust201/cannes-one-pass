/**
 * Persistance du « dernier espace sélectionné » (modèle multi-tenant standard,
 * façon Vercel teams / Slack workspaces).
 *
 * Le cookie est lisible côté serveur (SSR du dashboard) ET écrit côté client
 * (switcher d'espace). On atterrit toujours sur un espace : ce cookie mémorise
 * le choix pour qu'il persiste au refresh / à la navigation / au prochain login.
 */

export const ESPACE_COOKIE = "espace";

/** Durée de vie : 1 an. */
const MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Écrit le cookie côté client (à appeler depuis le switcher avant navigation).
 * `SameSite=Lax` suffit (navigation interne), `path=/` pour tout le site.
 */
export function setEspaceCookie(slug: string): void {
  if (typeof document === "undefined" || !slug) return;
  document.cookie = `${ESPACE_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}
