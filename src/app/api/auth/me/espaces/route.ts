import { NextRequest, NextResponse } from "next/server";
import { getSession, getAvailableEspacesForUser } from "@/lib/auth-helpers";

/**
 * GET /api/auth/me/espaces
 * Retourne la liste des Espaces accessibles à l'utilisateur connecté,
 * utilisée par le sélecteur d'Espace dans la sidebar logisticien.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const espaces = await getAvailableEspacesForUser(session.user.id);
    return NextResponse.json(espaces);
  } catch (error) {
    console.error("GET /api/auth/me/espaces error:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
