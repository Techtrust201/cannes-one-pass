import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { writeHistoryDirect } from "@/lib/history-server";

/**
 * GET /api/accreditations/[id]/chat — Lister les messages de chat
 * Paginé, trié par date croissante
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(req, "LISTE", "read");
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const cursor = searchParams.get("cursor");

  try {
    const messages = await prisma.chatMessage.findMany({
      where: { accreditationId: id },
      orderBy: { createdAt: "asc" },
      take: limit,
      ...(cursor ? { cursor: { id: parseInt(cursor) }, skip: 1 } : {}),
    });

    return Response.json({
      messages: messages.map((m) => ({
        id: m.id,
        userId: m.userId,
        userName: m.userName,
        message: m.message,
        createdAt: m.createdAt.toISOString(),
      })),
      hasMore: messages.length === limit,
      nextCursor: messages.length > 0 ? messages[messages.length - 1].id : null,
    });
  } catch (error) {
    console.error("GET /api/accreditations/[id]/chat error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/accreditations/[id]/chat — Envoyer un message
 * Body: { message: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let currentUserId: string | undefined;
  let currentUserName: string | undefined;
  try {
    const session = await requirePermission(req, "LISTE", "read");
    currentUserId = session.user.id;
    currentUserName = session.user.name || "Agent";
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, statusText: error.statusText });
    }
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { message } = body;

  if (!message || !message.trim()) {
    return Response.json({ error: "Le message ne peut pas être vide" }, { status: 400 });
  }

  try {
    // Vérifier que l'accréditation existe
    const acc = await prisma.accreditation.findUnique({ where: { id } });
    if (!acc) {
      return Response.json({ error: "Accréditation non trouvée" }, { status: 404 });
    }

    const chatMessage = await prisma.chatMessage.create({
      data: {
        accreditationId: id,
        userId: currentUserId!,
        userName: currentUserName!,
        message: message.trim(),
      },
    });

    // Écrire l'historique pour le polling
    await writeHistoryDirect({
      accreditationId: id,
      action: "CHAT_MESSAGE",
      field: "chat",
      newValue: message.trim().substring(0, 100),
      description: `Message de ${currentUserName}: ${message.trim().substring(0, 50)}...`,
      userId: currentUserId,
    });

    return Response.json({
      id: chatMessage.id,
      userId: chatMessage.userId,
      userName: chatMessage.userName,
      message: chatMessage.message,
      createdAt: chatMessage.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/accreditations/[id]/chat error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
