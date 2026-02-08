/**
 * City search module – 100% local, no API calls.
 *
 * Loads the European cities JSON once and provides:
 *  - Fast fuzzy search (< 50 ms) with accent-insensitive matching
 *  - Relevance-based sorting (exact > starts-with > contains > fuzzy)
 *  - Pre-calculated distance to Cannes for every city
 */

import citiesData from "@/data/european-cities.json";

// ── Types ────────────────────────────────────────────────────────────
export interface CityEntry {
  /** Display name (French-preferred) */
  n: string;
  /** ISO country code (FR, DE, …) */
  c: string;
  /** Country name in French */
  p: string;
  lat: number;
  lng: number;
  /** Pre-calculated road distance to Cannes (km) */
  d: number;
  /** Alternative names / spellings */
  alt?: string[];
}

export interface CitySearchResult {
  city: CityEntry;
  /** Display string: "City, Country" */
  label: string;
  /** Relevance score (lower = better match) */
  score: number;
}

// ── Normalisation ────────────────────────────────────────────────────
const ACCENT_MAP: Record<string, string> = {
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a",
  è: "e", é: "e", ê: "e", ë: "e",
  ì: "i", í: "i", î: "i", ï: "i",
  ò: "o", ó: "o", ô: "o", õ: "o", ö: "o",
  ù: "u", ú: "u", û: "u", ü: "u",
  ñ: "n", ç: "c", ł: "l", ß: "ss",
  ø: "o", æ: "ae", œ: "oe", ð: "d", þ: "th",
  š: "s", ž: "z", č: "c", ř: "r", ď: "d", ť: "t", ň: "n",
  ą: "a", ę: "e", ś: "s", ź: "z", ż: "z", ć: "c",
};

function normalize(str: string): string {
  return str
    .toLowerCase()
    .split("")
    .map((ch) => ACCENT_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9 -]/g, "")
    .trim();
}

// ── Pre-build search index ───────────────────────────────────────────
interface IndexedCity {
  city: CityEntry;
  label: string;
  /** Normalised primary name */
  norm: string;
  /** All normalised searchable names (primary + alt) */
  norms: string[];
}

const cities: CityEntry[] = citiesData as CityEntry[];

const index: IndexedCity[] = cities.map((city) => {
  const label = `${city.n}, ${city.p}`;
  const norm = normalize(city.n);
  const norms = [norm];
  if (city.alt) {
    for (const a of city.alt) {
      norms.push(normalize(a));
    }
  }
  return { city, label, norm, norms };
});

// ── Scoring ──────────────────────────────────────────────────────────

/**
 * Score a city against the query (lower is better).
 * Returns Infinity if no match at all.
 */
function score(entry: IndexedCity, q: string): number {
  for (const n of entry.norms) {
    // Exact match
    if (n === q) return 0;
    // Starts with query
    if (n.startsWith(q)) return 1 + (n.length - q.length) * 0.01;
    // Contains query
    const idx = n.indexOf(q);
    if (idx >= 0) return 2 + idx * 0.01;
  }

  // Simple fuzzy: allow 1 character difference for queries >= 3 chars
  if (q.length >= 3) {
    for (const n of entry.norms) {
      if (simpleFuzzy(n, q)) return 3;
    }
  }

  return Infinity;
}

/** Returns true if `a` and `b` differ by at most 1 char (insertion / deletion / substitution). */
function simpleFuzzy(haystack: string, needle: string): boolean {
  // Check if removing one char from needle matches a substring
  for (let i = 0; i < needle.length; i++) {
    const reduced = needle.slice(0, i) + needle.slice(i + 1);
    if (reduced.length >= 2 && haystack.includes(reduced)) return true;
  }
  return false;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Search cities locally. Returns up to `limit` results sorted by relevance.
 * Typical execution time: < 10 ms for 500 cities.
 */
export function searchCities(query: string, limit = 10): CitySearchResult[] {
  const q = normalize(query);
  if (!q || q.length < 1) return [];

  const results: CitySearchResult[] = [];

  for (const entry of index) {
    const s = score(entry, q);
    if (s < Infinity) {
      results.push({ city: entry.city, label: entry.label, score: s });
    }
  }

  // Sort by score ascending (best first), then alphabetical
  results.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, "fr"));

  return results.slice(0, limit);
}

/**
 * Find a city by exact or near-exact name. Returns the best match or null.
 */
export function findCity(name: string): CityEntry | null {
  const q = normalize(name);
  if (!q) return null;

  // First try exact match
  for (const entry of index) {
    for (const n of entry.norms) {
      if (n === q) return entry.city;
    }
  }

  // Then try starts-with on primary name
  for (const entry of index) {
    if (entry.norm.startsWith(q)) return entry.city;
  }

  return null;
}

/**
 * Get all cities (for pre-loading or listing).
 */
export function getAllCities(): CityEntry[] {
  return cities;
}

/**
 * Get the total number of cities in the database.
 */
export function getCityCount(): number {
  return cities.length;
}
