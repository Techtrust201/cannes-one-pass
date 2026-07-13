import { NextRequest } from "next/server";
import prisma, { withRetry } from "@/lib/prisma";
// import type { Accreditation } from "@/types";
import {
  requirePermission,
  getSession,
  getAccessibleEventIdsForEspace,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";
import {
  createAccreditation,
  CapacityQuotaError,
  type AccreditationCommand,
  type AccreditationServiceContext,
} from "@/lib/accreditation-service";
import { resolveReferential } from "@/lib/imports/accreditations-referential-resolver";
import type { LocationTypeCode } from "@/lib/imports/referential";

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

/**
 * Phase 6 — Rattachement référentiel serveur pour la création publique RX.
 *
 * Ne fait JAMAIS confiance à un identifiant fourni par le client : seuls le
 * nom de l'exposant (`extension.exhibitor.name`) et le code d'emplacement
 * naturel (`extension.location.code`) sont utilisés, exactement comme pour
 * l'import CSV (Phase 4B) et la duplication (Phase 4A), via le même
 * `resolveReferential` en lecture seule.
 *
 * Comportement délibérément non bloquant : si la résolution échoue (exposant
 * non trouvé, ambigu, emplacement introuvable) ou si aucune donnée
 * référentiel n'existe encore pour cet exposant (avant import/cutover),
 * on renvoie simplement `undefined` — l'accréditation est créée exactement
 * comme aujourd'hui (`exhibitorId`/`exhibitorLocationId` restent `null`).
 * Le formulaire Palais n'est jamais concerné (réservé à `organizationSlug === "rx"`).
 */
async function resolvePublicReferential(
  command: AccreditationCommand
): Promise<AccreditationServiceContext["referential"] | undefined> {
  const raw = command as unknown as {
    organizationSlug?: string;
    event?: string;
    extension?: {
      exhibitor?: { name?: string };
      location?: { code?: string | null; type?: string | null };
    };
  };
  const orgSlug = raw.organizationSlug?.trim().toLowerCase();
  if (orgSlug !== "rx") return undefined;

  const exhibitorName = raw.extension?.exhibitor?.name?.trim();
  const eventSlug = raw.event?.trim();
  if (!exhibitorName || !eventSlug) return undefined;

  try {
    const org = await prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true },
    });
    if (!org) return undefined;

    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      select: { id: true, organizationId: true },
    });
    if (!event || event.organizationId !== org.id) return undefined;

    const location = raw.extension?.location;
    const resolution = await resolveReferential(
      prisma,
      { organizationId: org.id, eventId: event.id },
      {
        name: exhibitorName,
        locationCode: location?.code ?? null,
        locationType: (location?.type as LocationTypeCode | null | undefined) ?? null,
      }
    );

    if (!resolution.ok) {
      console.warn(
        `Résolution référentiel RX publique non concluante (${resolution.code}): ${resolution.message}`
      );
      return undefined;
    }

    return {
      exhibitorId: resolution.exhibitorId,
      exhibitorLocationId: resolution.exhibitorLocationId,
      locationLabel: resolution.locationLabel,
      locationSnapshot: resolution.locationSnapshot,
    };
  } catch (err) {
    console.error("resolvePublicReferential error:", err);
    return undefined;
  }
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

    const command = (await req.json()) as AccreditationCommand;

    // Phase 6 : rattachement référentiel serveur (RX uniquement, jamais
    // bloquant — cf. `resolvePublicReferential`). Le Palais et les
    // exposants RX sans référentiel importé ne sont pas affectés.
    const referential = await resolvePublicReferential(command);

    // Adaptateur HTTP pur : toute la logique métier (validation, résolution
    // organisation/événement, quotas, écriture, e-mail post-commit) vit dans
    // le moteur unique `accreditation-service.ts`, partagé avec le
    // back-office, la duplication et l'import CSV (Phase 4).
    const result = await createAccreditation(command, {
      currentUserId,
      currentUserRole,
      referential,
    });

    if (!result.ok) {
      if (result.status === 409) {
        return Response.json(
          { error: result.error, code: result.code, details: result.details },
          { status: 409 }
        );
      }
      return Response.json({ error: result.error, details: result.details }, { status: 400 });
    }

    return Response.json(result.body, { status: 201 });
  } catch (err) {
    // Parité HTTP : `assertEventBelongsToOrg` (via le moteur) lève une `Response`
    // texte 400 ("Event inconnu" / "L'event ne correspond pas à l'organisation
    // cible"). On la retourne telle quelle, sans la reconstruire (statut,
    // content-type et body identiques au comportement historique).
    if (err instanceof Response) return err;
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
