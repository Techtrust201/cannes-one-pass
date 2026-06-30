export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { readAccreditations } from "@/lib/store";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  getAccessibleEventIdsForEspace,
  getAvailableEspacesForUser,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";
import { pickPreferredEspaceSlug } from "@/lib/default-espace";
import { cookies } from "next/headers";
import { ESPACE_COOKIE } from "@/lib/espace-cookie";
import { FilterBar } from "@/components/logisticien/FilterBar";
import AccreditationTable from "@/components/logisticien/AccreditationTable";
import { buildLink } from "@/lib/url";
import AccreditationFormCard from "@/components/logisticien/AccreditationFormCard";
import AutoRefreshOnSSE from "@/components/logisticien/AutoRefreshOnSSE";
import NoEspaceState from "@/components/logisticien/NoEspaceState";
import type { SortDirection } from "@/components/ui/table";
import { DEFAULT_VEHICLE_TYPES } from "@/lib/vehicle-type-defaults";
import {
  mapDbVehicleType,
  mapDefaultVehicleTypes,
} from "@/lib/vehicle-type-server";
import { buildVehicleTypeFilterOptions } from "@/lib/org-filter-options";
import {
  filterAndSortAccreditations,
  paginate,
  type DashboardSortKey,
} from "@/lib/accreditations-dashboard";

/* ---------- Page Dashboard ---------- */
export default async function LogisticienDashboard(props: {
  searchParams: Promise<Record<string, string>>;
}) {
  // Next.js 15 : searchParams est une Promise → on attend son résultat.
  const paramsObj = await props.searchParams;

  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  });
  if (!currentUser || !currentUser.isActive) {
    redirect("/login");
  }
  const isSuperAdmin = currentUser.role === "SUPER_ADMIN";
  const espaceParam = paramsObj.espace?.trim() || null;
  const availableEspaces = await getAvailableEspacesForUser(session.user.id);

  // Seul cas bloquant : un utilisateur standard sans AUCUNE organisation.
  if (!isSuperAdmin && availableEspaces.length === 0) {
    return (
      <div className="min-h-screen sm:h-screen flex flex-col">
        <NoEspaceState mode="none" />
      </div>
    );
  }

  // Résolution de l'espace courant (modèle multi-tenant standard) :
  //   1. `?espace=` dans l'URL (et accessible) ;
  //   2. sinon le dernier espace mémorisé en cookie (s'il est accessible) ;
  //   3. sinon l'espace préféré (Palais en priorité, puis 1er accessible).
  // On atterrit toujours sur un espace — jamais d'écran « choisir » bloquant.
  const cookieStore = await cookies();
  const cookieEspace = cookieStore.get(ESPACE_COOKIE)?.value || null;
  const isAccessible = (slug: string | null) =>
    !!slug && availableEspaces.some((o) => o.slug === slug);

  // Un slug d'URL non accessible (non super-admin) est ignoré → re-résolution.
  const urlEspace =
    espaceParam && (isSuperAdmin || isAccessible(espaceParam)) ? espaceParam : null;

  if (!urlEspace) {
    const resolved =
      (isAccessible(cookieEspace) ? cookieEspace : null) ||
      pickPreferredEspaceSlug(availableEspaces);
    if (resolved) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(paramsObj)) {
        if (k === "espace" || v === undefined || v === null || v === "") continue;
        qs.set(k, String(v));
      }
      qs.set("espace", resolved);
      redirect(`/logisticien?${qs.toString()}`);
    }
    // resolved null = super-admin sans aucune organisation en base (rare) :
    // on laisse passer sans scope (vue globale de repli).
  }

  const accessibleEventIds = await getAccessibleEventIdsForEspace(
    session.user.id,
    espaceParam
  );
  // Scope direct par organisation pour l'espace courant : garantit l'affichage
  // des accréditations rattachées à l'org même si leur eventId est null (le
  // contrôle d'accès à l'espace a déjà été validé plus haut).
  const espaceOrgId = espaceParam ? await resolveEspaceOrgId(espaceParam) : null;
  // Pré-filtres SQL (perf) : on pousse statut + zone au niveau base pour ne
  // charger que le sous-ensemble pertinent. La recherche texte et le tri (sur
  // champs calculés) restent appliqués en mémoire ci-dessous, à l'identique.
  const data = await readAccreditations({
    accessibleEventIds,
    organizationId: espaceOrgId,
    status: paramsObj.status ?? null,
    zone: paramsObj.zone ?? null,
  });

  const {
    q = "",
    status = "",
    from = "",
    to = "",
    zone = "",
    vehicleType = "",
    page = "1",
    sort = "vehicleDate",
    dir = "desc",
    sel = "",
  } = paramsObj;

  // Gabarits véhicule scopés à l'organisation de l'espace courant. Chargés
  // AVANT le filtrage pour permettre un matching de gabarit robuste (codes
  // canoniques vs codes-libellés prod RX) — évite de sous-compter les poids
  // lourds / camions. Repli sur les gabarits par défaut si l'org n'en a aucun.
  const activeVehicleTypes = await prisma.vehicleTypeConfig.findMany({
    where: { isActive: true, ...(espaceOrgId ? { organizationId: espaceOrgId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const vehicleTypesData =
    activeVehicleTypes.length > 0
      ? activeVehicleTypes.map(mapDbVehicleType)
      : mapDefaultVehicleTypes(espaceParam);

  // --- Filtrage + tri (logique partagée avec l'API défilement infini) ---
  const filtered = filterAndSortAccreditations(
    data,
    { q, status, zone, vehicleType, from, to, sort, dir },
    vehicleTypesData
  );

  // --- Pagination ---
  const perPage = 15;
  const requestedPage = Math.max(1, Number(page) || 1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  if (requestedPage > totalPages) {
    redirect(buildLink(paramsObj, totalPages));
  }

  const { items: pageData, currentPage } = paginate(filtered, requestedPage, perPage);
  const sortKey: DashboardSortKey = (
    [
      "status",
      "id",
      "vehicleDate",
      "company",
      "stand",
      "event",
      "entryAt",
      "exitAt",
      "duration",
    ] as const
  ).includes(sort as DashboardSortKey)
    ? (sort as DashboardSortKey)
    : "vehicleDate";

  // ---- Selected accreditation ----
  let selected = filtered.find((a) => String(a.id) === sel);
  if (!selected) {
    selected = pageData[0] ?? filtered[0];
  }

  const statusOptions = [
    { value: "", label: "Tous statuts" },
    { value: "NOUVEAU", label: "Nouveau" },
    { value: "ATTENTE", label: "Validée" },
    { value: "ENTREE", label: "Entrée" },
    { value: "SORTIE", label: "Sortie" },
    { value: "REFUS", label: "Refusé" },
    { value: "ABSENT", label: "Absent" },
  ];

  // Isolation multi-tenant : on scope les zones et les types de véhicule à
  // l'organisation de l'espace courant. Sans ce filtre, les zones d'une org
  // (ex. Palm Beach côté RX) pollueraient les filtres d'une autre (Palais).
  // espaceOrgId null = super-admin sans scope → vue globale de repli.
  const activeZones = await prisma.zoneConfig.findMany({
    where: { isActive: true, ...(espaceOrgId ? { organizationId: espaceOrgId } : {}) },
    orderBy: { label: "asc" },
  });
  const zoneOptions = [
    { value: "", label: "Toutes zones" },
    ...activeZones.map((z) => ({ value: z.zone, label: z.label })),
  ];

  const vehicleTypeOptions = [
    { value: "", label: "Tous types" },
    ...buildVehicleTypeFilterOptions(vehicleTypesData),
  ];

  return (
    <div className="min-h-screen sm:h-screen flex flex-col">
      <AutoRefreshOnSSE />

      <div className="flex-1 px-2 sm:px-4 md:px-3 pb-4 pt-2 md:pt-1 min-h-0 flex flex-col">
        <FilterBar searchParams={paramsObj} statusOptions={statusOptions} zoneOptions={zoneOptions} vehicleTypeOptions={vehicleTypeOptions} />
        <div className="grid md:grid-cols-[1fr_minmax(300px,380px)] md:gap-3 gap-4 flex-1 min-h-0 [&>*]:min-h-0">
          <AccreditationTable
            pageData={pageData}
            currentPage={currentPage}
            totalPages={totalPages}
            filteredCount={filtered.length}
            perPage={perPage}
            searchParams={paramsObj}
            selectedId={selected?.id}
            sort={sortKey}
            dir={dir as SortDirection}
          />

          <div className="hidden md:flex md:flex-col min-h-0">
            {selected && (
              <AccreditationFormCard key={selected.id} acc={selected} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
