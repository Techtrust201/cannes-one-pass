import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { assertAccreditationAccess } from "@/lib/rbac";
import { getZoneLabel } from "@/lib/zone-utils";
import type { ScanAction, ScanType } from "@/lib/scan-types";

/**
 * `POST /api/accreditations/[id]/scan-action` — Endpoint TRANSACTIONNEL du
 * module de scan. Applique l'action choisie par l'agent depuis la popup :
 *   - VALIDATE_ENTRY : NOUVEAU -> ENTREE + entrée zone (validation terrain)
 *   - REFUSE         : NOUVEAU -> REFUS (aucun mouvement)
 *   - ENTRY          : entrée dans la zone (auto-sortie de l'ancienne zone si
 *                      le véhicule était encore ENTREE ailleurs ; jamais ATTENTE)
 *   - EXIT           : sortie de la zone (currentZone conservée = dernière zone)
 *
 * Sécurité : `GESTION_ZONES write` (agents terrain, sans `LISTE`) +
 * `assertAccreditationAccess` + validation de la zone scopée à l'organisation
 * de l'accréditation. Verrou optimiste via `version`.
 */

const VALID_ACTIONS: ScanAction[] = ["VALIDATE_ENTRY", "REFUSE", "ENTRY", "EXIT"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(req, "GESTION_ZONES", "write");
    currentUserId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;

  try {
    await assertAccreditationAccess(currentUserId!, id);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as ScanAction | undefined;
  const zone = (body.zone as string | undefined)?.trim() || undefined;
  const scanType = (body.scanType as ScanType | undefined) ?? null;
  const scannedValue = (body.scannedValue as string | undefined) ?? null;
  const version = body.version;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return new Response("Action invalide", { status: 400 });
  }
  // Toutes les actions sauf REFUSE nécessitent une zone (la zone de poste).
  if (action !== "REFUSE" && !zone) {
    return Response.json(
      { error: "Aucune zone sélectionnée. Choisissez votre zone de poste." },
      { status: 400 }
    );
  }

  const userAgent = req.headers.get("user-agent") ?? undefined;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const acc = await tx.accreditation.findUnique({
        where: { id },
        include: { vehicles: true },
      });
      if (!acc) throw new Error("NOT_FOUND");

      // Verrou optimiste anti double-clic / concurrence.
      if (version !== undefined && version !== null && acc.version !== version) {
        throw new Error("CONFLICT");
      }

      // Validation de la zone scopée à l'organisation de l'accréditation
      // (empêche d'utiliser une zone d'une autre organisation).
      if (zone) {
        const validZone = await tx.zoneConfig.findFirst({
          where: { zone, organizationId: acc.organizationId, isActive: true },
          select: { id: true },
        });
        if (!validZone) throw new Error("INVALID_ZONE");
      }

      const prevStatus = acc.status;
      const prevZone = acc.currentZone;

      /* ---------- helpers de mouvement / créneaux ---------- */
      const openTimeSlot = async (toZone: string) => {
        if (acc.vehicles.length === 0) return;
        const vehicle = acc.vehicles[0];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const openSlot = await tx.vehicleTimeSlot.findFirst({
          where: { accreditationId: id, vehicleId: vehicle.id, date: today, exitAt: null },
        });
        if (openSlot) return;
        const lastSlot = await tx.vehicleTimeSlot.findFirst({
          where: { accreditationId: id, vehicleId: vehicle.id, date: today },
          orderBy: { stepNumber: "desc" },
        });
        await tx.vehicleTimeSlot.create({
          data: {
            accreditationId: id,
            vehicleId: vehicle.id,
            date: today,
            stepNumber: lastSlot ? lastSlot.stepNumber + 1 : 1,
            zone: toZone,
            entryAt: new Date(),
          },
        });
      };
      const closeTimeSlot = async () => {
        if (acc.vehicles.length === 0) return;
        const vehicle = acc.vehicles[0];
        const openSlot = await tx.vehicleTimeSlot.findFirst({
          where: { accreditationId: id, vehicleId: vehicle.id, exitAt: null },
          orderBy: { stepNumber: "desc" },
        });
        if (openSlot) {
          await tx.vehicleTimeSlot.update({
            where: { id: openSlot.id },
            data: { exitAt: new Date() },
          });
        }
      };
      const createMovement = (data: {
        fromZone: string | null;
        toZone: string;
        action: "ENTRY" | "EXIT";
        autoGenerated?: boolean;
        reason?: string | null;
        batchId?: string | null;
      }) =>
        tx.zoneMovement.create({
          data: {
            accreditationId: id,
            fromZone: data.fromZone,
            toZone: data.toZone,
            action: data.action,
            autoGenerated: data.autoGenerated ?? false,
            reason: data.reason ?? null,
            batchId: data.batchId ?? null,
            scanType,
            scannedValue,
            userId: currentUserId,
            userAgent,
          },
        });
      const writeHistory = (data: {
        action: "STATUS_CHANGED" | "ZONE_CHANGED";
        field: string;
        oldValue?: string | null;
        newValue?: string | null;
        description: string;
        actorSource?: "LOGISTICIEN" | "SYSTEM";
        changeReason?: string | null;
      }) =>
        tx.accreditationHistory.create({
          data: {
            accreditationId: id,
            action: data.action,
            field: data.field,
            oldValue: data.oldValue ?? undefined,
            newValue: data.newValue ?? undefined,
            description: data.description,
            userId: currentUserId,
            userAgent,
            actorSource: data.actorSource ?? "LOGISTICIEN",
            changeReason: data.changeReason ?? undefined,
          },
        });

      /* ---------- branches métier ---------- */
      switch (action) {
        case "VALIDATE_ENTRY": {
          if (prevStatus !== "NOUVEAU") throw new Error("BAD_STATUS");
          const zoneLabel = getZoneLabel(zone!);
          await tx.accreditation.update({
            where: { id, version: acc.version },
            data: {
              status: "ENTREE",
              currentZone: zone,
              entryAt: acc.entryAt ?? new Date(),
              version: acc.version + 1,
            },
          });
          await createMovement({ fromZone: prevZone, toZone: zone!, action: "ENTRY" });
          await openTimeSlot(zone!);
          await writeHistory({
            action: "STATUS_CHANGED",
            field: "status",
            oldValue: "NOUVEAU",
            newValue: "ENTREE",
            description: `Validation terrain depuis le scan : entrée en zone ${zoneLabel}`,
            changeReason: "field_validate_entry",
          });
          return { ok: true, status: "ENTREE", currentZone: zone };
        }

        case "REFUSE": {
          if (prevStatus !== "NOUVEAU") throw new Error("BAD_STATUS");
          await tx.accreditation.update({
            where: { id, version: acc.version },
            data: { status: "REFUS", version: acc.version + 1 },
          });
          await writeHistory({
            action: "STATUS_CHANGED",
            field: "status",
            oldValue: "NOUVEAU",
            newValue: "REFUS",
            description: "Accès refusé depuis le scan",
            changeReason: "field_refuse_access",
          });
          return { ok: true, status: "REFUS", currentZone: prevZone };
        }

        case "ENTRY": {
          if (prevStatus === "NOUVEAU") throw new Error("NEEDS_VALIDATION");
          if (prevStatus === "REFUS" || prevStatus === "ABSENT")
            throw new Error("BAD_STATUS");

          // Déjà entré dans CETTE zone -> no-op informatif (pas de doublon).
          if (prevStatus === "ENTREE" && prevZone === zone) {
            return {
              ok: true,
              noop: true,
              reason: "already_in_zone",
              status: prevStatus,
              currentZone: prevZone,
            };
          }

          const zoneLabel = getZoneLabel(zone!);
          // Oubli de scan sortie : véhicule encore ENTREE dans une autre zone.
          // On crée une SORTIE automatique de l'ancienne zone, reliée à
          // l'entrée agent par un batchId, avant l'entrée dans la nouvelle zone.
          const needsAutoExit =
            prevStatus === "ENTREE" && !!prevZone && prevZone !== zone;
          const batchId = needsAutoExit ? randomUUID() : null;

          if (needsAutoExit) {
            await createMovement({
              fromZone: prevZone,
              toZone: prevZone!,
              action: "EXIT",
              autoGenerated: true,
              reason: "auto_exit_previous_zone_on_new_entry",
              batchId,
            });
            await closeTimeSlot();
            await writeHistory({
              action: "ZONE_CHANGED",
              field: "currentZone",
              oldValue: prevZone,
              newValue: prevZone,
              description: `Sortie automatique de ${getZoneLabel(prevZone!)} (oubli de scan sortie, corrigé par le système)`,
              actorSource: "SYSTEM",
              changeReason: "auto_exit_previous_zone_on_new_entry",
            });
          }

          await tx.accreditation.update({
            where: { id, version: acc.version },
            data: {
              status: "ENTREE",
              currentZone: zone,
              entryAt: acc.entryAt ?? new Date(),
              version: acc.version + 1,
            },
          });
          await createMovement({
            fromZone: prevZone,
            toZone: zone!,
            action: "ENTRY",
            batchId,
          });
          await openTimeSlot(zone!);
          await writeHistory({
            action: "ZONE_CHANGED",
            field: "currentZone",
            oldValue: prevZone,
            newValue: zone,
            description: `Entrée en zone ${zoneLabel}`,
          });
          return {
            ok: true,
            status: "ENTREE",
            currentZone: zone,
            autoExit: needsAutoExit,
          };
        }

        case "EXIT": {
          if (
            prevStatus === "NOUVEAU" ||
            prevStatus === "REFUS" ||
            prevStatus === "ABSENT"
          )
            throw new Error("BAD_STATUS");
          // Déjà sorti -> no-op informatif.
          if (prevStatus === "SORTIE") {
            return {
              ok: true,
              noop: true,
              reason: "already_out",
              status: prevStatus,
              currentZone: prevZone,
            };
          }
          const zoneLabel = getZoneLabel(zone!);
          // Tolère une sortie sans entrée préalable (statut autre que ENTREE) :
          // on la trace explicitement via reason.
          const reason = prevStatus !== "ENTREE" ? "exit_without_prior_entry" : null;
          await tx.accreditation.update({
            where: { id, version: acc.version },
            data: {
              status: "SORTIE",
              // currentZone conservée = dernière zone connue (zone de sortie).
              currentZone: zone,
              exitAt: new Date(),
              version: acc.version + 1,
            },
          });
          await createMovement({
            fromZone: prevZone,
            toZone: zone!,
            action: "EXIT",
            reason,
          });
          await closeTimeSlot();
          await writeHistory({
            action: "ZONE_CHANGED",
            field: "currentZone",
            oldValue: prevZone,
            newValue: zone,
            description: `Sortie de la zone ${zoneLabel}`,
            changeReason: reason,
          });
          return { ok: true, status: "SORTIE", currentZone: zone };
        }

        default:
          throw new Error("INVALID_ACTION");
      }
    });

    // Validation terrain d'une demande publique (NOUVEAU -> ENTREE) : on envoie
    // la VRAIE accréditation validée par e-mail (PDF officiel, identique au
    // téléchargement). Non bloquant : l'emaileur ne lève jamais.
    if (action === "VALIDATE_ENTRY" && result?.ok) {
      try {
        const accForEmail = await prisma.accreditation.findUnique({
          where: { id },
          select: { email: true },
        });
        if (accForEmail?.email) {
          const { sendAccreditationCreationEmail } = await import(
            "@/lib/accreditation-creation-email"
          );
          await sendAccreditationCreationEmail({
            accreditationId: id,
            recipient: accForEmail.email,
          });
        }
      } catch (e) {
        console.error("Scan validation email failed:", e);
      }
    }

    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      const map: Record<string, { status: number; message: string }> = {
        NOT_FOUND: { status: 404, message: "Accréditation introuvable." },
        CONFLICT: {
          status: 409,
          message: "Cette accréditation vient d'être modifiée. Rescannez pour rafraîchir.",
        },
        INVALID_ZONE: {
          status: 400,
          message: "Zone invalide pour cette organisation.",
        },
        BAD_STATUS: {
          status: 409,
          message: "Action impossible dans l'état actuel de l'accréditation.",
        },
        NEEDS_VALIDATION: {
          status: 409,
          message: "Cette accréditation doit d'abord être validée (Valider l'entrée).",
        },
      };
      const mapped = map[error.message];
      if (mapped) {
        return Response.json({ error: mapped.message }, { status: mapped.status });
      }
    }
    console.error("POST /api/accreditations/[id]/scan-action error:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
