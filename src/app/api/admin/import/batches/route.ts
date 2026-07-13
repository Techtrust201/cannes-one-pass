import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEspaceManagement, getAccessibleOrganizationIds } from "@/lib/auth-helpers";
import type { ImportProfile } from "@prisma/client";

function handleAuthError(error: unknown): Response {
  if (error instanceof Response)
    return new Response(error.body, { status: error.status, statusText: error.statusText });
  return new Response("Non autorise", { status: 401 });
}

const VALID_PROFILES = new Set<ImportProfile>([
  "REFERENTIAL",
  "PLANNING",
  "ACCREDITATIONS",
  "ZONES",
  "VEHICLE_TYPES",
  "CAPACITIES",
]);

/**
 * GET /api/admin/import/batches?organizationId=&eventId=&profile=&limit=
 *
 * Historique des `ImportBatch` (Centre d'import unifie, Phase 5). Scoping
 * multi-organisation STRICT : un utilisateur ne voit jamais un lot d'une
 * organisation hors de son perimetre, meme en forcant `organizationId` dans
 * l'URL (verifie contre `getAccessibleOrganizationIds`).
 */
export async function GET(req: NextRequest) {
  let userId: string;
  let role: string;
  try {
    const ctx = await requireEspaceManagement(req, "read");
    userId = ctx.session.user.id;
    role = ctx.role;
  } catch (err) {
    return handleAuthError(err);
  }

  try {
    const organizationIdParam = req.nextUrl.searchParams.get("organizationId")?.trim() || null;
    const eventIdParam = req.nextUrl.searchParams.get("eventId")?.trim() || null;
    const profileParam = (req.nextUrl.searchParams.get("profile") ?? "").toUpperCase();
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

    const accessible = await getAccessibleOrganizationIds(userId);

    if (organizationIdParam) {
      if (role !== "SUPER_ADMIN" && accessible !== "ALL" && !accessible.includes(organizationIdParam)) {
        throw new Response("Organisation hors de votre perimetre", { status: 403 });
      }
    }

    const where: Record<string, unknown> = {};
    if (organizationIdParam) {
      where.organizationId = organizationIdParam;
    } else if (role !== "SUPER_ADMIN" && accessible !== "ALL") {
      where.organizationId = { in: accessible };
    }
    if (eventIdParam) where.eventId = eventIdParam;
    if (VALID_PROFILES.has(profileParam as ImportProfile)) where.sourceProfile = profileParam;

    const batches = await prisma.importBatch.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        organizationId: true,
        organization: { select: { id: true, name: true, slug: true } },
        eventId: true,
        event: { select: { id: true, name: true, slug: true } },
        userId: true,
        user: { select: { id: true, name: true, email: true } },
        sourceProfile: true,
        fileName: true,
        status: true,
        created: true,
        updated: true,
        unchanged: true,
        deactivated: true,
        errorCount: true,
        startedAt: true,
        completedAt: true,
      },
    });

    return Response.json({ batches });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/admin/import/batches error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
