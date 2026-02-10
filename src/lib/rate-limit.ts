/**
 * Rate limiter simple en mémoire pour les routes API.
 * Compatible avec Vercel Edge/Serverless.
 * 
 * Note : En serverless, chaque instance a son propre Map.
 * Ce n'est pas un rate limiter distribué, mais ça bloque les abus
 * évidents (bot, boucle infinie côté client, etc.).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Nettoyage périodique des entrées expirées (toutes les 60s)
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}

interface RateLimitOptions {
  /** Nombre max de requêtes dans la fenêtre */
  limit: number;
  /** Fenêtre en secondes */
  windowSeconds: number;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Vérifie si une requête est autorisée selon le rate limit.
 * @param identifier - Clé unique (ex: IP + route)
 * @param options - Configuration du rate limit
 * @returns Résultat avec headers à renvoyer
 */
export function rateLimit(
  identifier: string,
  options: RateLimitOptions
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  const key = identifier;

  let entry = store.get(key);

  // Nouvelle fenêtre ou fenêtre expirée
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  const remaining = Math.max(0, options.limit - entry.count);
  const success = entry.count <= options.limit;

  return {
    success,
    limit: options.limit,
    remaining,
    reset: entry.resetAt,
  };
}

/**
 * Extrait l'IP du client depuis les headers de la requête.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
