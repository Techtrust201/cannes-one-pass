"use client";

import Link from "next/link";
import { Search, Filter, Calendar, X, SlidersHorizontal } from "lucide-react";
import { useRef, useEffect, useState } from "react";

export interface FilterBarProps {
  searchParams: Record<string, string>;
  statusOptions: { value: string; label: string }[];
  zoneOptions?: { value: string; label: string }[];
  vehicleTypeOptions?: { value: string; label: string }[];
}

export function FilterBar({ searchParams, statusOptions, zoneOptions, vehicleTypeOptions }: FilterBarProps) {
  const { q = "", status = "", from = "", to = "", zone = "", vehicleType = "" } = searchParams;
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Compter les filtres actifs
  const activeFiltersCount = [status, zone, from, to, q, vehicleType].filter(Boolean).length;

  // Fermer le popover desktop sur clic extérieur
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

  return (
    <>
      {/* ===== MOBILE/TABLETTE : Bouton compact + drawer ===== */}
      <div className="block md:hidden w-full">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMobileFilterOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-[#4F587E] text-white font-semibold rounded-xl hover:bg-[#3B4252] active:bg-[#2d3347] transition shadow-md text-sm min-h-[44px]"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtres
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-white text-[#4F587E] rounded-full text-xs font-bold">
                {activeFiltersCount}
              </span>
            )}
          </button>
          {activeFiltersCount > 0 && (
            <Link
              href="/logisticien"
              className="px-3 py-3 rounded-xl border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 active:bg-gray-100 text-xs font-medium transition min-h-[44px] flex items-center"
            >
              <X className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Drawer slide-up mobile */}
        {isMobileFilterOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/40 z-[70]"
              onClick={() => setIsMobileFilterOpen(false)}
            />
            {/* Drawer */}
            <div className="fixed inset-x-0 bottom-0 z-[80] bg-white rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto animate-slide-up pb-[env(safe-area-inset-bottom)]">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-[#4F587E]" />
                  <h2 className="text-base font-bold text-gray-900">Filtres</h2>
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

              <form method="get" className="p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="q-mobile" className="text-xs font-semibold text-gray-700">
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
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="status-mobile" className="text-xs font-semibold text-gray-700">
                      Statut
                    </label>
                    <select
                      id="status-mobile"
                      name="status"
                      defaultValue={status as string}
                      className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white"
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
                      <label htmlFor="zone-mobile" className="text-xs font-semibold text-gray-700">
                        Zone
                      </label>
                      <select
                        id="zone-mobile"
                        name="zone"
                        defaultValue={zone as string}
                        className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white"
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

                {vehicleTypeOptions && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="vehicleType-mobile" className="text-xs font-semibold text-gray-700">
                      Type de véhicule
                    </label>
                    <select
                      id="vehicleType-mobile"
                      name="vehicleType"
                      defaultValue={vehicleType as string}
                      className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white"
                    >
                      {vehicleTypeOptions.map((opt) => (
                        <option key={opt.value || "all"} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="from-mobile" className="text-xs font-semibold text-gray-700">
                      Début
                    </label>
                    <input
                      id="from-mobile"
                      type="date"
                      name="from"
                      defaultValue={from as string}
                      className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="to-mobile" className="text-xs font-semibold text-gray-700">
                      Fin
                    </label>
                    <input
                      id="to-mobile"
                      type="date"
                      name="to"
                      defaultValue={to as string}
                      className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F587E] text-sm bg-gray-50 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Link
                    href="/logisticien"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 text-sm font-semibold transition min-h-[48px]"
                    onClick={() => setIsMobileFilterOpen(false)}
                  >
                    <X className="w-4 h-4" />
                    Réinitialiser
                  </Link>
                  <button
                    type="submit"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#4F587E] text-white font-bold shadow hover:bg-[#3B4252] active:bg-[#2d3347] text-sm transition min-h-[48px]"
                    onClick={() => setIsMobileFilterOpen(false)}
                  >
                    <Filter className="w-4 h-4" />
                    Appliquer
                  </button>
                </div>
              </form>
            </div>
          </>
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
