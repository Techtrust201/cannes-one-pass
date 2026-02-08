import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accreditationId } = await params;

  try {
    const history = await prisma.accreditationHistory.findMany({
      where: { accreditationId },
      orderBy: { createdAt: "desc" },
    });

    // Récupérer les noms des utilisateurs en une seule requête
    const userIds = [
      ...new Set(history.map((h) => h.userId).filter(Boolean)),
    ] as string[];

    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Enrichir les entrées avec le nom de l'utilisateur
    const enrichedHistory = history.map((h) => ({
      ...h,
      userName: h.userId ? (userMap.get(h.userId)?.name ?? null) : null,
      userEmail: h.userId ? (userMap.get(h.userId)?.email ?? null) : null,
    }));

    return Response.json(enrichedHistory);
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
