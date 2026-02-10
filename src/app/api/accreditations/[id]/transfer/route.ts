import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

const VALID_ZONES = ["LA_BOCCA", "PALAIS_DES_FESTIVALS", "PANTIERO", "MACE"] as const;

/* POST - Transférer une accréditation vers une autre zone */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { targetZone, reason, version } = body;

  // Validation
  if (!targetZone || !VALID_ZONES.includes(targetZone)) {
    return new Response("Invalid targetZone", { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Lire avec vérification
      const acc = await tx.accreditation.findUnique({ where: { id } });
      if (!acc) throw new Error("NOT_FOUND");

      // 2. Optimistic lock
      if (version !== undefined && version !== null && acc.version !== version) {
        throw new Error("CONFLICT");
      }

      // 3. Vérifier le statut SORTIE
      if (acc.status !== "SORTIE") {
        throw new Error("BAD_STATUS");
      }

      // 4. Vérifier qu'on ne transfère pas vers la même zone
      if (acc.currentZone === targetZone) {
        throw new Error("SAME_ZONE");
      }

      const fromZone = acc.currentZone;

      // 5. Créer le mouvement de transfert
      await tx.zoneMovement.create({
        data: {
          accreditationId: id,
          fromZone,
          toZone: targetZone,
          action: "TRANSFER",
        },
      });

      // 6. Mettre à jour l'accréditation avec incrémentation de version
      await tx.accreditation.update({
        where: { id, version: acc.version },
        data: {
          currentZone: targetZone,
          status: "ATTENTE",
          version: acc.version + 1,
        },
      });

      // 7. Historique dans la transaction
      await tx.accreditationHistory.create({
        data: {
          accreditationId: id,
          action: "ZONE_TRANSFER",
          field: "currentZone",
          oldValue: fromZone ?? undefined,
          newValue: targetZone,
          description: `Transféré de ${fromZone ?? "N/A"} vers ${targetZone}${reason ? ` - ${reason}` : ""}`,
        },
      });

      return true;
    });

    // Relire après transaction
    const updated = await prisma.accreditation.findUnique({
      where: { id },
      include: { vehicles: true },
    });

    return Response.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return new Response("Not found", { status: 404 });
      }
      if (error.message === "CONFLICT") {
        return Response.json(
          { error: "Cette accréditation a été modifiée par un autre utilisateur. Veuillez rafraîchir." },
          { status: 409 }
        );
      }
      if (error.message === "BAD_STATUS") {
        return new Response(
          "Le véhicule doit être en statut SORTIE pour être transféré",
          { status: 400 }
        );
      }
      if (error.message === "SAME_ZONE") {
        return new Response("Le véhicule est déjà dans cette zone", { status: 400 });
      }
    }
    console.error("POST /api/accreditations/[id]/transfer error:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
