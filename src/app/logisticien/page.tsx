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
import { parseVehicleDate, parseSearchDate, formatTimeForSearch } from "@/lib/date-utils";

// --- Utilitaire de normalisation accent/casse/espaces/ligatures ---
const slug = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    // Supprime les diacritiques (accents)
    .replace(/[\u0300-\u036f]/g, "")
    // Remplace les ligatures courantes
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    // Unifie les espaces
    .replace(/\s+/g, " ")
    .trim();

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

  // --- Filtering ---
  let filtered = data;
  if (q && q.trim()) {
    const needle = slug(q);
    const queryAsDate = parseSearchDate(q);

    filtered = filtered.filter((acc) => {
      // Match par date exacte si la requête ressemble à une date (ex. 04/03/2026 ou 2026-03-04)
      if (queryAsDate) {
        const accDate = parseVehicleDate(acc.vehicles?.[0]?.date);
        if (accDate && accDate.getTime() === queryAsDate.getTime()) return true;
      }

      // Champs texte + date brute + horaires (entrée/sortie) pour la recherche texte
      const timeHay = [
        ...formatTimeForSearch(acc.lastStepEntryAt),
        ...formatTimeForSearch(acc.lastStepExitAt),
        ...formatTimeForSearch(acc.entryAt),
        ...formatTimeForSearch(acc.exitAt),
      ];
      const ext = (acc.extension ?? null) as {
        vehicleContext?: { interveningCompany?: string | null };
      } | null;
      const interveningCompany = ext?.vehicleContext?.interveningCompany ?? null;
      const haystack = [
        acc.id,
        acc.publicToken,
        acc.status,
        acc.company,
        acc.stand,
        acc.event,
        acc.vehicles?.[0]?.date,
        interveningCompany,
        ...(acc.vehicles?.flatMap((v) => [v.plate, v.trailerPlate]) ?? []),
        ...timeHay,
      ]
        .filter(Boolean)
        .map((x) => slug(String(x)));

      return haystack.some((hay) => hay.includes(needle));
    });
  }

  if (status && status !== "all") {
    filtered = filtered.filter((acc) => (acc.status as string) === status);
  }

  if (zone && zone !== "all") {
    filtered = filtered.filter((acc) => acc.currentZone === zone);
  }

  if (vehicleType && vehicleType !== "all") {
    filtered = filtered.filter((acc) =>
      acc.vehicles?.some((v) => v.vehicleType === vehicleType || v.size === vehicleType)
    );
  }

  const hasFrom = Boolean(from);
  const hasTo = Boolean(to);

  if (hasFrom || hasTo) {
    const fromDate = hasFrom ? new Date(from) : new Date(0);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = hasTo ? new Date(to) : new Date(8640000000000000); // max date
    toDate.setHours(23, 59, 59, 999);

    // swap if user inverted
    const [start, end] =
      fromDate <= toDate ? [fromDate, toDate] : [toDate, fromDate];

    filtered = filtered.filter((acc) => {
      const d = parseVehicleDate(acc.vehicles?.[0]?.date);
      if (!d) return false;
      return d >= start && d <= end;
    });
  }

  // --- Sorting ---
  const validSortKeys = [
    "status",
    "id",
    "vehicleDate",
    "company",
    "stand",
    "event",
    "entryAt",
    "exitAt",
    "duration",
  ] as const;
  const sortKey = (validSortKeys as readonly string[]).includes(sort)
    ? (sort as (typeof validSortKeys)[number])
    : "vehicleDate";
  const direction = dir === "asc" ? 1 : -1;

  filtered.sort((a, b) => {
    let aVal: string | number | Date | undefined;
    let bVal: typeof aVal;

    switch (sortKey) {
      case "status":
        aVal = (a.status as string) ?? "";
        bVal = (b.status as string) ?? "";
        break;
      case "id":
        aVal = a.id;
        bVal = b.id;
        break;
      case "company":
        aVal = (a.company as string) ?? "";
        bVal = (b.company as string) ?? "";
        break;
      case "stand":
        aVal = (a.stand as string) ?? "";
        bVal = (b.stand as string) ?? "";
        break;
      case "event":
        aVal = (a.event as string) ?? "";
        bVal = (b.event as string) ?? "";
        break;
      case "entryAt": {
        const aEntry = a.lastStepEntryAt || a.entryAt;
        const bEntry = b.lastStepEntryAt || b.entryAt;
        aVal = aEntry ? new Date(aEntry) : new Date(0);
        bVal = bEntry ? new Date(bEntry) : new Date(0);
        break;
      }
      case "exitAt": {
        const aExit = a.lastStepExitAt || a.exitAt;
        const bExit = b.lastStepExitAt || b.exitAt;
        aVal = aExit ? new Date(aExit) : new Date(0);
        bVal = bExit ? new Date(bExit) : new Date(0);
        break;
      }
      case "duration": {
        // Calcul de la durée en millisecondes (dernier step)
        const getDuration = (acc: typeof a) => {
          const entry = acc.lastStepEntryAt || acc.entryAt;
          const exit = acc.lastStepExitAt || acc.exitAt;
          if (!entry || !exit) return 0;
          return new Date(exit).getTime() - new Date(entry).getTime();
        };
        aVal = getDuration(a);
        bVal = getDuration(b);
        break;
      }
      default:
        // vehicleDate
        aVal = parseVehicleDate(a.vehicles?.[0]?.date) ?? new Date(0);
        bVal = parseVehicleDate(b.vehicles?.[0]?.date) ?? new Date(0);
    }

    if (aVal === undefined || bVal === undefined) return 0;

    if (aVal < bVal) return -1 * direction;
    if (aVal > bVal) return 1 * direction;
    return 0;
  });

  // Tri secondaire : les accréditations du jour remontent en premier,
  // triées par priorité de statut (ENTREE > ATTENTE > NOUVEAU > reste)
  if (sort === "vehicleDate" && dir === "desc") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const statusPriority: Record<string, number> = {
      ENTREE: 0,
      ATTENTE: 1,
      NOUVEAU: 2,
      SORTIE: 3,
      REFUS: 4,
      ABSENT: 5,
    };

    filtered.sort((a, b) => {
      const aDate = parseVehicleDate(a.vehicles?.[0]?.date);
      const bDate = parseVehicleDate(b.vehicles?.[0]?.date);
      const aIsToday = aDate && aDate >= today && aDate < tomorrow;
      const bIsToday = bDate && bDate >= today && bDate < tomorrow;

      if (aIsToday && !bIsToday) return -1;
      if (!aIsToday && bIsToday) return 1;

      if (aIsToday && bIsToday) {
        const aPrio = statusPriority[a.status as string] ?? 99;
        const bPrio = statusPriority[b.status as string] ?? 99;
        return aPrio - bPrio;
      }
      return 0;
    });
  }

  // --- Pagination ---
  const perPage = 15;
  const currentPage = Math.max(1, Number(page));
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  if (currentPage > totalPages) {
    redirect(buildLink(paramsObj, totalPages));
  }

  const sliceStart = (currentPage - 1) * perPage;
  const pageData = filtered.slice(sliceStart, sliceStart + perPage);

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

  const activeVehicleTypes = await prisma.vehicleTypeConfig.findMany({
    where: { isActive: true, ...(espaceOrgId ? { organizationId: espaceOrgId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const vehicleTypeOptions = [
    { value: "", label: "Tous types" },
    ...(activeVehicleTypes.length > 0
      ? activeVehicleTypes.map((t) => ({ value: t.code, label: t.gabarit }))
      : DEFAULT_VEHICLE_TYPES.map((t) => ({ value: t.code, label: t.gabarit }))),
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
