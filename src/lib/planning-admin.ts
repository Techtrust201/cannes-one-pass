/**
 * Helpers admin « Planning & quotas » — validations pures + contexte org.
 * Réutilise mergeDailyRanges / buildScopeKey ; aucune logique planning dupliquée.
 */

import type { NextRequest } from "next/server";
import {
  canAccessOrganization,
  getAccessibleOrganizationIds,
  requirePermission,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";
import { mergeDailyRanges } from "@/lib/logistics-planning";
import {
  buildScopeKey,
  canonicalPortCode,
  canonicalSectorCode,
  DEFAULT_CATEGORY_CODE,
  type PhaseCode,
  type PlanningScopeCode,
} from "@/lib/imports/planning";
import { normalizeOptionalCode } from "@/lib/imports/normalization";
import { compareTimes, parseTime } from "@/lib/imports/csv";
import { formatCapacityScopeLabel } from "@/lib/rx-capacity-scope";

export type PlanningAdminFeature = "GESTION_DATES" | "FLUX_VEHICULES";

export type PlanningAdminContext = {
  session: Awaited<ReturnType<typeof requirePermission>>;
  orgId: string;
  espace: string;
};

const VALID_SCOPES = new Set<PlanningScopeCode>([
  "EVENT",
  "PORT",
  "SECTOR",
  "SPACE",
  "LOCATION",
]);
const VALID_PHASES = new Set<PhaseCode>(["MONTAGE", "DEMONTAGE"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function resolvePlanningAdminContext(
  req: NextRequest,
  feature: PlanningAdminFeature,
  mode: "read" | "write" = "read"
): Promise<PlanningAdminContext | Response> {
  try {
    const session = await requirePermission(req, feature, mode);
    const espace = req.nextUrl.searchParams.get("espace")?.trim();
    if (!espace) {
      return Response.json({ error: "Le paramètre espace est requis" }, { status: 400 });
    }

    const orgId = await resolveEspaceOrgId(espace);
    if (!orgId) {
      return Response.json({ error: "Espace introuvable" }, { status: 404 });
    }

    const accessible = await getAccessibleOrganizationIds(session.user.id);
    if (!canAccessOrganization(accessible, orgId)) {
      return Response.json({ error: "Accès refusé à cet espace" }, { status: 403 });
    }

    return { session, orgId, espace };
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
}

export function parsePlanningPhase(raw: string | null | undefined): PhaseCode | null {
  const v = (raw ?? "").trim().toUpperCase();
  return VALID_PHASES.has(v as PhaseCode) ? (v as PhaseCode) : null;
}

export function parsePlanningScope(raw: string | null | undefined): PlanningScopeCode | null {
  const v = (raw ?? "").trim().toUpperCase();
  return VALID_SCOPES.has(v as PlanningScopeCode) ? (v as PlanningScopeCode) : null;
}

export function isValidDateYmd(raw: string | null | undefined): boolean {
  return !!raw && DATE_RE.test(raw);
}

export function isValidTimeHm(raw: string | null | undefined): boolean {
  return !!raw && parseTime(raw) !== null;
}

/** endTime strictement après startTime. */
export function assertTimeRange(
  startTime: string,
  endTime: string
): { ok: true; startTime: string; endTime: string } | { ok: false; error: string } {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (!start) return { ok: false, error: "startTime invalide (attendu HH:MM)" };
  if (!end) return { ok: false, error: "endTime invalide (attendu HH:MM)" };
  if (compareTimes(start, end) >= 0) {
    return { ok: false, error: "endTime doit être strictement après startTime" };
  }
  return { ok: true, startTime: start, endTime: end };
}

export function resolveManualScopeKey(params: {
  scope: string;
  portCode?: string | null;
  sectorCode?: string | null;
  spaceCode?: string | null;
  exhibitorLocationId?: string | null;
}): {
  ok: true;
  scope: PlanningScopeCode;
  scopeKey: string;
  portCode: string | null;
  sectorCode: string | null;
  spaceCode: string | null;
  exhibitorLocationId: string | null;
} | { ok: false; error: string } {
  const scope = parsePlanningScope(params.scope);
  if (!scope) {
    return { ok: false, error: "scope invalide (EVENT|PORT|SECTOR|SPACE|LOCATION)" };
  }
  const portCode = canonicalPortCode(params.portCode);
  const sectorCode = canonicalSectorCode(params.sectorCode);
  const spaceCode = normalizeOptionalCode(params.spaceCode);
  const exhibitorLocationId = params.exhibitorLocationId?.trim() || null;
  const scopeKey = buildScopeKey(scope, portCode, sectorCode, spaceCode, exhibitorLocationId);
  if (!scopeKey) {
    return {
      ok: false,
      error:
        scope === "LOCATION"
          ? "exhibitorLocationId requis pour le scope LOCATION"
          : `Codes manquants pour le scope ${scope} (PORT/SECTOR/SPACE requis selon le scope)`,
    };
  }
  return {
    ok: true,
    scope,
    scopeKey,
    portCode: scope === "PORT" || scope === "SECTOR" ? portCode : null,
    sectorCode: scope === "SECTOR" ? sectorCode : null,
    spaceCode: scope === "SPACE" ? spaceCode : null,
    exhibitorLocationId: scope === "LOCATION" ? exhibitorLocationId : null,
  };
}

/**
 * Refuse tout chevauchement strict sur le même groupe journalier.
 * Réutilise mergeDailyRanges : si deux plages fusionnent sans être adjacentes
 * (simple contact), c'est un chevauchement → conflit.
 */
export function findOverlappingRanges(
  candidate: { start: string; end: string },
  existing: Array<{ start: string; end: string }>
): string[] {
  const conflicts: string[] = [];
  for (const other of existing) {
    const touches =
      candidate.end === other.start || other.end === candidate.start;
    if (touches) continue;

    const merged = mergeDailyRanges([
      { start: candidate.start, end: candidate.end },
      { start: other.start, end: other.end },
    ]);
    // Fusion OK sans contact = chevauchement (ou inclusion).
    if (merged.ok) {
      conflicts.push(`${other.start}-${other.end}`);
    }
  }
  return conflicts;
}

/** Un créneau est couvert s'il est entièrement inclus dans au moins une plage. */
export function isSlotInsidePlanningRanges(
  slot: { date: string; startTime: string; endTime: string },
  ranges: Array<{ date: string; startTime: string; endTime: string; isActive?: boolean }>
): boolean {
  return ranges.some(
    (r) =>
      r.isActive !== false &&
      r.date === slot.date &&
      r.startTime <= slot.startTime &&
      slot.endTime <= r.endTime
  );
}

export function normalizeCategoryCode(raw: string | null | undefined): string {
  return normalizeOptionalCode(raw) ?? DEFAULT_CATEGORY_CODE;
}

export function scopeLabel(scopeKey: string): string {
  return formatCapacityScopeLabel(scopeKey);
}

export function integerParam(
  value: string | null,
  fallback: number,
  max: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export function responseFromError(error: unknown, label: string): Response {
  if (error instanceof Response) return error;
  console.error(`${label}:`, error);
  return Response.json({ error: "Erreur serveur" }, { status: 500 });
}
