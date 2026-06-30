import { NextRequest } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";
import {
  requirePermission,
  requireAuth,
  hasPermission,
  getAccessibleEventIdsForEspace,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";
import { isEventVisibleForAccreditation } from "@/lib/events";
import type { Event } from "@/types";

function handleAuthError(error: unknown) {
  if (error instanceof Response)
    return new Response(error.body, {
      status: error.status,
      statusText: error.statusText,
    });
  return new Response("Non autorisé", { status: 401 });
}

export async function GET(req: NextRequest) {
  const activeOnly = req.nextUrl.searchParams.get("active") === "true";
  const espaceParam = req.nextUrl.searchParams.get("espace")?.trim() || null;
  let currentUserId: string | undefined;
  // Mode lecture scopée : l'utilisateur a FLUX_VEHICULES ou BILAN_CARBONE
  // mais pas GESTION_DATES → on retourne uniquement les événements de l'org.
  let scopedReadOnly = false;

  // L'endpoint ?active=true est public (pour Step 1 accreditation)
  if (!activeOnly) {
    try {
      const session = await requirePermission(req, "GESTION_DATES", "read");
      currentUserId = session.user.id;
    } catch (adminError) {
      // Si un espace est spécifié, on accepte FLUX_VEHICULES ou BILAN_CARBONE
      // comme accès lecture restreint au catalogue de l'org (pour les filtres).
      if (espaceParam) {
        try {
          const { session } = await requireAuth(req);
          const userId = session.user.id;
          const hasFlux = await hasPermission(userId, "FLUX_VEHICULES", "read");
          const hasCarbone = await hasPermission(userId, "BILAN_CARBONE", "read");
          if (!hasFlux && !hasCarbone) {
            return handleAuthError(adminError);
          }
          currentUserId = userId;
          scopedReadOnly = true;
        } catch {
          return handleAuthError(adminError);
        }
      } else {
        return handleAuthError(adminError);
      }
    }
  }

  try {
    const now = new Date();

    // Lecture scopée (FLUX_VEHICULES/BILAN_CARBONE) : retourner uniquement les
    // événements de l'organisation demandée, champs réduits au minimum nécessaire
    // pour alimenter les selects de filtre.
    if (scopedReadOnly && espaceParam) {
      const orgId = await resolveEspaceOrgId(espaceParam);
      if (!orgId) return Response.json([]);
      const events = await prisma.event.findMany({
        where: { organizationId: orgId, isArchived: false },
        select: { id: true, slug: true, name: true, startDate: true },
        orderBy: { startDate: "asc" },
      });
      return Response.json(events);
    }

    const scopeFilter: Record<string, unknown> = {};
    // Sur les endpoints non-publics, restreindre au périmètre du user
    // (Espaces + grants) + éventuel contexte d'Espace `?espace=<slug>`.
    if (!activeOnly && currentUserId) {
      const accessibleIds = await getAccessibleEventIdsForEspace(
        currentUserId,
        espaceParam
      );
      if (accessibleIds !== "ALL") {
        scopeFilter.id = { in: accessibleIds };
      }
    }

    // Sur l'endpoint ?active=true (public, formulaire exposant), on accepte
    // un filtre `&espace=<slug>` pour ne lister que les events d'une
    // organisation donnée — sécurise le carrousel d'events de
    // `/accreditation/[orgSlug]` côté multi-tenant.
    let activeOrgFilter: Record<string, unknown> = {};
    if (activeOnly && espaceParam) {
      const org = await prisma.organization.findUnique({
        where: { slug: espaceParam },
        select: { id: true, isActive: true },
      });
      if (!org || !org.isActive) {
        return Response.json([]);
      }
      activeOrgFilter = { organizationId: org.id };
    }

    const where = activeOnly
      ? {
          isArchived: false,
          startDate: { lte: new Date(now.getTime() + 365 * 24 * 3600000) },
          OR: [
            { teardownEndDate: { not: null, gte: now } },
            { teardownEndDate: null, endDate: { gte: now } },
          ],
          ...activeOrgFilter,
        }
      : scopeFilter;

    const events = await withRetry(() => prisma.event.findMany({
      where,
      orderBy: { startDate: "asc" },
      omit: { logoData: true },
    }));

    if (activeOnly) {
      const visible = events.filter((e) =>
        isEventVisibleForAccreditation(e as unknown as Event, now)
      );
      return Response.json(visible);
    }

    return Response.json(events);
  } catch (error) {
    console.error("GET /api/events error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "GESTION_DATES", "write");
  } catch (error) {
    return handleAuthError(error);
  }

  try {
    const body = await req.json();
    const { name, slug, startDate, endDate } = body;

    if (!name || !slug || !startDate || !endDate) {
      return Response.json(
        { error: "Champs requis : name, slug, startDate, endDate" },
        { status: 400 }
      );
    }

    const normalized = slug
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    const existing = await prisma.event.findUnique({
      where: { slug: normalized },
    });
    if (existing) {
      return Response.json(
        { error: "Un événement avec ce slug existe déjà" },
        { status: 409 }
      );
    }

    const created = await prisma.event.create({
      data: {
        name,
        slug: normalized,
        logo: body.logo ?? null,
        description: body.description ?? null,
        location: body.location ?? null,
        color: body.color ?? "#3DAAA4",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        setupStartDate: body.setupStartDate
          ? new Date(body.setupStartDate)
          : null,
        setupEndDate: body.setupEndDate ? new Date(body.setupEndDate) : null,
        teardownStartDate: body.teardownStartDate
          ? new Date(body.teardownStartDate)
          : null,
        teardownEndDate: body.teardownEndDate
          ? new Date(body.teardownEndDate)
          : null,
        accessStartTime: body.accessStartTime ?? null,
        accessEndTime: body.accessEndTime ?? null,
        notes: body.notes ?? null,
        activationDays: body.activationDays ?? 7,
      },
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/events error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
