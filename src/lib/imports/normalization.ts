/**
 * Normalisation pure et deterministe pour le referentiel exposants
 * (nom, code d'emplacement, codes optionnels secteur/port/espace).
 *
 * Utilisee par le backfill Phase 1B et, plus tard, par les imports CSV
 * generiques (Phase 3+). Aucune fonction de ce module ne doit jamais
 * modifier un libelle affiche existant : elles ne font que *calculer* des
 * cles de comparaison a partir d'une valeur source.
 *
 * Regles communes :
 *  - trim ;
 *  - accents retires de maniere deterministe (NFD + suppression des
 *    marques diacritiques) ;
 *  - espaces multiples ramenes a un seul espace ;
 *  - cle normalisee toujours en MAJUSCULES ;
 *  - resultat stable et idempotent (meme entree -> meme sortie, toujours).
 */

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Calcule la valeur a stocker dans `Exhibitor.nameNormalized` depuis
 * `Exhibitor.name`. Conserve les espaces entre mots (collapse uniquement
 * les espaces multiples) afin de ne jamais fusionner deux noms distincts.
 *
 * "  Sunseeker  " -> "SUNSEEKER"
 *
 * Ne modifie jamais `Exhibitor.name` lui-meme.
 */
export function normalizeExhibitorName(value: string | null | undefined): string | null {
  if (!value) return null;
  const collapsed = collapseSpaces(value);
  if (!collapsed) return null;
  return stripAccents(collapsed).toUpperCase();
}

export interface NormalizedLocationCode {
  /** Libelle affiche (trim + espaces multiples collapses), a stocker dans `ExhibitorLocation.code`. */
  code: string;
  /** Cle de comparaison stricte (MAJUSCULES, accents retires, separateurs supprimes). */
  codeNormalized: string;
}

/**
 * Normalise un code d'emplacement legacy (stand/jetee/etc.) en distinguant
 * le libelle affiche (`code`) de la cle de comparaison (`codeNormalized`).
 *
 * Separateurs supprimes UNIQUEMENT dans `codeNormalized` (pas dans `code`) :
 *   - espaces ;
 *   - tirets ASCII `-` ;
 *   - underscores `_` ;
 *   - points `.`.
 *
 * Exemples :
 *   "JETEE 001"  -> { code: "JETEE 001",  codeNormalized: "JETEE001" }
 *   "JETEE-001"  -> { code: "JETEE-001",  codeNormalized: "JETEE001" }  (meme cle)
 *   "Power 209"  -> { code: "Power 209",  codeNormalized: "POWER209" }
 *   "Power 219"  -> { code: "Power 219",  codeNormalized: "POWER219" } (codes distincts)
 *
 * Deux libelles qui fusionnent silencieusement (ex. "AB" et "A-B") doivent
 * etre signales par l'appelant (cf. compteur `codeNormalizedCollisions` du
 * backfill) plutot qu'ignorees.
 */
export function normalizeLocationCode(
  value: string | null | undefined
): NormalizedLocationCode | null {
  if (!value) return null;
  const code = collapseSpaces(value);
  if (!code) return null;
  const codeNormalized = stripAccents(code)
    .toUpperCase()
    .replace(/[\s\-_.]+/g, "");
  if (!codeNormalized) return null;
  return { code, codeNormalized };
}

/**
 * Normalise un code optionnel issu d'un champ texte libre legacy (secteur,
 * port, espace logistique...). Conserve les espaces entre mots (ex:
 * "VIEUX PORT") pour rester lisible tout en garantissant une comparaison
 * stable (accents, casse, espaces multiples).
 *
 * Retourne `null` si la valeur est vide/absente : on ne doit jamais
 * inventer une valeur a partir de rien.
 */
export function normalizeOptionalCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const collapsed = collapseSpaces(value);
  if (!collapsed) return null;
  return stripAccents(collapsed).toUpperCase();
}
