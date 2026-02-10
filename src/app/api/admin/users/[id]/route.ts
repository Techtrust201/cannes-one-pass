import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/users/[id]
 * Récupère un utilisateur spécifique.
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

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      permissions: user.permissions,
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    console.error("Erreur GET /api/admin/users/[id]:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/users/[id]
 * Met à jour un utilisateur (rôle, statut, nom, email).
 * Seuls les SUPER_ADMIN peuvent modifier l'email.
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { session } = await requireRole(request, "SUPER_ADMIN");
    const { id } = await props.params;

    // Empêcher un super admin de se modifier lui-même pour le rôle
    const body = await request.json();
    const { role, isActive, name, email } = body;

    if (id === session.user.id && role && role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Vous ne pouvez pas rétrograder votre propre rôle" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (name !== undefined) updateData.name = name;

    // Gestion de la modification d'email (SUPER_ADMIN only)
    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase().trim();

      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        return NextResponse.json(
          { error: "Adresse email invalide" },
          { status: 400 }
        );
      }

      // Vérifier que le nouvel email n'est pas déjà utilisé par un autre utilisateur
      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing && existing.id !== id) {
        return NextResponse.json(
          { error: "Un autre utilisateur possède déjà cette adresse email" },
          { status: 409 }
        );
      }

      updateData.email = normalizedEmail;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    console.error("Erreur PATCH /api/admin/users/[id]:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Supprime un utilisateur (soft delete : isActive = false).
 */
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { session } = await requireRole(request, "SUPER_ADMIN");
    const { id } = await props.params;

    // Empêcher un super admin de se supprimer lui-même
    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas supprimer votre propre compte" },
        { status: 400 }
      );
    }

    // Soft delete
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Supprimer toutes les sessions de l'utilisateur pour le déconnecter
    await prisma.session.deleteMany({
      where: { userId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    console.error("Erreur DELETE /api/admin/users/[id]:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
