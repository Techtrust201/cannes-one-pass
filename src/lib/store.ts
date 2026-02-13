import type { Accreditation, Vehicle } from "@/types";
import prisma from "@/lib/prisma";

export async function readAccreditations(): Promise<Accreditation[]> {
  const rows = await prisma.accreditation.findMany({
    include: { vehicles: true },
  });

  return rows.map(
    (a): Accreditation => ({
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
      vehicles: a.vehicles.map(
        (v): Vehicle => ({
          id: v.id,
          plate: v.plate,
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
        })
      ),
    })
  );
}

export function generateId(): string {
  return crypto.randomUUID();
}
