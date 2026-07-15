import type { LocationType, Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAdminOrgContext } from "@/lib/admin-referential-access";
import { assertEventBelongsToOrg } from "@/lib/auth-helpers";
import {
  normalizeExhibitorName,
  normalizeLocationCode,
  normalizeOptionalCode,
} from "@/lib/imports/normalization";

const LOCATION_TYPES = new Set<LocationType>(["TERRE", "FLOT", "STAND"]);

function integerParam(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function responseFromError(error: unknown) {
  if (error instanceof Response) return error;
  console.error("Référentiel exposants :", error);
  return Response.json({ error: "Erreur serveur" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const context = await resolveAdminOrgContext(req);
  if (context instanceof Response) return context;

  try {
    const params = req.nextUrl.searchParams;
    const eventId = params.get("eventId")?.trim() || undefined;
    if (eventId) await assertEventBelongsToOrg(eventId, context.orgId);

    const type = params.get("type")?.toUpperCase() as LocationType | undefined;
    if (type && !LOCATION_TYPES.has(type)) {
      return Response.json({ error: "Type d'emplacement invalide" }, { status: 400 });
    }

    const q = params.get("q")?.trim() || "";
    const qName = normalizeExhibitorName(q);
    const qCode = normalizeLocationCode(q)?.codeNormalized;
    const status = params.get("status") || "active";
    if (!["active", "inactive", "all"].includes(status)) {
      return Response.json({ error: "Statut invalide" }, { status: 400 });
    }

    const locationWhere: Prisma.ExhibitorLocationWhereInput = {
      ...(type ? { type } : {}),
      ...(params.get("port") ? { portCode: normalizeOptionalCode(params.get("port")) } : {}),
      ...(params.get("sector")
        ? { sectorCode: normalizeOptionalCode(params.get("sector")) }
        : {}),
      ...(params.get("space")
        ? { logisticSpace: normalizeOptionalCode(params.get("space")) }
        : {}),
    };
    const hasLocationFilter = Object.keys(locationWhere).length > 0;
    const where: Prisma.ExhibitorWhereInput = {
      organizationId: context.orgId,
      ...(eventId ? { eventId } : {}),
      ...(status === "all" ? {} : { isActive: status === "active" }),
      ...(hasLocationFilter ? { locations: { some: locationWhere } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              ...(qName ? [{ nameNormalized: { contains: qName } }] : []),
              ...(qCode
                ? [{ locations: { some: { codeNormalized: { contains: qCode } } } }]
                : []),
            ],
          }
        : {}),
    };

    const page = integerParam(params.get("page"), 1, 1_000_000);
    const pageSize = integerParam(params.get("pageSize"), 25, 100);
    const counterScope: Prisma.ExhibitorWhereInput = {
      organizationId: context.orgId,
      ...(eventId ? { eventId } : {}),
      isActive: true,
    };

    const [rows, total, exhibitors, locations] = await Promise.all([
      prisma.exhibitor.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          externalReference: true,
          isActive: true,
          stand: true,
          sector: true,
          zone: true,
          _count: { select: { locations: true } },
          locations: {
            orderBy: [{ isActive: "desc" }, { type: "asc" }, { code: "asc" }],
            take: 5,
            select: {
              id: true,
              type: true,
              code: true,
              portCode: true,
              sectorCode: true,
              logisticSpace: true,
              isActive: true,
            },
          },
        },
      }),
      prisma.exhibitor.count({ where }),
      prisma.exhibitor.count({ where: counterScope }),
      prisma.exhibitorLocation.count({
        where: { isActive: true, exhibitor: counterScope },
      }),
    ]);

    return Response.json({
      items: rows.map(({ _count, ...row }) => ({
        ...row,
        locationsCount: _count.locations,
      })),
      total,
      page,
      pageSize,
      counters: { exhibitors, locations },
    });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(req: NextRequest) {
  const context = await resolveAdminOrgContext(req, "write");
  if (context instanceof Response) return context;

  try {
    const body = await req.json();
    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    const nameNormalized = normalizeExhibitorName(name);
    const rawLocations = Array.isArray(body.locations) ? body.locations : [];
    if (!eventId || !name || !nameNormalized || rawLocations.length === 0) {
      return Response.json(
        { error: "eventId, name et au moins un emplacement sont requis" },
        { status: 400 }
      );
    }
    await assertEventBelongsToOrg(eventId, context.orgId);

    const locations = rawLocations.map((raw: Record<string, unknown>) => {
      const type = typeof raw.type === "string" ? raw.type.toUpperCase() : "";
      const normalized = normalizeLocationCode(
        typeof raw.code === "string" ? raw.code : undefined
      );
      if (!LOCATION_TYPES.has(type as LocationType) || !normalized) {
        throw new Response("Type ou code d'emplacement invalide", { status: 400 });
      }
      return {
        type: type as LocationType,
        ...normalized,
        portCode: normalizeOptionalCode(
          typeof raw.portCode === "string" ? raw.portCode : undefined
        ),
        sectorCode: normalizeOptionalCode(
          typeof raw.sectorCode === "string" ? raw.sectorCode : undefined
        ),
        logisticSpace: normalizeOptionalCode(
          typeof raw.logisticSpace === "string" ? raw.logisticSpace : undefined
        ),
      };
    });

    const first = locations[0]!;
    const exhibitor = await prisma.exhibitor.create({
      data: {
        organizationId: context.orgId,
        eventId,
        name,
        nameNormalized,
        externalReference:
          typeof body.externalReference === "string"
            ? body.externalReference.trim() || null
            : null,
        stand: first.code || "—",
        sector: first.sectorCode,
        zone: first.logisticSpace,
        locations: { create: locations },
      },
      include: { locations: true },
    });
    return Response.json({ exhibitor }, { status: 201 });
  } catch (error) {
    return responseFromError(error);
  }
}
