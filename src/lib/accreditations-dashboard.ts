/**
 * Logique partagée de filtrage / tri / pagination / comptage des accréditations
 * du dashboard logisticien.
 *
 * Centralisée ici (et non plus inline dans `page.tsx`) pour garantir que :
 *   - le rendu SSR paginé,
 *   - l'API de défilement infini (`/api/accreditations/dashboard`),
 *   - l'onglet « Comptage » (`/api/accreditations/stats`)
 * produisent EXACTEMENT les mêmes résultats (même total, mêmes filtres).
 */
import type { Accreditation, Vehicle } from "@/types";
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import {
  vehicleTypeFamilyKey,
  resolveVehicleTypeCodeFromList,
} from "@/lib/vehicle-type-resolve";
import {
  parseVehicleDate,
  parseSearchDate,
  formatTimeForSearch,
} from "@/lib/date-utils";

// --- Normalisation accent/casse/espaces/ligatures (recherche texte) ---
export const slug = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();

export const ALL_STATUSES = [
  "NOUVEAU",
  "ATTENTE",
  "ENTREE",
  "SORTIE",
  "REFUS",
  "ABSENT",
] as const;

export type DashboardSortKey =
  | "status"
  | "id"
  | "vehicleDate"
  | "company"
  | "stand"
  | "event"
  | "entryAt"
  | "exitAt"
  | "duration";

const VALID_SORT_KEYS: readonly DashboardSortKey[] = [
  "status",
  "id",
  "vehicleDate",
  "company",
  "stand",
  "event",
  "entryAt",
  "exitAt",
  "duration",
];

export interface DashboardQuery {
  q?: string;
  status?: string;
  zone?: string;
  vehicleType?: string;
  /** Famille de véhicules : "heavy" = poids lourds, "light" = utilitaires, "all" ou absent = tous */
  vehicleFamily?: "heavy" | "light" | "all";
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  /** Filtre événement exact (slug ou nom) — distinct de q (recherche texte) */
  event?: string;
  /** Filtre société exact */
  company?: string;
  /** Filtre stand exact */
  stand?: string;
}

/**
 * Un véhicule correspond-il au code de gabarit filtré ? Tolérant au divorce
 * codes canoniques / codes-libellés RX (voir `vehicleTypeFamilyKey`). C'est le
 * cœur du correctif de comptage des poids lourds : on ne se contente plus d'une
 * égalité stricte sur `vehicleType`/`size`.
 */
export function vehicleMatchesType(
  types: VehicleTypeData[],
  v: Vehicle,
  code: string
): boolean {
  if (!code || code === "all") return true;
  if (v.vehicleType === code || v.size === code) return true;
  const target = vehicleTypeFamilyKey(types, code);
  if (!target) return false;
  return (
    vehicleTypeFamilyKey(types, v.vehicleType) === target ||
    vehicleTypeFamilyKey(types, v.size) === target
  );
}

/** Une accréditation correspond si AU MOINS un de ses véhicules correspond. */
export function accreditationMatchesVehicleType(
  types: VehicleTypeData[],
  acc: Accreditation,
  code: string
): boolean {
  if (!code || code === "all") return true;
  return (acc.vehicles ?? []).some((v) => vehicleMatchesType(types, v, code));
}

/** Catégorie PDF C/D = poids lourd. */
function isHeavy(pdfCode: string | undefined | null): boolean {
  return pdfCode === "C" || pdfCode === "D";
}

/** Un véhicule est-il poids lourd selon ses codes de gabarit résolus ? */
function vehicleIsHeavy(types: VehicleTypeData[], v: Vehicle): boolean {
  const code = resolveVehicleTypeCodeFromList(types, v.vehicleType, v.size);
  const matched = types.find((t) => t.code === code || t.code === code.toUpperCase());
  return isHeavy(matched?.pdfCode);
}

/**
 * Applique recherche texte + filtres (statut, zone, gabarit, dates, famille, événement…).
 * NE modifie PAS le tableau d'entrée.
 */
export function filterAccreditations(
  data: Accreditation[],
  query: DashboardQuery,
  vehicleTypes: VehicleTypeData[]
): Accreditation[] {
  const { q, status, zone, vehicleType, vehicleFamily, from, to, event, company, stand } = query;
  let filtered = data;

  if (q && q.trim()) {
    const needle = slug(q);
    const queryAsDate = parseSearchDate(q);

    filtered = filtered.filter((acc) => {
      if (queryAsDate) {
        const accDate = parseVehicleDate(acc.vehicles?.[0]?.date);
        if (accDate && accDate.getTime() === queryAsDate.getTime()) return true;
      }

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
      accreditationMatchesVehicleType(vehicleTypes, acc, vehicleType)
    );
  }

  if (vehicleFamily && vehicleFamily !== "all") {
    filtered = filtered.filter((acc) =>
      (acc.vehicles ?? []).some((v) =>
        vehicleFamily === "heavy"
          ? vehicleIsHeavy(vehicleTypes, v)
          : !vehicleIsHeavy(vehicleTypes, v)
      )
    );
  }

  // Filtre événement exact (insensible à la casse)
  if (event && event.trim()) {
    const needle = slug(event);
    filtered = filtered.filter((acc) => slug(acc.event ?? "") === needle);
  }

  // Filtre société exact
  if (company && company.trim()) {
    const needle = slug(company);
    filtered = filtered.filter((acc) => slug(acc.company ?? "") === needle);
  }

  // Filtre stand exact
  if (stand && stand.trim()) {
    const needle = slug(stand);
    filtered = filtered.filter((acc) => slug(acc.stand ?? "") === needle);
  }

  const hasFrom = Boolean(from);
  const hasTo = Boolean(to);
  if (hasFrom || hasTo) {
    const fromDate = hasFrom ? new Date(from as string) : new Date(0);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = hasTo ? new Date(to as string) : new Date(8640000000000000);
    toDate.setHours(23, 59, 59, 999);
    const [start, end] =
      fromDate <= toDate ? [fromDate, toDate] : [toDate, fromDate];

    filtered = filtered.filter((acc) => {
      const d = parseVehicleDate(acc.vehicles?.[0]?.date);
      if (!d) return false;
      return d >= start && d <= end;
    });
  }

  return filtered;
}

/** Trie une COPIE des accréditations (tri principal + priorité du jour). */
export function sortAccreditations(
  data: Accreditation[],
  sort?: string,
  dir?: string
): Accreditation[] {
  const sortKey: DashboardSortKey = (VALID_SORT_KEYS as readonly string[]).includes(
    sort ?? ""
  )
    ? (sort as DashboardSortKey)
    : "vehicleDate";
  const direction = dir === "asc" ? 1 : -1;

  const sorted = [...data];

  sorted.sort((a, b) => {
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
        const getDuration = (acc: Accreditation) => {
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
        aVal = parseVehicleDate(a.vehicles?.[0]?.date) ?? new Date(0);
        bVal = parseVehicleDate(b.vehicles?.[0]?.date) ?? new Date(0);
    }

    if (aVal === undefined || bVal === undefined) return 0;
    if (aVal < bVal) return -1 * direction;
    if (aVal > bVal) return 1 * direction;
    return 0;
  });

  // Tri secondaire : les accréditations du jour remontent en premier,
  // triées par priorité de statut (ENTREE > ATTENTE > NOUVEAU > reste).
  if (sortKey === "vehicleDate" && dir !== "asc") {
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

    sorted.sort((a, b) => {
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

  return sorted;
}

/** Filtre puis trie (pipeline complet, copie). */
export function filterAndSortAccreditations(
  data: Accreditation[],
  query: DashboardQuery,
  vehicleTypes: VehicleTypeData[]
): Accreditation[] {
  return sortAccreditations(
    filterAccreditations(data, query, vehicleTypes),
    query.sort,
    query.dir
  );
}

export interface PaginationResult<T> {
  items: T[];
  total: number;
  totalPages: number;
  currentPage: number;
}

export function paginate<T>(
  items: T[],
  page: number,
  perPage: number
): PaginationResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    total,
    totalPages,
    currentPage,
  };
}

// ──────────────────────────────────────────────────────────────
// Comptage (onglet « Comptage » de Flux véhicules)
// ──────────────────────────────────────────────────────────────

export interface VehicleTypeCount {
  code: string;
  label: string;
  /** Nombre d'accréditations comportant au moins un véhicule de ce gabarit. */
  accreditations: number;
  /** Nombre de véhicules de ce gabarit. */
  vehicles: number;
  isHeavy: boolean;
}

export interface AccreditationStats {
  byStatus: Record<string, number>;
  byVehicleType: VehicleTypeCount[];
  totalAccreditations: number;
  totalVehicles: number;
  heavyVehicles: number;
  heavyAccreditations: number;
}

/** Alias interne pour la compatibilité ascendante avec computeAccreditationStats. */
const isHeavyPdfCode = isHeavy;

/**
 * Calcule les compteurs par statut et par gabarit, en résolvant chaque
 * véhicule via la même logique de gabarit que le filtre (robuste aux libellés
 * legacy / poids lourds RX), afin de ne pas sous-compter les NOUVEAU ni les
 * camions.
 */
export function computeAccreditationStats(
  data: Accreditation[],
  vehicleTypes: VehicleTypeData[]
): AccreditationStats {
  const byStatus: Record<string, number> = {};
  for (const s of ALL_STATUSES) byStatus[s] = 0;

  const typeAgg = new Map<
    string,
    { label: string; vehicles: number; accIds: Set<string>; isHeavy: boolean }
  >();

  let totalVehicles = 0;
  let heavyVehicles = 0;
  let heavyAccreditations = 0;

  for (const acc of data) {
    const status = acc.status as string;
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    let accHasHeavy = false;
    for (const v of acc.vehicles ?? []) {
      totalVehicles += 1;
      const code = resolveVehicleTypeCodeFromList(
        vehicleTypes,
        v.vehicleType,
        v.size
      );
      const matched = vehicleTypes.find(
        (t) => t.code === code || t.code === code.toUpperCase()
      );
      const label = matched?.label || matched?.gabarit || code;
      const heavy = isHeavyPdfCode(matched?.pdfCode);

      let entry = typeAgg.get(code);
      if (!entry) {
        entry = { label, vehicles: 0, accIds: new Set(), isHeavy: heavy };
        typeAgg.set(code, entry);
      }
      entry.vehicles += 1;
      entry.accIds.add(acc.id);
      if (heavy) {
        heavyVehicles += 1;
        accHasHeavy = true;
      }
    }
    if (accHasHeavy) heavyAccreditations += 1;
  }

  // Ordonner selon l'ordre des gabarits configurés, puis alphabétique.
  const order = new Map(vehicleTypes.map((t, i) => [t.code, i]));
  const byVehicleType: VehicleTypeCount[] = [...typeAgg.entries()]
    .map(([code, agg]) => ({
      code,
      label: agg.label,
      accreditations: agg.accIds.size,
      vehicles: agg.vehicles,
      isHeavy: agg.isHeavy,
    }))
    .sort((a, b) => {
      const oa = order.get(a.code) ?? 999;
      const ob = order.get(b.code) ?? 999;
      if (oa !== ob) return oa - ob;
      return a.label.localeCompare(b.label);
    });

  return {
    byStatus,
    byVehicleType,
    totalAccreditations: data.length,
    totalVehicles,
    heavyVehicles,
    heavyAccreditations,
  };
}
