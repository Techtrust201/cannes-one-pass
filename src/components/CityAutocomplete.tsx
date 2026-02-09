"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { searchCities, type CitySearchResult } from "@/lib/city-search";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Callback optionnel avec la distance pré-calculée vers Cannes (km) */
  onCitySelect?: (city: { name: string; country: string; distance: number; lat: number; lng: number }) => void;
  placeholder?: string;
  className?: string;
}

export default function CityAutocomplete({
  value,
  onChange,
  onCitySelect,
  placeholder = "Choisir une ville",
  className = "",
}: Props) {
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const nominatimTimeout = useRef<NodeJS.Timeout | null>(null);
  const [nominatimResults, setNominatimResults] = useState<CitySearchResult[]>([]);

  // ── Recherche locale (instantanée) ──────────────────────────────
  const doSearch = useCallback((query: string) => {
    if (!query || query.length < 1) {
      setResults([]);
      setNominatimResults([]);
      return;
    }
    const local = searchCities(query, 8);
    setResults(local);
    setActiveIdx(-1);

    if (local.length > 0) {
      setOpen(true);
    }

    // Si peu de résultats locaux et query >= 3 chars → Nominatim en arrière-plan
    if (local.length < 3 && query.length >= 3) {
      if (nominatimTimeout.current) clearTimeout(nominatimTimeout.current);
      nominatimTimeout.current = setTimeout(async () => {
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`,
            { headers: { "User-Agent": "PalaisDesFestivals/1.0" } }
          );
          const data: { display_name: string; lat: string; lon: string }[] = await resp.json();
          const extra: CitySearchResult[] = data
            .map((d) => {
              const parts = d.display_name.split(",").map((p) => p.trim());
              const cityName = parts[0];
              const country = parts[parts.length - 1] || "";
              const label = `${cityName}, ${country}`;
              return {
                city: {
                  n: cityName,
                  c: "",
                  p: country,
                  lat: parseFloat(d.lat),
                  lng: parseFloat(d.lon),
                  d: 0, // Will be calculated via API if selected
                },
                label,
                score: 10,
              };
            })
            // Filter out entries already in local results
            .filter((r) => !local.some((l) => l.label === r.label));

          setNominatimResults(extra);
          if (extra.length > 0) setOpen(true);
        } catch {
          // Silently fail – local results are already shown
        }
      }, 500);
    } else {
      setNominatimResults([]);
    }
  }, []);

  // Recherche quand la valeur change
  useEffect(() => {
    doSearch(value);
    return () => {
      if (nominatimTimeout.current) clearTimeout(nominatimTimeout.current);
    };
  }, [value, doSearch]);

  // Fermer au clic extérieur
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handle);
    return () => document.removeEventListener("click", handle);
  }, []);

  // Combinaison résultats locaux + Nominatim
  const allResults = [...results, ...nominatimResults];

  // Sélection d'une ville
  const selectCity = (result: CitySearchResult) => {
    onChange(result.label);
    setOpen(false);
    setActiveIdx(-1);

    if (onCitySelect) {
      onCitySelect({
        name: result.city.n,
        country: result.city.p,
        distance: result.city.d,
        lat: result.city.lat,
        lng: result.city.lng,
      });
    }
  };

  // ── Clavier ─────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || allResults.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((prev) => Math.min(prev + 1, allResults.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < allResults.length) {
          selectCity(allResults[activeIdx]);
        }
        break;
      case "Escape":
        setOpen(false);
        setActiveIdx(-1);
        break;
      case "Tab":
        if (activeIdx >= 0 && activeIdx < allResults.length) {
          selectCity(allResults[activeIdx]);
        }
        setOpen(false);
        break;
    }
  };

  // Scroll vers l'élément actif
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.children[activeIdx] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  // ── Grouper par pays ────────────────────────────────────────────
  const grouped = groupByCountry(allResults);

  return (
    <div className="relative" ref={containerRef}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        onFocus={() => {
          if (value && allResults.length > 0) setOpen(true);
        }}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="city-autocomplete-list"
      />
      {open && allResults.length > 0 && (
        <ul
          id="city-autocomplete-list"
          ref={listRef}
          className="absolute z-10 left-0 right-0 bg-white border rounded shadow-lg max-h-60 overflow-auto text-sm"
          role="listbox"
        >
          {grouped.map((group) => (
            <li key={group.country} role="group">
              {grouped.length > 1 && (
                <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">
                  {group.country}
                </div>
              )}
              {group.items.map((result) => {
                const globalIdx = allResults.indexOf(result);
                const isActive = globalIdx === activeIdx;
                return (
                  <div
                    key={`${result.label}-${globalIdx}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseDown={() => selectCity(result)}
                    onMouseEnter={() => setActiveIdx(globalIdx)}
                    className={`px-3 py-1.5 cursor-pointer flex items-center justify-between ${
                      isActive ? "bg-blue-50 text-blue-700" : "hover:bg-gray-100"
                    }`}
                  >
                    <span>{highlightMatch(result.city.n, value)}</span>
                    {result.city.d > 0 && (
                      <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                        {result.city.d} km
                      </span>
                    )}
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function groupByCountry(results: CitySearchResult[]) {
  const map = new Map<string, CitySearchResult[]>();
  for (const r of results) {
    const key = r.city.p || "Autre";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries()).map(([country, items]) => ({ country, items }));
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <strong className="font-semibold">{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </>
  );
}
