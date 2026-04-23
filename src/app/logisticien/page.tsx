export const maxDuration = 60;

import { headers } from "next/headers";
import { readAccreditations } from "@/lib/store";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  getAccessibleEventIdsForEspace,
  getAvailableEspacesForUser,
} from "@/lib/auth-helpers";
import { FilterBar } from "@/components/logisticien/FilterBar";
import AccreditationTable from "@/components/logisticien/AccreditationTable";
import { buildLink } from "@/lib/url";
import AccreditationFormCard from "@/components/logisticien/AccreditationFormCard";
import AutoRefreshOnSSE from "@/components/logisticien/AutoRefreshOnSSE";
import NoEspaceState from "@/components/logisticien/NoEspaceState";
import type { SortDirection } from "@/components/ui/table";
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

  // Cas 1 : utilisateur standard sans aucune organisation → message dédié.
  if (!isSuperAdmin && availableEspaces.length === 0) {
    return (
      <div className="min-h-screen sm:h-screen flex flex-col">
        <NoEspaceState mode="none" />
      </div>
    );
  }

  // Cas 2 : un seul espace → redirect auto pour figer l'URL ergonomique.
  if (!espaceParam && !isSuperAdmin && availableEspaces.length === 1) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(paramsObj)) {
      if (v === undefined || v === null || v === "") continue;
      qs.set(k, String(v));
    }
    qs.set("espace", availableEspaces[0].slug);
    redirect(`/logisticien?${qs.toString()}`);
  }

  // Cas 3 : utilisateur multi-org sans `espace` → sélecteur.
  if (!espaceParam && !isSuperAdmin && availableEspaces.length > 1) {
    return (
      <div className="min-h-screen sm:h-screen flex flex-col">
        <NoEspaceState
          mode="choose"
          espaces={availableEspaces}
          currentSearchParams={paramsObj}
        />
      </div>
    );
  }

  // Validation du slug `espace` : doit appartenir aux espaces accessibles
  // (hors super-admin qui peut cibler n'importe quelle org).
  if (espaceParam && !isSuperAdmin) {
    const allowed = availableEspaces.some((o) => o.slug === espaceParam);
    if (!allowed) {
      redirect("/logisticien");
    }
  }

  const accessibleEventIds = await getAccessibleEventIdsForEspace(
    session.user.id,
    espaceParam
  );
  const data = await readAccreditations({ accessibleEventIds });

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
      const haystack = [
        acc.id,
        acc.status,
        acc.company,
        acc.stand,
        acc.event,
        acc.vehicles?.[0]?.date,
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
    { value: "ATTENTE", label: "Attente" },
    { value: "ENTREE", label: "Entrée" },
    { value: "SORTIE", label: "Sortie" },
    { value: "REFUS", label: "Refusé" },
    { value: "ABSENT", label: "Absent" },
  ];

  const activeZones = await prisma.zoneConfig.findMany({
    where: { isActive: true },
    orderBy: { label: "asc" },
  });
  const zoneOptions = [
    { value: "", label: "Toutes zones" },
    ...activeZones.map((z) => ({ value: z.zone, label: z.label })),
  ];

  const vehicleTypeOptions = [
    { value: "", label: "Tous types" },
    { value: "PORTEUR", label: "Porteur" },
    { value: "PORTEUR_ARTICULE", label: "Porteur articulé" },
    { value: "SEMI_REMORQUE", label: "Semi-remorque" },
  ];

  return (
    <div className="min-h-screen sm:h-screen flex flex-col">
      <AutoRefreshOnSSE />

      <div className="flex-1 px-2 sm:px-4 pb-4 pt-2 min-h-0 flex flex-col">
        <FilterBar searchParams={paramsObj} statusOptions={statusOptions} zoneOptions={zoneOptions} vehicleTypeOptions={vehicleTypeOptions} />
        <div className="grid md:grid-cols-[1fr_420px] gap-4 flex-1 min-h-0">
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

          <div className="hidden md:block">
            {selected && (
              <AccreditationFormCard key={selected.id} acc={selected} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
