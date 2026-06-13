import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { assertVehicleAccess } from "@/lib/rbac";
import { writeHistoryDirect } from "@/lib/history-server";
import { createVehicleRemovedEntry } from "@/lib/history";
import { normalizePlate } from "@/lib/plate-utils";

/**
 * `POST /api/vehicles/[id]/assign-plate` — Affecte (ou ré-affecte) la
 * plaque réelle d'un véhicule attendu.
 *
 * Workflow RX : à la création d'une accréditation, le gabarit est connu
 * mais la plaque ne l'est pas forcément. À l'arrivée du chauffeur, un
 * agent scanne le QR du stand, identifie le véhicule attendu et saisit
 * la plaque. Cette route écrit :
 *   - `Vehicle.plate = body.plate`
 *   - `Vehicle.assignedAt = now()`
 *   - une entrée d'historique sur l'accréditation (action VEHICLE_UPDATED)
 *
 * Body : `{ plate: string, trailerPlate?: string }`.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "LISTE", "write");
    currentUserId = session.user.id;
  } catch (err) {
    if (err instanceof Response) {
      return new Response(err.body, { status: err.status, statusText: err.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const params = await props.params;
  const vehicleId = Number(params.id);
  if (!Number.isFinite(vehicleId)) {
    return Response.json({ error: "ID véhicule invalide" }, { status: 400 });
  }

  try {
    await assertVehicleAccess(currentUserId!, vehicleId);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const body = (await req.json().catch(() => ({}))) as {
    plate?: string;
    trailerPlate?: string;
  };
  const plate = (body.plate ?? "").trim();
  if (!plate) {
    return Response.json({ error: "La plaque est requise" }, { status: 400 });
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, plate: true, accreditationId: true },
  });
  if (!vehicle) {
    return Response.json({ error: "Véhicule introuvable" }, { status: 404 });
  }

  const trailerPlate = body.trailerPlate?.trim() || undefined;
  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      plate,
      trailerPlate,
      plateNormalized: normalizePlate(plate),
      trailerPlateNormalized:
        trailerPlate !== undefined ? normalizePlate(trailerPlate) : undefined,
      assignedAt: new Date(),
    },
  });

  // Trace l'évolution dans l'historique de l'accréditation
  if (updated.accreditationId) {
    const oldLabel = vehicle.plate ?? "(plaque non affectée)";
    const newLabel = updated.plate ?? "(plaque non affectée)";
    const entry = createVehicleRemovedEntry(
      updated.accreditationId,
      newLabel,
      currentUserId
    );
    entry.action = "VEHICLE_UPDATED" as typeof entry.action;
    entry.description = `Plaque véhicule affectée à l'arrivée : ${oldLabel} → ${newLabel}`;
    await writeHistoryDirect(entry);
  }

  return Response.json(updated, { status: 200 });
}
