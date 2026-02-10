import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/users
 * Liste tous les utilisateurs avec leurs permissions.
 * Accès : SUPER_ADMIN uniquement.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, "SUPER_ADMIN");

    const users = await prisma.user.findMany({
      include: {
        permissions: {
          select: {
            feature: true,
            canRead: true,
            canWrite: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Ne pas exposer les données sensibles
    const safeUsers = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      permissions: user.permissions,
    }));

    return NextResponse.json(safeUsers);
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    console.error("Erreur GET /api/admin/users:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users
 * Crée un nouvel utilisateur.
 * Accès : SUPER_ADMIN uniquement.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, "SUPER_ADMIN");

    const body = await request.json();
    const { email, name, password, role } = body;

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "Email, nom et mot de passe requis" },
        { status: 400 }
      );
    }

    // Vérifier que l'email n'existe pas déjà
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Un compte avec cet email existe déjà" },
        { status: 409 }
      );
    }

    // Hasher le mot de passe avec la même fonction que Better Auth
    const { hashPassword } = await import("better-auth/crypto");
    const hashedPassword = await hashPassword(password);

    // Créer l'utilisateur + le compte dans une transaction atomique
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          emailVerified: true,
          role: role || "USER",
          isActive: true,
        },
      });

      await tx.account.create({
        data: {
          userId: newUser.id,
          accountId: newUser.id,
          providerId: "credential",
          password: hashedPassword,
        },
      });

      return newUser;
    });

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    console.error("Erreur POST /api/admin/users:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
