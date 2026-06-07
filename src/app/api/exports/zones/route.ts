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

/** Export CSV des zones de déchargement d'une organisation (`?espace=<slug>`). */
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

  const zones = await prisma.zoneConfig.findMany({
    where: { organizationId: org.id },
    orderBy: { label: "asc" },
  });

  const headers = ["Code", "Libellé", "Adresse", "Latitude", "Longitude", "Destination finale", "Actif"];
  const rows: string[] = [headers.map(escapeCsv).join(",")];
  for (const z of zones) {
    rows.push(
      [
        z.zone,
        z.label,
        z.address,
        z.latitude,
        z.longitude,
        z.isFinalDestination ? "Oui" : "Non",
        z.isActive ? "Oui" : "Non",
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  const csv = "\uFEFF" + rows.join("\n");
  const filename = `zones-${espace}-${new Date().toISOString().split("T")[0]}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
