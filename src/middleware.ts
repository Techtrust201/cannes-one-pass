import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Routes protégées qui nécessitent une authentification
  const protectedPaths = ["/logisticien", "/admin"];
  const isProtected = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // Better Auth préfixe les cookies avec __Secure- en HTTPS (production)
  // En HTTP (localhost), pas de préfixe
  const sessionToken =
    request.cookies.get("__Secure-better-auth.session_token")?.value ||
    request.cookies.get("better-auth.session_token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Pour le contrôle de rôle admin, décoder le cookie session_data
  // (signé par Better Auth, contient les infos utilisateur en JSON)
  if (pathname.startsWith("/admin")) {
    const sessionData =
      request.cookies.get("__Secure-better-auth.session_data")?.value ||
      request.cookies.get("better-auth.session_data")?.value;

    if (sessionData) {
      try {
        const decoded = JSON.parse(decodeURIComponent(sessionData));
        const role = decoded?.user?.role;
        if (role !== "SUPER_ADMIN") {
          return NextResponse.redirect(new URL("/logisticien", request.url));
        }
      } catch {
        // Cookie illisible, laisser passer — la page fera la vérif côté serveur
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/logisticien/:path*", "/admin/:path*"],
};
