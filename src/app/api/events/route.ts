import { NextRequest } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";
import { requirePermission, getAccessibleEventIdsForEspace } from "@/lib/auth-helpers";

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
  let currentUserId: string | undefined;

  // L'endpoint ?active=true est public (pour Step 1 accreditation)
  if (!activeOnly) {
    try {
      const session = await requirePermission(req, "GESTION_DATES", "read");
      currentUserId = session.user.id;
    } catch (error) {
      return handleAuthError(error);
    }
  }

  try {
    const now = new Date();

    const scopeFilter: Record<string, unknown> = {};
    // Sur les endpoints non-publics, restreindre au périmètre du user
    // (Espaces + grants) + éventuel contexte d'Espace `?espace=<slug>`.
    // Endpoint ?active=true reste public (formulaire exposant).
    if (!activeOnly && currentUserId) {
      const espaceParam = req.nextUrl.searchParams.get("espace")?.trim() || null;
      const accessibleIds = await getAccessibleEventIdsForEspace(
        currentUserId,
        espaceParam
      );
      if (accessibleIds !== "ALL") {
        scopeFilter.id = { in: accessibleIds };
      }
    }

    const where = activeOnly
      ? {
          isArchived: false,
          startDate: { lte: new Date(now.getTime() + 365 * 24 * 3600000) },
          OR: [
            { teardownEndDate: { not: null, gte: now } },
            { teardownEndDate: null, endDate: { gte: now } },
          ],
        }
      : scopeFilter;

    const events = await withRetry(() => prisma.event.findMany({
      where,
      orderBy: { startDate: "asc" },
      omit: { logoData: true },
    }));

    if (activeOnly) {
      const visible = events.filter((e) => {
        const activation = new Date(e.startDate);
        activation.setDate(activation.getDate() - e.activationDays);
        return now >= activation && now <= (e.teardownEndDate ?? e.endDate);
      });
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
