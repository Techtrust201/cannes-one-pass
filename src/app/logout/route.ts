import { NextResponse } from "next/server";

export async function GET() {
  // Route de déconnexion basique - redirige vers la page d'accueil
  return NextResponse.redirect(new URL("/", "http://localhost:3000"));
}
