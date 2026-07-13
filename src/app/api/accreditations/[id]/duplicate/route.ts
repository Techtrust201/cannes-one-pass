import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { assertAccreditationAccess } from "@/lib/rbac";
import { ENUM_TO_CSV } from "@/lib/category-rules";
import {
  createAccreditation,
  type AccreditationCommand,
} from "@/lib/accreditation-service";

/**
 * POST /api/accreditations/[id]/duplicate
 * Clone une accréditation existante avec un nouveau véhicule.
 * Body : les champs du véhicule (même format que VehicleEditDialog).
 *
 * Phase 4A : adaptateur HTTP pur — toute la logique métier (validation par
 * template, organisation/événement, quotas, Stand, historique, e-mail
 * post-commit) passe par le moteur unique `accreditation-service.ts`,
 * exactement comme le formulaire public et le back-office. `splitPerVehicle`
 * est forcé à `true` avec un seul véhicule pour réutiliser le chemin
 * d'enrichissement de `extension` (suggestedZone/vehicleContext recalculés
 * pour CE véhicule) déjà présent dans le moteur pour les créations
 * multi-véhicules — sans dupliquer cette logique ici.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  let currentUserId: string | undefined;
  let currentUserRole: "SUPER_ADMIN" | "ADMIN" | "USER" | undefined;
  try {
    const session = await requirePermission(req, "LISTE", "write");
    currentUserId = session.user.id;
    const u = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });
    currentUserRole = u?.role;
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id: parentId } = await props.params;

  try {
    await assertAccreditationAccess(currentUserId!, parentId);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const parent = await prisma.accreditation.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      return Response.json({ error: "Accréditation introuvable" }, { status: 404 });
    }

    const v = await req.json();

    // Le template Zod (Palais/RX) est déterminé par l'organisation du
    // parent — jamais recalculé ni contournable par le client.
    let organizationSlug: string | undefined;
    if (parent.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: parent.organizationId },
        select: { slug: true },
      });
      organizationSlug = org?.slug;
    }

    const command: AccreditationCommand = {
      organizationSlug,
      company: parent.company,
      stand: parent.stand,
      unloading: parent.unloading,
      event: parent.event,
      message: parent.message ?? undefined,
      consent: parent.consent,
      language: parent.language,
      email: parent.email ?? undefined,
      category: parent.category ? ENUM_TO_CSV[parent.category] : undefined,
      // Extension recopiée du parent (contact RX, catégories, contexte
      // véhicule…) : sans elle, le template RX perdrait toutes ses données
      // métier. Le moteur recalcule `suggestedZone`/`vehicleContext` pour le
      // nouveau véhicule via le chemin `splitPerVehicle`.
      extension: (parent.extension as Record<string, unknown> | null) ?? undefined,
      splitPerVehicle: true,
      vehicles: [v],
    };

    const result = await createAccreditation(command, {
      currentUserId,
      currentUserRole,
      // Références référentiel et provenance de duplication : sourcées
      // UNIQUEMENT depuis `parent` (déjà validé par `assertAccreditationAccess`
      // ci-dessus), jamais depuis le corps de la requête `v`.
      duplicateSourceAccreditationId: parent.id,
      referential: {
        exhibitorId: parent.exhibitorId,
        exhibitorLocationId: parent.exhibitorLocationId,
        locationLabel: parent.locationLabel,
        locationSnapshot: parent.locationSnapshot,
      },
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

    // `splitPerVehicle` force le chemin "split" du moteur (même avec un seul
    // véhicule) : le body renvoyé est `{ count, ids, emailOutcome }`. On
    // recharge l'accréditation créée pour préserver le contrat de réponse
    // historique de cette route (objet Accreditation complet + véhicules).
    const body = result.body as { ids: string[]; emailOutcome: string };
    const newId = body.ids[0];

    // La transaction est déjà committée et l'e-mail éventuellement envoyé à
    // ce stade : un échec de CE rechargement ne doit JAMAIS être traduit en
    // 500 (l'utilisateur relancerait la requête et créerait un doublon). On
    // retente uniquement la lecture, jamais la création, et on retombe sur un
    // corps minimal (id + emailOutcome) si le rechargement échoue.
    try {
      const created = await prisma.accreditation.findUnique({
        where: { id: newId },
        include: { vehicles: true },
      });
      if (created) {
        return Response.json({ ...created, emailOutcome: body.emailOutcome }, { status: 201 });
      }
      console.error(
        `POST /api/accreditations/[id]/duplicate: accréditation ${newId} créée mais introuvable au rechargement`
      );
    } catch (refetchError) {
      console.error(
        `POST /api/accreditations/[id]/duplicate: échec du rechargement post-commit de ${newId}`,
        refetchError
      );
    }
    return Response.json({ id: newId, emailOutcome: body.emailOutcome }, { status: 201 });
  } catch (error) {
    // Parité HTTP : `assertEventBelongsToOrg` (via le moteur) peut lever une
    // `Response` texte 400 — on la retourne telle quelle, sans la reconstruire.
    if (error instanceof Response) return error;
    console.error("POST /api/accreditations/[id]/duplicate error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
