import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAdminOrgContext } from "@/lib/admin-referential-access";
import { normalizeExhibitorName } from "@/lib/imports/normalization";

function serverError(error: unknown) {
  if (error instanceof Response) return error;
  console.error("Détail exposant :", error);
  return Response.json({ error: "Erreur serveur" }, { status: 500 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await resolveAdminOrgContext(req);
  if (context instanceof Response) return context;

  try {
    const { id } = await params;
    const exhibitor = await prisma.exhibitor.findFirst({
      where: { id, organizationId: context.orgId },
      include: {
        locations: { orderBy: [{ isActive: "desc" }, { type: "asc" }, { code: "asc" }] },
        eventRef: { select: { id: true, name: true } },
      },
    });
    if (!exhibitor) {
      return Response.json({ error: "Exposant introuvable" }, { status: 404 });
    }
    return Response.json({ exhibitor });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await resolveAdminOrgContext(req, "write");
  if (context instanceof Response) return context;

  try {
    const { id } = await params;
    const existing = await prisma.exhibitor.findFirst({
      where: { id, organizationId: context.orgId },
      select: { id: true },
    });
    if (!existing) {
      return Response.json({ error: "Exposant introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const data: {
      name?: string;
      nameNormalized?: string;
      externalReference?: string | null;
      isActive?: boolean;
    } = {};
    if ("name" in body) {
      const name =
        typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
      const normalized = normalizeExhibitorName(name);
      if (!name || !normalized) {
        return Response.json({ error: "Nom invalide" }, { status: 400 });
      }
      data.name = name;
      data.nameNormalized = normalized;
    }
    if ("externalReference" in body) {
      if (body.externalReference !== null && typeof body.externalReference !== "string") {
        return Response.json({ error: "Référence externe invalide" }, { status: 400 });
      }
      data.externalReference =
        typeof body.externalReference === "string"
          ? body.externalReference.trim() || null
          : null;
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

    const exhibitor = await prisma.exhibitor.update({
      where: { id },
      data,
      include: { locations: true },
    });
    return Response.json({ exhibitor });
  } catch (error) {
    return serverError(error);
  }
}
