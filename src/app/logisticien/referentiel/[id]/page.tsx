export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Building2, ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  canAccessOrganization,
  getAccessibleOrganizationIds,
  requirePermission,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";
import ExhibitorLocationsPanel from "@/components/logisticien/referentiel/ExhibitorLocationsPanel";
import PageHelp from "@/components/logisticien/help/PageHelp";

export default async function ExhibitorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (query.espace !== "rx") redirect(`/logisticien/referentiel/${id}?espace=rx`);

  const request = new Request(`http://localhost/logisticien/referentiel/${id}?espace=rx`, {
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

  const exhibitor = await prisma.exhibitor.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      name: true,
      externalReference: true,
      isActive: true,
      eventRef: { select: { name: true } },
      locations: {
        orderBy: [{ isActive: "desc" }, { type: "asc" }, { code: "asc" }],
        select: {
          id: true,
          type: true,
          code: true,
          portCode: true,
          sectorCode: true,
          logisticSpace: true,
          isActive: true,
        },
      },
    },
  });
  if (!exhibitor) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col p-3 sm:p-6">
      <Link
        href="/logisticien/referentiel?espace=rx"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-gray-500 hover:text-[#3F4660] sm:min-h-0"
      >
        <ChevronLeft size={16} /> Tous les exposants
      </Link>
      <PageHelp storageKey="rx-exhibitor-detail">
        <p>
          Fiche de l’exposant : vérifiez le nom, puis gérez ses emplacements ci-dessous.
        </p>
        <p>
          Les demandes d’accréditation RX s’appuient sur ces emplacements pour proposer les bons créneaux.
        </p>
      </PageHelp>
      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-start gap-2 text-lg font-bold text-gray-900 sm:text-xl">
              <Building2 size={21} className="mt-0.5 shrink-0 text-[#3F4660]" />
              <span className="break-words">{exhibitor.name}</span>
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {exhibitor.eventRef.name}
              {exhibitor.externalReference ? ` · Réf. ${exhibitor.externalReference}` : ""}
            </p>
          </div>
          <span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${exhibitor.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
            {exhibitor.isActive ? "Actif" : "Inactif"}
          </span>
        </div>
      </div>
      <ExhibitorLocationsPanel exhibitorId={exhibitor.id} initialLocations={exhibitor.locations} />
    </div>
  );
}
