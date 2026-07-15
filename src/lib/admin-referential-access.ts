import type { NextRequest } from "next/server";
import {
  canAccessOrganization,
  getAccessibleOrganizationIds,
  requirePermission,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";

export type AdminOrgContext = {
  session: Awaited<ReturnType<typeof requirePermission>>;
  orgId: string;
  espace: string;
};

export async function resolveAdminOrgContext(
  req: NextRequest,
  mode: "read" | "write" = "read"
): Promise<AdminOrgContext | Response> {
  try {
    const session = await requirePermission(req, "GESTION_ESPACES", mode);
    const espace = req.nextUrl.searchParams.get("espace")?.trim();
    if (!espace) {
      return Response.json({ error: "Le paramètre espace est requis" }, { status: 400 });
    }

    const orgId = await resolveEspaceOrgId(espace);
    if (!orgId) {
      return Response.json({ error: "Espace introuvable" }, { status: 404 });
    }

    const accessible = await getAccessibleOrganizationIds(session.user.id);
    if (!canAccessOrganization(accessible, orgId)) {
      return Response.json({ error: "Accès refusé à cet espace" }, { status: 403 });
    }

    return { session, orgId, espace };
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
}
