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
import ExhibitorsExplorer from "@/components/logisticien/referentiel/ExhibitorsExplorer";

export default async function ReferentialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  if (query.espace !== "rx") redirect("/logisticien/referentiel?espace=rx");

  const request = new Request("http://localhost/logisticien/referentiel?espace=rx", {
    headers: await headers(),
  });
  let session;
  try {
    session = await requirePermission(request, "GESTION_ESPACES", "read");
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect("/login");
    notFound();
  }

  const orgId = await resolveEspaceOrgId("rx");
  if (!orgId) notFound();
  const accessible = await getAccessibleOrganizationIds(session.user.id);
  if (!canAccessOrganization(accessible, orgId)) notFound();

  const events = await prisma.event.findMany({
    where: { organizationId: orgId, isArchived: false },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 p-3 sm:p-6">
      <Suspense fallback={<div className="text-sm text-gray-500">Chargement…</div>}>
        <ExhibitorsExplorer
          events={events.map((event) => ({
            ...event,
            startDate: event.startDate.toISOString(),
            endDate: event.endDate.toISOString(),
          }))}
        />
      </Suspense>
    </div>
  );
}
