/**
 * GET/POST /api/admin/planning/rules
 * CRUD liste + création des règles LogisticsPlanning (source: manuel).
 * Permission : GESTION_DATES
 */

import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertEventBelongsToOrg } from "@/lib/auth-helpers";
import {
  assertTimeRange,
  findOverlappingRanges,
  integerParam,
  isValidDateYmd,
  normalizeCategoryCode,
  parsePlanningPhase,
  parsePlanningScope,
  resolveManualScopeKey,
  resolvePlanningAdminContext,
  responseFromError,
  scopeLabel,
} from "@/lib/planning-admin";
import { DEFAULT_CATEGORY_CODE } from "@/lib/imports/planning";

function serializeRule(row: {
  id: string;
  eventId: string;
  scope: string;
  scopeKey: string;
  portCode: string | null;
  sectorCode: string | null;
  spaceCode: string | null;
  categoryCode: string;
  phase: string;
  date: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
  event?: { id: string; name: string; slug: string };
}) {
  return {
    id: row.id,
    eventId: row.eventId,
    eventName: row.event?.name ?? null,
    eventSlug: row.event?.slug ?? null,
    scope: row.scope,
    scopeKey: row.scopeKey,
    scopeLabel: scopeLabel(row.scopeKey),
    portCode: row.portCode,
    sectorCode: row.sectorCode,
    spaceCode: row.spaceCode,
    categoryCode: row.categoryCode,
    phase: row.phase,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    isActive: row.isActive,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const context = await resolvePlanningAdminContext(req, "GESTION_DATES", "read");
  if (context instanceof Response) return context;

  try {
    const params = req.nextUrl.searchParams;
    const eventId = params.get("eventId")?.trim() || undefined;
    if (eventId) await assertEventBelongsToOrg(eventId, context.orgId);

    const phase = params.get("phase")?.trim();
    if (phase && !parsePlanningPhase(phase)) {
      return Response.json({ error: "phase invalide (MONTAGE|DEMONTAGE)" }, { status: 400 });
    }
    const scope = params.get("scope")?.trim();
    if (scope && !parsePlanningScope(scope)) {
      return Response.json({ error: "scope invalide (EVENT|PORT|SECTOR|SPACE)" }, { status: 400 });
    }
    const date = params.get("date")?.trim();
    if (date && !isValidDateYmd(date)) {
      return Response.json({ error: "date invalide (YYYY-MM-DD)" }, { status: 400 });
    }

    const categoryCode = params.get("categoryCode")?.trim();
    const port = params.get("port")?.trim();
    const sector = params.get("sector")?.trim();
    const q = params.get("q")?.trim() || "";

    const where: Prisma.LogisticsPlanningWhereInput = {
      organizationId: context.orgId,
      ...(eventId ? { eventId } : {}),
      ...(phase ? { phase: phase as "MONTAGE" | "DEMONTAGE" } : {}),
      ...(scope ? { scope: scope as "EVENT" | "PORT" | "SECTOR" | "SPACE" } : {}),
      ...(categoryCode ? { categoryCode: normalizeCategoryCode(categoryCode) } : {}),
      ...(date ? { date } : {}),
      ...(port ? { portCode: { contains: port, mode: "insensitive" } } : {}),
      ...(sector ? { sectorCode: { contains: sector, mode: "insensitive" } } : {}),
      ...(q
        ? {
            OR: [
              { scopeKey: { contains: q, mode: "insensitive" } },
              { categoryCode: { contains: q, mode: "insensitive" } },
              { portCode: { contains: q, mode: "insensitive" } },
              { sectorCode: { contains: q, mode: "insensitive" } },
              { spaceCode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const page = integerParam(params.get("page"), 1, 1_000_000);
    const pageSize = integerParam(params.get("pageSize"), 50, 200);

    const [rows, total, events] = await Promise.all([
      prisma.logisticsPlanning.findMany({
        where,
        orderBy: [
          { date: "asc" },
          { startTime: "asc" },
          { scopeKey: "asc" },
          { phase: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { event: { select: { id: true, name: true, slug: true } } },
      }),
      prisma.logisticsPlanning.count({ where }),
      prisma.event.findMany({
        where: { organizationId: context.orgId, isArchived: false },
        select: { id: true, name: true, slug: true },
        orderBy: { startDate: "desc" },
      }),
    ]);

    return Response.json({
      items: rows.map(serializeRule),
      total,
      page,
      pageSize,
      events,
    });
  } catch (error) {
    return responseFromError(error, "GET /api/admin/planning/rules");
  }
}

export async function POST(req: NextRequest) {
  const context = await resolvePlanningAdminContext(req, "GESTION_DATES", "write");
  if (context instanceof Response) return context;

  try {
    const body = await req.json();
    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    if (!eventId) {
      return Response.json({ error: "eventId requis" }, { status: 400 });
    }
    await assertEventBelongsToOrg(eventId, context.orgId);

    const phase = parsePlanningPhase(body.phase);
    if (!phase) {
      return Response.json({ error: "phase invalide (MONTAGE|DEMONTAGE)" }, { status: 400 });
    }

    const date = typeof body.date === "string" ? body.date.trim() : "";
    if (!isValidDateYmd(date)) {
      return Response.json({ error: "date invalide (YYYY-MM-DD)" }, { status: 400 });
    }

    const times = assertTimeRange(String(body.startTime ?? ""), String(body.endTime ?? ""));
    if (!times.ok) {
      return Response.json({ error: times.error }, { status: 400 });
    }

    const scopeResolved = resolveManualScopeKey({
      scope: String(body.scope ?? ""),
      portCode: body.portCode ?? null,
      sectorCode: body.sectorCode ?? null,
      spaceCode: body.spaceCode ?? null,
    });
    if (!scopeResolved.ok) {
      return Response.json({ error: scopeResolved.error }, { status: 400 });
    }

    const categoryCode = normalizeCategoryCode(body.categoryCode);

    const siblings = await prisma.logisticsPlanning.findMany({
      where: {
        organizationId: context.orgId,
        eventId,
        scopeKey: scopeResolved.scopeKey,
        categoryCode,
        phase,
        date,
      },
      select: { startTime: true, endTime: true },
    });

    const overlaps = findOverlappingRanges(
      { start: times.startTime, end: times.endTime },
      siblings.map((s) => ({ start: s.startTime, end: s.endTime }))
    );
    if (overlaps.length > 0) {
      return Response.json(
        {
          error: `Chevauchement horaire avec plage(s) existante(s) : ${overlaps.join(", ")}`,
          code: "PLANNING_OVERLAP",
          conflicts: overlaps,
        },
        { status: 400 }
      );
    }

    const row = await prisma.logisticsPlanning.create({
      data: {
        organizationId: context.orgId,
        eventId,
        scope: scopeResolved.scope,
        scopeKey: scopeResolved.scopeKey,
        portCode: scopeResolved.portCode,
        sectorCode: scopeResolved.sectorCode,
        spaceCode: scopeResolved.spaceCode,
        categoryCode: categoryCode || DEFAULT_CATEGORY_CODE,
        phase,
        date,
        startTime: times.startTime,
        endTime: times.endTime,
        isActive: true,
        source: "manuel",
      },
      include: { event: { select: { id: true, name: true, slug: true } } },
    });

    return Response.json(serializeRule(row), { status: 201 });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return Response.json({ error: "Règle déjà existante (doublon exact)" }, { status: 409 });
    }
    return responseFromError(error, "POST /api/admin/planning/rules");
  }
}
