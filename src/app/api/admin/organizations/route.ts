import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, hasPermission } from "@/lib/auth-helpers";

/**
 * Vérifie que l'utilisateur peut gérer les Espaces :
 * - SUPER_ADMIN toujours autorisé
 * - Sinon : permission GESTION_ESPACES en écriture
 */
async function requireEspaceAdmin(
  request: NextRequest,
  mode: "read" | "write"
) {
  const { session, role } = await requireRole(request, "USER");
  if (role === "SUPER_ADMIN") return session;
  const allowed = await hasPermission(session.user.id, "GESTION_ESPACES", mode);
  if (!allowed) throw new Response("Accès refusé", { status: 403 });
  return session;
}

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

export async function GET(req: NextRequest) {
  try {
    await requireEspaceAdmin(req, "read");
  } catch (err) {
    return handleAuthError(err);
  }

  try {
    const orgs = await prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: {
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
      },
    });
    return Response.json(orgs);
  } catch (error) {
    console.error("GET /api/admin/organizations error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireEspaceAdmin(req, "write");
  } catch (err) {
    return handleAuthError(err);
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
