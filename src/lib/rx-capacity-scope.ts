/**
 * ScopeKeys de capacité — alignés sur LogisticsPlanning + extensions ZONE/LOCATION.
 *
 * Pas de second moteur de résolution : on réutilise `buildScopeKey` du planning
 * pour EVENT/PORT/SECTOR/SPACE, et on ajoute uniquement ZONE / LOCATION.
 */

import {
  buildScopeKey,
  type PlanningScopeCode,
} from "@/lib/imports/planning";

export type CapacityScopeKind =
  | "EVENT"
  | "PORT"
  | "SECTOR"
  | "SPACE"
  | "ZONE"
  | "LOCATION";

/** ScopeKey zone logistique (comportement historique RxCapacity). */
export function zoneScopeKey(zoneCode: string): string {
  return `ZONE:${zoneCode.trim().toUpperCase()}`;
}

/** ScopeKey emplacement (ExhibitorLocation.id). */
export function locationScopeKey(exhibitorLocationId: string): string {
  return `LOCATION:${exhibitorLocationId.trim()}`;
}

/**
 * Construit un scopeKey capacité depuis un scope planning (EVENT/PORT/SECTOR/SPACE)
 * ou depuis une zone / un emplacement.
 */
export function buildCapacityScopeKey(params: {
  scope: CapacityScopeKind;
  portCode?: string | null;
  sectorCode?: string | null;
  spaceCode?: string | null;
  zoneCode?: string | null;
  exhibitorLocationId?: string | null;
}): string | null {
  const { scope } = params;
  if (scope === "ZONE") {
    const z = params.zoneCode?.trim();
    return z ? zoneScopeKey(z) : null;
  }
  if (scope === "LOCATION") {
    const id = params.exhibitorLocationId?.trim();
    return id ? locationScopeKey(id) : null;
  }
  return buildScopeKey(
    scope as PlanningScopeCode,
    params.portCode ?? null,
    params.sectorCode ?? null,
    params.spaceCode ?? null
  );
}

export function parseCapacityScopeKey(scopeKey: string): {
  kind: CapacityScopeKind | "UNKNOWN";
  rest: string;
} {
  const raw = scopeKey.trim();
  if (raw === "EVENT") return { kind: "EVENT", rest: "" };
  const idx = raw.indexOf(":");
  if (idx <= 0) return { kind: "UNKNOWN", rest: raw };
  const prefix = raw.slice(0, idx).toUpperCase();
  const rest = raw.slice(idx + 1);
  if (
    prefix === "PORT" ||
    prefix === "SECTOR" ||
    prefix === "SPACE" ||
    prefix === "ZONE" ||
    prefix === "LOCATION"
  ) {
    return { kind: prefix, rest };
  }
  return { kind: "UNKNOWN", rest: raw };
}

/** Libellé métier court pour l'UI (pas de JSON technique seul). */
export function formatCapacityScopeLabel(scopeKey: string): string {
  const { kind, rest } = parseCapacityScopeKey(scopeKey);
  switch (kind) {
    case "EVENT":
      return "Événement entier";
    case "PORT":
      return `Port ${rest.replace(/_/g, " ")}`;
    case "SECTOR":
      return `Secteur ${rest.replace(/_/g, " ").replace(/:/g, " / ")}`;
    case "SPACE":
      return `Espace ${rest.replace(/_/g, " ")}`;
    case "ZONE":
      return `Zone ${rest.replace(/_/g, " ")}`;
    case "LOCATION":
      return `Emplacement`;
    default:
      return scopeKey;
  }
}

/** Défaut rétrocompat : si scopeKey absent → ZONE:<zone>. */
export function resolveCapacityScopeKey(
  scopeKey: string | null | undefined,
  zone: string
): string {
  const s = scopeKey?.trim();
  if (s) return s;
  return zoneScopeKey(zone);
}
