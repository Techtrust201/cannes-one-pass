"use client";

import Link from "next/link";
import { Search, Filter, Calendar, X } from "lucide-react";
import { useRef, useEffect, useState } from "react";

export interface FilterBarProps {
  searchParams: Record<string, string>;
  statusOptions: { value: string; label: string }[];
  zoneOptions?: { value: string; label: string }[];
}

export function FilterBar({ searchParams, statusOptions, zoneOptions }: FilterBarProps) {
  const { q = "", status = "", from = "", to = "", zone = "" } = searchParams;
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fermer le popover sur clic extérieur
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
      {/* Mobile/tablette : card grise, labels, boutons larges */}
      <div className="block sm:hidden w-full pb-10">
        <div className="bg-gray-50 rounded-2xl shadow p-4 mb-4 border border-gray-100">
          <form method="get" className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="q"
                className="text-xs font-semibold text-gray-700"
              >
                Recherche
              </label>
              <input
                id="q"
                type="text"
                name="q"
                defaultValue={q as string}
                placeholder="ID, plaque, statut, date..."
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="status"
                className="text-xs font-semibold text-gray-700"
              >
                Statut
              </label>
              <select
                id="status"
                name="status"
                defaultValue={status as string}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value || "all"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {zoneOptions && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="zone"
                  className="text-xs font-semibold text-gray-700"
                >
                  Zone
                </label>
                <select
                  id="zone"
                  name="zone"
                  defaultValue={zone as string}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                >
                  {zoneOptions.map((opt) => (
                    <option key={opt.value || "all"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <div className="flex flex-col gap-1 w-1/2">
                <label
                  htmlFor="from"
                  className="text-xs font-semibold text-gray-700"
                >
                  Début
                </label>
                <input
                  id="from"
                  type="date"
                  name="from"
                  defaultValue={from as string}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                />
              </div>
              <div className="flex flex-col gap-1 w-1/2">
                <label
                  htmlFor="to"
                  className="text-xs font-semibold text-gray-700"
                >
                  Fin
                </label>
                <input
                  id="to"
                  type="date"
                  name="to"
                  defaultValue={to as string}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 rounded-xl bg-[#4F587E] text-white font-bold shadow hover:bg-[#3B4252] transition-colors text-base"
            >
              Filtrer
            </button>
            <Link
              href="/logisticien"
              className="w-full px-4 py-2 rounded-xl border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors text-center text-base font-semibold"
            >
              Réinitialiser
            </Link>
          </form>
        </div>
        {/* SUPPRESSION du bouton Nouvelle demande mobile */}
      </div>

      {/* Desktop : bouton + popover flottant amélioré */}
      <div className="hidden sm:block w-full mb-6 relative">
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={() => setIsFilterOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-7 py-3 bg-[#4F587E] text-white font-bold rounded-2xl hover:bg-[#3B4252] focus:ring-2 focus:ring-blue-400 transition shadow-lg hover:shadow-xl text-base"
          >
            <Filter className="w-5 h-5 text-blue-200" />
            Filtrer
          </button>
        </div>
        {isFilterOpen && (
          <div
            ref={popoverRef}
            className="absolute right-0 z-50 mt-2 bg-white rounded-3xl shadow-2xl border border-gray-100 p-7 animate-fade-in"
            style={{ top: "60px" }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Filter className="w-6 h-6 text-blue-600" />
                <h2 className="text-2xl font-extrabold text-gray-900">
                  Filtres de recherche
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 focus:ring-2 focus:ring-blue-400"
                aria-label="Fermer le filtre"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form method="get" className="space-y-7">
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
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
