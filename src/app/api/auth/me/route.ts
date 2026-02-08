import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

/**
 * GET /api/auth/me
 * Retourne l'utilisateur courant avec ses permissions.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        permissions: {
          select: {
            feature: true,
            canRead: true,
            canWrite: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "Compte désactivé" },
        { status: 403 }
      );
    }

    // Si super admin, retourner toutes les permissions
    const allFeatures = [
      "LISTE",
      "CREER",
      "PLAQUE",
      "QR_CODE",
      "FLUX_VEHICULES",
      "BILAN_CARBONE",
      "GESTION_ZONES",
      "GESTION_DATES",
    ] as const;

    const permissions =
      user.role === "SUPER_ADMIN"
        ? allFeatures.map((feature) => ({
            feature,
            canRead: true,
            canWrite: true,
          }))
        : user.permissions;

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      permissions,
    });
  } catch (error) {
    console.error("Erreur GET /api/auth/me:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
