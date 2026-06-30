export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { readAccreditations } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  getAccessibleEventIdsForEspace,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";
import {
  mapDbVehicleType,
  mapDefaultVehicleTypes,
} from "@/lib/vehicle-type-server";
import {
  filterAccreditations,
  computeAccreditationStats,
} from "@/lib/accreditations-dashboard";

/**
 * Compteurs d'accréditations (par statut + par gabarit, avec sous-total poids
 * lourds) pour l'onglet « Comptage » de Flux véhicules. Indépendant de la
 * pagination du dashboard : garantit que NOUVEAU et camions sont bien comptés.
 * Filtres optionnels de date (from/to) pour cadrer une période.
 */
export async function GET(request: NextRequest) {
  let userId: string;
  try {
    const session = await requirePermission(request, "FLUX_VEHICULES", "read");
    userId = session.user.id;
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response("Non autorisé", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const espaceParam = searchParams.get("espace")?.trim() || null;

  const accessibleEventIds = await getAccessibleEventIdsForEspace(
    userId,
    espaceParam
  );
  const espaceOrgId = espaceParam ? await resolveEspaceOrgId(espaceParam) : null;

  const data = await readAccreditations({
    accessibleEventIds,
    organizationId: espaceOrgId,
  });

  const activeVehicleTypes = await prisma.vehicleTypeConfig.findMany({
    where: { isActive: true, ...(espaceOrgId ? { organizationId: espaceOrgId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const vehicleTypesData =
    activeVehicleTypes.length > 0
      ? activeVehicleTypes.map(mapDbVehicleType)
      : mapDefaultVehicleTypes(espaceParam);

  // Seuls les filtres de date sont appliqués (le comptage doit refléter tous
  // les statuts et gabarits de la période).
  const scoped = filterAccreditations(
    data,
    {
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    },
    vehicleTypesData
  );

  const stats = computeAccreditationStats(scoped, vehicleTypesData);
  return Response.json(stats);
}
