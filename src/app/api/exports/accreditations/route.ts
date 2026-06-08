import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  requirePermission,
  getAccessibleOrganizationIds,
} from "@/lib/auth-helpers";
import { parseRxVehicleContext } from "@/lib/rx-vehicle-context";

function escapeCsv(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Export CSV des accréditations, scopé à une organisation (`?espace=<slug>`).
 * Inclut les données RX (catégorie, créneaux montage/démontage, transporteur,
 * zone). Filtre optionnel `?event=<slug>` et `?status=`.
 *
 * Rubrique « Exports » centralisée (réponse à la demande Mathieu §12).
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
  const eventSlug = req.nextUrl.searchParams.get("event")?.trim() || null;
  const status = req.nextUrl.searchParams.get("status")?.trim() || null;

  const accessibleOrgs = await getAccessibleOrganizationIds(userId);
  let orgId: string | null = null;
  if (espace) {
    const org = await prisma.organization.findUnique({
      where: { slug: espace },
      select: { id: true },
    });
    if (!org) return new Response("Organisation inconnue", { status: 404 });
    if (accessibleOrgs !== "ALL" && !accessibleOrgs.includes(org.id)) {
      return new Response("Accès refusé", { status: 403 });
    }
    orgId = org.id;
  }

  let eventId: string | null = null;
  if (eventSlug) {
    const ev = await prisma.event.findFirst({
      where: { slug: eventSlug, ...(orgId ? { organizationId: orgId } : {}) },
      select: { id: true },
    });
    eventId = ev?.id ?? null;
  }

  const accreditations = await prisma.accreditation.findMany({
    where: {
      ...(orgId ? { organizationId: orgId } : {}),
      ...(eventId ? { eventId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: { vehicles: true, eventRef: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const headers = [
    "Entreprise", "Stand", "Événement", "Statut", "Zone",
    "Transporteur", "Catégorie", "Créneau montage", "Créneau démontage",
    "Plaque", "Remorque", "Type véhicule",
    "Ville livraison", "Ville reprise",
    "Créé le", "Archivé",
  ];
  // Données 2D (pour CSV ou XLSX selon ?format).
  const data: (string | number)[][] = [headers];

  for (const acc of accreditations) {
    const ext = (acc.extension ?? {}) as {
      vehicleContext?: {
        categoryId?: string;
        livDate?: string;
        livTime?: string;
        repDate?: string;
        repTime?: string;
      };
    };
    const ctx = ext.vehicleContext ?? {};
    const rxCtx = parseRxVehicleContext(acc.extension);
    const montage = [ctx.livDate, ctx.livTime].filter(Boolean).join(" ");
    const demontage = [ctx.repDate, ctx.repTime].filter(Boolean).join(" ");
    const base = [
      acc.company,
      acc.stand,
      acc.eventRef?.name ?? acc.event,
      acc.status,
      acc.currentZone ?? "",
      acc.unloading ?? "",
      ctx.categoryId ?? "",
      montage,
      demontage,
    ];
    if (acc.vehicles.length === 0) {
      data.push([
        ...base,
        "",
        "",
        "",
        "",
        "",
        new Date(acc.createdAt).toLocaleDateString("fr-FR"),
        acc.isArchived ? "Oui" : "Non",
      ]);
    } else {
      for (const v of acc.vehicles) {
        data.push([
          ...base,
          v.plate ?? "",
          v.trailerPlate ?? "",
          v.vehicleType ?? "",
          v.city ?? "",
          rxCtx?.repCity ?? "",
          new Date(acc.createdAt).toLocaleDateString("fr-FR"),
          acc.isArchived ? "Oui" : "Non",
        ]);
      }
    }
  }

  const dateStr = new Date().toISOString().split("T")[0];
  const baseName = `accreditations-${espace ?? "all"}-${dateStr}`;

  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Accréditations");
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
