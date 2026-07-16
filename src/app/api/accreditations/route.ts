import { NextRequest } from "next/server";
import prisma, { withRetry } from "@/lib/prisma";
// import type { Accreditation } from "@/types";
import {
  requirePermission,
  getSession,
  requireAuth,
  hasPermission,
  getAccessibleEventIdsForEspace,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";
import {
  createAccreditation,
  CapacityQuotaError,
  RxServerValidationError,
  type AccreditationCommand,
  type DerogationContext,
} from "@/lib/accreditation-service";
import type { TrustedReferentialInput } from "@/lib/accreditation-referential";
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
 * Phase 6C-B-2 — Indications référentielles NON FIABLES pour la création
 * publique/back-office RX.
 *
 * Extraction PURE et SYNCHRONE, sans aucun accès DB : seuls le nom de
 * l'exposant (`extension.exhibitor.name`) et le code d'emplacement naturel
 * (`extension.location.code`/`type`) sont lus depuis le payload client —
 * jamais un `exhibitorId`/`exhibitorLocationId` (même si présent dans
 * `extension`, il est ignoré ici : ce ne sont que des indications, jamais
 * une confiance directe).
 *
 * La résolution effective (rechargement, revérification organisation/
 * événement/activité, résolution naturelle, ambiguïté, anti-IDOR) est
 * désormais intégralement déléguée au moteur unique
 * (`resolveTrustedAccreditationReferential`, appelée par
 * `resolveRxServerContext` dans `accreditation-service.ts`) — cette route
 * ne fait plus AUCUNE résolution référentielle elle-même. Le formulaire
 * Palais n'est jamais concerné (réservé à `organizationSlug === "rx"`).
 */
function buildRxReferentialInput(
  command: AccreditationCommand
): TrustedReferentialInput | undefined {
  const raw = command as unknown as {
    organizationSlug?: string;
    extension?: {
      exhibitor?: { name?: string };
      location?: { code?: string | null; type?: string | null };
    };
  };
  const orgSlug = raw.organizationSlug?.trim().toLowerCase();
  if (orgSlug !== "rx") return undefined;

  const exhibitorName = raw.extension?.exhibitor?.name?.trim() ?? null;
  const location = raw.extension?.location;
  return {
    exhibitorName,
    locationCode: location?.code ?? null,
    locationType: (location?.type as LocationTypeCode | null | undefined) ?? null,
  };
}

/**
 * Établit le contexte de dérogation depuis la session et la route HTTP.
 * Les indicateurs `isDerogation` / `capacityBypass` envoyés par le navigateur
 * sont volontairement ignorés : seul ce contexte serveur est transmis au moteur.
 */
async function buildDerogationContext(
  req: NextRequest,
  command: AccreditationCommand
): Promise<DerogationContext | undefined> {
  const searchParams = new URL(req.url || "http://localhost").searchParams;
  if (searchParams.get("mode") !== "derogation") return undefined;
  if (searchParams.get("espace") !== "rx") {
    throw new Response("La dérogation est réservée à l'espace RX", { status: 400 });
  }

  const { session, role } = await requireAuth(req);
  const userId = session.user.id;
  const baseAllowed =
    role === "SUPER_ADMIN" ||
    (await hasPermission(userId, "CREER", "write")) ||
    (await hasPermission(userId, "GESTION_DATES", "write"));
  if (!baseAllowed) {
    throw new Response("Accès refusé à la création de dérogation", { status: 403 });
  }

  const eventSlug = typeof command.event === "string" ? command.event.trim() : "";
  const rxOrgId = await resolveEspaceOrgId("rx");
  const event = eventSlug
    ? await prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true, organizationId: true } })
    : null;
  const accessibleEvents = await getAccessibleEventIdsForEspace(userId, "rx");
  if (
    !rxOrgId ||
    !event ||
    event.organizationId !== rxOrgId ||
    (accessibleEvents !== "ALL" && !accessibleEvents.includes(event.id))
  ) {
    throw new Response("Événement RX inaccessible", { status: 403 });
  }

  const reason = typeof command.derogationReason === "string" ? command.derogationReason.trim() : "";
  if (reason.length < 10) {
    throw new Response("Le motif de dérogation est requis et doit contenir au moins 10 caractères.", {
      status: 400,
    });
  }

  return {
    reason,
    byUserId: userId,
    planningBypass: true,
    capacityBypass:
      role === "SUPER_ADMIN" || (await hasPermission(userId, "FLUX_VEHICULES", "write")),
  };
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
    const derogation = await buildDerogationContext(req, command);

    // Phase 6C-B-2 : indications référentielles NON FIABLES (RX uniquement)
    // — la résolution/revalidation fiable vit désormais dans le moteur
    // unique (`resolveRxServerContext`, appelé deux fois : preview puis
    // transaction). Palais et back-office (même route, session détectée
    // ci-dessus) suivent exactement le même chemin.
    const referentialInput = buildRxReferentialInput(command);

    // Adaptateur HTTP pur : toute la logique métier (validation, résolution
    // organisation/événement, référentiel, planning RX, quotas, écriture,
    // e-mail post-commit) vit dans le moteur unique `accreditation-service.ts`,
    // partagé avec le back-office, la duplication et l'import CSV (Phase 4).
    const result = await createAccreditation(command, {
      currentUserId,
      currentUserRole,
      referentialInput,
      derogation,
    });

    if (!result.ok) {
      if (result.status === 503) {
        return Response.json(
          { error: result.error, code: result.code, details: result.details },
          { status: 503 }
        );
      }
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
    if (err instanceof RxServerValidationError) {
      return Response.json(
        { error: err.message, code: err.code, details: err.details },
        { status: err.status }
      );
    }
    console.error(err);
    return new Response("Invalid payload", { status: 400 });
  }
}
