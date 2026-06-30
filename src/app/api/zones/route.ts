import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  requireAuth,
  hasPermission,
  resolveEspaceOrgId,
  getAccessibleOrganizationIds,
} from "@/lib/auth-helpers";
import { isSafeHttpUrl } from "@/lib/url-safety";

type ZoneRow = { zone: string };

/** Dé-duplique une liste de zones par `zone` (garde la première occurrence).
 * Filet de sécurité anti-doublon cross-organisation. */
function dedupeByZone<T extends ZoneRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.zone) ? false : (seen.add(r.zone), true)));
}

/**
 * GET /api/zones — Lister les zones accessibles.
 *
 * Cloisonnement strict par organisation (plus aucune zone « globale ») :
 * - `?espace=<slug>` : zones de cette organisation uniquement.
 * - Sans `?espace=` : zones des organisations accessibles à l'utilisateur
 *   (dé-dupliquées par `zone` si plusieurs orgs).
 *
 * Permissions acceptées :
 * - `GESTION_ZONES` read (accès admin complet)
 * - `FLUX_VEHICULES` ou `BILAN_CARBONE` read + `?espace=` (lecture scopée
 *   pour alimenter les selects de filtre Comptage / Bilan carbone)
 */
export async function GET(req: NextRequest) {
  const espaceParam = req.nextUrl.searchParams.get("espace")?.trim() || null;
  let session: Awaited<ReturnType<typeof requirePermission>> | null = null;
  let scopedReadOnly = false;

  try {
    session = await requirePermission(req, "GESTION_ZONES", "read");
  } catch (adminError) {
    if (espaceParam) {
      try {
        const { session: authSession } = await requireAuth(req);
        const userId = authSession.user.id;
        const hasFlux = await hasPermission(userId, "FLUX_VEHICULES", "read");
        const hasCarbone = await hasPermission(userId, "BILAN_CARBONE", "read");
        if (!hasFlux && !hasCarbone) {
          if (adminError instanceof Response) {
            return new Response(adminError.body, { status: adminError.status, statusText: adminError.statusText });
          }
          return new Response("Non autorisé", { status: 401 });
        }
        scopedReadOnly = true;
      } catch {
        if (adminError instanceof Response) {
          return new Response(adminError.body, { status: adminError.status, statusText: adminError.statusText });
        }
        return new Response("Non autorisé", { status: 401 });
      }
    } else {
      if (adminError instanceof Response) {
        return new Response(adminError.body, { status: adminError.status, statusText: adminError.statusText });
      }
      return new Response("Non autorisé", { status: 401 });
    }
  }

  try {
    const orderBy = { label: "asc" as const };

    // Lecture scopée (FLUX_VEHICULES/BILAN_CARBONE) ou espace fourni → org seulement.
    if (espaceParam) {
      const orgId = await resolveEspaceOrgId(espaceParam);
      if (!orgId) return Response.json([]);
      const zones = await prisma.zoneConfig.findMany({
        where: { organizationId: orgId },
        orderBy,
      });
      return Response.json(zones);
    }

    // Accès admin sans espace → ne pas autoriser la lecture scopée sans espace.
    if (scopedReadOnly) return Response.json([]);

    // Cas 2/3 : pas d'espace → orgs accessibles à l'utilisateur (admin uniquement).
    const accessible = await getAccessibleOrganizationIds(session!.user.id);
    if (Array.isArray(accessible) && accessible.length > 0) {
      const zones = await prisma.zoneConfig.findMany({
        where: { organizationId: { in: accessible } },
        orderBy,
      });
      return Response.json(accessible.length > 1 ? dedupeByZone(zones) : zones);
    }

    // Super-admin ("ALL") ou aucune org → tout, dé-dupliqué par zone.
    const zones = await prisma.zoneConfig.findMany({ orderBy });
    return Response.json(dedupeByZone(zones));
  } catch (error) {
    console.error("GET /api/zones error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/zones — Créer une nouvelle zone.
 *
 * Si `?espace=<slug>` est fourni, la zone est créée pour cette organisation
 * uniquement. Sinon elle est globale (héritée par toutes les orgs).
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "GESTION_ZONES", "write");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  try {
    const espace = req.nextUrl.searchParams.get("espace")?.trim() || null;
    const orgId = await resolveEspaceOrgId(espace);

    const body = await req.json();
    const { zone, label, address, latitude, longitude, isFinalDestination, color } = body;
    const { readerName, readerUrl, readerActive } = body;

    if (!zone || !label || !address || latitude == null || longitude == null) {
      return Response.json(
        { error: "Tous les champs sont requis : zone, label, address, latitude, longitude" },
        { status: 400 }
      );
    }

    // Lecteur de plaque (Lot 3) : URL optionnelle mais, si fournie, doit être
    // une URL http/https valide (refus de javascript:/data:/file: …).
    const trimmedReaderUrl =
      typeof readerUrl === "string" ? readerUrl.trim() : "";
    if (trimmedReaderUrl && !isSafeHttpUrl(trimmedReaderUrl)) {
      return Response.json(
        { error: "URL du lecteur invalide (http/https uniquement)." },
        { status: 400 }
      );
    }

    const zoneKey = zone.toUpperCase().replace(/[^A-Z0-9]/g, "_");

    const existing = await prisma.zoneConfig.findFirst({
      where: { zone: zoneKey, organizationId: orgId },
    });
    if (existing) {
      return Response.json({ error: "Cette zone existe déjà" }, { status: 409 });
    }

    const created = await prisma.zoneConfig.create({
      data: {
        zone: zoneKey,
        label,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        isFinalDestination: isFinalDestination ?? false,
        color: color ?? "gray",
        readerName:
          typeof readerName === "string" && readerName.trim()
            ? readerName.trim()
            : null,
        readerUrl: trimmedReaderUrl || null,
        readerActive: Boolean(readerActive),
        organizationId: orgId,
      },
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/zones error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
