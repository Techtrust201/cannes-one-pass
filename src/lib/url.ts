export type SearchParams = Record<string, string | undefined>;

export function buildLink(
  params: SearchParams,
  page: number,
  overrides: Record<string, string> = {}
) {
  const qs = new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      if (v !== undefined && v !== null && v !== "") acc[k] = String(v);
      return acc;
    }, {})
  );
  qs.set("page", String(page));
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) qs.delete(k);
    else qs.set(k, v);
  }
  return `/logisticien?${qs.toString()}`;
}

/**
 * Ajoute le paramètre `espace` à un chemin s'il est fourni. Utilisé pour les
 * liens internes du dashboard logisticien afin de préserver le contexte
 * d'Espace sélectionné lors de la navigation.
 */
export function withEspaceQuery(path: string, espace: string | null | undefined): string {
  if (!espace) return path;
  const [base, existingQs] = path.split("?", 2);
  const qs = new URLSearchParams(existingQs ?? "");
  qs.set("espace", espace);
  return `${base}?${qs.toString()}`;
}
