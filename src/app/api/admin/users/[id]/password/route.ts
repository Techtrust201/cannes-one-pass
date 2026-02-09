import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";

/**
 * Génère un mot de passe aléatoire sécurisé
 */
function generatePassword(length = 16): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

/**
 * POST /api/admin/users/[id]/password
 * Réinitialise le mot de passe d'un utilisateur en générant un nouveau mot de passe aléatoire.
 * Accès : SUPER_ADMIN uniquement.
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, "SUPER_ADMIN");
    const { id } = await props.params;

    // Vérifier que l'utilisateur existe
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    // Générer un nouveau mot de passe aléatoire
    const newPassword = generatePassword(16);

    // Hasher le mot de passe avec la même fonction que Better Auth
    const { hashPassword } = await import("better-auth/crypto");
    const hashedPassword = await hashPassword(newPassword);

    // Trouver ou créer le compte credential
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId: id,
        providerId: "credential",
      },
    });

    if (existingAccount) {
      // Mettre à jour le mot de passe existant
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: { password: hashedPassword },
      });
    } else {
      // Créer le compte credential s'il n'existe pas
      await prisma.account.create({
        data: {
          userId: id,
          accountId: id,
          providerId: "credential",
          password: hashedPassword,
        },
      });
    }

    // Supprimer toutes les sessions de l'utilisateur pour le déconnecter
    await prisma.session.deleteMany({
      where: { userId: id },
    });

    // Retourner le mot de passe en clair (une seule fois)
    return NextResponse.json({
      success: true,
      password: newPassword, // ⚠️ Affiché une seule fois
      message: "Mot de passe réinitialisé avec succès",
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    console.error("Erreur POST /api/admin/users/[id]/password:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/users/[id]/password
 * Modifie le mot de passe d'un utilisateur avec un mot de passe spécifique.
 * Accès : SUPER_ADMIN uniquement.
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, "SUPER_ADMIN");
    const { id } = await props.params;

    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Le mot de passe est requis" },
        { status: 400 }
      );
    }

    // Validation : longueur minimale
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    // Vérifier que l'utilisateur existe
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    // Hasher le mot de passe avec la même fonction que Better Auth
    const { hashPassword } = await import("better-auth/crypto");
    const hashedPassword = await hashPassword(password);

    // Trouver ou créer le compte credential
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId: id,
        providerId: "credential",
      },
    });

    if (existingAccount) {
      // Mettre à jour le mot de passe existant
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: { password: hashedPassword },
      });
    } else {
      // Créer le compte credential s'il n'existe pas
      await prisma.account.create({
        data: {
          userId: id,
          accountId: id,
          providerId: "credential",
          password: hashedPassword,
        },
      });
    }

    // Supprimer toutes les sessions de l'utilisateur pour le déconnecter
    await prisma.session.deleteMany({
      where: { userId: id },
    });

    // Retourner un succès sans exposer le mot de passe
    return NextResponse.json({
      success: true,
      message: "Mot de passe modifié avec succès",
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    console.error("Erreur PATCH /api/admin/users/[id]/password:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
