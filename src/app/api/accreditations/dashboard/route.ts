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
import { filterAndSortAccreditations } from "@/lib/accreditations-dashboard";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;

/**
 * Pagination serveur (offset/limit) pour le mode « défilement continu » du
 * dashboard logisticien. Renvoie un lot d'accréditations correspondant aux
 * mêmes filtres/tri que le rendu SSR (logique partagée
 * `filterAndSortAccreditations`), pour éviter tout écart de total/doublon.
 */
export async function GET(request: NextRequest) {
  let userId: string;
  try {
    const session = await requirePermission(request, "LISTE", "read");
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
    status: searchParams.get("status"),
    zone: searchParams.get("zone"),
  });

  const activeVehicleTypes = await prisma.vehicleTypeConfig.findMany({
    where: { isActive: true, ...(espaceOrgId ? { organizationId: espaceOrgId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const vehicleTypesData =
    activeVehicleTypes.length > 0
      ? activeVehicleTypes.map(mapDbVehicleType)
      : mapDefaultVehicleTypes(espaceParam);

  const filtered = filterAndSortAccreditations(
    data,
    {
      q: searchParams.get("q") ?? "",
      status: searchParams.get("status") ?? "",
      zone: searchParams.get("zone") ?? "",
      vehicleType: searchParams.get("vehicleType") ?? "",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
      sort: searchParams.get("sort") ?? "vehicleDate",
      dir: searchParams.get("dir") ?? "desc",
    },
    vehicleTypesData
  );

  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT)
  );

  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);
  const hasMore = offset + items.length < total;

  return Response.json({ items, total, offset, limit, hasMore });
}
