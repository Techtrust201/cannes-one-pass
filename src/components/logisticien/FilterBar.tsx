"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Filter, Calendar, X, SlidersHorizontal, Truck } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

export interface FilterBarProps {
  searchParams: Record<string, string>;
  statusOptions: { value: string; label: string }[];
  zoneOptions?: { value: string; label: string }[];
  vehicleTypeOptions?: { value: string; label: string }[];
}

export function FilterBar({ searchParams, statusOptions, zoneOptions, vehicleTypeOptions }: FilterBarProps) {
  const { q = "", status = "", from = "", to = "", zone = "", vehicleType = "" } = searchParams;
  const router = useRouter();
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(q as string);
  const popoverRef = useRef<HTMLDivElement>(null);

  const activeFiltersCount = [status, zone, from, to, q, vehicleType].filter(Boolean).length;
  const activeFiltersCountExcludingSearch = [status, zone, from, to, vehicleType].filter(Boolean).length;

  useEffect(() => {
    setMobileSearch(q as string);
  }, [q]);

  // Debounced URL update for real-time search
  useEffect(() => {
    if (mobileSearch === (q as string)) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(currentSearchParams.toString());
      if (mobileSearch.trim()) {
        params.set("q", mobileSearch.trim());
      } else {
        params.delete("q");
      }
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [mobileSearch, q, currentSearchParams, pathname, router]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsFilterOpen(false);
      }
    }
    if (isFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFilterOpen]);

  // Programmatic submit for mobile drawer filters
  const handleMobileFilterSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const params = new URLSearchParams();
      for (const [key, val] of fd.entries()) {
        if (val && typeof val === "string" && val.trim()) {
          params.set(key, val.trim());
        }
      }
      router.push(`${pathname}?${params.toString()}`);
      setIsMobileFilterOpen(false);
    },
    [pathname, router]
  );

  const handleMobileReset = useCallback(() => {
    setIsMobileFilterOpen(false);
    setMobileSearch("");
    router.push("/logisticien");
  }, [router]);

  const removeFilter = useCallback(
    (key: string) => {
      const params = new URLSearchParams(currentSearchParams.toString());
      params.delete(key);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [currentSearchParams, pathname, router]
  );

  const getFilterLabel = (key: string, value: string): string => {
    if (key === "status") return statusOptions.find((o) => o.value === value)?.label ?? value;
    if (key === "zone") return zoneOptions?.find((o) => o.value === value)?.label ?? value;
    if (key === "vehicleType") return vehicleTypeOptions?.find((o) => o.value === value)?.label ?? value;
    if (key === "from") return `Depuis ${value}`;
    if (key === "to") return `Jusqu'au ${value}`;
    return value;
  };

  const activeChips = [
    { key: "status", value: status },
    { key: "zone", value: zone },
    { key: "vehicleType", value: vehicleType },
    { key: "from", value: from },
    { key: "to", value: to },
  ].filter((c) => Boolean(c.value));

  return (
    <>
      {/* ===== MOBILE/TABLETTE : Recherche sticky + bouton Filtres + drawer ===== */}
      <div className="block md:hidden w-full sticky top-0 z-30 bg-gray-50 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={mobileSearch}
              onChange={(e) => setMobileSearch(e.target.value)}
              placeholder="ID, plaque, statut, date..."
              className="w-full pl-10 pr-9 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-white"
            />
            {mobileSearch && (
              <button
                type="button"
                onClick={() => setMobileSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsMobileFilterOpen(true)}
            className={`relative flex items-center gap-1.5 px-3 py-2.5 font-semibold rounded-xl transition shadow-md text-sm min-h-[42px] shrink-0 ${
              activeFiltersCountExcludingSearch > 0
                ? "bg-[#4F587E] text-white ring-2 ring-[#FFAA00] ring-offset-1"
                : "bg-[#4F587E] text-white hover:bg-[#3B4252] active:bg-[#2d3347]"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filtres</span>
            {activeFiltersCountExcludingSearch > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-[#FFAA00] text-white rounded-full text-[10px] font-bold">
                {activeFiltersCountExcludingSearch}
              </span>
            )}
          </button>
        </div>

        {/* Chips de filtres actifs */}
        {activeChips.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
            {activeChips.map(({ key, value }) => (
              <button
                key={key}
                type="button"
                onClick={() => removeFilter(key)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#4F587E]/10 text-[#4F587E] text-[11px] font-semibold whitespace-nowrap shrink-0 active:bg-[#4F587E]/20 transition"
              >
                {getFilterLabel(key, value)}
                <X className="w-3 h-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={handleMobileReset}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-[11px] font-semibold whitespace-nowrap shrink-0 active:bg-red-100 transition"
            >
              Tout effacer
            </button>
          </div>
        )}

        {/* Drawer slide-up mobile — rendered via portal to escape sticky stacking context */}
        {isMobileFilterOpen && createPortal(
          <>
            <div
              className="fixed inset-0 bg-black/40 z-[70] animate-[fadeIn_200ms_ease-out]"
              onClick={() => setIsMobileFilterOpen(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-[80] bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col animate-[slideUp_300ms_ease-out]">
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>

              <div className="shrink-0 bg-white px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-[#4F587E]" />
                  <h2 className="text-base font-bold text-gray-900">Filtres</h2>
                  {activeFiltersCountExcludingSearch > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 bg-[#4F587E] text-white rounded-full text-[10px] font-bold">
                      {activeFiltersCountExcludingSearch}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Fermer les filtres"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleMobileFilterSubmit} className="flex flex-col flex-1 min-h-0">
                {/* Scrollable filter fields */}
                <div className="flex-1 overflow-y-auto px-4 pt-2 pb-3 flex flex-col gap-3">
                  {/* Recherche */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="q-mobile" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Recherche
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        id="q-mobile"
                        type="text"
                        name="q"
                        defaultValue={q as string}
                        placeholder="ID, plaque, statut, date..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  {/* Statut + Zone */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="status-mobile" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Statut
                      </label>
                      <select
                        id="status-mobile"
                        name="status"
                        defaultValue={status as string}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white appearance-none transition"
                      >
                        {statusOptions.map((opt) => (
                          <option key={opt.value || "all"} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {zoneOptions && (
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="zone-mobile" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Zone
                        </label>
                        <select
                          id="zone-mobile"
                          name="zone"
                          defaultValue={zone as string}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white appearance-none transition"
                        >
                          {zoneOptions.map((opt) => (
                            <option key={opt.value || "all"} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Type véhicule */}
                  {vehicleTypeOptions && (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="vehicleType-mobile" className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5" />
                        Type de véhicule
                      </label>
                      <select
                        id="vehicleType-mobile"
                        name="vehicleType"
                        defaultValue={vehicleType as string}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white appearance-none transition"
                      >
                        {vehicleTypeOptions.map((opt) => (
                          <option key={opt.value || "all"} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="from-mobile" className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-green-600" />
                        Début
                      </label>
                      <input
                        id="from-mobile"
                        type="date"
                        name="from"
                        defaultValue={from as string}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white transition"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="to-mobile" className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-red-500" />
                        Fin
                      </label>
                      <input
                        id="to-mobile"
                        type="date"
                        name="to"
                        defaultValue={to as string}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Actions — sticky en bas, au-dessus de la navbar mobile (56px + safe-area) */}
                <div className="shrink-0 px-4 pt-3 border-t border-gray-200 bg-white rounded-b-none" style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 0.75rem)" }}>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleMobileReset}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 text-sm font-semibold transition min-h-[48px]"
                    >
                      <X className="w-4 h-4" />
                      Réinitialiser
                    </button>
                    <button
                      type="submit"
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#4F587E] text-white font-bold shadow-lg hover:bg-[#3B4252] active:bg-[#2d3347] text-sm transition min-h-[48px]"
                    >
                      <Filter className="w-4 h-4" />
                      Appliquer
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </>,
          document.body
        )}
      </div>

      {/* ===== DESKTOP : bouton + popover flottant ===== */}
      <div className="hidden md:block w-full mb-4 relative">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => setIsFilterOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#4F587E] text-white font-semibold rounded-xl hover:bg-[#3B4252] focus:ring-2 focus:ring-blue-400 transition shadow-md text-sm"
          >
            <Filter className="w-4 h-4 text-blue-200" />
            Filtrer
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-white text-[#4F587E] rounded-full text-xs font-bold">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
        {isFilterOpen && (
          <div
            ref={popoverRef}
            className="absolute right-0 z-50 mt-1 bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 animate-fade-in min-w-[520px]"
            style={{ top: "50px" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-[#4F587E]" />
                <h2 className="text-lg font-bold text-gray-900">
                  Filtres de recherche
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 focus:ring-2 focus:ring-blue-400"
                aria-label="Fermer le filtre"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form method="get" className="space-y-5">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Rechercher par ID, plaque, statut, date..."
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400 bg-gray-50 text-base"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
                <div>
                  <label
                    className="text-base font-semibold text-gray-800 mb-2 block"
                    htmlFor="status"
                  >
                    Statut
                  </label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={status}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-gray-50"
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt.value || "all"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {zoneOptions && (
                  <div>
                    <label
                      className="text-base font-semibold text-gray-800 mb-2 block"
                      htmlFor="zone-desktop"
                    >
                      Zone
                    </label>
                    <select
                      id="zone-desktop"
                      name="zone"
                      defaultValue={zone}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-gray-50"
                    >
                      {zoneOptions.map((opt) => (
                        <option key={opt.value || "all"} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {vehicleTypeOptions && (
                  <div>
                    <label
                      className="text-base font-semibold text-gray-800 mb-2 block"
                      htmlFor="vehicleType-desktop"
                    >
                      Type véhicule
                    </label>
                    <select
                      id="vehicleType-desktop"
                      name="vehicleType"
                      defaultValue={vehicleType}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-gray-50"
                    >
                      {vehicleTypeOptions.map((opt) => (
                        <option key={opt.value || "all"} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label
                    className="text-base font-semibold text-gray-800 mb-2 block flex items-center gap-2"
                    htmlFor="from"
                  >
                    <Calendar className="w-5 h-5 text-green-500" />
                    Date de début
                  </label>
                  <input
                    id="from"
                    type="date"
                    name="from"
                    defaultValue={from}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-800 bg-gray-50"
                  />
                </div>
                <div>
                  <label
                    className="text-base font-semibold text-gray-800 mb-2 block flex items-center gap-2"
                    htmlFor="to"
                  >
                    <Calendar className="w-5 h-5 text-red-500" />
                    Date de fin
                  </label>
                  <input
                    id="to"
                    type="date"
                    name="to"
                    defaultValue={to}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-800 bg-gray-50"
                  />
                </div>
              </div>
              <hr className="my-4 border-t border-gray-200" />
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#4F587E] text-white font-bold rounded-xl hover:bg-[#3B4252] focus:ring-2 focus:ring-blue-400 text-base shadow-lg transition"
                >
                  <Filter className="w-5 h-5" />
                  Appliquer les filtres
                </button>
                <Link
                  href="/logisticien"
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 focus:ring-2 focus:ring-gray-300 text-base transition"
                >
                  <X className="w-5 h-5" />
                  Réinitialiser
                </Link>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
