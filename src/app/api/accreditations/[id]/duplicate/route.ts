import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { assertAccreditationAccess } from "@/lib/rbac";
import { addHistoryEntry, createCreatedEntry } from "@/lib/history";

/**
 * POST /api/accreditations/[id]/duplicate
 * Clone une accréditation existante avec un nouveau véhicule.
 * Body : les champs du véhicule (même format que VehicleEditDialog).
 * Résultat : nouvelle accréditation au statut NOUVEAU, sans zone.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "LISTE", "write");
    currentUserId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id: parentId } = await props.params;

  try {
    await assertAccreditationAccess(currentUserId!, parentId);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const parent = await prisma.accreditation.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      return Response.json({ error: "Accréditation introuvable" }, { status: 404 });
    }

    const v = await req.json();
    // Plaque et gabarit optionnels (vision Killian) — peuvent être remplis sur place.
    if (!v.phoneCode || !v.phoneNumber || !v.date || !v.city || !v.unloading) {
      return Response.json({ error: "Champs véhicule manquants" }, { status: 400 });
    }

    const eventRecord = parent.eventId
      ? null
      : await prisma.event.findUnique({ where: { slug: parent.event } });

    const created = await prisma.accreditation.create({
      data: {
        company: parent.company,
        stand: parent.stand,
        unloading: parent.unloading,
        event: parent.event,
        eventId: parent.eventId ?? eventRecord?.id ?? null,
        message: parent.message,
        consent: parent.consent,
        status: "NOUVEAU",
        currentZone: null,
        vehicles: {
          create: {
            plate: ((v.plate as string) ?? "").trim(),
            size: ((v.size as string) ?? "").trim(),
            phoneCode: v.phoneCode as string,
            phoneNumber: v.phoneNumber as string,
            date: v.date as string,
            time: (v.time as string) ?? "",
            city: v.city as string,
            unloading: JSON.stringify(v.unloading),
            kms: (v.kms as string) ?? "",
            vehicleType: v.vehicleType ?? null,
            country: v.country ?? null,
            estimatedKms: v.estimatedKms != null ? Number(v.estimatedKms) : 0,
            trailerPlate: v.trailerPlate ?? null,
            emptyWeight: v.emptyWeight != null ? Number(v.emptyWeight) : null,
            maxWeight: v.maxWeight != null ? Number(v.maxWeight) : null,
            currentWeight: v.currentWeight != null ? Number(v.currentWeight) : null,
          },
        },
      },
      include: { vehicles: true },
    });

    await addHistoryEntry(createCreatedEntry(created.id, currentUserId));

    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/accreditations/[id]/duplicate error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
