import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import type { Feature } from "@prisma/client";

/**
 * GET /api/admin/users/[id]/permissions
 * Récupère les permissions d'un utilisateur.
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, "SUPER_ADMIN");
    const { id } = await props.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    // Si super admin, retourner toutes les permissions
    if (user.role === "SUPER_ADMIN") {
      const allFeatures: Feature[] = [
        "LISTE",
        "CREER",
        "PLAQUE",
        "QR_CODE",
        "FLUX_VEHICULES",
        "BILAN_CARBONE",
        "GESTION_ZONES",
        "GESTION_DATES",
      ];
      return NextResponse.json(
        allFeatures.map((feature) => ({
          feature,
          canRead: true,
          canWrite: true,
        }))
      );
    }

    const permissions = await prisma.userPermission.findMany({
      where: { userId: id },
      select: {
        feature: true,
        canRead: true,
        canWrite: true,
      },
    });

    return NextResponse.json(permissions);
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    console.error(
      "Erreur GET /api/admin/users/[id]/permissions:",
      error
    );
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/users/[id]/permissions
 * Met à jour les permissions d'un utilisateur.
 * Body: { permissions: [{ feature: string, canRead: boolean, canWrite: boolean }] }
 */
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, "SUPER_ADMIN");
    const { id } = await props.params;

    const body = await request.json();
    const { permissions } = body as {
      permissions: Array<{
        feature: Feature;
        canRead: boolean;
        canWrite: boolean;
      }>;
    };

    if (!permissions || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: "Permissions invalides" },
        { status: 400 }
      );
    }

    // Vérifier que l'utilisateur existe
    const user = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    // Ne pas modifier les permissions des super admins
    if (user.role === "SUPER_ADMIN") {
      return NextResponse.json(
        {
          error:
            "Les permissions des Super Admins ne peuvent pas être modifiées",
        },
        { status: 400 }
      );
    }

    // Upsert chaque permission
    const results = await Promise.all(
      permissions.map((perm) =>
        prisma.userPermission.upsert({
          where: {
            userId_feature: {
              userId: id,
              feature: perm.feature,
            },
          },
          create: {
            userId: id,
            feature: perm.feature,
            canRead: perm.canRead,
            canWrite: perm.canWrite,
          },
          update: {
            canRead: perm.canRead,
            canWrite: perm.canWrite,
          },
        })
      )
    );

    return NextResponse.json(
      results.map((r) => ({
        feature: r.feature,
        canRead: r.canRead,
        canWrite: r.canWrite,
      }))
    );
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    console.error(
      "Erreur PUT /api/admin/users/[id]/permissions:",
      error
    );
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
