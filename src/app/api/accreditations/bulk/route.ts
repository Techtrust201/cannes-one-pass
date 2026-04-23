import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, getAccessibleEventIdsForEspace, canAccessEvent } from "@/lib/auth-helpers";
import { createStatusChangeEntry, createArchivedEntry } from "@/lib/history";
import { writeHistoryDirect } from "@/lib/history-server";

const VALID_STATUSES = ["ATTENTE", "ENTREE", "SORTIE", "NOUVEAU", "REFUS", "ABSENT"];

const VALID_BULK_TRANSITIONS: Record<string, string[]> = {
  ATTENTE: ["NOUVEAU"],
  ENTREE:  ["ATTENTE"],
  SORTIE:  ["ENTREE"],
  REFUS:   ["NOUVEAU"],
};

/**
 * POST /api/accreditations/bulk — Actions groupées sur plusieurs accréditations
 * Body: { ids: string[], action: string, zone?: string }
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const { ids, action, zone } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "Le champ 'ids' est requis et ne doit pas être vide" }, { status: 400 });
  }

  if (!action) {
    return Response.json({ error: "Le champ 'action' est requis" }, { status: 400 });
  }

  const isArchiveAction = action === "ARCHIVE" || action === "UNARCHIVE";
  if (!isArchiveAction && !VALID_STATUSES.includes(action)) {
    return Response.json({ error: "Action invalide" }, { status: 400 });
  }

  // Valider la zone si fournie (ex: validation groupée NOUVEAU -> ATTENTE avec zone)
  if (zone) {
    const validZone = await prisma.zoneConfig.findUnique({ where: { zone } });
    if (!validZone || !validZone.isActive) {
      return Response.json({ error: "Zone invalide" }, { status: 400 });
    }
  }

  // Vérifier la permission ARCHIVES pour les actions d'archivage
  if (isArchiveAction) {
    try {
      await requirePermission(req, "ARCHIVES", "write");
    } catch {
      return Response.json({ error: "Permission ARCHIVES requise" }, { status: 403 });
    }
  }

  // RBAC : filtrer pour ne traiter que les accréditations dans les events
  // accessibles à l'utilisateur. Les autres sont renvoyées comme "failed".
  // On prend en compte `espace` (query ou body) pour aligner avec le SSR.
  const espaceQuery = req.nextUrl.searchParams.get("espace")?.trim() || null;
  const espaceBody = typeof body.espace === "string" ? body.espace.trim() || null : null;
  const espaceParam = espaceQuery || espaceBody;
  const accessibleEventIds = await getAccessibleEventIdsForEspace(
    currentUserId!,
    espaceParam
  );

  try {
    const results: { id: string; success: boolean; error?: string }[] = [];

    // Traiter chaque accréditation dans une transaction
    for (const accId of ids) {
      // Pré-vérification RBAC rapide
      if (accessibleEventIds !== "ALL") {
        const pre = await prisma.accreditation.findUnique({
          where: { id: accId },
          select: { eventId: true },
        });
        if (!pre) {
          results.push({ id: accId, success: false, error: "NOT_FOUND" });
          continue;
        }
        if (!canAccessEvent(accessibleEventIds, pre.eventId)) {
          results.push({ id: accId, success: false, error: "FORBIDDEN" });
          continue;
        }
      }
      try {
        await prisma.$transaction(async (tx) => {
          const acc = await tx.accreditation.findUnique({
            where: { id: accId },
            include: { vehicles: true },
          });
          if (!acc) throw new Error("NOT_FOUND");

          // Valider la transition de statut
          if (!isArchiveAction) {
            const allowedFrom = VALID_BULK_TRANSITIONS[action];
            if (allowedFrom && !allowedFrom.includes(acc.status)) {
              throw new Error(`INVALID_TRANSITION:${acc.status}->${action}`);
            }
          }

          if (isArchiveAction) {
            const isArchive = action === "ARCHIVE";
            await tx.accreditation.update({
              where: { id: accId, version: acc.version },
              data: {
                isArchived: isArchive,
                version: acc.version + 1,
              },
            });
            await writeHistoryDirect(
              createArchivedEntry(accId, isArchive, currentUserId),
              tx
            );
          } else {
            const now = new Date();
            const updates: Record<string, unknown> = {
              status: action,
              version: acc.version + 1,
            };

            // Pour ATTENTE (validation de NOUVEAU) : assigner la zone si fournie
            if (action === "ATTENTE" && zone) {
              updates.currentZone = zone;
            }

            if (action === "ENTREE" && !acc.entryAt) updates.entryAt = now;
            if (action === "SORTIE") updates.exitAt = now;

            // Zone effective pour les ZoneMovements et time slots
            let effectiveZone: string | null =
              (action === "ATTENTE" && zone) ? zone : (acc.currentZone ?? null);

            // Fallback : si currentZone est vide, récupérer la zone du dernier ZoneMovement ou VehicleTimeSlot
            if (!effectiveZone && (action === "ENTREE" || action === "SORTIE")) {
              const lastMovement = await tx.zoneMovement.findFirst({
                where: { accreditationId: accId },
                orderBy: { timestamp: "desc" },
              });
              if (lastMovement?.toZone) effectiveZone = lastMovement.toZone;
              if (!effectiveZone && acc.vehicles.length > 0) {
                const lastSlot = await tx.vehicleTimeSlot.findFirst({
                  where: { accreditationId: accId, vehicleId: acc.vehicles[0].id },
                  orderBy: { entryAt: "desc" },
                });
                if (lastSlot?.zone) effectiveZone = lastSlot.zone;
              }
            }

            // ENTREE/SORTIE sans zone connue : refuser pour éviter d'écraser avec Palais
            if ((action === "ENTREE" || action === "SORTIE") && !effectiveZone) {
              throw new Error("Zone inconnue — vérifiez que l'accréditation a une zone assignée");
            }

            await tx.accreditation.update({
              where: { id: accId, version: acc.version },
              data: updates,
            });

            // Créer les ZoneMovements (aligné sur le PATCH individuel)
            if (action !== acc.status && effectiveZone) {
              if (action === "ATTENTE" && zone && !acc.currentZone) {
                await tx.zoneMovement.create({
                  data: {
                    accreditationId: accId,
                    toZone: zone,
                    action: "ENTRY",
                    fromZone: null,
                  },
                });
              } else if (action === "ENTREE") {
                await tx.zoneMovement.create({
                  data: {
                    accreditationId: accId,
                    toZone: effectiveZone,
                    action: "ENTRY",
                  },
                });
              } else if (action === "SORTIE") {
                await tx.zoneMovement.create({
                  data: {
                    accreditationId: accId,
                    fromZone: effectiveZone,
                    toZone: effectiveZone,
                    action: "EXIT",
                  },
                });
              }
            }

            // Gérer les time slots (historique des créneaux) pour ENTREE/SORTIE
            if (action !== acc.status && acc.vehicles.length > 0) {
              const targetVehicle = acc.vehicles[0];
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              if (action === "ENTREE") {
                const openSlot = await tx.vehicleTimeSlot.findFirst({
                  where: {
                    accreditationId: accId,
                    vehicleId: targetVehicle.id,
                    date: today,
                    exitAt: null,
                  },
                });

                if (!openSlot) {
                  const lastSlot = await tx.vehicleTimeSlot.findFirst({
                    where: {
                      accreditationId: accId,
                      vehicleId: targetVehicle.id,
                      date: today,
                    },
                    orderBy: { stepNumber: "desc" },
                  });
                  const nextStep = lastSlot ? lastSlot.stepNumber + 1 : 1;
                  await tx.vehicleTimeSlot.create({
                    data: {
                      accreditationId: accId,
                      vehicleId: targetVehicle.id,
                      date: today,
                      stepNumber: nextStep,
                      zone: effectiveZone || "PALAIS_DES_FESTIVALS",
                      entryAt: now,
                    },
                  });
                }
              } else if (action === "SORTIE") {
                const openSlot = await tx.vehicleTimeSlot.findFirst({
                  where: {
                    accreditationId: accId,
                    vehicleId: targetVehicle.id,
                    exitAt: null,
                  },
                  orderBy: { stepNumber: "desc" },
                });

                if (openSlot) {
                  await tx.vehicleTimeSlot.update({
                    where: { id: openSlot.id },
                    data: { exitAt: now },
                  });
                }
              }
            }

            await writeHistoryDirect(
              createStatusChangeEntry(accId, acc.status, action, currentUserId),
              tx
            );

            // Historique de zone si applicable
            if (action !== acc.status && effectiveZone && (action === "ENTREE" || action === "SORTIE")) {
              await tx.accreditationHistory.create({
                data: {
                  accreditationId: accId,
                  action: "ZONE_CHANGED",
                  field: "currentZone",
                  oldValue: effectiveZone,
                  newValue: effectiveZone,
                  description: action === "ENTREE"
                    ? `Entrée en zone (action groupée)`
                    : `Sortie de zone (action groupée)`,
                  userId: currentUserId,
                },
              });
            }

            // Historique d'assignation de zone lors de la validation (NOUVEAU -> ATTENTE)
            if (action === "ATTENTE" && zone) {
              await tx.accreditationHistory.create({
                data: {
                  accreditationId: accId,
                  action: "ZONE_CHANGED",
                  field: "currentZone",
                  oldValue: acc.currentZone ?? "",
                  newValue: zone,
                  description: `Zone assignée : ${zone} (validation groupée)`,
                  userId: currentUserId,
                },
              });
            }
          }
        });
        results.push({ id: accId, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur";
        results.push({ id: accId, success: false, error: msg });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return Response.json({
      success: true,
      total: ids.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    console.error("POST /api/accreditations/bulk error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
