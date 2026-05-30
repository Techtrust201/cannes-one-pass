import type { Accreditation, Vehicle } from "@/types";
import prisma, { withRetry } from "@/lib/prisma";
import type { AccessibleIds } from "@/lib/auth-helpers";

export async function readAccreditations(options?: {
  accessibleEventIds?: AccessibleIds;
  /**
   * ID de l'organisation de l'espace courant (`?espace=<slug>`). Lorsqu'il
   * est fourni, on inclut TOUTES les accréditations de cette organisation
   * (scope direct via `Accreditation.organizationId`), en plus du scope par
   * event. Indispensable pour afficher les accréditations dont l'`eventId`
   * est null (ex. RX si le slug d'event soumis n'a pas résolu) mais qui sont
   * bien rattachées à l'organisation.
   */
  organizationId?: string | null;
}): Promise<Accreditation[]> {
  const scope = options?.accessibleEventIds ?? "ALL";
  const orgId = options?.organizationId ?? null;

  // Construction du filtre tenant :
  // - scope "ALL" sans org → aucun filtre (super-admin global).
  // - org fournie → union (organizationId = X) OR (eventId ∈ scope).
  // - sinon → filtre par event uniquement (comportement historique).
  let tenantFilter: Record<string, unknown>;
  if (scope === "ALL") {
    tenantFilter = orgId ? { organizationId: orgId } : {};
  } else {
    const eventFilter = { eventId: { in: scope } };
    tenantFilter = orgId
      ? { OR: [{ organizationId: orgId }, eventFilter] }
      : eventFilter;
  }

  const rows = await withRetry(() => prisma.accreditation.findMany({
    where: { isArchived: false, ...tenantFilter },
    include: {
      vehicles: {
        include: {
          timeSlots: {
            orderBy: { entryAt: "desc" },
            take: 1,
          },
        },
      },
    },
  }));

  return rows.map(
    (a): Accreditation => {
      // Trouver le dernier step parmi tous les véhicules
      let lastStepEntryAt: Date | undefined;
      let lastStepExitAt: Date | undefined;
      let lastStepZone: string | undefined;

      for (const v of a.vehicles) {
        const lastSlot = v.timeSlots?.[0];
        if (lastSlot) {
          if (!lastStepEntryAt || lastSlot.entryAt > lastStepEntryAt) {
            lastStepEntryAt = lastSlot.entryAt;
            lastStepExitAt = lastSlot.exitAt ?? undefined;
            lastStepZone = lastSlot.zone;
          }
        }
      }

      return {
        id: a.id,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        version: a.version,
        company: a.company,
        stand: a.stand,
        unloading: a.unloading,
        event: a.event,
        message: a.message || "",
        consent: a.consent,
        status: a.status as Accreditation["status"],
        entryAt: a.entryAt ?? undefined,
        exitAt: a.exitAt ?? undefined,
        currentZone: a.currentZone ?? null,
        isArchived: a.isArchived,
        standId: a.standId ?? null,
        extension: (a.extension as Record<string, unknown> | null) ?? null,
        lastStepEntryAt,
        lastStepExitAt,
        lastStepZone,
        vehicles: a.vehicles.map(
          (v): Vehicle => ({
            id: v.id,
            // Vehicle.plate est nullable côté DB (workflow scan RX) ; côté
            // type TS legacy, on fournit une chaîne vide quand non
            // renseignée pour éviter une cascade de null-guards côté UI.
            plate: v.plate ?? "",
            size: v.size || "",
            phoneCode: v.phoneCode,
            phoneNumber: v.phoneNumber,
            date: v.date,
            time: v.time,
            city: v.city,
            unloading: Array.isArray(v.unloading)
              ? v.unloading
              : typeof v.unloading === "string" && v.unloading.startsWith("[")
                ? (() => { try { return JSON.parse(v.unloading as string); } catch { return [v.unloading]; } })()
                : v.unloading
                  ? [v.unloading]
                  : [],
            kms: v.kms || undefined,
            vehicleType: v.vehicleType as Vehicle["vehicleType"] ?? undefined,
            emptyWeight: v.emptyWeight ?? undefined,
            maxWeight: v.maxWeight ?? undefined,
            currentWeight: v.currentWeight ?? undefined,
            trailerPlate: v.trailerPlate ?? undefined,
          })
        ),
      };
    }
  );
}

export function generateId(): string {
  return crypto.randomUUID();
}
