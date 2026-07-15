import type { LocationType } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAdminOrgContext } from "@/lib/admin-referential-access";
import {
  normalizeLocationCode,
  normalizeOptionalCode,
} from "@/lib/imports/normalization";

const TYPES = new Set<LocationType>(["TERRE", "FLOT", "STAND"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await resolveAdminOrgContext(req, "write");
  if (context instanceof Response) return context;

  try {
    const { id } = await params;
    const exhibitor = await prisma.exhibitor.findFirst({
      where: { id, organizationId: context.orgId },
      select: { id: true, eventId: true },
    });
    if (!exhibitor) {
      return Response.json({ error: "Exposant introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const type =
      typeof body.type === "string" ? (body.type.toUpperCase() as LocationType) : null;
    const code = normalizeLocationCode(
      typeof body.code === "string" ? body.code : undefined
    );
    if (!type || !TYPES.has(type) || !code) {
      return Response.json({ error: "Type ou code d'emplacement invalide" }, { status: 400 });
    }

    const collisionRows = await prisma.exhibitorLocation.findMany({
      where: {
        type,
        codeNormalized: code.codeNormalized,
        isActive: true,
        exhibitorId: { not: id },
        exhibitor: {
          organizationId: context.orgId,
          eventId: exhibitor.eventId,
          isActive: true,
        },
      },
      select: { code: true, exhibitorId: true },
    });

    const location = await prisma.exhibitorLocation.create({
      data: {
        exhibitorId: id,
        type,
        ...code,
        portCode: normalizeOptionalCode(
          typeof body.portCode === "string" ? body.portCode : undefined
        ),
        sectorCode: normalizeOptionalCode(
          typeof body.sectorCode === "string" ? body.sectorCode : undefined
        ),
        logisticSpace: normalizeOptionalCode(
          typeof body.logisticSpace === "string" ? body.logisticSpace : undefined
        ),
      },
    });

    const collisionWarning =
      collisionRows.length > 0
        ? {
            exhibitorIds: [...new Set(collisionRows.map((row) => row.exhibitorId))],
            codes: [...new Set([code.code, ...collisionRows.map((row) => row.code)])],
          }
        : undefined;
    return Response.json({ location, ...(collisionWarning ? { collisionWarning } : {}) }, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Ajout emplacement :", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
