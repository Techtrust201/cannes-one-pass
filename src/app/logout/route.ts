import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Utilise Better Auth pour déconnecter l'utilisateur
  await auth.api.signOut({
    headers: request.headers,
  });

  // Redirige vers la page de login en utilisant l'URL dynamique
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}
