/**
 * Accès tolérant au `localStorage`.
 *
 * Pourquoi : sur certains navigateurs mobiles le SEUL fait d'accéder à
 * `window.localStorage` lève une exception (Safari iOS « Bloquer tous les
 * cookies », navigation privée sur d'anciennes versions, WebView d'app tierce,
 * stockage désactivé par politique d'entreprise). Lorsqu'un composant lit le
 * storage pendant le rendu (ex. initialiseur `useState`), cette exception n'est
 * pas catchée et fait planter tout l'arbre React → écran blanc Next
 * « Application error: a client-side exception has occurred ».
 *
 * Ces helpers ne lèvent JAMAIS : ils renvoient `null`/`false` en cas d'échec.
 * Utiliser exclusivement ces fonctions dans le parcours public.
 */

function getStore(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    // L'accès à la propriété elle-même peut lever (SecurityError).
    return window.localStorage;
  } catch {
    return null;
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return getStore()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    const store = getStore();
    if (!store) return false;
    store.setItem(key, value);
    return true;
  } catch {
    // QuotaExceededError (mode privé Safari) ou stockage indisponible.
    return false;
  }
}

export function safeRemoveItem(key: string): boolean {
  try {
    const store = getStore();
    if (!store) return false;
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
