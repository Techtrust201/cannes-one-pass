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

  // Vérifier la session via le cookie Better Auth
  // Better Auth stocke le token de session dans un cookie
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Vérifier la session côté serveur via l'API Better Auth
  try {
    const sessionResponse = await fetch(
      new URL("/api/auth/get-session", request.url),
      {
        headers: {
          cookie: request.headers.get("cookie") || "",
        },
      }
    );

    if (!sessionResponse.ok) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const session = await sessionResponse.json();

    // Vérifier que le compte est actif
    if (!session?.user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Vérifier l'accès admin
    if (pathname.startsWith("/admin")) {
      const role = session.user.role;
      if (role !== "SUPER_ADMIN") {
        return NextResponse.redirect(new URL("/logisticien", request.url));
      }
    }

    return NextResponse.next();
  } catch {
    // En cas d'erreur réseau, rediriger vers login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/logisticien/:path*", "/admin/:path*"],
};
