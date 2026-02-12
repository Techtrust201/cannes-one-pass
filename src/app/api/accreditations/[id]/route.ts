import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  createStatusChangeEntry,
  createInfoUpdatedEntry,
  type HistoryEntryData,
} from "@/lib/history";
import { writeHistoryDirect } from "@/lib/history-server";
import { requirePermission } from "@/lib/auth-helpers";

/* ----------------------- GET ----------------------- */
export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(_req, "LISTE", "read");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const params = await props.params;
  const { id } = params;
  const acc = await prisma.accreditation.findUnique({
    where: { id },
    include: { vehicles: true },
  });
  if (!acc) return new Response("Not found", { status: 404 });
  // Désérialisation unloading (toujours tableau)
  const safeAcc = {
    ...acc,
    vehicles: acc.vehicles.map((v) => ({
      ...v,
      unloading: Array.isArray(v.unloading)
        ? v.unloading
        : typeof v.unloading === "string" && v.unloading.startsWith("[")
          ? (() => { try { return JSON.parse(v.unloading as string); } catch { return [v.unloading]; } })()
          : v.unloading
            ? [v.unloading]
            : [],
    })),
  };
  return Response.json(safeAcc);
}

/* ---------------------- PATCH ---------------------- */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const { id: accreditationId } = await params;
  const body = await req.json();
  const { status, company, stand, unloading, event, message, vehicles, currentZone, version } = body;

  if (
    !status ||
    !["ATTENTE", "ENTREE", "SORTIE", "NOUVEAU", "REFUS", "ABSENT"].includes(status)
  ) {
    return new Response("Invalid status", { status: 400 });
  }

  const VALID_ZONES = ["LA_BOCCA", "PALAIS_DES_FESTIVALS", "PANTIERO", "MACE"];
  if (currentZone !== undefined && currentZone !== null && !VALID_ZONES.includes(currentZone)) {
    return new Response("Invalid zone", { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Lire l'accréditation avec verrouillage optimiste
      const acc = await tx.accreditation.findUnique({
        where: { id: accreditationId },
        include: { vehicles: true },
      });
      if (!acc) throw new Error("NOT_FOUND");

      // 2. Vérifier la version (optimistic lock)
      if (version !== undefined && version !== null && acc.version !== version) {
        throw new Error("CONFLICT");
      }

      // 3. Préparer les updates
      const updates: Record<string, unknown> = {
        status,
        company,
        stand,
        unloading,
        event,
        message,
        version: acc.version + 1, // Incrémenter la version
      };

      if (currentZone !== undefined) {
        updates.currentZone = currentZone;
      }

      if (status === "ENTREE" && !acc.entryAt) updates.entryAt = new Date();
      if (status === "SORTIE") updates.exitAt = new Date();

      // 4. Update atomique avec vérification de version
      const updated = await tx.accreditation.update({
        where: { id: accreditationId, version: acc.version },
        data: updates,
      });

      // 5. Créer les ZoneMovements si nécessaire
      const effectiveZone = currentZone ?? acc.currentZone;

      if (currentZone && currentZone !== acc.currentZone && !acc.currentZone) {
        await tx.zoneMovement.create({
          data: {
            accreditationId,
            toZone: currentZone,
            action: "ENTRY",
            fromZone: null,
          },
        });
      }

      if (status !== acc.status && effectiveZone) {
        if (status === "ENTREE") {
          await tx.zoneMovement.create({
            data: {
              accreditationId,
              toZone: effectiveZone,
              action: "ENTRY",
            },
          });
        } else if (status === "SORTIE") {
          await tx.zoneMovement.create({
            data: {
              accreditationId,
              fromZone: effectiveZone,
              toZone: effectiveZone,
              action: "EXIT",
            },
          });
        }
      }

      // 6. Collecter les entrées d'historique
      const historyEntries: HistoryEntryData[] = [];

      if (currentZone && currentZone !== acc.currentZone) {
        historyEntries.push(
          createInfoUpdatedEntry(
            accreditationId,
            "currentZone",
            acc.currentZone ?? "",
            currentZone,
            currentUserId
          )
        );
      }

      if (status !== acc.status) {
        historyEntries.push(
          createStatusChangeEntry(accreditationId, acc.status, status, currentUserId)
        );
      }

      if (company && company !== acc.company) {
        historyEntries.push(
          createInfoUpdatedEntry(accreditationId, "company", acc.company, company, currentUserId)
        );
      }
      if (stand && stand !== acc.stand) {
        historyEntries.push(
          createInfoUpdatedEntry(accreditationId, "stand", acc.stand, stand, currentUserId)
        );
      }
      if (unloading && unloading !== acc.unloading) {
        historyEntries.push(
          createInfoUpdatedEntry(accreditationId, "unloading", acc.unloading, unloading, currentUserId)
        );
      }
      if (event && event !== acc.event) {
        historyEntries.push(
          createInfoUpdatedEntry(accreditationId, "event", acc.event, event, currentUserId)
        );
      }
      if (message !== acc.message) {
        historyEntries.push(
          createInfoUpdatedEntry(
            accreditationId,
            "message",
            acc.message || "",
            message || "",
            currentUserId
          )
        );
      }

      // 7. Remplacement des véhicules dans la même transaction
      if (Array.isArray(vehicles)) {
        await tx.vehicle.deleteMany({ where: { accreditationId } });
        if (vehicles.length) {
          await tx.vehicle.createMany({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: vehicles.map((v: any) => ({
              plate: v.plate as string,
              size: v.size as string,
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
              arrivalDate: v.arrivalDate ? new Date(v.arrivalDate) : null,
              departureDate: v.departureDate ? new Date(v.departureDate) : null,
              trailerPlate: (v.trailerPlate as string) ?? null,
              emptyWeight: v.emptyWeight != null ? Number(v.emptyWeight) : null,
              maxWeight: v.maxWeight != null ? Number(v.maxWeight) : null,
              currentWeight: v.currentWeight != null ? Number(v.currentWeight) : null,
              accreditationId,
            })),
          });
        }
        historyEntries.push(
          createInfoUpdatedEntry(
            accreditationId,
            "vehicles",
            JSON.stringify(acc.vehicles),
            JSON.stringify(vehicles),
            currentUserId
          )
        );
      }

      // 8. Écrire tout l'historique dans la transaction
      for (const entry of historyEntries) {
        await writeHistoryDirect(entry, tx);
      }

      return updated;
    });

    // Relire la version complète après la transaction
    const accWithVehicles = await prisma.accreditation.findUnique({
      where: { id: accreditationId },
      include: { vehicles: true },
    });

    const safeAccWithVehicles = {
      ...accWithVehicles,
      vehicles:
        accWithVehicles?.vehicles.map((v) => ({
          ...v,
          unloading: Array.isArray(v.unloading)
            ? v.unloading
            : typeof v.unloading === "string" && v.unloading.startsWith("[")
              ? (() => { try { return JSON.parse(v.unloading as string); } catch { return [v.unloading]; } })()
              : v.unloading
                ? [v.unloading]
                : [],
        })) ?? [],
    };
    return Response.json(safeAccWithVehicles);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return new Response("Not found", { status: 404 });
      }
      if (error.message === "CONFLICT") {
        return Response.json(
          { error: "Cette accréditation a été modifiée par un autre utilisateur. Veuillez rafraîchir." },
          { status: 409 }
        );
      }
    }
    console.error("PATCH /api/accreditations/[id] error:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}

/* --------------------- DELETE ---------------------- */
export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(_req, "LISTE", "write");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const params = await props.params;
  const { id } = params;
  try {
    await prisma.accreditation.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
