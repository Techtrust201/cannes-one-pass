import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  getAccessibleOrganizationIds,
} from "@/lib/auth-helpers";

/**
 * Vérifie que l'utilisateur peut administrer un gabarit appartenant à
 * `orgId`. Empêche un admin d'une organisation de modifier/supprimer le
 * gabarit d'une autre (ex. un admin Palais touchant un gabarit RX).
 * Les gabarits legacy sans organisation (`orgId` null) restent accessibles.
 */
async function canAdministerOrg(
  userId: string,
  orgId: string | null
): Promise<boolean> {
  if (!orgId) return true;
  const accessible = await getAccessibleOrganizationIds(userId);
  return accessible === "ALL" || accessible.includes(orgId);
}

/**
 * PATCH /api/vehicle-types/[id] — Modifier un gabarit
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session: Awaited<ReturnType<typeof requirePermission>>;
  try {
    session = await requirePermission(req, "FLUX_VEHICULES", "write");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (Number.isNaN(numericId)) {
    return Response.json({ error: "ID invalide" }, { status: 400 });
  }

  try {
    const existing = await prisma.vehicleTypeConfig.findUnique({
      where: { id: numericId },
      include: { organization: { select: { slug: true } } },
    });
    if (!existing) {
      return Response.json({ error: "Gabarit non trouvé" }, { status: 404 });
    }

    if (!(await canAdministerOrg(session.user.id, existing.organizationId))) {
      return Response.json(
        { error: "Gabarit hors de votre périmètre d'organisation" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    // Renommage de l'identifiant technique (`code`). On ne bloque plus quand
    // des véhicules l'utilisent : on renomme en cascade (cf. transaction plus
    // bas), strictement scopé à l'organisation du gabarit pour ne jamais
    // toucher un code homonyme d'une autre organisation (ex. `VL` RX vs Palais).
    let renameFrom: string | null = null;
    if (body.code !== undefined) {
      const newCode = String(body.code).trim();
      if (!newCode) {
        return Response.json({ error: "Le code ne peut pas être vide" }, { status: 400 });
      }
      if (newCode !== existing.code) {
        const duplicate = await prisma.vehicleTypeConfig.findFirst({
          where: { code: newCode, organizationId: existing.organizationId ?? null },
        });
        if (duplicate && duplicate.id !== numericId) {
          return Response.json({ error: "Ce code existe déjà" }, { status: 409 });
        }
        renameFrom = existing.code;
      }
      updates.code = newCode;
    }
    if (body.label !== undefined) updates.label = String(body.label).trim();
    if (body.gabarit !== undefined) {
      updates.gabarit = String(body.gabarit).trim();
      if (body.label === undefined) {
        updates.label = updates.gabarit;
      }
    }
    if (body.tonnageMini !== undefined) updates.tonnageMini = Number(body.tonnageMini);
    if (body.tonnageMoyen !== undefined) updates.tonnageMoyen = Number(body.tonnageMoyen);
    if (body.tonnageMaxi !== undefined) updates.tonnageMaxi = Number(body.tonnageMaxi);
    if (body.co2Coefficient !== undefined) updates.co2Coefficient = Number(body.co2Coefficient);
    if (body.pdfCode !== undefined) updates.pdfCode = String(body.pdfCode);
    if (body.color !== undefined) updates.color = String(body.color);
    if (body.showTrailerPlate !== undefined) updates.showTrailerPlate = Boolean(body.showTrailerPlate);
    // Champs de routage spécifiques à RX : refusés pour les autres organisations
    // (ex. Palais), afin qu'aucun flux Palm Beach / zones ne pollue leur catalogue.
    const isRxOrg = existing.organization?.slug === "rx";
    // On ne refuse que la pose d'une valeur RX « réelle » (truthy) hors RX ; les
    // valeurs par défaut (false / null) envoyées par le formulaire générique
    // sont tolérées et simplement ignorées.
    const setsRealRxValue =
      body.rxPalmBeachAtCanto === true ||
      (typeof body.rxZoneCanto === "string" && body.rxZoneCanto.trim() !== "") ||
      (typeof body.rxZoneVieuxPort === "string" &&
        body.rxZoneVieuxPort.trim() !== "");
    if (setsRealRxValue && !isRxOrg) {
      return Response.json(
        {
          error:
            "Les champs de routage RX (Palm Beach / zones) ne s'appliquent qu'à l'organisation RX.",
        },
        { status: 400 }
      );
    }
    if (isRxOrg) {
      if (body.rxPalmBeachAtCanto !== undefined) {
        updates.rxPalmBeachAtCanto = Boolean(body.rxPalmBeachAtCanto);
      }
      if (body.rxZoneCanto !== undefined) {
        const z = String(body.rxZoneCanto ?? "").trim();
        updates.rxZoneCanto = z || null;
      }
      if (body.rxZoneVieuxPort !== undefined) {
        const z = String(body.rxZoneVieuxPort ?? "").trim();
        updates.rxZoneVieuxPort = z || null;
      }
    }
    if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder);
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

    // Renommage : update + cascade atomique sur les véhicules de la MÊME
    // organisation (Vehicle.vehicleType est une chaîne, pas une FK). Le scope
    // via `accreditation.organizationId` garantit l'isolation inter-org.
    if (renameFrom !== null) {
      const newCode = updates.code as string;
      const [updated] = await prisma.$transaction([
        prisma.vehicleTypeConfig.update({
          where: { id: numericId },
          data: updates,
        }),
        prisma.vehicle.updateMany({
          where: {
            vehicleType: renameFrom,
            ...(existing.organizationId
              ? { accreditation: { organizationId: existing.organizationId } }
              : {}),
          },
          data: { vehicleType: newCode },
        }),
      ]);
      return Response.json(updated);
    }

    const updated = await prisma.vehicleTypeConfig.update({
      where: { id: numericId },
      data: updates,
    });

    return Response.json(updated);
  } catch (error) {
    console.error("PATCH /api/vehicle-types/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * DELETE /api/vehicle-types/[id] — Soft delete
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session: Awaited<ReturnType<typeof requirePermission>>;
  try {
    session = await requirePermission(req, "FLUX_VEHICULES", "write");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (Number.isNaN(numericId)) {
    return Response.json({ error: "ID invalide" }, { status: 400 });
  }

  try {
    const existing = await prisma.vehicleTypeConfig.findUnique({
      where: { id: numericId },
    });
    if (!existing) {
      return Response.json({ error: "Gabarit non trouvé" }, { status: 404 });
    }

    if (!(await canAdministerOrg(session.user.id, existing.organizationId))) {
      return Response.json(
        { error: "Gabarit hors de votre périmètre d'organisation" },
        { status: 403 }
      );
    }

    await prisma.vehicleTypeConfig.update({
      where: { id: numericId },
      data: { isActive: false },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/vehicle-types/[id] error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
