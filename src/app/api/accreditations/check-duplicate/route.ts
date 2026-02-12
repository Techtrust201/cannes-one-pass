import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/accreditations/check-duplicate — Vérifier les doublons
 * Body: { company: string, plate: string, trailerPlate?: string }
 * Retourne les accréditations existantes qui correspondent.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company, plate, trailerPlate } = body;

    if (!company || !plate) {
      return Response.json({ duplicates: [] });
    }

    // Normaliser : minuscule, trim
    const normalizedCompany = company.trim().toLowerCase();
    const normalizedPlate = plate.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

    // Chercher les accréditations avec le même nom de décorateur ET un véhicule avec la même plaque
    const candidates = await prisma.accreditation.findMany({
      where: {
        isArchived: false,
        company: { equals: company.trim(), mode: "insensitive" },
        vehicles: {
          some: {
            plate: { equals: plate.trim(), mode: "insensitive" },
          },
        },
      },
      include: {
        vehicles: true,
      },
      take: 10,
    });

    // Filtrage supplémentaire : si trailerPlate est fourni, vérifier la correspondance
    const duplicates = candidates.filter((acc) => {
      // Vérifier la plaque
      const hasMatchingPlate = acc.vehicles.some(
        (v) => v.plate.trim().toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedPlate
      );
      if (!hasMatchingPlate) return false;

      // Vérifier le nom du décorateur
      if (acc.company.trim().toLowerCase() !== normalizedCompany) return false;

      // Si une plaque de remorque est fournie, vérifier aussi
      if (trailerPlate && trailerPlate.trim()) {
        const normalizedTrailer = trailerPlate.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const hasMatchingTrailer = acc.vehicles.some(
          (v) => v.trailerPlate && v.trailerPlate.trim().toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedTrailer
        );
        return hasMatchingTrailer;
      }

      return true;
    });

    // Formatter la réponse
    const result = duplicates.map((acc) => ({
      id: acc.id,
      company: acc.company,
      stand: acc.stand,
      event: acc.event,
      status: acc.status,
      createdAt: acc.createdAt.toISOString(),
      currentZone: acc.currentZone,
      vehicles: acc.vehicles.map((v) => ({
        plate: v.plate,
        size: v.size,
        trailerPlate: v.trailerPlate,
        city: v.city,
      })),
    }));

    return Response.json({ duplicates: result });
  } catch (error) {
    console.error("POST /api/accreditations/check-duplicate error:", error);
    return Response.json({ duplicates: [] });
  }
}
