import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";

function escapeCsv(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(req, "GESTION_DATES", "read");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;

  try {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      return Response.json({ error: "Événement introuvable" }, { status: 404 });
    }

    const accreditations = await prisma.accreditation.findMany({
      where: { eventId: id },
      include: {
        vehicles: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const headers = [
      "Entreprise", "Stand", "Déchargement", "Statut", "Zone",
      "Plaque", "Remorque", "Type véhicule", "Taille",
      "Date passage", "Heure", "Ville",
      "Créé le", "Archivé",
    ];

    const rows: string[] = [headers.map(escapeCsv).join(",")];

    for (const acc of accreditations) {
      if (acc.vehicles.length === 0) {
        rows.push([
          acc.company, acc.stand, acc.unloading, acc.status, acc.currentZone ?? "",
          "", "", "", "",
          "", "", "",
          new Date(acc.createdAt).toLocaleDateString("fr-FR"), acc.isArchived ? "Oui" : "Non",
        ].map(escapeCsv).join(","));
      } else {
        for (const v of acc.vehicles) {
          rows.push([
            acc.company, acc.stand, acc.unloading, acc.status, acc.currentZone ?? "",
            v.plate, v.trailerPlate ?? "", v.vehicleType ?? "", v.size ?? "",
            v.date ?? "", v.time ?? "", v.city ?? "",
            new Date(acc.createdAt).toLocaleDateString("fr-FR"), acc.isArchived ? "Oui" : "Non",
          ].map(escapeCsv).join(","));
        }
      }
    }

    const csv = "\uFEFF" + rows.join("\n");
    const filename = `export-${event.slug}-${new Date().toISOString().split("T")[0]}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/events/[id]/export-csv error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
