import { readAccreditations } from "@/lib/store";
import { redirect } from "next/navigation";
import { FilterBar } from "@/components/logisticien/FilterBar";
import AccreditationTable from "@/components/logisticien/AccreditationTable";
import { buildLink } from "@/lib/url";
import AccreditationFormCard from "@/components/logisticien/AccreditationFormCard";
import AutoRefreshOnSSE from "@/components/logisticien/AutoRefreshOnSSE";
import type { SortDirection } from "@/components/ui/table";

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
  const data = await readAccreditations();

  const {
    q = "",
    status = "",
    from = "",
    to = "",
    zone = "",
    page = "1",
    sort = "createdAt",
    dir = "desc",
    sel = "",
  } = paramsObj;

  // --- Filtering ---
  let filtered = data;
  if (q && q.trim()) {
    const needle = slug(q);
    filtered = filtered.filter((acc) =>
      [
        acc.id,
        acc.vehicles?.[0]?.plate,
        acc.status,
        acc.company,
        acc.stand,
        acc.event,
        acc.createdAt && new Date(acc.createdAt).toLocaleDateString("fr-FR"),
      ]
        .map(slug)
        .some((hay) => hay.includes(needle))
    );
  }

  if (status && status !== "all") {
    filtered = filtered.filter((acc) => (acc.status as string) === status);
  }

  if (zone && zone !== "all") {
    filtered = filtered.filter((acc) => acc.currentZone === zone);
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
      if (!acc.createdAt) return false;
      const d = new Date(acc.createdAt);
      return d >= start && d <= end;
    });
  }

  // --- Sorting ---
  const validSortKeys = [
    "status",
    "id",
    "createdAt",
    "company",
    "stand",
    "event",
    "entryAt",
    "exitAt",
    "duration",
  ] as const;
  const sortKey = (validSortKeys as readonly string[]).includes(sort)
    ? (sort as (typeof validSortKeys)[number])
    : "createdAt";
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
      case "entryAt":
        aVal = a.entryAt ? new Date(a.entryAt) : new Date(0);
        bVal = b.entryAt ? new Date(b.entryAt) : new Date(0);
        break;
      case "exitAt":
        aVal = a.exitAt ? new Date(a.exitAt) : new Date(0);
        bVal = b.exitAt ? new Date(b.exitAt) : new Date(0);
        break;
      case "duration":
        // Calcul de la durée en millisecondes
        const getDuration = (acc: typeof a) => {
          if (!acc.entryAt || !acc.exitAt) return 0;
          return (
            new Date(acc.exitAt).getTime() - new Date(acc.entryAt).getTime()
          );
        };
        aVal = getDuration(a);
        bVal = getDuration(b);
        break;
      default:
        // createdAt
        aVal = a.createdAt ? new Date(a.createdAt) : new Date(0);
        bVal = b.createdAt ? new Date(b.createdAt) : new Date(0);
    }

    if (aVal === undefined || bVal === undefined) return 0;

    if (aVal < bVal) return -1 * direction;
    if (aVal > bVal) return 1 * direction;
    return 0;
  });

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

  const zoneOptions = [
    { value: "", label: "Toutes zones" },
    { value: "LA_BOCCA", label: "La Bocca" },
    { value: "PALAIS_DES_FESTIVALS", label: "Palais des festivals" },
    { value: "PANTIERO", label: "Pantiero" },
    { value: "MACE", label: "Macé" },
  ];

  return (
    <div className="min-h-screen sm:h-screen flex flex-col">
      {/* Auto-refresh invisible : détecte les changements et met à jour la liste */}
      <AutoRefreshOnSSE />

      {/* Header fixe */}
      <div className="flex-shrink-0 p-2 md:p-2">
        <div className="flex justify-between items-center">
          <FilterBar searchParams={paramsObj} statusOptions={statusOptions} zoneOptions={zoneOptions} />
        </div>
      </div>

      {/* Contenu fixe */}
      <div className="flex-1 px-2 sm:px-4 pb-4 min-h-0">
        <div className="grid md:grid-cols-[1fr_420px] gap-4 h-full">
          <AccreditationTable
            pageData={pageData}
            currentPage={currentPage}
            totalPages={totalPages}
            filteredCount={filtered.length}
            perPage={perPage}
            searchParams={paramsObj}
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
