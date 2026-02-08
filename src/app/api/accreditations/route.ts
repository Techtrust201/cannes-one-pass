import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
// import type { Accreditation } from "@/types";
import { addHistoryEntry, createCreatedEntry } from "@/lib/history";
import { requirePermission, getSession } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, "LISTE", "read");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const list = await prisma.accreditation.findMany({
    include: { vehicles: true },
  });
  // Désérialisation unloading (toujours tableau)
  const safeList = list.map((acc) => ({
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
  }));
  return Response.json(safeList);
}

export async function POST(req: NextRequest) {
  try {
    // Tenter de récupérer la session (optionnel, le formulaire public n'est pas authentifié)
    let currentUserId: string | undefined;
    try {
      const session = await getSession(req);
      currentUserId = session?.user?.id;
    } catch {
      // Pas de session = formulaire public
    }

    const raw = await req.json();
    const { company, stand, unloading, event, message, consent, vehicles } =
      raw;
    if (
      !company ||
      !stand ||
      !unloading ||
      !event ||
      !Array.isArray(vehicles) ||
      vehicles.length === 0 ||
      vehicles.some(
        (v) =>
          !v.plate ||
          !v.size ||
          !v.phoneCode ||
          !v.phoneNumber ||
          !v.date ||
          !v.city ||
          !v.unloading
      )
    ) {
      return new Response("Invalid payload: missing vehicle fields", {
        status: 400,
      });
    }
    const currentZone = raw.currentZone ?? null;
    const created = await prisma.accreditation.create({
      data: {
        company,
        stand,
        unloading,
        event,
        message: message ?? "",
        consent: consent ?? true,
        status: raw.status ?? "ATTENTE",
        currentZone: currentZone,
        vehicles: {
          create: vehicles.map((v: Record<string, unknown>) => ({
            plate: v.plate as string,
            size: v.size as string,
            phoneCode: v.phoneCode as string,
            phoneNumber: v.phoneNumber as string,
            date: v.date as string,
            time: (v.time as string) ?? "",
            city: v.city as string,
            unloading: JSON.stringify(v.unloading),
            kms: (v.kms as string) ?? "",
            vehicleType: (v.vehicleType as "PORTEUR" | "PORTEUR_ARTICULE" | "SEMI_REMORQUE") ?? null,
            emptyWeight: v.emptyWeight != null ? Number(v.emptyWeight) : null,
            maxWeight: v.maxWeight != null ? Number(v.maxWeight) : null,
            currentWeight: v.currentWeight != null ? Number(v.currentWeight) : null,
          })),
        },
        ...(currentZone
          ? {
              zoneMovements: {
                create: {
                  toZone: currentZone,
                  action: "ENTRY",
                },
              },
            }
          : {}),
      },
      include: { vehicles: true },
    });
    // Ajout historique création
    await addHistoryEntry(createCreatedEntry(created.id, currentUserId));
    // Désérialisation unloading pour la réponse
    const safeCreated = {
      ...created,
      vehicles: created.vehicles.map((v) => ({
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
    return Response.json(safeCreated, { status: 201 });
  } catch (err) {
    console.error(err);
    return new Response("Invalid payload", { status: 400 });
  }
}
