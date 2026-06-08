import type { RxCategorySelection } from "./types";

/**
 * Compte les véhicules « logiques » demandés par l'exposant :
 * - 1 par ligne livraison (ou véhicule saisi en skip montage)
 * - +1 par reprise distincte (repSameAsDelivery === false)
 */
export function countRxLogicalVehicles(
  categories: RxCategorySelection[],
  skipDemontage?: boolean
): number {
  if (skipDemontage) {
    return categories.reduce((s, c) => s + c.vehicles.length, 0);
  }
  return categories.reduce(
    (sum, cat) =>
      sum +
      cat.vehicles.reduce(
        (vs, v) => vs + 1 + (v.repSameAsDelivery === false ? 1 : 0),
        0
      ),
    0
  );
}
