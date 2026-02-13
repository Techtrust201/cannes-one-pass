"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  usePhoneInput,
  defaultCountries,
  parseCountry,
  FlagImage,
} from "react-international-phone";
import "react-international-phone/style.css";
import type { CountryIso2 } from "react-international-phone";
import { ChevronDown, Search } from "lucide-react";

interface PhoneInputProps {
  /** Full international phone value, e.g. "+33612345678" */
  value: string;
  /** Called with full phone string (including dial code) */
  onChange: (phone: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: boolean;
}

const PREFERRED_COUNTRIES: CountryIso2[] = [
  "fr", "be", "ch", "de", "es", "it", "gb", "nl", "pt",
];

/**
 * Composant d'input téléphonique professionnel avec drapeaux, indicatifs
 * et barre de recherche dans le dropdown.
 * Utilise le hook usePhoneInput de react-international-phone sous le capot.
 */
export default function PhoneInput({
  value,
  onChange,
  placeholder = "Numéro de téléphone",
  error = false,
}: PhoneInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    inputValue,
    country,
    setCountry,
    handlePhoneValueChange,
    inputRef,
  } = usePhoneInput({
    defaultCountry: "fr",
    value,
    countries: defaultCountries,
    preferredCountries: PREFERRED_COUNTRIES,
    forceDialCode: true,
    onChange: (data) => onChange(data.phone),
  });

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSearch("");
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (dropdownOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [dropdownOpen]);

  // Parse countries for rendering
  const parsedCountries = defaultCountries.map((c) => parseCountry(c));

  // Filter countries based on search
  const filterCountries = useCallback(
    (list: typeof parsedCountries) => {
      if (!search) return list;
      const q = search.toLowerCase();
      return list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.dialCode.includes(q) ||
          c.iso2.includes(q)
      );
    },
    [search]
  );

  // Build preferred + rest lists
  const preferred = parsedCountries.filter((c) =>
    PREFERRED_COUNTRIES.includes(c.iso2 as CountryIso2)
  );
  const rest = parsedCountries.filter(
    (c) => !PREFERRED_COUNTRIES.includes(c.iso2 as CountryIso2)
  );

  const filteredPreferred = filterCountries(preferred);
  const filteredRest = filterCountries(rest);

  const handleSelectCountry = (iso2: CountryIso2) => {
    setCountry(iso2, { focusOnInput: true });
    setDropdownOpen(false);
    setSearch("");
  };

  const currentParsed = parsedCountries.find((c) => c.iso2 === country.iso2);

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={`flex items-center rounded-md border ${
          error ? "border-red-500" : "border-gray-300"
        } focus-within:ring-2 focus-within:ring-[#4F587E] focus-within:border-[#4F587E] shadow-sm bg-white overflow-hidden`}
      >
        {/* Country selector button */}
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 hover:bg-gray-100 transition border-r border-gray-300 shrink-0"
        >
          <FlagImage iso2={country.iso2} size={20} />
          <span className="text-xs text-gray-600 font-medium">
            +{currentParsed?.dialCode || country.dialCode}
          </span>
          <ChevronDown size={12} className="text-gray-400" />
        </button>

        {/* Phone number input */}
        <input
          ref={inputRef}
          type="tel"
          value={inputValue}
          onChange={handlePhoneValueChange}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 text-sm border-0 shadow-none ring-0 focus:ring-0 focus:outline-none bg-transparent"
        />
      </div>

      {/* Dropdown with search */}
      {dropdownOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Search bar */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <Search size={14} className="text-gray-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un pays ou indicatif..."
                className="flex-1 text-sm bg-transparent border-0 outline-none placeholder-gray-400"
              />
            </div>
          </div>

          {/* Country list */}
          <div className="max-h-60 overflow-y-auto">
            {/* Preferred countries */}
            {filteredPreferred.length > 0 && (
              <>
                {filteredPreferred.map((c) => (
                  <button
                    key={`pref-${c.iso2}`}
                    type="button"
                    onClick={() => handleSelectCountry(c.iso2 as CountryIso2)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition ${
                      c.iso2 === country.iso2 ? "bg-[#4F587E]/5 font-semibold" : ""
                    }`}
                  >
                    <FlagImage iso2={c.iso2} size={20} />
                    <span className="flex-1 text-left text-gray-800 truncate">
                      {c.name}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      +{c.dialCode}
                    </span>
                  </button>
                ))}
                {filteredRest.length > 0 && (
                  <div className="border-t border-gray-100" />
                )}
              </>
            )}

            {/* Rest of countries */}
            {filteredRest.map((c) => (
              <button
                key={c.iso2}
                type="button"
                onClick={() => handleSelectCountry(c.iso2 as CountryIso2)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition ${
                  c.iso2 === country.iso2 ? "bg-[#4F587E]/5 font-semibold" : ""
                }`}
              >
                <FlagImage iso2={c.iso2} size={20} />
                <span className="flex-1 text-left text-gray-800 truncate">
                  {c.name}
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  +{c.dialCode}
                </span>
              </button>
            ))}

            {/* No results */}
            {filteredPreferred.length === 0 && filteredRest.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                Aucun pays trouvé
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
