import type { LocationType } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAdminOrgContext } from "@/lib/admin-referential-access";
import {
  normalizeLocationCode,
  normalizeOptionalCode,
} from "@/lib/imports/normalization";

const TYPES = new Set<LocationType>(["TERRE", "FLOT", "STAND"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await resolveAdminOrgContext(req, "write");
  if (context instanceof Response) return context;

  try {
    const { id } = await params;
    const existing = await prisma.exhibitorLocation.findFirst({
      where: { id, exhibitor: { organizationId: context.orgId } },
      select: { id: true },
    });
    if (!existing) {
      return Response.json({ error: "Emplacement introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const data: {
      type?: LocationType;
      code?: string;
      codeNormalized?: string;
      portCode?: string | null;
      sectorCode?: string | null;
      logisticSpace?: string | null;
      isActive?: boolean;
    } = {};

    if ("type" in body) {
      const type =
        typeof body.type === "string" ? (body.type.toUpperCase() as LocationType) : null;
      if (!type || !TYPES.has(type)) {
        return Response.json({ error: "Type invalide" }, { status: 400 });
      }
      data.type = type;
    }
    if ("code" in body) {
      const code = normalizeLocationCode(
        typeof body.code === "string" ? body.code : undefined
      );
      if (!code) return Response.json({ error: "Code invalide" }, { status: 400 });
      Object.assign(data, code);
    }
    for (const field of ["portCode", "sectorCode", "logisticSpace"] as const) {
      if (field in body) {
        if (body[field] !== null && typeof body[field] !== "string") {
          return Response.json({ error: `${field} invalide` }, { status: 400 });
        }
        data[field] = normalizeOptionalCode(body[field]);
      }
    }
    if ("isActive" in body) {
      if (typeof body.isActive !== "boolean") {
        return Response.json({ error: "isActive doit être un booléen" }, { status: 400 });
      }
      data.isActive = body.isActive;
    }
    if (Object.keys(data).length === 0) {
      return Response.json({ error: "Aucune modification valide" }, { status: 400 });
    }

    const location = await prisma.exhibitorLocation.update({ where: { id }, data });
    return Response.json({ location });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Modification emplacement :", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
