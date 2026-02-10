import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

/**
 * Décompresse le champ `summary` JSON compact d'une entrée archivée.
 * Format : {"f":"status","o":"ATTENTE","n":"ENTREE","d":"Statut…","u":"userId","ua":"userAgent"}
 */
function decompressSummary(summary: string) {
  try {
    const parsed = JSON.parse(summary);
    return {
      field: parsed.f ?? null,
      oldValue: parsed.o ?? null,
      newValue: parsed.n ?? null,
      description: parsed.d ?? "",
      userId: parsed.u ?? null,
      userAgent: parsed.ua ?? null,
    };
  } catch {
    return {
      field: null,
      oldValue: null,
      newValue: null,
      description: summary,
      userId: null,
      userAgent: null,
    };
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accreditationId } = await params;

  try {
    // 1. Récupérer l'historique récent (table principale)
    const recentHistory = await prisma.accreditationHistory.findMany({
      where: { accreditationId },
      orderBy: { createdAt: "desc" },
    });

    // 2. Récupérer l'historique archivé (table archive, compressé)
    const archivedHistory = await prisma.accreditationHistoryArchive.findMany({
      where: { accreditationId },
      orderBy: { createdAt: "desc" },
    });

    // 3. Récupérer les noms des utilisateurs
    const recentUserIds = recentHistory.map((h) => h.userId).filter(Boolean) as string[];
    const archivedUserIds = archivedHistory
      .map((h) => {
        try { return JSON.parse(h.summary)?.u; } catch { return null; }
      })
      .filter(Boolean) as string[];

    const allUserIds = [...new Set([...recentUserIds, ...archivedUserIds])];

    const users =
      allUserIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: allUserIds } },
            select: { id: true, name: true, email: true },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    // 4. Normaliser l'historique récent
    const enrichedRecent = recentHistory.map((h) => ({
      id: h.id,
      action: h.action,
      field: h.field,
      oldValue: h.oldValue,
      newValue: h.newValue,
      description: h.description,
      userId: h.userId,
      userAgent: h.userAgent,
      createdAt: h.createdAt,
      userName: h.userId ? (userMap.get(h.userId)?.name ?? null) : null,
      userEmail: h.userId ? (userMap.get(h.userId)?.email ?? null) : null,
      isArchived: false,
    }));

    // 5. Normaliser l'historique archivé (décompresser summary)
    const enrichedArchived = archivedHistory.map((h) => {
      const details = decompressSummary(h.summary);
      return {
        id: h.id,
        action: h.action,
        field: details.field,
        oldValue: details.oldValue,
        newValue: details.newValue,
        description: details.description,
        userId: details.userId,
        userAgent: details.userAgent,
        createdAt: h.createdAt,
        userName: details.userId ? (userMap.get(details.userId)?.name ?? null) : null,
        userEmail: details.userId ? (userMap.get(details.userId)?.email ?? null) : null,
        isArchived: true,
      };
    });

    // 6. Fusionner et trier par date décroissante
    const allHistory = [...enrichedRecent, ...enrichedArchived].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return Response.json(allHistory);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'historique:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accreditationId } = await params;
  const body = await req.json();
  const { action, field, oldValue, newValue, description, userId, userAgent } =
    body;

  try {
    const historyEntry = await prisma.accreditationHistory.create({
      data: {
        accreditationId,
        action,
        field,
        oldValue,
        newValue,
        description,
        userId,
        userAgent,
      },
    });

    return Response.json(historyEntry, { status: 201 });
  } catch (error) {
    console.error(
      "Erreur lors de la création de l'entrée d'historique:",
      error
    );
    return new Response("Erreur serveur", { status: 500 });
  }
}
