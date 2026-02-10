/**
 * Utilitaire fetch avec retry automatique sur erreur 429 (Too Many Requests).
 * 
 * - Lit le header `Retry-After` pour calculer le délai d'attente
 * - Backoff exponentiel (1s, 2s, 4s) si `Retry-After` absent
 * - Max 3 tentatives par défaut
 * - Mode silencieux : ne throw pas sur 429, retourne la dernière Response
 */

interface FetchWithRetryOptions extends RequestInit {
  /** Nombre max de tentatives (défaut: 3) */
  maxRetries?: number;
  /** Délai de base en ms pour le backoff exponentiel (défaut: 1000) */
  baseDelayMs?: number;
  /** Si true, ne log pas les retries (défaut: false) */
  silent?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrapper autour de `fetch` avec gestion automatique du 429.
 * Retente la requête avec un délai exponentiel.
 */
export async function fetchWithRetry(
  url: string | URL | Request,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { maxRetries = 3, baseDelayMs = 1000, silent = false, ...fetchOptions } = options;

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // Si ce n'est pas un 429, retourner directement
      if (response.status !== 429) {
        return response;
      }

      lastResponse = response;

      // C'est un 429 — calculer le délai d'attente
      if (attempt < maxRetries) {
        // Essayer de lire Retry-After (en secondes)
        const retryAfter = response.headers.get("Retry-After");
        let delayMs: number;

        if (retryAfter) {
          const retrySeconds = parseInt(retryAfter, 10);
          delayMs = isNaN(retrySeconds) ? baseDelayMs * 2 ** attempt : retrySeconds * 1000;
        } else {
          // Backoff exponentiel : 1s, 2s, 4s
          delayMs = baseDelayMs * 2 ** attempt;
        }

        if (!silent) {
          console.log(
            `[fetchWithRetry] 429 reçu, tentative ${attempt + 1}/${maxRetries}, retry dans ${delayMs}ms`
          );
        }

        await sleep(delayMs);
      }
    } catch (error) {
      // Erreur réseau — retenter seulement si tentatives restantes
      if (attempt === maxRetries) {
        throw error;
      }

      if (!silent) {
        console.log(
          `[fetchWithRetry] Erreur réseau, tentative ${attempt + 1}/${maxRetries}, retry dans ${baseDelayMs * 2 ** attempt}ms`
        );
      }

      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  // Retourner la dernière réponse 429 si toutes les tentatives échouent
  return lastResponse!;
}
