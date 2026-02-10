import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/fix-emails
 * 
 * Script one-shot : normalise tous les emails existants en minuscules.
 * À supprimer après exécution.
 * 
 * Accès : SUPER_ADMIN uniquement.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, "SUPER_ADMIN");

    // Récupérer tous les utilisateurs
    const users = await prisma.user.findMany({
      select: { id: true, email: true },
    });

    const fixed: { id: string; oldEmail: string; newEmail: string }[] = [];

    for (const user of users) {
      const normalized = user.email.toLowerCase().trim();
      if (normalized !== user.email) {
        // Vérifier qu'il n'y a pas de collision avec un email déjà en lowercase
        const collision = await prisma.user.findUnique({
          where: { email: normalized },
        });

        if (collision && collision.id !== user.id) {
          // Collision : deux comptes avec le même email (un en majuscule, un en minuscule)
          // On ne peut pas corriger automatiquement — on log l'erreur
          console.error(
            `[fix-emails] Collision détectée : "${user.email}" (${user.id}) ↔ "${collision.email}" (${collision.id})`
          );
          continue;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { email: normalized },
        });

        fixed.push({
          id: user.id,
          oldEmail: user.email,
          newEmail: normalized,
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalUsers: users.length,
      totalFixed: fixed.length,
      fixed,
      message:
        fixed.length === 0
          ? "Tous les emails étaient déjà en minuscules."
          : `${fixed.length} email(s) corrigé(s).`,
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
      });
    }
    console.error("Erreur GET /api/admin/fix-emails:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
