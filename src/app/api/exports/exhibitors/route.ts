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

/** Export CSV des exposants d'une organisation (`?espace=<slug>`). */
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

  const exhibitors = await prisma.exhibitor.findMany({
    where: { organizationId: org.id },
    include: { eventRef: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const headers = ["Société", "Stand", "Secteur", "Zone", "Événement", "Actif"];
  const data: (string | number)[][] = [headers];
  for (const e of exhibitors) {
    data.push([
      e.name,
      e.stand,
      e.sector ?? "",
      e.zone ?? "",
      e.eventRef?.name ?? "",
      e.isActive ? "Oui" : "Non",
    ]);
  }

  const dateStr = new Date().toISOString().split("T")[0];
  const baseName = `exposants-${espace}-${dateStr}`;

  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Exposants");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
      },
    });
  }

  const csv = "\uFEFF" + data.map((r) => r.map(escapeCsv).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.csv"`,
    },
  });
}
