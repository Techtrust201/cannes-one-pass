import { NextRequest } from "next/server";
import prisma, { withRetry } from "@/lib/prisma";
import {
  resolvePlanning,
  buildScopeCandidates,
  type PlanningPhase,
  type PlanningMode,
  type PlanningRuleRow,
} from "@/lib/logistics-planning";

/**
 * `GET /api/planning` — Public, lecture seule.
 *
 * Résout la règle de planning applicable pour un contexte donné (emplacement
 * exposant résolu côté serveur, phase MONTAGE/DEMONTAGE, catégorie optionnelle).
 *
 * Paramètres :
 *   - orgSlug, eventSlug (obligatoires) ;
 *   - phase = MONTAGE | DEMONTAGE (obligatoire) ;
 *   - exhibitorId, exhibitorLocationId (optionnels — l'appartenance est
 *     TOUJOURS vérifiée côté serveur, jamais déduite du client) ;
 *   - categoryCode (optionnel, défaut "ALL").
 *
 * Sécurité : event.organizationId, exhibitor.organizationId/eventId et
 * exhibitorLocation.exhibitorId sont systématiquement vérifiés. Aucun mélange
 * multi-organisation n'est possible. Aucun objet Prisma complet n'est exposé :
 * seule la résolution structurée `PlanningResolution` est renvoyée.
 *
 * Ce module n'implémente AUCUN fallback métier (planning-data.ts RX, dates
 * Event Palais) : il ne fait que rapporter l'état réel de la base via
 * `logistics-planning.ts`. Le fallback, spécifique à chaque template, reste
 * la responsabilité du code appelant (formulaire).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const orgSlug = params.get("orgSlug")?.trim();
  const eventSlug = params.get("eventSlug")?.trim();
  const phaseParam = params.get("phase")?.trim();
  const exhibitorId = params.get("exhibitorId")?.trim() || null;
  const exhibitorLocationId = params.get("exhibitorLocationId")?.trim() || null;
  const categoryCode = params.get("categoryCode")?.trim() || undefined;

  if (!orgSlug || !eventSlug) {
    return Response.json({ ok: false, error: "orgSlug et eventSlug sont requis." }, { status: 400 });
  }
  if (phaseParam !== "MONTAGE" && phaseParam !== "DEMONTAGE") {
    return Response.json(
      { ok: false, error: "phase doit être MONTAGE ou DEMONTAGE." },
      { status: 400 }
    );
  }
  const phase: PlanningPhase = phaseParam;

  try {
    const org = await prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true, isActive: true },
    });
    if (!org || !org.isActive) {
      return Response.json({ ok: false, error: "Organisation inconnue." }, { status: 404 });
    }

    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      select: { id: true, organizationId: true, logisticsPlanningMode: true },
    });
    if (!event || event.organizationId !== org.id) {
      return Response.json(
        { ok: false, error: "Événement introuvable pour cette organisation." },
        { status: 404 }
      );
    }

    // Résolution + vérification stricte de l'emplacement : le client peut
    // suggérer un exhibitorId/exhibitorLocationId, mais l'appartenance à
    // l'organisation + l'événement + l'exposant est toujours revérifiée ici.
    let location: { portCode: string | null; sectorCode: string | null; logisticSpace: string | null } | null =
      null;

    if (exhibitorLocationId) {
      if (!exhibitorId) {
        return Response.json(
          { ok: false, error: "exhibitorId est requis lorsque exhibitorLocationId est fourni." },
          { status: 400 }
        );
      }
      const exhibitor = await prisma.exhibitor.findUnique({
        where: { id: exhibitorId },
        select: { id: true, organizationId: true, eventId: true },
      });
      if (!exhibitor || exhibitor.organizationId !== org.id || exhibitor.eventId !== event.id) {
        return Response.json(
          { ok: false, error: "Exposant introuvable pour cette organisation/événement." },
          { status: 404 }
        );
      }
      const exhibitorLocation = await prisma.exhibitorLocation.findUnique({
        where: { id: exhibitorLocationId },
        select: {
          id: true,
          exhibitorId: true,
          portCode: true,
          sectorCode: true,
          logisticSpace: true,
        },
      });
      if (!exhibitorLocation || exhibitorLocation.exhibitorId !== exhibitor.id) {
        return Response.json(
          { ok: false, error: "Emplacement introuvable pour cet exposant." },
          { status: 404 }
        );
      }
      location = {
        portCode: exhibitorLocation.portCode,
        sectorCode: exhibitorLocation.sectorCode,
        logisticSpace: exhibitorLocation.logisticSpace,
      };
    } else if (exhibitorId) {
      // exhibitorId seul (sans emplacement) : on vérifie son appartenance
      // mais aucune portée PORT/SECTOR/SPACE n'est déductible sans location.
      const exhibitor = await prisma.exhibitor.findUnique({
        where: { id: exhibitorId },
        select: { id: true, organizationId: true, eventId: true },
      });
      if (!exhibitor || exhibitor.organizationId !== org.id || exhibitor.eventId !== event.id) {
        return Response.json(
          { ok: false, error: "Exposant introuvable pour cette organisation/événement." },
          { status: 404 }
        );
      }
    }

    const mode = event.logisticsPlanningMode as PlanningMode;
    const candidates = buildScopeCandidates(location);
    const scopeKeys = candidates.map((c) => c.scopeKey);

    // En DISABLED, on ne consulte jamais la base (comportement historique
    // garanti par construction — cf. `resolvePlanning`).
    const rows: PlanningRuleRow[] =
      mode === "DISABLED"
        ? []
        : await withRetry(() =>
            prisma.logisticsPlanning.findMany({
              where: {
                organizationId: org.id,
                eventId: event.id,
                phase,
                isActive: true,
                scopeKey: { in: scopeKeys },
              },
              select: {
                scope: true,
                scopeKey: true,
                categoryCode: true,
                phase: true,
                date: true,
                startTime: true,
                endTime: true,
              },
            })
          );

    const resolution = resolvePlanning({
      mode,
      phase,
      categoryCode,
      location,
      rows: rows as PlanningRuleRow[],
    });

    return Response.json({ ok: true, resolution });
  } catch (err) {
    console.error("GET /api/planning error:", err);
    return Response.json({ ok: false, error: "Erreur interne." }, { status: 500 });
  }
}
