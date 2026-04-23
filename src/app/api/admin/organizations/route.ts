import { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireEspaceManagement,
  getAccessibleOrganizationIds,
} from "@/lib/auth-helpers";

function handleAuthError(error: unknown) {
  if (error instanceof Response)
    return new Response(error.body, {
      status: error.status,
      statusText: error.statusText,
    });
  return new Response("Non autorisé", { status: 401 });
}

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

const orgListSelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  color: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { events: true, members: true } },
} as const;

export async function GET(req: NextRequest) {
  let sessionUserId: string;
  let role: UserRole;
  try {
    const ctx = await requireEspaceManagement(req, "read");
    sessionUserId = ctx.session.user.id;
    role = ctx.role;
  } catch (err) {
    return handleAuthError(err);
  }

  try {
    const accessible = await getAccessibleOrganizationIds(sessionUserId);
    const orgWhere =
      role === "SUPER_ADMIN" || accessible === "ALL"
        ? {}
        : { id: { in: accessible } };

    const orgs = await prisma.organization.findMany({
      where: orgWhere,
      orderBy: { name: "asc" },
      select: orgListSelect,
    });
    return Response.json(orgs);
  } catch (error) {
    console.error("GET /api/admin/organizations error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let role: UserRole;
  try {
    const ctx = await requireEspaceManagement(req, "write");
    role = ctx.role;
  } catch (err) {
    return handleAuthError(err);
  }

  if (role !== "SUPER_ADMIN") {
    return Response.json(
      { error: "Seuls les Super Admins peuvent créer un Espace." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { name, slug, logo, color, description, isActive } = body;

    if (!name || !String(name).trim()) {
      return Response.json({ error: "Le nom est requis" }, { status: 400 });
    }

    const normalized = normalizeSlug(String(slug || name));
    if (!normalized) {
      return Response.json({ error: "Slug invalide" }, { status: 400 });
    }

    const existing = await prisma.organization.findUnique({
      where: { slug: normalized },
    });
    if (existing) {
      return Response.json(
        { error: "Un Espace avec ce slug existe déjà" },
        { status: 409 }
      );
    }

    const created = await prisma.organization.create({
      data: {
        name: String(name).trim(),
        slug: normalized,
        logo: logo ?? null,
        color: color ?? "#4F587E",
        description: description ?? null,
        isActive: isActive ?? true,
      },
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/organizations error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
