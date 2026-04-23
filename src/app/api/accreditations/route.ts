import { NextRequest } from "next/server";
import prisma, { withRetry } from "@/lib/prisma";
// import type { Accreditation } from "@/types";
import { addHistoryEntry, createCreatedEntry } from "@/lib/history";
import { requirePermission, getSession, getAccessibleEventIdsForEspace } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  let currentUserId: string | undefined;
  try {
    const session = await requirePermission(request, "LISTE", "read");
    currentUserId = session.user.id;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  // Scoping multi-tenant : restreindre aux events accessibles (avec prise en
  // compte du contexte d'Espace `?espace=<slug>` pour aligner SSR et API).
  const { searchParams } = new URL(request.url);
  const espaceParam = searchParams.get("espace")?.trim() || null;
  const accessibleEventIds = await getAccessibleEventIdsForEspace(
    currentUserId!,
    espaceParam
  );
  const eventScopeFilter =
    accessibleEventIds === "ALL" ? {} : { eventId: { in: accessibleEventIds } };

  // Par défaut, exclure les accréditations archivées
  const showArchived = searchParams.get("archived") === "true";

  if (showArchived) {
    const list = await withRetry(() => prisma.accreditation.findMany({
      where: { isArchived: true, ...eventScopeFilter },
      select: {
        id: true, company: true, stand: true, event: true, status: true,
        createdAt: true, currentZone: true, isArchived: true,
        vehicles: {
          select: { id: true, plate: true, trailerPlate: true, size: true, date: true, vehicleType: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }));
    return Response.json(list);
  }

  const finalZone = await withRetry(() => prisma.zoneConfig.findFirst({ where: { isFinalDestination: true, isActive: true } }));
  const finalZoneKey = finalZone?.zone || "PALAIS_DES_FESTIVALS";

  const list = await withRetry(() => prisma.accreditation.findMany({
    where: { isArchived: false, ...eventScopeFilter },
    include: {
      vehicles: {
        include: {
          timeSlots: {
            where: { zone: finalZoneKey },
            orderBy: { entryAt: "desc" },
            take: 1,
          },
        },
      },
    },
  }));

  const safeList = list.map((acc) => {
    let palaisEntryAt: Date | null = null;
    let palaisExitAt: Date | null = null;

    for (const v of acc.vehicles) {
      const palaisSlot = v.timeSlots?.[0];
      if (palaisSlot) {
        if (!palaisEntryAt || palaisSlot.entryAt > palaisEntryAt) {
          palaisEntryAt = palaisSlot.entryAt;
          palaisExitAt = palaisSlot.exitAt;
        }
      }
    }

    return {
      ...acc,
      palaisEntryAt,
      palaisExitAt,
      vehicles: acc.vehicles.map((v) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { timeSlots, ...rest } = v;
        return {
          ...rest,
          unloading: Array.isArray(v.unloading)
            ? v.unloading
            : typeof v.unloading === "string" && v.unloading.startsWith("[")
              ? (() => { try { return JSON.parse(v.unloading as string); } catch { return [v.unloading]; } })()
              : v.unloading
                ? [v.unloading]
                : [],
        };
      }),
    };
  });
  return Response.json(safeList);
}

export async function POST(req: NextRequest) {
  try {
    // Tenter de récupérer la session (optionnel, le formulaire public n'est pas authentifié)
    let currentUserId: string | undefined;
    let currentUserRole: "SUPER_ADMIN" | "ADMIN" | "USER" | undefined;
    try {
      const session = await getSession(req);
      currentUserId = session?.user?.id;
      if (currentUserId) {
        const u = await prisma.user.findUnique({
          where: { id: currentUserId },
          select: { role: true },
        });
        currentUserRole = u?.role;
      }
    } catch {
      // Pas de session = formulaire public
    }

    const raw = await req.json();
    const { company, stand, unloading, event, message, consent, vehicles, language } =
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

    const eventRecord = await prisma.event.findUnique({ where: { slug: event } });

    // Catégorie : soit fournie explicitement par le client (override manuel),
    // soit déduite automatiquement depuis stand + zone.
    const { deriveCategory, CSV_TO_ENUM } = await import("@/lib/category-rules");
    const { inferActorSource: inferSource } = await import("@/lib/accreditation-audit");
    let category: "STAND_NU" | "STAND_CLE_EN_MAIN" | "BATEAU_TERRE" | "BATEAU_FLOT" | "TENTE_STRUCTURE" | null = null;
    let categorySource: "PUBLIC_FORM" | "LOGISTICIEN" | "SUPER_ADMIN" | "AUTO_DEDUCTION" | null = null;
    const rawCategory = (raw.category as string | undefined)?.trim().toLowerCase();
    if (rawCategory && CSV_TO_ENUM[rawCategory]) {
      category = CSV_TO_ENUM[rawCategory];
      const inferred = inferSource(currentUserId, currentUserRole);
      // Seules les sources "saisie" sont admises pour la catégorie (pas MIGRATION/SYSTEM/CSV via ce POST)
      categorySource =
        inferred === "PUBLIC_FORM" || inferred === "LOGISTICIEN" || inferred === "SUPER_ADMIN"
          ? inferred
          : "LOGISTICIEN";
    } else {
      const derived = deriveCategory({ stand, zone: currentZone });
      if (derived) {
        category = derived;
        categorySource = "AUTO_DEDUCTION";
      }
    }

    const created = await prisma.accreditation.create({
      data: {
        company,
        stand,
        unloading,
        event,
        eventId: eventRecord?.id ?? null,
        message: message ?? "",
        consent: consent ?? true,
        language: language ?? "fr",
        status: raw.status ?? "ATTENTE",
        currentZone: currentZone,
        category,
        categorySource,
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
            country: (v.country as "FRANCE" | "ESPAGNE" | "ITALIE" | "ALLEMAGNE" | "BELGIQUE" | "SUISSE" | "ROYAUME_UNI" | "PAYS_BAS" | "PORTUGAL" | "AUTRE") ?? null,
            estimatedKms: v.estimatedKms != null ? Number(v.estimatedKms) : 0,
            trailerPlate: (v.trailerPlate as string) ?? null,
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
    // Ajout historique création avec la source adéquate (PUBLIC_FORM si pas
    // de session, SUPER_ADMIN ou LOGISTICIEN sinon)
    const { inferActorSource } = await import("@/lib/accreditation-audit");
    const actorSource = inferActorSource(currentUserId, currentUserRole);
    await addHistoryEntry(
      createCreatedEntry(created.id, currentUserId, actorSource)
    );
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
