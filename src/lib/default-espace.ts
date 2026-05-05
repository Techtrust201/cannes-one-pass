import { getAccessibleEventIdsForEspace } from "./auth-helpers";

/** Slug canonique (seed prod) pour le Palais des Festivals. */
export const DEFAULT_ESPACES_PALAIS_SLUG = "palais-des-festivals";

function normalizeAccentSlug(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

/**
 * Sélection synchrone parmi une liste déjà filtrée (ordre préservé).
 * 1. Slug canonique {@link DEFAULT_ESPACES_PALAIS_SLUG}.
 * 2. Sinon slug/nom rapprochant « Palais » + « Festival ».
 * 3. Sinon premier élément du tableau.
 */
export function pickPreferredEspaceSlug<T extends { slug: string; name: string }>(
  pool: T[]
): string | null {
  if (pool.length === 0) return null;

  const exact = pool.find((o) => o.slug === DEFAULT_ESPACES_PALAIS_SLUG);
  if (exact) return exact.slug;

  const fuzzy = pool.find((o) => {
    const ns = normalizeAccentSlug(o.slug);
    const nm = normalizeAccentSlug(o.name);
    const palais = ns.includes("palais") || nm.includes("palais");
    const festival = ns.includes("festival") || nm.includes("festival");
    return palais && festival;
  });
  if (fuzzy) return fuzzy.slug;

  return pool[0].slug;
}

/**
 * Choisit l'Espace par défaut pour un utilisateur non super-admin :
 * préfère les Espaces où le périmètre événements (LISTE / grants) est non vide,
 * puis applique la priorité {@link pickPreferredEspaceSlug}.
 */
export async function resolveDefaultEspaceSlugForUser(
  userId: string,
  espaces: Array<{ slug: string; name: string }>
): Promise<string | null> {
  if (espaces.length === 0) return null;

  const withEvents: typeof espaces = [];
  for (const o of espaces) {
    const ids = await getAccessibleEventIdsForEspace(userId, o.slug);
    if (Array.isArray(ids) && ids.length > 0) {
      withEvents.push(o);
    }
  }

  const pool = withEvents.length > 0 ? withEvents : espaces;
  return pickPreferredEspaceSlug(pool);
}
