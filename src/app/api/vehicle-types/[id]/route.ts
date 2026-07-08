import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  getAccessibleOrganizationIds,
} from "@/lib/auth-helpers";
import { parseLocalizedNumber } from "@/lib/parse-localized-number";
import { parseVehicleTypeDbTranslations } from "@/lib/vehicle-type-i18n";

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

    // Code technique NON renommable en back-office. Un gabarit existant en base
    // peut être référencé bien au-delà d'un simple `vehicle.count` : véhicules
    // (y compris payloads JSON), accréditations, historiques, et PDFs déjà
    // générés — un usage impossible à recompter de façon exhaustive et fiable.
    // Règle stricte : le code est figé dès la création. Un éventuel changement
    // de code est une opération technique dédiée (script hors back-office),
    // jamais une action d'administration normale.
    if (body.code !== undefined && String(body.code).trim() !== existing.code) {
      return Response.json(
        {
          error:
            "Le code technique n'est pas modifiable : il identifie ce gabarit dans les accréditations, historiques et documents déjà générés.",
        },
        { status: 409 }
      );
    }
    if (body.label !== undefined) updates.label = String(body.label).trim();
    if (body.gabarit !== undefined) {
      updates.gabarit = String(body.gabarit).trim();
      if (body.label === undefined) {
        updates.label = updates.gabarit;
      }
    }
    // Validation numérique (décimales FR/EN). Un champ fourni mais invalide
    // renvoie un 400 clair au lieu d'écrire un NaN en base.
    const numericPatch: Array<[string, unknown, string]> = [
      ["tonnageMini", body.tonnageMini, "Le tonnage mini doit être un nombre"],
      ["tonnageMoyen", body.tonnageMoyen, "Le tonnage moyen doit être un nombre"],
      ["tonnageMaxi", body.tonnageMaxi, "Le tonnage maxi doit être un nombre"],
      ["co2Coefficient", body.co2Coefficient, "Le CO₂ doit être un nombre"],
    ];
    for (const [field, raw, message] of numericPatch) {
      if (raw === undefined) continue;
      const parsed = parseLocalizedNumber(raw);
      if (parsed === null) return Response.json({ error: message }, { status: 400 });
      updates[field] = parsed;
    }
    if (
      updates.tonnageMini !== undefined &&
      updates.tonnageMoyen !== undefined &&
      (updates.tonnageMini as number) > (updates.tonnageMoyen as number)
    ) {
      return Response.json(
        { error: "Le tonnage mini doit être inférieur ou égal au tonnage moyen" },
        { status: 400 }
      );
    }
    if (
      updates.tonnageMoyen !== undefined &&
      updates.tonnageMaxi !== undefined &&
      (updates.tonnageMoyen as number) > (updates.tonnageMaxi as number)
    ) {
      return Response.json(
        { error: "Le tonnage moyen doit être inférieur ou égal au tonnage maxi" },
        { status: 400 }
      );
    }
    if (body.pdfCode !== undefined) updates.pdfCode = String(body.pdfCode);
    // Famille de capacité (quotas) : surcharge explicite optionnelle.
    // "" / null = remise en automatique (repli pdfCode). Autre valeur que
    // "", null, "LIGHT", "HEAVY" refusée.
    if (body.vehicleFamily !== undefined) {
      const normalizedVehicleFamily =
        body.vehicleFamily === null || body.vehicleFamily === ""
          ? null
          : body.vehicleFamily;
      if (
        normalizedVehicleFamily !== null &&
        normalizedVehicleFamily !== "LIGHT" &&
        normalizedVehicleFamily !== "HEAVY"
      ) {
        return Response.json(
          { error: "vehicleFamily invalide (LIGHT, HEAVY ou vide pour automatique)" },
          { status: 400 }
        );
      }
      updates.vehicleFamily = normalizedVehicleFamily;
    }
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
    if (body.sortOrder !== undefined) {
      const parsedOrder = parseLocalizedNumber(body.sortOrder);
      if (parsedOrder === null)
        return Response.json({ error: "L'ordre doit être un nombre" }, { status: 400 });
      updates.sortOrder = Math.round(parsedOrder);
    }
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
    // Traductions d'affichage : on remplace l'ensemble par la version sanitizée
    // (langues supportées + valeurs non vides). Une map vide efface la colonne.
    if (body.displayLabels !== undefined) {
      const sanitized = parseVehicleTypeDbTranslations(body.displayLabels);
      updates.displayLabels =
        Object.keys(sanitized).length > 0 ? sanitized : Prisma.JsonNull;
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
