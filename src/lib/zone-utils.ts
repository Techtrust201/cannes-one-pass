/**
 * Zone utilities — dynamiques.
 * Les zones sont maintenant des Strings liées à ZoneConfig en base.
 * Ce module fournit des helpers synchrones basés sur un cache,
 * et une fonction de chargement asynchrone.
 */

// Types
export interface ZoneConfigData {
  id: number;
  zone: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  isFinalDestination: boolean;
  color: string;
  isActive: boolean;
  // Lot 3 — Lecteur de plaque par zone (optionnel).
  readerName?: string | null;
  readerUrl?: string | null;
  readerActive?: boolean;
}

// ────────────────────────────────────────────────────────────────
// Cache local par Espace (chargé via loadZones)
//
// Multi-tenant : les zones sont scopées par organisation. On garde un cache
// par slug d'Espace (clé "__global__" quand aucun espace n'est fourni) afin
// d'éviter de mélanger les zones de plusieurs organisations dans les
// sélecteurs (entrée/transfert).
// ────────────────────────────────────────────────────────────────
const GLOBAL_SCOPE = "__global__";
const _zonesByScope = new Map<string, ZoneConfigData[]>();
const _loadingByScope = new Map<string, Promise<ZoneConfigData[]>>();
let _currentScope = GLOBAL_SCOPE;

/**
 * Charge les zones depuis l'API /api/zones (client-side), scopées à l'Espace.
 * Le cache est indexé par slug d'Espace ; le dernier scope chargé devient le
 * scope "courant" utilisé par les helpers synchrones.
 */
export async function loadZones(
  force = false,
  espace?: string | null
): Promise<ZoneConfigData[]> {
  const scope = espace?.trim() || GLOBAL_SCOPE;
  _currentScope = scope;

  if (!force && _zonesByScope.has(scope)) return _zonesByScope.get(scope)!;
  if (!force && _loadingByScope.has(scope)) return _loadingByScope.get(scope)!;

  const promise = (async () => {
    try {
      const url =
        scope === GLOBAL_SCOPE
          ? "/api/zones"
          : `/api/zones?espace=${encodeURIComponent(scope)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const active = (data as ZoneConfigData[]).filter((z) => z.isActive);
        _zonesByScope.set(scope, active);
        return active;
      }
    } catch (e) {
      console.error("Erreur chargement zones:", e);
    }
    // Fallback aux zones par défaut si rien n'est chargé pour ce scope.
    const fallback = _zonesByScope.get(scope) ?? DEFAULT_ZONES;
    _zonesByScope.set(scope, fallback);
    return fallback;
  })();

  _loadingByScope.set(scope, promise);
  const result = await promise;
  _loadingByScope.delete(scope);
  return result;
}

/**
 * Retourne les zones déjà chargées pour le scope courant (synchrone).
 * Si rien n'est chargé, retourne les valeurs par défaut.
 */
export function getZonesSync(): ZoneConfigData[] {
  return (
    _zonesByScope.get(_currentScope) ??
    _zonesByScope.get(GLOBAL_SCOPE) ??
    DEFAULT_ZONES
  );
}

/**
 * Force la mise à jour du cache (après ajout/modification de zone).
 */
export function invalidateZoneCache(): void {
  _zonesByScope.clear();
  _loadingByScope.clear();
}

// ────────────────────────────────────────────────────────────────
// Valeurs par défaut (fallback avant le premier chargement)
// ────────────────────────────────────────────────────────────────
const DEFAULT_ZONES: ZoneConfigData[] = [
  { id: 1, zone: "LA_BOCCA", label: "La Bocca", address: "", latitude: 43.5519, longitude: 6.9629, isFinalDestination: false, color: "orange", isActive: true },
  { id: 2, zone: "PALAIS_DES_FESTIVALS", label: "Palais des Festivals", address: "", latitude: 43.5515, longitude: 7.0168, isFinalDestination: true, color: "green", isActive: true },
  { id: 3, zone: "PANTIERO", label: "Pantiero", address: "", latitude: 43.5498, longitude: 7.0142, isFinalDestination: false, color: "blue", isActive: true },
  { id: 4, zone: "MACE", label: "Macé", address: "", latitude: 43.5503, longitude: 7.0223, isFinalDestination: false, color: "purple", isActive: true },
];

// ────────────────────────────────────────────────────────────────
// Helpers synchrones
// ────────────────────────────────────────────────────────────────

/** Palette de couleurs CSS par couleur de zone */
const COLOR_PALETTE: Record<string, { bg: string; text: string; dot: string }> = {
  orange: { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  green: { bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" },
  blue: { bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
  purple: { bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-500" },
  red: { bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500" },
  pink: { bg: "bg-pink-100", text: "text-pink-700", dot: "bg-pink-500" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-700", dot: "bg-indigo-500" },
  teal: { bg: "bg-teal-100", text: "text-teal-700", dot: "bg-teal-500" },
  gray: { bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-500" },
};

/** Retourne le label d'affichage d'une zone. */
export function getZoneLabel(zoneKey: string): string {
  const z = getZonesSync().find((z) => z.zone === zoneKey);
  return z?.label || zoneKey.replace(/_/g, " ");
}

/** Retourne les classes CSS pour une zone. */
export function getZoneColors(zoneKey: string): { bg: string; text: string; dot: string } {
  const z = getZonesSync().find((z) => z.zone === zoneKey);
  const color = z?.color || "gray";
  return COLOR_PALETTE[color] || COLOR_PALETTE.gray;
}

/** Compatibilité : ancien ZONE_COLORS (retourne "bg-xx-100 text-xx-700"). */
export function getZoneColorClasses(zoneKey: string): string {
  const c = getZoneColors(zoneKey);
  return `${c.bg} ${c.text}`;
}

/** Map statique pour la rétro-compatibilité (utilisée par les composants existants). */
export const ZONE_COLORS: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  {
    get(_target, prop: string) {
      return getZoneColorClasses(prop);
    },
  }
);

/** Vérifie si une zone est la destination finale (Palais). */
export function isFinalDestination(zoneKey: string): boolean {
  const z = getZonesSync().find((z) => z.zone === zoneKey);
  return z?.isFinalDestination ?? (zoneKey === "PALAIS_DES_FESTIVALS");
}

/** Retourne toutes les clés de zones actives. */
export function getAllZones(): string[] {
  return getZonesSync().map((z) => z.zone);
}

/** Retourne les zones vers lesquelles un transfert est possible (exclut la zone actuelle). */
export function getTransferTargets(currentZone: string): string[] {
  return getZonesSync()
    .filter((z) => z.zone !== currentZone)
    .map((z) => z.zone);
}
