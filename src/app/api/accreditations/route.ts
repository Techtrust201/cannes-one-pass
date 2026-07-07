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
import { suggestZone, buildRxZoneRouting, type RxZoneRouting } from "@/lib/rx-zone-rules";
import {
  resolveVehicleFamilyFromConfig,
  resolveVehicleFamilyFromText,
  type VehicleFamily,
} from "@/lib/vehicle-family";
import type { RxCapacityDb } from "@/lib/rx-capacity-service";
import {
  buildCapacityQuotaCandidates,
  enforceCapacityQuotas,
  CapacityQuotaError,
  type QuotaCandidate,
  type CandidateVehicleInput,
} from "@/lib/capacity-quota-guard";
import { normalizePlate } from "@/lib/plate-utils";
import { isValidEmail } from "@/lib/email-sender";

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
      // Fallback legacy réservé au Palais (anciens liens diffusés sans slug).
      // RX et tout template moderne : Zod fait foi, pas de contournement.
      const legacyPalaisOk =
        organizationSlug === "palais" &&
        company &&
        stand &&
        unloading &&
        event &&
        Array.isArray(vehicles) &&
        vehicles.length > 0 &&
        !vehicles.some(
          (v) =>
            !v.plate ||
            !v.size ||
            !v.phoneCode ||
            !v.phoneNumber ||
            !v.date ||
            !v.city ||
            !v.unloading
        );

      if (!legacyPalaisOk) {
        return Response.json(
          {
            error:
              zodResult.error.issues[0]?.message ?? "Payload invalide",
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

    // Destinataire de l'e-mail de création (Lot 2) : email racine (Palais) ou
    // contact RX (extension.contact.email). Null si absent → envoi ignoré.
    const contactObj =
      extensionPayload && typeof extensionPayload.contact === "object"
        ? (extensionPayload.contact as Record<string, unknown>)
        : null;
    const recipientEmail: string | null =
      typeof raw.email === "string" && raw.email.trim()
        ? raw.email.trim()
        : contactObj &&
            typeof contactObj.email === "string" &&
            (contactObj.email as string).trim()
          ? (contactObj.email as string).trim()
          : null;

    // Garde-fou : l'e-mail destinataire est OBLIGATOIRE avant création — il
    // conditionne l'envoi automatique (récap + QR). On bloque *avant* toute
    // création pour ne jamais produire une accréditation non « envoyable ».
    // (L'échec d'envoi Resend lui-même reste non bloquant, voir Lot 2.)
    if (!isValidEmail(recipientEmail)) {
      return Response.json(
        {
          error:
            "E-mail du destinataire requis et valide pour créer l'accréditation (envoi du récapitulatif et du QR code).",
        },
        { status: 400 }
      );
    }
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
      plateNormalized: normalizePlate(v.plate as string | null | undefined),
      trailerPlateNormalized: normalizePlate(
        v.trailerPlate as string | null | undefined
      ),
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

    // Statut administratif déterminé par le SERVEUR selon l'origine de la
    // création — JAMAIS d'après le `status` du payload client (sécurité :
    // empêche une création publique de produire une accréditation déjà
    // validée). Règle métier :
    //  - création PUBLIQUE (formulaire non authentifié) -> NOUVEAU : la demande
    //    doit être validée par un agent (à l'arrivée ou au back-office) ;
    //  - création INTERNE (logisticien / super-admin authentifié) -> ATTENTE :
    //    créée par un agent habilité, donc validée administrativement
    //    (= validée, en attente d'arrivée).
    // NB : « validée administrativement » ne crée AUCUN mouvement d'entrée ;
    // l'entrée en zone reste déclenchée par un scan terrain. Les statuts
    // opérationnels (ENTREE/SORTIE/REFUS) ne sont atteignables que via PATCH /
    // scan, jamais à la création.
    const isInternalCreation =
      actorSource === "LOGISTICIEN" || actorSource === "SUPER_ADMIN";
    const status: "NOUVEAU" | "ATTENTE" = isInternalCreation
      ? "ATTENTE"
      : "NOUVEAU";

    const vehiclesArr = vehicles as Array<Record<string, unknown>>;
    const splitPerVehicle = raw.splitPerVehicle === true && vehiclesArr.length > 0;

    // ── Résolution générique zone / famille véhicule (toutes organisations) ─
    // La table de routage RX (rxZoneCanto/rxZoneVieuxPort/rxPalmBeachAtCanto)
    // vit sur VehicleTypeConfig pour TOUTES les organisations, mais elle n'est
    // en pratique renseignée qu'en RX aujourd'hui. On ne l'utilise donc que si
    // elle est réellement configurée pour cette organisation
    // (`hasRxZoneConfig`) — sinon on retombe sur la résolution standard
    // (currentZone / extension.suggestedZone). On ne force JAMAIS
    // LA_BOCCA/PALM_BEACH pour une organisation qui n'a pas configuré ce
    // routage : pas de zone déterminable ⇒ pas de candidate de quota.
    const exhibitorSector =
      extensionPayload && typeof extensionPayload.exhibitor === "object"
        ? String(
            (extensionPayload.exhibitor as Record<string, unknown>).sector ?? ""
          )
        : "";
    let rxPalmBeachCodes: Set<string> = new Set();
    let rxZoneRouting: Map<string, RxZoneRouting> | undefined;
    // Map code.toUpperCase() → VehicleFamily — source de vérité unique pour
    // la famille, réutilisée par le routage RX ET les quotas génériques.
    let vtFamilyMap: Map<string, VehicleFamily> = new Map();
    let hasRxZoneConfig = false;
    if (organizationId && vehiclesArr.length > 0) {
      const vtConfigs = await prisma.vehicleTypeConfig.findMany({
        where: { organizationId, isActive: true },
        select: {
          code: true,
          pdfCode: true,
          vehicleFamily: true,
          rxPalmBeachAtCanto: true,
          rxZoneCanto: true,
          rxZoneVieuxPort: true,
        },
      });
      hasRxZoneConfig = vtConfigs.some(
        (c) => c.rxPalmBeachAtCanto || c.rxZoneCanto || c.rxZoneVieuxPort
      );
      rxPalmBeachCodes = new Set(
        vtConfigs
          .filter((c) => c.rxPalmBeachAtCanto)
          .map((c) => c.code.toUpperCase())
      );
      rxZoneRouting = buildRxZoneRouting(vtConfigs);
      vtFamilyMap = new Map(
        vtConfigs.map((c) => [
          c.code.toUpperCase(),
          resolveVehicleFamilyFromConfig({
            pdfCode: c.pdfCode as "A" | "B" | "C" | "D",
            vehicleFamily: c.vehicleFamily ?? null,
          }) ?? resolveVehicleFamilyFromText(c.code),
        ])
      );
    }
    const resolveZoneForType = (vehicleTypeCode: string): string | null => {
      if (hasRxZoneConfig && exhibitorSector) {
        return suggestZone(
          vehicleTypeCode ?? "",
          exhibitorSector,
          rxPalmBeachCodes,
          rxZoneRouting
        );
      }
      return (
        (currentZone as string | null) ??
        (extensionPayload?.suggestedZone as string | undefined) ??
        null
      );
    };
    const resolveVehicleZone = (v: Record<string, unknown>): string | null =>
      resolveZoneForType((v.vehicleType as string) ?? "");
    const resolveVehicleFamily = (vehicleTypeCode: string): VehicleFamily => {
      const key = (vehicleTypeCode ?? "").trim().toUpperCase();
      return vtFamilyMap.get(key) ?? resolveVehicleFamilyFromText(vehicleTypeCode);
    };

    // ── Quotas de capacité : construction des candidates (toutes orgs) ─────
    // Standard global (MONTAGE) : fonctionne pour toute organisation dès que
    // vehicleType + date + time (plage) + zone sont déterminables. Optionnel
    // (DEMONTAGE) : seulement si repDate/repTime/repVehicleType sont présents
    // (RX aujourd'hui, mais pas imposé aux autres organisations).
    // Le blocage réel (lock + recheck + comparaison remaining/requestedCount)
    // se fait plus bas, DANS la transaction qui crée les accréditations — voir
    // enforceCapacityQuotas. Aucune décision de blocage n'est prise ici :
    // si aucun quota n'est configuré pour une candidate, elle ne bloque rien.
    const quotaCandidates: QuotaCandidate[] =
      organizationId && eventRecord?.id
        ? buildCapacityQuotaCandidates({
            organizationId,
            eventId: eventRecord.id,
            vehicles: vehiclesArr as CandidateVehicleInput[],
            resolveZone: resolveZoneForType,
            resolveFamily: resolveVehicleFamily,
          })
        : [];

    // Jeton public non devinable (QR de suivi du PDF « demande »), distinct de
    // l'id d'accès. Généré pour chaque accréditation créée.
    const { randomBytes } = await import("crypto");
    const genPublicToken = () => randomBytes(12).toString("base64url");

    // ── Fabriques de création (RX split ou accréditation unique) ───────────
    // Paramétrées par `db` (client Prisma global OU client de transaction
    // interactive `tx`) pour pouvoir s'exécuter soit hors transaction
    // (comportement historique inchangé, quand aucun quota candidate n'est
    // calculable), soit DANS la transaction de garde anti-surbooking.
    // Contenu des données IDENTIQUE à l'existant (email/PDF non modifiés).
    const createSplitAccreditations = async (db: RxCapacityDb) => {
      const createdList: { id: string }[] = [];
      for (const v of vehiclesArr) {
        const c = await db.accreditation.create({
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
              // Zone suggérée recalculée pour le gabarit de CE véhicule
              // (RX) ; repli sur la valeur globale du payload sinon.
              suggestedZone: resolveVehicleZone(v),
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
                repInterveningCompany: (v.repInterveningCompany as string) ?? null,
                repCity: (v.repCity as string) ?? null,
                repCountry: (v.repCountry as string) ?? null,
                repEstimatedKms:
                  v.repEstimatedKms != null ? Number(v.repEstimatedKms) : null,
              },
            },
            message: message ?? "",
            consent: consent ?? true,
            language: language ?? "fr",
            email: recipientEmail,
            status,
            currentZone: currentZone,
            category,
            categorySource,
            vehicles: { create: [buildVehicleCreate(v)] },
            ...zoneMovementCreate,
          },
          select: { id: true },
        });
        createdList.push(c);
      }
      return createdList;
    };

    const createSingleAccreditation = (db: RxCapacityDb) =>
      db.accreditation.create({
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
          email: recipientEmail,
          status,
          currentZone: currentZone,
          category,
          categorySource,
          vehicles: { create: vehiclesArr.map(buildVehicleCreate) },
          ...zoneMovementCreate,
        },
        include: { vehicles: true },
      });

    // ── Exécution : atomique (lock + recheck + create) si des quotas sont
    // potentiellement concernés par cette demande, sinon comportement
    // historique inchangé (aucune transaction supplémentaire). Le check +
    // la création sont ATOMIQUES : aucune accréditation n'est créée si un
    // quota est insuffisant, donc aucun email/token n'est jamais émis pour
    // une création bloquée.
    let createdList: { id: string }[] | null = null;
    let created: Awaited<ReturnType<typeof createSingleAccreditation>> | null = null;
    try {
      if (quotaCandidates.length > 0) {
        if (splitPerVehicle) {
          createdList = await prisma.$transaction(async (tx) => {
            await enforceCapacityQuotas(tx, quotaCandidates);
            return createSplitAccreditations(tx);
          });
        } else {
          created = await prisma.$transaction(async (tx) => {
            await enforceCapacityQuotas(tx, quotaCandidates);
            return createSingleAccreditation(tx);
          });
        }
      } else if (splitPerVehicle) {
        createdList = await createSplitAccreditations(prisma);
      } else {
        created = await createSingleAccreditation(prisma);
      }
    } catch (err) {
      if (err instanceof CapacityQuotaError) {
        return Response.json(
          { error: err.message, code: err.code, details: err.details },
          { status: 409 }
        );
      }
      throw err;
    }

    // ── Workflow RX : une accréditation par véhicule ───────────────────────
    if (createdList) {
      for (const c of createdList) {
        await addHistoryEntry(createCreatedEntry(c.id, currentUserId, actorSource));
      }
      // Lot 2 : un e-mail par accréditation/véhicule (chaque véhicule a son QR).
      // Non bloquant : n'altère jamais le statut et ne fait jamais échouer la création.
      const emailOutcomes: string[] = [];
      try {
        const { sendAccreditationCreationEmail } = await import(
          "@/lib/accreditation-creation-email"
        );
        for (const c of createdList) {
          emailOutcomes.push(
            await sendAccreditationCreationEmail({
              accreditationId: c.id,
              recipient: recipientEmail,
            })
          );
        }
      } catch (e) {
        console.error("Creation email (split) failed:", e);
      }
      // Issue agrégée : "sent" si au moins un e-mail est parti, sinon la 1re issue.
      const emailOutcome = emailOutcomes.includes("sent")
        ? "sent"
        : (emailOutcomes[0] ?? "failed");
      return Response.json(
        {
          count: createdList.length,
          ids: createdList.map((c) => c.id),
          emailOutcome,
        },
        { status: 201 }
      );
    }

    // ── Chemin historique : une seule accréditation (Palais, etc.) ─────────
    await addHistoryEntry(
      createCreatedEntry(created!.id, currentUserId, actorSource)
    );
    // Lot 2 : e-mail récap + QR à la création. Non bloquant (try/catch),
    // statut inchangé (reste NOUVEAU). Si pas d'email ou config manquante,
    // l'issue est tracée dans l'historique sans faire échouer la création.
    let creationEmailOutcome: string | undefined;
    try {
      const { sendAccreditationCreationEmail } = await import(
        "@/lib/accreditation-creation-email"
      );
      creationEmailOutcome = await sendAccreditationCreationEmail({
        accreditationId: created!.id,
        recipient: recipientEmail,
      });
    } catch (e) {
      console.error("Creation email failed:", e);
      creationEmailOutcome = "failed";
    }
    // Désérialisation unloading pour la réponse
    const safeCreated = {
      ...created!,
      emailOutcome: creationEmailOutcome,
      vehicles: created!.vehicles.map((v) => ({
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
    if (err instanceof CapacityQuotaError) {
      return Response.json(
        { error: err.message, code: err.code, details: err.details },
        { status: 409 }
      );
    }
    console.error(err);
    return new Response("Invalid payload", { status: 400 });
  }
}
