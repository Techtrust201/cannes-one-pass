import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { createVehicleRemovedEntry } from "@/lib/history";
import { writeHistoryDirect } from "@/lib/history-server";

export async function PATCH(
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

  const params = await props.params;
  try {
    const data = await req.json();
    const updated = await prisma.vehicle.update({
      where: { id: Number(params.id) },
      data: {
        ...data,
        unloading: JSON.stringify(data.unloading),
      },
    });

    // Écrire l'historique de mise à jour du véhicule
    if (updated.accreditationId) {
      const entry = createVehicleRemovedEntry(
        updated.accreditationId,
        updated.plate,
        currentUserId
      );
      // On utilise INFO_UPDATED pour un update (pas un remove)
      entry.action = "VEHICLE_UPDATED" as typeof entry.action;
      entry.description = `Véhicule ${updated.plate} mis à jour`;
      await writeHistoryDirect(entry);
    }

    return Response.json(updated);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
}

export async function DELETE(
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

  const params = await props.params;
  try {
    // Récupérer le véhicule avant suppression pour l'historique
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: Number(params.id) },
    });

    if (!vehicle) {
      return new Response("Not found", { status: 404 });
    }

    await prisma.vehicle.delete({
      where: { id: Number(params.id) },
    });

    // Écrire l'historique de suppression du véhicule
    if (vehicle.accreditationId) {
      const entry = createVehicleRemovedEntry(
        vehicle.accreditationId,
        vehicle.plate,
        currentUserId
      );
      await writeHistoryDirect(entry);
    }

    return new Response(null, { status: 204 });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
