import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  requirePermission,
  getAccessibleOrganizationIds,
} from "@/lib/auth-helpers";

function escapeCsv(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Export CSV des prestataires de manutention d'une organisation
 * (`?espace=<slug>`). Inclut les prestataires globaux (organizationId null).
 */
export async function GET(req: NextRequest) {
  let userId: string;
  try {
    const session = await requirePermission(req, "LISTE", "read");
    userId = session.user.id;
  } catch (err) {
    if (err instanceof Response) {
      return new Response(err.body, { status: err.status });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const espace = req.nextUrl.searchParams.get("espace")?.trim() || null;
  if (!espace) return new Response("Espace requis", { status: 400 });

  const accessibleOrgs = await getAccessibleOrganizationIds(userId);
  const org = await prisma.organization.findUnique({
    where: { slug: espace },
    select: { id: true },
  });
  if (!org) return new Response("Organisation inconnue", { status: 404 });
  if (accessibleOrgs !== "ALL" && !accessibleOrgs.includes(org.id)) {
    return new Response("Accès refusé", { status: 403 });
  }

  const providers = await prisma.unloadingProvider.findMany({
    where: { OR: [{ organizationId: org.id }, { organizationId: null }] },
    orderBy: { name: "asc" },
  });

  const headers = ["Prestataire", "Portée", "Actif"];
  const rows: string[] = [headers.map(escapeCsv).join(",")];
  for (const p of providers) {
    rows.push(
      [p.name, p.organizationId ? "Organisation" : "Global", p.isActive ? "Oui" : "Non"]
        .map(escapeCsv)
        .join(",")
    );
  }

  const csv = "\uFEFF" + rows.join("\n");
  const filename = `prestataires-${espace}-${new Date().toISOString().split("T")[0]}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
