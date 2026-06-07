import { NextRequest } from "next/server";
import prisma, { withRetry } from "@/lib/prisma";
// import type { Accreditation } from "@/types";
import { addHistoryEntry, createCreatedEntry } from "@/lib/history";
import {
  requirePermission,
  getSession,
  getAccessibleEventIdsForEspace,
  assertEventBelongsToOrg,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";
import { getTemplate } from "@/templates/accreditation/registry";

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
  // Scope direct par organisation de l'espace courant : inclut les
  // accréditations rattachées à l'org même si leur eventId est null
  // (aligné avec le dashboard SSR `readAccreditations`).
  const espaceOrgId = espaceParam ? await resolveEspaceOrgId(espaceParam) : null;
  const eventScopeFilter: Record<string, unknown> =
    accessibleEventIds === "ALL"
      ? espaceOrgId
        ? { organizationId: espaceOrgId }
        : {}
      : espaceOrgId
        ? { OR: [{ organizationId: espaceOrgId }, { eventId: { in: accessibleEventIds } }] }
        : { eventId: { in: accessibleEventIds } };

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

    // Détermination du template via `organizationSlug` (nouveau, optionnel
    // pour les anciens payloads Palais sans slug → fallback "palais").
    const organizationSlug = (raw.organizationSlug as string | undefined)?.toLowerCase() ?? "palais";
    const template = getTemplate(organizationSlug);

    // Validation Zod différenciée par template (plaque obligatoire pour
    // Palais, optionnelle pour RX, etc.). On accepte aussi le format
    // legacy pour ne casser aucune intégration existante.
    const zodResult = template.schema.safeParse({ ...raw, organizationSlug });
    if (!zodResult.success) {
      // Fallback validation minimale "ancien format" (compat liens diffusés)
      if (
        !company ||
        !stand ||
        !unloading ||
        !event ||
        !Array.isArray(vehicles) ||
        // Pour le template Palais, on garde l'exigence historique ; pour
        // les autres templates, la validation Zod ci-dessus a déjà tranché.
        (organizationSlug === "palais" &&
          (vehicles.length === 0 ||
            vehicles.some(
              (v) =>
                !v.plate ||
                !v.size ||
                !v.phoneCode ||
                !v.phoneNumber ||
                !v.date ||
                !v.city ||
                !v.unloading
            )))
      ) {
        return Response.json(
          {
            error: "Payload invalide",
            details: zodResult.error.issues,
          },
          { status: 400 }
        );
      }
    }
    const currentZone = raw.currentZone ?? null;

    // Résolution de l'organisation cible. Le `organizationSlug` du payload
    // correspond à la clé du registry de template (ex: "palais", "rx") et
    // pas forcément au `Organization.slug` en base (ex: "palais-des-festivals").
    // Ordre de résolution :
    //   1. Match exact sur `Organization.slug`.
    //   2. Match sur `Organization.formTemplate` (cas legacy Palais où
    //      le payload envoie "palais" mais l'org en base est
    //      "palais-des-festivals").
    //   3. Fallback final : dérive l'org depuis l'event soumis.
    let organizationId: string | null = null;
    let orgRecord = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true, isActive: true },
    });
    if (!orgRecord || !orgRecord.isActive) {
      orgRecord = await prisma.organization.findFirst({
        where: { formTemplate: organizationSlug, isActive: true },
        select: { id: true, isActive: true },
        orderBy: { createdAt: "asc" },
      });
    }
    if (orgRecord && orgRecord.isActive) {
      organizationId = orgRecord.id;
    }

    const eventRecord = await prisma.event.findUnique({ where: { slug: event } });
    if (eventRecord && organizationId) {
      try {
        await assertEventBelongsToOrg(eventRecord.id, organizationId);
      } catch (err) {
        if (err instanceof Response) return err;
        throw err;
      }
    }
    // Fallback rétrocompat : si l'org n'est toujours pas résolue, on dérive
    // depuis l'event si possible (préserve les anciens liens Palais sans
    // organizationSlug dans le payload).
    if (!organizationId && eventRecord?.organizationId) {
      organizationId = eventRecord.organizationId;
    }

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

    const extensionPayload = (raw.extension && typeof raw.extension === "object")
      ? (raw.extension as Record<string, unknown>)
      : null;
    // Laissé en type souple (issu du JSON) pour rester compatible avec l'enum
    // Prisma `AccreditationStatus` sans cast explicite (comportement d'origine).
    const status = raw.status ?? "ATTENTE";

    // Mapping d'un véhicule du payload → objet `create` Prisma (factorisé pour
    // être réutilisé par le chemin unique ET le split RX).
    const buildVehicleCreate = (v: Record<string, unknown>) => ({
      // `plate` est nullable côté DB (workflow RX : plaque saisie au scan).
      plate: (v.plate as string | null | undefined) ?? null,
      size: (v.size as string) ?? "",
      phoneCode: v.phoneCode as string,
      phoneNumber: v.phoneNumber as string,
      date: v.date as string,
      time: (v.time as string) ?? "",
      city: (v.city as string) ?? "",
      unloading: JSON.stringify(v.unloading),
      kms: (v.kms as string) ?? "",
      vehicleType: (v.vehicleType as string) ?? null,
      country: (v.country as "FRANCE" | "ESPAGNE" | "ITALIE" | "ALLEMAGNE" | "BELGIQUE" | "SUISSE" | "ROYAUME_UNI" | "PAYS_BAS" | "PORTUGAL" | "AUTRE") ?? null,
      estimatedKms: v.estimatedKms != null ? Number(v.estimatedKms) : 0,
      trailerPlate: (v.trailerPlate as string) ?? null,
      emptyWeight: v.emptyWeight != null ? Number(v.emptyWeight) : null,
      maxWeight: v.maxWeight != null ? Number(v.maxWeight) : null,
      currentWeight: v.currentWeight != null ? Number(v.currentWeight) : null,
    });

    // Résolution du Stand : upsert par (organizationId, eventId, number=stand)
    // pour relier l'accréditation au niveau « Stand » (centralisation RX).
    let standId: string | null = null;
    if (organizationId && stand && String(stand).trim() !== "") {
      const exhibitor =
        extensionPayload && typeof extensionPayload.exhibitor === "object"
          ? (extensionPayload.exhibitor as Record<string, unknown>)
          : null;
      const sector = exhibitor?.sector ? String(exhibitor.sector) : null;
      const eventIdForStand = eventRecord?.id ?? null;
      try {
        const existing = await prisma.stand.findFirst({
          where: { organizationId, eventId: eventIdForStand, number: stand },
          select: { id: true },
        });
        if (existing) {
          standId = existing.id;
          if (sector) {
            await prisma.stand.update({
              where: { id: existing.id },
              data: { sector },
            });
          }
        } else {
          const created = await prisma.stand.create({
            data: { organizationId, eventId: eventIdForStand, number: stand, sector },
            select: { id: true },
          });
          standId = created.id;
        }
      } catch (e) {
        // Ne bloque pas la création d'accréditation si le stand échoue.
        console.error("Stand resolution failed", e);
      }
    }

    const zoneMovementCreate = currentZone
      ? { zoneMovements: { create: { toZone: currentZone, action: "ENTRY" as const } } }
      : {};

    const { inferActorSource } = await import("@/lib/accreditation-audit");
    const actorSource = inferActorSource(currentUserId, currentUserRole);

    const vehiclesArr = vehicles as Array<Record<string, unknown>>;
    const splitPerVehicle = raw.splitPerVehicle === true && vehiclesArr.length > 0;

    // Jeton public non devinable (QR de suivi du PDF « demande »), distinct de
    // l'id d'accès. Généré pour chaque accréditation créée.
    const { randomBytes } = await import("crypto");
    const genPublicToken = () => randomBytes(12).toString("base64url");

    // ── Workflow RX : une accréditation par véhicule ───────────────────────
    if (splitPerVehicle) {
      const createdList = await prisma.$transaction(
        vehiclesArr.map((v) =>
          prisma.accreditation.create({
            data: {
              company,
              stand,
              unloading,
              event,
              publicToken: genPublicToken(),
              eventId: eventRecord?.id ?? null,
              organizationId: organizationId,
              standId: standId,
              // Extension partagée + contexte de la catégorie de CE véhicule.
              extension: {
                ...(extensionPayload ?? {}),
                vehicleContext: {
                  categoryId: (v.categoryId as string) ?? null,
                  livDate: (v.date as string) ?? null,
                  livTime: (v.time as string) ?? null,
                  repDate: (v.repDate as string) ?? null,
                  repTime: (v.repTime as string) ?? null,
                  repSameAsDelivery: v.repSameAsDelivery !== false,
                  repPlate: (v.repPlate as string | null | undefined) ?? null,
                  repVehicleType: (v.repVehicleType as string) ?? null,
                  repPhoneCode: (v.repPhoneCode as string) ?? null,
                  repPhoneNumber: (v.repPhoneNumber as string) ?? null,
                  interveningCompany: (v.interveningCompany as string) ?? null,
                },
              },
              message: message ?? "",
              consent: consent ?? true,
              language: language ?? "fr",
              status,
              currentZone: currentZone,
              category,
              categorySource,
              vehicles: { create: [buildVehicleCreate(v)] },
              ...zoneMovementCreate,
            },
            select: { id: true },
          })
        )
      );
      for (const c of createdList) {
        await addHistoryEntry(createCreatedEntry(c.id, currentUserId, actorSource));
      }
      return Response.json(
        { count: createdList.length, ids: createdList.map((c) => c.id) },
        { status: 201 }
      );
    }

    // ── Chemin historique : une seule accréditation (Palais, etc.) ─────────
    const created = await prisma.accreditation.create({
      data: {
        company,
        stand,
        unloading,
        event,
        publicToken: genPublicToken(),
        eventId: eventRecord?.id ?? null,
        organizationId: organizationId,
        standId: standId,
        extension: extensionPayload === null ? undefined : (extensionPayload as object),
        message: message ?? "",
        consent: consent ?? true,
        language: language ?? "fr",
        status,
        currentZone: currentZone,
        category,
        categorySource,
        vehicles: { create: vehiclesArr.map(buildVehicleCreate) },
        ...zoneMovementCreate,
      },
      include: { vehicles: true },
    });
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
