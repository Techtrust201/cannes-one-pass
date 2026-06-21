/**
 * Gestion du code technique d'un gabarit véhicule (création back-office).
 *
 * Règle métier : à la création, le code est prérempli depuis l'appellation
 * (gabarit) mais reste librement modifiable, et il conserve la valeur EXACTE
 * saisie (ex. « 15 m³ »). On ne force JAMAIS une transformation en slug type
 * « 15_M3 » : les codes RX historiques sont précisément des libellés bruts
 * (« 10 m³ », « 20 m³ », « Porteur »…) qu'il faut pouvoir reproduire.
 *
 * Après création, le code est verrouillé (cf. PATCH /api/vehicle-types/[id]) :
 * il référence le gabarit dans les accréditations, le bilan carbone, les PDF,
 * les e-mails et les historiques.
 */

/**
 * Suggestion de code à la création : valeur exacte de l'appellation, sans
 * transformation. Utilisée pour le préremplissage tant que l'admin n'a pas
 * saisi le code manuellement.
 */
export function suggestVehicleTypeCode(
  gabarit: string | null | undefined
): string {
  return (gabarit ?? "").trim();
}

/**
 * Un code de gabarit est valide s'il n'est pas vide une fois les espaces de
 * bord retirés. (L'unicité par organisation est vérifiée côté API.)
 */
export function isValidVehicleTypeCode(
  code: string | null | undefined
): boolean {
  return (code ?? "").trim().length > 0;
}
