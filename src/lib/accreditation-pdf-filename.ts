/**
 * Construction des noms de fichiers PDF d'accréditation (Lot 4).
 *
 * Objectif : un nom de fichier parlant et sûr, intégrant le stand et — pour les
 * accréditations individuelles véhicule — la plaque. Exemples :
 *   - Accreditation_Stand_A12.pdf
 *   - Accreditation_StandA12_AB123CD.pdf
 *   - Demande_Accreditation_StandA12.pdf (document non validé)
 *
 * Le nom est « ASCII-safe » : accents retirés, espaces et caractères spéciaux
 * remplacés, longueur bornée — afin d'éviter tout souci de téléchargement, de
 * header Content-Disposition ou de pièce jointe e-mail.
 */

/** Longueur max d'un segment (stand/plaque) après nettoyage. */
const MAX_PART_LENGTH = 40;

/**
 * Nettoie un segment de nom de fichier : retire les accents, ne conserve que
 * [A-Za-z0-9], compacte les séparateurs en un seul tiret et borne la longueur.
 * Renvoie une chaîne vide si rien d'exploitable.
 */
export function sanitizeFilenamePart(value: string | null | undefined): string {
  if (!value) return "";
  const noAccents = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const cleaned = noAccents
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, MAX_PART_LENGTH).replace(/-+$/g, "");
}

/**
 * Construit le nom de fichier PDF d'une accréditation.
 *
 * @param stand     nom/numéro de stand (ex. « Stand A12 »)
 * @param plate     plaque du véhicule (PDF individuel) ; omis pour le PDF global
 * @param validated true = document officiel (« Accreditation_… ») ;
 *                   false = demande non validée (« Demande_Accreditation_… »)
 */
export function buildAccreditationPdfFilename(opts: {
  stand?: string | null;
  plate?: string | null;
  validated: boolean;
}): string {
  const prefix = opts.validated ? "Accreditation" : "Demande_Accreditation";
  const parts = [prefix];
  const stand = sanitizeFilenamePart(opts.stand);
  if (stand) parts.push(stand);
  const plate = sanitizeFilenamePart(opts.plate);
  if (plate) parts.push(plate);
  return `${parts.join("_")}.pdf`;
}
