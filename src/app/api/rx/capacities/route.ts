/**
 * GET/POST/PATCH/DELETE /api/rx/capacities
 *
 * Alias rétrocompatible legacy. La route générique est /api/capacities ;
 * cette route ré-exporte ses handlers pour ne rien casser côté clients
 * existants, sans dupliquer la moindre ligne de logique métier.
 *
 * @see src/app/api/capacities/route.ts
 * @see docs/rx/RX_CAPACITY_CONTRACT.md
 */
export { GET, POST, PATCH, DELETE } from "@/app/api/capacities/route";
