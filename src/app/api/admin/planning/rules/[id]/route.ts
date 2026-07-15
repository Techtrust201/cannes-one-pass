/**
 * PATCH/DELETE /api/admin/planning/rules/[id]
 * Permission : GESTION_DATES — scopé organisation.
 */

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertTimeRange,
  findOverlappingRanges,
  isValidDateYmd,
  normalizeCategoryCode,
  resolvePlanningAdminContext,
  responseFromError,
  scopeLabel,
} from "@/lib/planning-admin";

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

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, routeContext: RouteContext) {
  const context = await resolvePlanningAdminContext(req, "GESTION_DATES", "write");
  if (context instanceof Response) return context;

  try {
    const { id } = await routeContext.params;
    if (!id?.trim()) {
      return Response.json({ error: "id requis" }, { status: 400 });
    }

    const existing = await prisma.logisticsPlanning.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        eventId: true,
        scopeKey: true,
        categoryCode: true,
        phase: true,
        date: true,
        startTime: true,
        endTime: true,
      },
    });
    if (!existing || existing.organizationId !== context.orgId) {
      return Response.json({ error: "Règle introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const nextDate =
      body.date !== undefined
        ? String(body.date).trim()
        : existing.date;
    if (!isValidDateYmd(nextDate)) {
      return Response.json({ error: "date invalide (YYYY-MM-DD)" }, { status: 400 });
    }

    const nextStart =
      body.startTime !== undefined ? String(body.startTime) : existing.startTime;
    const nextEnd =
      body.endTime !== undefined ? String(body.endTime) : existing.endTime;
    const times = assertTimeRange(nextStart, nextEnd);
    if (!times.ok) {
      return Response.json({ error: times.error }, { status: 400 });
    }

    const nextCategory =
      body.categoryCode !== undefined
        ? normalizeCategoryCode(body.categoryCode)
        : existing.categoryCode;

    const siblings = await prisma.logisticsPlanning.findMany({
      where: {
        organizationId: context.orgId,
        eventId: existing.eventId,
        scopeKey: existing.scopeKey,
        categoryCode: nextCategory,
        phase: existing.phase,
        date: nextDate,
        NOT: { id: existing.id },
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

    const data: {
      date?: string;
      startTime?: string;
      endTime?: string;
      isActive?: boolean;
      categoryCode?: string;
    } = {};
    if (body.date !== undefined) data.date = nextDate;
    if (body.startTime !== undefined || body.endTime !== undefined) {
      data.startTime = times.startTime;
      data.endTime = times.endTime;
    }
    if (body.categoryCode !== undefined) data.categoryCode = nextCategory;
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return Response.json({ error: "isActive doit être un booléen" }, { status: 400 });
      }
      data.isActive = body.isActive;
    }

    const row = await prisma.logisticsPlanning.update({
      where: { id: existing.id },
      data,
      include: { event: { select: { id: true, name: true, slug: true } } },
    });

    return Response.json(serializeRule(row));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return Response.json({ error: "Règle déjà existante (doublon exact)" }, { status: 409 });
    }
    return responseFromError(error, "PATCH /api/admin/planning/rules/[id]");
  }
}

export async function DELETE(req: NextRequest, routeContext: RouteContext) {
  const context = await resolvePlanningAdminContext(req, "GESTION_DATES", "write");
  if (context instanceof Response) return context;

  try {
    const { id } = await routeContext.params;
    if (!id?.trim()) {
      return Response.json({ error: "id requis" }, { status: 400 });
    }

    const existing = await prisma.logisticsPlanning.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!existing || existing.organizationId !== context.orgId) {
      return Response.json({ error: "Règle introuvable" }, { status: 404 });
    }

    await prisma.logisticsPlanning.delete({ where: { id: existing.id } });
    return Response.json({ ok: true, id: existing.id });
  } catch (error) {
    return responseFromError(error, "DELETE /api/admin/planning/rules/[id]");
  }
}
