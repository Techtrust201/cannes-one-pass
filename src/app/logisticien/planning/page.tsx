export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  canAccessOrganization,
  getAccessibleOrganizationIds,
  requirePermission,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";
import PlanningQuotasExplorer from "@/components/logisticien/planning/PlanningQuotasExplorer";

export default async function PlanningQuotasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  if (query.espace !== "rx") redirect("/logisticien/planning?espace=rx");

  const request = new Request("http://localhost/logisticien/planning?espace=rx", {
    headers: await headers(),
  });

  let session;
  try {
    // Accès page si GESTION_DATES ou FLUX_VEHICULES (lecture).
    try {
      session = await requirePermission(request, "GESTION_DATES", "read");
    } catch (first) {
      if (!(first instanceof Response) || (first.status !== 401 && first.status !== 403)) {
        throw first;
      }
      session = await requirePermission(request, "FLUX_VEHICULES", "read");
    }
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect("/login");
    notFound();
  }

  const orgId = await resolveEspaceOrgId("rx");
  if (!orgId) notFound();
  const accessible = await getAccessibleOrganizationIds(session.user.id);
  if (!canAccessOrganization(accessible, orgId)) notFound();

  const [events, zones] = await Promise.all([
    prisma.event.findMany({
      where: { organizationId: orgId, isArchived: false },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, startDate: true, endDate: true },
    }),
    prisma.zoneConfig.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { label: "asc" },
      select: { zone: true, label: true },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 min-h-0 p-3 sm:p-6">
      <Suspense fallback={<div className="text-sm text-gray-500">Chargement…</div>}>
        <PlanningQuotasExplorer
          events={events.map((event) => ({
            ...event,
            startDate: event.startDate.toISOString(),
            endDate: event.endDate.toISOString(),
          }))}
          zones={zones.map((z) => ({ code: z.zone, label: z.label }))}
        />
      </Suspense>
    </div>
  );
}
